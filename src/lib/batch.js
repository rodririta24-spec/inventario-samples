// Agrupa operaciones {history: [...]} para que cada batch tenga a lo sumo `max` escrituras
// (1 por el equipo + 1 por cada entrada de historial).
export function chunkOps(ops, max = 450) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const op of ops) {
    const n = 1 + op.history.length;
    if (current.length && size + n > max) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(op);
    size += n;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function chunk(array, size = 450) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}
