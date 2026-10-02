export function normalizeSerial(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function serialToDocId(raw) {
  const s = normalizeSerial(raw);
  if (!s) throw new Error('Serial vacío');
  const id = s.replace(/\//g, '_');
  if (id === '.' || id === '..' || /^__.*__$/.test(id)) throw new Error(`Serial inválido: ${s}`);
  return id;
}
