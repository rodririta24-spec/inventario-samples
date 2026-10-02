import { describe, it, expect } from 'vitest';
import { filterDevices, summarize, sortDevices, distinctValues } from '../../src/lib/filters.js';

const today = '2026-10-02';
const devs = [
  { id: 'a', product: 'Z Flip5', model: 'SM-F731B', serial: '111', category: 'celular', status: 'asignado', owner: 'Ana', location: 'Oficina', dueDate: '2026-10-10' },
  { id: 'b', product: 'Watch6', model: 'SM-R930', serial: '222', category: 'wearable', status: 'en_stock', owner: null, location: 'Cajón', dueDate: '2026-09-01' },
  { id: 'c', product: 'Tab S9', model: 'SM-X710', serial: '333', category: 'tablet', status: 'devuelto', owner: null, location: null, dueDate: '2026-01-01' },
  { id: 'd', product: 'Buds3', model: 'SM-R530', serial: '444', category: 'audio', status: 'perdido', owner: 'Beto', location: null, dueDate: null },
  { id: 'e', product: 'A55', model: 'SM-A556', serial: '555', category: 'celular', status: 'en_stock', owner: null, location: 'Cajón', dueDate: '2027-06-01' },
];
const ids = (r) => r.map((d) => d.id);

describe('filterDevices', () => {
  it('hides devueltos by default', () => expect(ids(filterDevices(devs, {}, today))).toEqual(['a', 'b', 'd', 'e']));
  it('shows devueltos with toggle', () => expect(ids(filterDevices(devs, { showReturned: true }, today))).toHaveLength(5));
  it('status filter devuelto shows them even without toggle', () => expect(ids(filterDevices(devs, { status: 'devuelto' }, today))).toEqual(['c']));
  it('search matches serial, model, owner (case-insensitive)', () => {
    expect(ids(filterDevices(devs, { q: '222' }, today))).toEqual(['b']);
    expect(ids(filterDevices(devs, { q: 'sm-f731' }, today))).toEqual(['a']);
    expect(ids(filterDevices(devs, { q: 'ana' }, today))).toEqual(['a']);
  });
  it('category / owner / location / due filters', () => {
    expect(ids(filterDevices(devs, { category: 'celular' }, today))).toEqual(['a', 'e']);
    expect(ids(filterDevices(devs, { owner: 'Beto' }, today))).toEqual(['d']);
    expect(ids(filterDevices(devs, { location: 'Cajón' }, today))).toEqual(['b', 'e']);
    expect(ids(filterDevices(devs, { due: 'vencido' }, today))).toEqual(['b']);
  });
  it('quick filters', () => {
    expect(ids(filterDevices(devs, { quick: 'por_vencer' }, today))).toEqual(['a']);
    expect(ids(filterDevices(devs, { quick: 'asignados' }, today))).toEqual(['a']);
    expect(ids(filterDevices(devs, { quick: 'en_poder' }, today))).toEqual(['a', 'b', 'e']);
  });
});

describe('summarize', () => {
  it('counts quick categories', () =>
    expect(summarize(devs, today)).toEqual({ en_poder: 3, por_vencer: 1, vencido: 1, asignados: 1 }));
});

describe('sortDevices', () => {
  it('sorts asc with empties last', () => expect(ids(sortDevices(devs, 'dueDate', 'asc'))).toEqual(['c', 'b', 'a', 'e', 'd']));
  it('sorts desc with empties still last', () => expect(ids(sortDevices(devs, 'dueDate', 'desc'))).toEqual(['e', 'a', 'b', 'c', 'd']));
  it('does not mutate', () => {
    const copy = [...devs];
    sortDevices(devs, 'product', 'asc');
    expect(devs).toEqual(copy);
  });
});

describe('distinctValues', () => {
  it('unique, non-empty, sorted', () => expect(distinctValues(devs, 'location')).toEqual(['Cajón', 'Oficina']));
});
