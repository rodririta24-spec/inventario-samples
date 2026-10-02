export const MAX_SIDE = 1280;
export const TARGET_BYTES = 700_000;      // largo del dataURL base64
export const HARD_LIMIT_BYTES = 950_000;  // margen bajo el límite de 1 MiB del documento
const SCALES = [1, 0.75, 0.5];
const QUALITIES = [0.7, 0.6, 0.5, 0.4];

export function fitWithin(width, height, max = MAX_SIDE) {
  const ratio = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

// encode(width, height, quality) => Promise<dataURL string>
export async function compressWithEncoder(encode, { width, height }) {
  let best = null;
  for (const scale of SCALES) {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    for (const q of QUALITIES) {
      const data = await encode(w, h, q);
      if (data.length <= TARGET_BYTES) return data;
      if (!best || data.length < best.length) best = data;
    }
  }
  return best && best.length <= HARD_LIMIT_BYTES ? best : null;
}

// Solo navegador. Devuelve un dataURL JPEG o null si no se pudo achicar lo suficiente.
export async function compressImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  const encode = async (w, h, q) => {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', q);
  };
  try {
    return await compressWithEncoder(encode, size);
  } finally {
    bitmap.close();
  }
}
