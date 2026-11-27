// ZIP store format. The generator supplies safe, ASCII relative filenames.
// Store avoids a compression dependency for the small generated text files.
export function pythonPackageZip(files: Readonly<Record<string, string>>): Blob {
  const encoder = new TextEncoder();
  const parts: ArrayBuffer[] = [];
  const directory: ArrayBuffer[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const [path, source] of Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (!/^(?:[a-z_][a-z0-9_]*\/)*[a-z_][a-z0-9_]*\.py$/.test(path)) throw Error('Invalid Python package path.');
    const name = encoder.encode(path);
    const bytes = encoder.encode(source);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc ^= 0xffffffff;
    const local = new ArrayBuffer(30);
    const header = new DataView(local);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(12, 33, true); // 1980-01-01
    header.setUint32(14, crc, true);
    header.setUint32(18, bytes.length, true);
    header.setUint32(22, bytes.length, true);
    header.setUint16(26, name.length, true);
    parts.push(local, name.buffer, bytes.buffer);
    const central = new ArrayBuffer(46);
    const entry = new DataView(central);
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(14, 33, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true);
    entry.setUint32(24, bytes.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(central, name.buffer);
    offset += local.byteLength + name.length + bytes.length;
    centralSize += central.byteLength + name.length;
  }
  const count = directory.length / 2;
  if (count > 65535 || offset + centralSize > 0xffffffff) throw Error('The Python package is too large.');
  const ending = new ArrayBuffer(22);
  const record = new DataView(ending);
  record.setUint32(0, 0x06054b50, true);
  record.setUint16(8, count, true);
  record.setUint16(10, count, true);
  record.setUint32(12, centralSize, true);
  record.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, ending], {type: 'application/zip'});
}
