import { describe, it, expect } from 'vitest';
import { fitWithin, compressWithEncoder, TARGET_BYTES, HARD_LIMIT_BYTES } from '../../src/lib/compress.js';

describe('fitWithin', () => {
  it('scales landscape', () => expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 }));
  it('scales portrait', () => expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 }));
  it('never yields a zero side', () => expect(fitWithin(10000, 3, 1280)).toEqual({ width: 1280, height: 1 }));
  it('keeps small images', () => expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 }));
});

describe('compressWithEncoder', () => {
  // Encoder falso: el tamaño depende de ancho y calidad.
  const fake = (bytesFor) => {
    const calls = [];
    const encode = async (w, h, q) => {
      calls.push([w, h, q]);
      return 'x'.repeat(bytesFor(w, q));
    };
    return { encode, calls };
  };

  it('returns first attempt under target', async () => {
    const { encode, calls } = fake(() => 1000);
    expect((await compressWithEncoder(encode, { width: 1280, height: 960 })).length).toBe(1000);
    expect(calls).toEqual([[1280, 960, 0.7]]);
  });

  it('lowers quality, then size', async () => {
    const { encode, calls } = fake((w, q) => (w < 1280 && q <= 0.6 ? 1000 : TARGET_BYTES + 1));
    await compressWithEncoder(encode, { width: 1280, height: 960 });
    expect(calls.at(-1)).toEqual([960, 720, 0.6]);
  });

  it('falls back to smallest result under hard limit', async () => {
    const { encode } = fake((w, q) => TARGET_BYTES + Math.round(w * q));
    const r = await compressWithEncoder(encode, { width: 1280, height: 960 });
    expect(r.length).toBe(TARGET_BYTES + Math.round(640 * 0.4));
  });

  it('returns null when nothing fits the hard limit', async () => {
    const { encode } = fake(() => HARD_LIMIT_BYTES + 1);
    expect(await compressWithEncoder(encode, { width: 1280, height: 960 })).toBeNull();
  });
});
