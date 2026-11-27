type Style = 'hover' | 'target' | 'selected' | 'previous' | 'panel';

export class Highlights {
  private host?: HTMLElement;
  private root?: ShadowRoot;
  private boxes = new Map<Style, {element: Element; box: HTMLElement}>();
  private tooltip?: HTMLElement;
  private frame = 0;
  private timeout = 0;

  private ensureRoot() {
    if (this.root) return this.root;
    const host = document.createElement('div');
    host.setAttribute('data-pom-overlay', '');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
    document.documentElement.append(host);
    const root = host.attachShadow({mode: 'closed'});
    this.host = host;
    this.root = root;
    return root;
  }

  set(style: Style, element?: Element) {
    const old = this.boxes.get(style);
    if (old?.element === element) return;
    old?.box.remove();
    this.boxes.delete(style);
    if (!element) return;
    const box = document.createElement('div');
    box.dataset.pomState = style;
    const borders: Record<Style, string> = {
      hover: '2px dashed #0284c7', target: '3px double #2563eb', selected: '3px solid #15803d',
      previous: '2px dotted #166534', panel: '4px solid #a21caf',
    };
    box.style.cssText = `position:fixed;pointer-events:none;box-sizing:border-box;border:${borders[style]};box-shadow:0 0 0 1px #fff9`;
    this.ensureRoot().append(box);
    this.boxes.set(style, {element, box});
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  describe(text: string) {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.style.cssText = 'position:fixed;pointer-events:none;background:#122033;color:white;padding:6px 9px;border-radius:4px;font:12px/1.4 system-ui;max-width:min(320px,90vw);white-space:pre-line;overflow-wrap:anywhere';
      this.ensureRoot().append(this.tooltip);
    }
    this.tooltip.textContent = text;
  }

  flash(element: Element) {
    element.scrollIntoView({block: 'center', inline: 'nearest'});
    this.set('panel', element);
    clearTimeout(this.timeout);
    this.timeout = window.setTimeout(() => {
      this.set('panel');
      this.releaseIfEmpty();
    }, 1800);
  }

  clearTarget() {
    this.set('hover');
    this.set('target');
    this.tooltip?.remove();
    this.tooltip = undefined;
    this.releaseIfEmpty();
  }

  clear() {
    clearTimeout(this.timeout);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.boxes.clear();
    this.tooltip = undefined;
    this.host?.remove();
    this.host = this.root = undefined;
  }

  private releaseIfEmpty() {
    if (!this.boxes.size) this.clear();
  }

  private draw = () => {
    this.frame = 0;
    let anchor: DOMRect | undefined;
    const focused = this.boxes.get('target') ?? this.boxes.get('hover') ??
      this.boxes.get('panel') ?? this.boxes.get('selected');
    const scope = focused?.element.closest('dialog:modal,[popover]:popover-open');
    const hostParent = scope ?? document.documentElement;
    if (this.host && this.host.parentElement !== hostParent) hostParent.append(this.host);
    for (const [style, {element, box}] of this.boxes) {
      if (!element.isConnected) {
        box.remove();
        this.boxes.delete(style);
        continue;
      }
      const rect = element.getBoundingClientRect();
      const offscreen = rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth;
      box.hidden = Boolean(scope && !scope.contains(element)) || offscreen || !rect.width || !rect.height ||
        getComputedStyle(element).visibility !== 'visible';
      if (box.hidden) continue;
      if (style === 'hover' || style === 'target') anchor = rect;
      const geometry = `translate(${rect.left}px,${rect.top}px)`;
      if (box.style.transform !== geometry) box.style.transform = geometry;
      if (box.style.width !== rect.width + 'px') box.style.width = rect.width + 'px';
      if (box.style.height !== rect.height + 'px') box.style.height = rect.height + 'px';
      box.style.top = box.style.left = '0px';
    }
    if (this.tooltip) {
      this.tooltip.hidden = !anchor;
      if (anchor) {
        const {offsetWidth: width, offsetHeight: height} = this.tooltip;
        this.tooltip.style.left = Math.max(4, Math.min(anchor.left, innerWidth - width - 4)) + 'px';
        const below = anchor.bottom + 6;
        this.tooltip.style.top = Math.max(4, Math.min(below + height <= innerHeight ? below : anchor.top - height - 6,
          innerHeight - height - 4)) + 'px';
      }
    }
    if (this.boxes.size) this.frame = requestAnimationFrame(this.draw);
    else this.releaseIfEmpty();
  };
}
