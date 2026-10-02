import { it, expect } from 'vitest';
import { normalizeEmail, isValidEmail } from '../../src/lib/email.js';

it('normalizes', () => expect(normalizeEmail('  Ana@Cheil.COM ')).toBe('ana@cheil.com'));
it('validates', () => {
  expect(isValidEmail('ana@cheil.com')).toBe(true);
  expect(isValidEmail('ana@')).toBe(false);
  expect(isValidEmail('')).toBe(false);
});
