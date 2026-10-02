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
  it('replaces slashes', () => expect(serialToDocId('sm/123')).toBe('SM_123'));
  it('throws on empty', () => expect(() => serialToDocId('   ')).toThrow('Serial vacío'));
  it('throws on dot ids', () => expect(() => serialToDocId('..')).toThrow());
});
