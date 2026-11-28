"""Bounded static analysis of caller-supplied Python text."""

import ast
import difflib
import hashlib
import io
import re
import tokenize
from bisect import bisect_left

from .contracts import LocatorSpec, RequestError, object_value

MAX_SOURCE = 65_536
METHODS = {
    "get_by_label": "label",
    "get_by_placeholder": "placeholder",
    "get_by_text": "text",
    "get_by_alt_text": "alt",
    "get_by_title": "title",
}


def parse_source(body):
    source = body.get("source")
    if not isinstance(source, str):
        raise RequestError("Provide Python source text.")
    raw = source.encode("utf-8")
    if len(raw) > MAX_SOURCE or "\x00" in source or "\r" in source.replace("\r\n", ""):
        raise RequestError("Use UTF-8 Python source up to 64 KiB with LF or CRLF.")
    try:
        encoding, _ = tokenize.detect_encoding(io.BytesIO(raw).readline)
        if encoding != "utf-8":
            raise RequestError("Use UTF-8 Python source without a byte order mark.")
        tree = ast.parse(source)
    except RequestError:
        raise
    except (SyntaxError, ValueError, RecursionError) as error:
        line = getattr(error, "lineno", None)
        raise RequestError(
            f"Python syntax could not be parsed at line {line or 1}."
        ) from None
    pending = [(tree, 0)]
    count = 0
    while pending:
        node, depth = pending.pop()
        count += 1
        if count > 12000 or depth > 48:
            raise RequestError("Python syntax exceeds analysis limits.")
        pending.extend((child, depth + 1) for child in ast.iter_child_nodes(node))
    return source, raw, tree


def literal(node, constants):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name):
        return constants.get(node.id)
    return None


def extract(node, constants, receivers, depth=0):
    if (
        depth > 4
        or not isinstance(node, ast.Call)
        or not isinstance(node.func, ast.Attribute)
    ):
        return None
    receiver, method = node.func.value, node.func.attr
    keywords = {keyword.arg: keyword.value for keyword in node.keywords}
    if len(keywords) != len(node.keywords) or len(node.args) != 1:
        return None
    value = literal(node.args[0], constants)
    if value is None:
        return None
    if method in METHODS or method == "get_by_role":
        exact = keywords.pop("exact", None)
        if not isinstance(exact, ast.Constant) or exact.value is not True:
            return None
    if method == "get_by_role":
        name = literal(keywords.pop("name", None), constants)
        locator = {"strategy": "role", "role": value, "name": name}
    elif method in METHODS:
        locator = {"strategy": METHODS[method], "value": value}
    elif method in ("locator", "frame_locator"):
        locator = {"strategy": "css", "selector": value}
    elif method == "get_by_test_id":
        locator = {"strategy": "test-id", "attribute": "data-testid", "value": value}
    else:
        return None
    if keywords:
        return None
    entry = isinstance(receiver, ast.Attribute) and receiver.attr == "content_frame"
    if entry:
        receiver = receiver.value
    if isinstance(receiver, ast.Call):
        root = extract(receiver, constants, receivers, depth + 1)
        if root is None:
            return None
        if root["strategy"] == "frame-owner":
            root, entry = root["owner"], True
        locator = {
            "strategy": "frame" if entry else "chain",
            "root": root,
            "child": locator,
        }
    elif entry or ast.unparse(receiver) not in receivers:
        return None
    return (
        {"strategy": "frame-owner", "owner": locator}
        if method == "frame_locator"
        else locator
    )


