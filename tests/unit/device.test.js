import { describe, it, expect } from 'vitest';
import { cleanInput, validateDevice, prepareSave, prepareBulk } from '../../src/lib/device.js';

const today = '2026-10-02';
const input = { product: ' Z Flip5 ', category: 'celular', model: '', color: 'Mint', serial: ' 350290890120226 ', status: 'en_stock', owner: '', location: 'Cajón Cheil', requestDate: '2026-09-01', dueDate: '2027-03-01' };

describe('cleanInput', () => {
  it('trims, nulls empties and normalizes serial', () => {
    const c = cleanInput({ ...input, serial: ' ab/1 ' });
    expect(c.product).toBe('Z Flip5');
    expect(c.model).toBeNull();
    expect(c.owner).toBeNull();
    expect(c.serial).toBe('AB/1');
  });
  it('ignores unknown fields', () => expect(cleanInput({ ...input, hack: 1 }).hack).toBeUndefined());
});

describe('validateDevice', () => {
  const ok = cleanInput(input);
  it('accepts valid', () => expect(validateDevice(ok)).toEqual([]));
  it('requires product', () => expect(validateDevice({ ...ok, product: null })).toContain('Falta el producto'));
  it('requires serial', () => expect(validateDevice({ ...ok, serial: null })).toContain('Falta el serial / IMEI'));
  it('checks category', () => expect(validateDevice({ ...ok, category: 'x' })).toContain('Categoría inválida'));
  it('checks status', () => expect(validateDevice({ ...ok, status: 'x' })).toContain('Estado inválido'));
  it('dueDate not before requestDate', () =>
    expect(validateDevice({ ...ok, dueDate: '2026-08-01' })).toContain('El vencimiento no puede ser anterior a la fecha de solicitud'));
});

describe('prepareSave', () => {
  it('new device: alta entry, returnedDate null', () => {
    const r = prepareSave(null, input, today);
    expect(r.errors).toEqual([]);
    expect(r.data.returnedDate).toBeNull();
    expect(r.data.serial).toBe('350290890120226');
    expect(r.history.map((h) => h.type)).toEqual(['alta']);
  });
  it('returns errors without data', () => {
    const r = prepareSave(null, { ...input, product: '' }, today);
    expect(r.errors.length).toBe(1);
    expect(r.data).toBeUndefined();
  });
  it('becoming devuelto sets date and logs estado', () => {
    const before = { id: '350290890120226', ...prepareSave(null, input, today).data, photoIds: [] };
    const r = prepareSave(before, { ...input, status: 'devuelto' }, today, 'ok');
    expect(r.data.returnedDate).toBe(today);
    expect(r.history).toEqual([{ type: 'estado', field: 'status', from: 'en_stock', to: 'devuelto', note: 'ok' }]);
    expect(r.data.photoIds).toBeUndefined();
  });
});

describe('prepareBulk', () => {
  it('applies a partial patch over the existing device', () => {
    const before = { id: 'X', ...prepareSave(null, input, today).data };
    const r = prepareBulk(before, { dueDate: '2027-09-01' }, today, 'Renovación');
    expect(r.data.dueDate).toBe('2027-09-01');
    expect(r.data.product).toBe('Z Flip5');
    expect(r.history).toEqual([{ type: 'renovacion', field: 'dueDate', from: '2027-03-01', to: '2027-09-01', note: 'Renovación' }]);
  });
});
