export function normalizeSerial(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function serialToDocId(raw) {
  const s = normalizeSerial(raw);
  if (!s) throw new Error('Serial vacío');
  const id = s.replace(/%/g, '%25').replace(/\//g, '%2F');
  if (id === '.' || id === '..' || /^__.*__$/.test(id)) throw new Error(`Serial inválido: ${s}`);
  if (new TextEncoder().encode(id).length > 1500) throw new Error('Serial demasiado largo');
  return id;
}
