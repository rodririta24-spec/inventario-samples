import { it, expect } from 'vitest';
import { toCSV } from '../../src/lib/csv.js';

const cols = [
  { label: 'Producto', value: (r) => r.p },
  { label: 'Nota', value: (r) => r.n },
];

it('starts with BOM and uses ; and CRLF', () => {
  expect(toCSV([{ p: 'A54', n: null }], cols)).toBe('﻿Producto;Nota\r\nA54;');
});
it('quotes values with separator, quotes or newlines', () => {
  expect(toCSV([{ p: 'a;b', n: 'di "hola"\nchau' }], cols)).toBe('﻿Producto;Nota\r\n"a;b";"di ""hola""\nchau"');
});
