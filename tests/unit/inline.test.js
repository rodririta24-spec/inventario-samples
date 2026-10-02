import { describe, it, expect } from 'vitest';
import { withField, sameFieldValue, mergeFormChanges } from '../../src/lib/device.js';

const device = {
  id: 'X1', product: 'Z Flip5', category: 'celular', model: null, color: 'Mint', serial: '123', status: 'en_stock',
  owner: 'Ana', location: undefined, requestDate: '2026-09-01', dueDate: '2027-03-01', returnedDate: null, photoIds: ['p'],
};

describe('withField', () => {
  it('returns only FIELDS with the override applied', () => {
    expect(withField(device, 'status', 'asignado')).toEqual({
      product: 'Z Flip5', category: 'celular', model: null, color: 'Mint', serial: '123', status: 'asignado',
      owner: 'Ana', location: null, requestDate: '2026-09-01', dueDate: '2027-03-01',
    });
  });
  it('can clear a field', () => expect(withField(device, 'dueDate', '').dueDate).toBe(''));
  it('does not mutate the device', () => {
    withField(device, 'owner', 'Beto');
    expect(device.owner).toBe('Ana');
  });
});

describe('sameFieldValue', () => {
  it('treats null, undefined and blank as equal', () => {
    expect(sameFieldValue(null, '')).toBe(true);
    expect(sameFieldValue(undefined, '   ')).toBe(true);
  });
  it('ignores surrounding whitespace', () => expect(sameFieldValue('Ana', ' Ana ')).toBe(true));
  it('detects changes', () => {
    expect(sameFieldValue('Ana', 'Beto')).toBe(false);
    expect(sameFieldValue('2027-03-01', '')).toBe(false);
  });
});

describe('mergeFormChanges', () => {
  const rendered = { ...device };
  it('applies only the fields the form changed on top of the latest device', () => {
    const latest = { ...device, status: 'asignado', owner: 'Beto' }; // cambio inline posterior al render del panel
    const form = { ...withField(rendered, 'color', 'Azul'), model: '' }; // model: null -> '' no es un cambio
    expect(mergeFormChanges(rendered, latest, form)).toEqual({ ...withField(latest, 'color', 'Azul') });
  });
  it('form changes win over the latest value of the same field', () => {
    const latest = { ...device, owner: 'Beto' };
    expect(mergeFormChanges(rendered, latest, withField(rendered, 'owner', 'Caro')).owner).toBe('Caro');
  });
  it('can clear a field', () => {
    expect(mergeFormChanges(rendered, rendered, withField(rendered, 'dueDate', '')).dueDate).toBe('');
  });
});
