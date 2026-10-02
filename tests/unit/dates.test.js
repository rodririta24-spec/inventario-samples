import { describe, it, expect } from 'vitest';
import { todayISO, addDaysISO, dueState, formatDate } from '../../src/lib/dates.js';

describe('todayISO', () => {
  it('formats local date', () => expect(todayISO(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02'));
});

describe('addDaysISO', () => {
  it('crosses months', () => expect(addDaysISO('2026-01-31', 30)).toBe('2026-03-02'));
  it('crosses years', () => expect(addDaysISO('2026-12-15', 30)).toBe('2027-01-14'));
});

describe('dueState', () => {
  const today = '2026-10-02';
  const d = (dueDate, status = 'asignado') => ({ dueDate, status });
  it('null without dueDate', () => expect(dueState(d(null), today)).toBeNull());
  it('null for inactive statuses', () => {
    for (const s of ['devuelto', 'perdido', 'no_return']) expect(dueState(d('2020-01-01', s), today)).toBeNull();
  });
  it('vencido when past', () => expect(dueState(d('2026-10-01'), today)).toBe('vencido'));
  it('por_vencer on same day', () => expect(dueState(d('2026-10-02'), today)).toBe('por_vencer'));
  it('por_vencer at +30 days', () => expect(dueState(d('2026-11-01'), today)).toBe('por_vencer'));
  it('vigente at +31 days', () => expect(dueState(d('2026-11-02'), today)).toBe('vigente'));
  it('applies to en_stock too', () => expect(dueState(d('2026-10-01', 'en_stock'), today)).toBe('vencido'));
});

describe('formatDate', () => {
  it('formats dd/mm/yyyy', () => expect(formatDate('2026-10-02')).toBe('02/10/2026'));
  it('empty for falsy', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
  });
});
