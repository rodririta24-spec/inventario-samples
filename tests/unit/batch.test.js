import { it, expect } from 'vitest';
import { chunkOps } from '../../src/lib/batch.js';

const op = (n) => ({ history: new Array(n).fill({}) });

it('groups ops so each chunk stays within max writes', () => {
  const ops = [op(1), op(1), op(1)]; // 2 writes each
  expect(chunkOps(ops, 4).map((c) => c.length)).toEqual([2, 1]);
});
it('never splits a single op even if it alone exceeds max', () => {
  expect(chunkOps([op(10)], 4).map((c) => c.length)).toEqual([1]);
});
it('empty input gives no chunks', () => expect(chunkOps([], 4)).toEqual([]));

import { chunk } from '../../src/lib/batch.js';

it('chunk splits an array into pieces of at most size', () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(chunk([], 3)).toEqual([]);
  expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
});
