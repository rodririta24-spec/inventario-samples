import { describe, it, expect } from 'vitest';
import { normalizeSerial, serialToDocId } from '../../src/lib/serial.js';

describe('normalizeSerial', () => {
  it('trims and uppercases', () => expect(normalizeSerial('  rf2r50852re ')).toBe('RF2R50852RE'));
  it('collapses inner whitespace', () => expect(normalizeSerial('A   b')).toBe('A B'));
  it('handles null/undefined', () => {
    expect(normalizeSerial(null)).toBe('');
    expect(normalizeSerial(undefined)).toBe('');
  });
});

describe('serialToDocId', () => {
  it('percent-encodes slashes', () => expect(serialToDocId('sm/123')).toBe('SM%2F123'));
  it('maps colliding-looking serials to distinct ids', () => {
    const ids = ['AB/1', 'AB_1', 'AB%2F1'].map(serialToDocId);
    expect(new Set(ids).size).toBe(3);
  });
  it('throws on empty', () => expect(() => serialToDocId('   ')).toThrow('Serial vacío'));
  it('throws on dot ids', () => expect(() => serialToDocId('..')).toThrow());
  it('throws on reserved __x__ ids', () => expect(() => serialToDocId('__A__')).toThrow('Serial inválido: __A__'));
  it('throws on too long serials', () => expect(() => serialToDocId('A'.repeat(2000))).toThrow('Serial demasiado largo'));
});
