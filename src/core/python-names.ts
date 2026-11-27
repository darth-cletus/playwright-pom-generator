export const reserved = new Set(
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self page navigate PATH'.split(' '),
);

export function identifier(value: string): string {
  const name = value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'element';
  return /^\d/.test(name) || reserved.has(name) ? 'element_' + name : name;
}
