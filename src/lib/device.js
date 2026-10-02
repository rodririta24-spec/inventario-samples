import { CATEGORIES, STATUSES } from './constants.js';
import { normalizeSerial } from './serial.js';
import { applyStatusRules, diffToHistory } from './history.js';

export const FIELDS = ['product', 'category', 'model', 'color', 'serial', 'status', 'owner', 'location', 'requestDate', 'dueDate'];

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? null]));

export function cleanInput(input) {
  const out = {};
  for (const f of FIELDS) {
    let v = input?.[f];
    if (typeof v === 'string') v = v.trim();
    out[f] = v === '' || v == null ? null : v;
  }
  if (out.serial) out.serial = normalizeSerial(out.serial);
  return out;
}

export function validateDevice(d) {
  const errors = [];
  if (!d.product) errors.push('Falta el producto');
  if (!d.serial) errors.push('Falta el serial / IMEI');
  if (!CATEGORIES.some((c) => c.value === d.category)) errors.push('Categoría inválida');
  if (!STATUSES.some((s) => s.value === d.status)) errors.push('Estado inválido');
  if (d.requestDate && d.dueDate && d.dueDate < d.requestDate) errors.push('El vencimiento no puede ser anterior a la fecha de solicitud');
  return errors;
}

export function prepareSave(before, input, today, note = '') {
  const cleaned = cleanInput(input);
  const errors = validateDevice(cleaned);
  if (errors.length) return { errors };
  const merged = { returnedDate: before?.returnedDate ?? null, ...cleaned };
  const data = applyStatusRules(before, merged, today);
  const history = diffToHistory(before, data, note);
  return { errors: [], data, history };
}

export function prepareBulk(before, patch, today, note = '') {
  return prepareSave(before, { ...pick(before, FIELDS), ...patch }, today, note);
}