def analyze(body):
    source, raw, tree = parse_source(body)
    offsets = [0]
    lines = io.StringIO(source).readlines()
    for line in lines:
        offsets.append(offsets[-1] + len(line.encode("utf-8")))
    comments = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type == tokenize.COMMENT:
            row, column = token.start
            comments.append(
                offsets[row - 1] + len(lines[row - 1][:column].encode("utf-8"))
            )
    constants = {}
    repeated = set()
    for stmt in tree.body:
        if (
            isinstance(stmt, ast.Assign)
            and len(stmt.targets) == 1
            and isinstance(stmt.targets[0], ast.Name)
        ):
            key = stmt.targets[0].id
            if key in constants:
                repeated.add(key)
            constants[key] = literal(stmt.value, {}) if key.isupper() else None
    for key in repeated:
        constants.pop(key)
    classes, entries, diagnostics = [], [], []
    for cls in tree.body:
        if not isinstance(cls, ast.ClassDef):
            continue
        classes.append({"name": cls.name, "line": cls.lineno})
        for method in cls.body:
            if (
                not isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef))
                or method.name != "__init__"
            ):
                continue
            receivers = {"self.page"}
            receivers.update(arg.arg for arg in method.args.args if arg.arg == "page")
            for stmt in method.body:
                if not isinstance(stmt, (ast.Assign, ast.AnnAssign)):
                    continue
                targets = (
                    stmt.targets if isinstance(stmt, ast.Assign) else [stmt.target]
                )
                node = stmt.value
                if len(targets) != 1 or not isinstance(node, ast.Call):
                    continue
                target = targets[0]
                if (
                    not isinstance(target, ast.Attribute)
                    or not isinstance(target.value, ast.Name)
                    or target.value.id != "self"
                ):
                    continue
                extracted = extract(node, constants, receivers)
                try:
                    LocatorSpec.parse(extracted)
                except RequestError:
                    if (
                        isinstance(node.func, ast.Attribute)
                        and node.func.attr
                        in {
                            "locator",
                            "frame_locator",
                            "get_by_role",
                            "get_by_test_id",
                            *METHODS,
                        }
                        and len(diagnostics) < 100
                    ):
                        diagnostics.append(
                            {"line": node.lineno, "code": "unsupported-locator"}
                        )
                    continue
                start = offsets[node.lineno - 1] + node.col_offset
                end = offsets[node.end_lineno - 1] + node.end_col_offset
                first_comment = bisect_left(comments, start)
                root = node
                while (
                    isinstance(root, ast.Call)
                    or isinstance(root, ast.Attribute)
                    and root.attr == "content_frame"
                ):
                    root = root.func.value if isinstance(root, ast.Call) else root.value
                receiver = ast.unparse(root)
                entries.append(
                    {
                        "id": f"{cls.name}:{target.attr}:{start}",
                        "className": cls.name,
                        "name": target.attr,
                        "line": node.lineno,
                        "start": start,
                        "end": end,
                        "locator": extracted,
                        "receiver": receiver,
                        "editable": first_comment == len(comments)
                        or comments[first_comment] >= end,
                    }
                )
    return {
        "revision": hashlib.sha256(raw).hexdigest(),
        "classes": classes,
        "entries": entries,
        "diagnostics": diagnostics,
    }


def render(locator, receiver):
    spec = LocatorSpec.parse(locator)
    strategy = spec.strategy
    if strategy in ("chain", "frame"):
        root = render(locator["root"], receiver)
        return render(
            locator["child"], root + (".content_frame" if strategy == "frame" else "")
        )
    if strategy == "css":
        return f"{receiver}.locator({spec.value!r})"
    if strategy == "test-id" and spec.argument == "data-testid":
        return f"{receiver}.get_by_test_id({spec.value!r})"
    if strategy == "role":
        return f"{receiver}.get_by_role({spec.argument!r}, name={spec.value!r}, exact=True)"
    if strategy in METHODS.values():
        method = next(method for method, kind in METHODS.items() if kind == strategy)
        return f"{receiver}.{method}({spec.value!r}, exact=True)"
    raise RequestError("The replacement locator cannot be written safely.")


def transform(body):
    source, raw, _ = parse_source(body)
    analysis = analyze(body)
    if body.get("revision") != analysis["revision"]:
        raise RequestError(
            "Source revision conflict. Reopen the current source before applying changes."
        )
    choices = body.get("changes")
    if not isinstance(choices, list) or len(choices) > 100:
        raise RequestError("Submit at most 100 reviewed changes.")
    filename = body.get("filename")
    if not isinstance(filename, str) or not re.fullmatch(
        r"[\w.-]{1,100}\.py", filename
    ):
        raise RequestError("Use a Python filename without directories.")
    entries = {entry["id"]: entry for entry in analysis["entries"]}
    edits = {}
    for change in choices:
        data = object_value(change)
        key = data.get("id")
        entry = entries.get(key) if isinstance(key, str) else None
        if not entry or not entry["editable"] or key in edits:
            raise RequestError("Invalid or duplicate reviewed source entry.")
        locator = data.get("locator")
        if locator != entry["locator"]:
            edits[key] = (
                entry["start"],
                entry["end"],
                render(locator, entry["receiver"]).encode("utf-8"),
            )
    for start, end, value in sorted(edits.values(), reverse=True):
        raw = raw[:start] + value + raw[end:]
    updated = raw.decode("utf-8")
    parse_source({"source": updated})
    lines = difflib.unified_diff(
        io.StringIO(source).readlines(),
        io.StringIO(updated).readlines(),
        f"a/{filename}",
        f"b/{filename}",
    )
    patch = "".join(
        line if line.endswith("\n") else line + "\n\\ No newline at end of file\n"
        for line in lines
    )
    return {"source": updated, "patch": patch}
