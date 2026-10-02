import { it, expect } from 'vitest';
import { toCSV } from '../../src/lib/csv.js';

const cols = [
  { label: 'Producto', value: (r) => r.p },
  { label: 'Nota', value: (r) => r.n },
];

it('starts with BOM and uses ; and CRLF', () => {
  expect(toCSV([{ p: 'A54', n: null }], cols)).toBe('\uFEFFProducto;Nota\r\nA54;');
});
it('quotes values with separator, quotes or newlines', () => {
  expect(toCSV([{ p: 'a;b', n: 'di "hola"\nchau' }], cols)).toBe('\uFEFFProducto;Nota\r\n"a;b";"di ""hola""\nchau"');
});
it('quotes values containing CR', () => {
  expect(toCSV([{ p: 'a\rb', n: 'x' }], cols)).toBe('\uFEFFProducto;Nota\r\n"a\rb";x');
});
it('guards against formula injection', () => {
  expect(toCSV([{ p: '=SUM(A1)', n: '@x' }], cols)).toBe("\uFEFFProducto;Nota\r\n'=SUM(A1);'@x");
  expect(toCSV([{ p: '+1', n: '-2' }], cols)).toBe("\uFEFFProducto;Nota\r\n'+1;'-2");
});
