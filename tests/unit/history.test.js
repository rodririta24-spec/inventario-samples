import { describe, it, expect } from 'vitest';
import { applyStatusRules, diffToHistory } from '../../src/lib/history.js';

const today = '2026-10-02';

describe('applyStatusRules', () => {
  it('sets returnedDate when becoming devuelto', () => {
    const r = applyStatusRules({ status: 'asignado', returnedDate: null }, { status: 'devuelto', returnedDate: null }, today);
    expect(r.returnedDate).toBe(today);
  });
  it('sets returnedDate when created as devuelto', () => {
    expect(applyStatusRules(null, { status: 'devuelto' }, today).returnedDate).toBe(today);
  });
  it('keeps returnedDate while staying devuelto', () => {
    const r = applyStatusRules({ status: 'devuelto', returnedDate: '2026-01-01' }, { status: 'devuelto', returnedDate: '2026-01-01' }, today);
    expect(r.returnedDate).toBe('2026-01-01');
  });
  it('clears returnedDate when leaving devuelto', () => {
    const r = applyStatusRules({ status: 'devuelto', returnedDate: '2026-01-01' }, { status: 'en_stock', returnedDate: '2026-01-01' }, today);
    expect(r.returnedDate).toBeNull();
  });
  it('does not mutate input', () => {
    const after = { status: 'devuelto' };
    applyStatusRules(null, after, today);
    expect(after).toEqual({ status: 'devuelto' });
  });
});

describe('diffToHistory', () => {
  const base = { product: 'A54', category: 'celular', model: 'SM-A546E', color: 'Negro', serial: 'X1', status: 'en_stock', owner: null, location: 'Cajón', requestDate: '2026-01-01', dueDate: '2026-06-01' };

  it('alta when no before', () => {
    expect(diffToHistory(null, base, 'n')).toEqual([{ type: 'alta', field: null, from: null, to: null, note: 'n' }]);
  });
  it('empty when nothing changed (undefined == null)', () => {
    expect(diffToHistory(base, { ...base, owner: undefined })).toEqual([]);
  });
  it('estado entry', () => {
    expect(diffToHistory(base, { ...base, status: 'asignado' })).toEqual([
      { type: 'estado', field: 'status', from: 'en_stock', to: 'asignado', note: '' },
    ]);
  });
  it('renovacion entry for dueDate', () => {
    const [e] = diffToHistory(base, { ...base, dueDate: '2026-12-01' }, 'renovado');
    expect(e).toEqual({ type: 'renovacion', field: 'dueDate', from: '2026-06-01', to: '2026-12-01', note: 'renovado' });
  });
  it('owner and location produce two entries', () => {
    const r = diffToHistory(base, { ...base, owner: 'Ana', location: 'Oficina' });
    expect(r.map((e) => e.type)).toEqual(['owner', 'locacion']);
  });
  it('other fields collapse into one edicion entry', () => {
    const r = diffToHistory(base, { ...base, product: 'A55', color: 'Lima' });
    expect(r).toEqual([{ type: 'edicion', field: 'product, color', from: 'A54 | Negro', to: 'A55 | Lima', note: '' }]);
  });
});
