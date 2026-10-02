import { DUE_SOON_DAYS, INACTIVE_STATUSES } from './constants.js';

const pad = (n) => String(n).padStart(2, '0');

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dueState(device, today = todayISO()) {
  if (!device.dueDate || INACTIVE_STATUSES.includes(device.status)) return null;
  if (device.dueDate < today) return 'vencido';
  if (device.dueDate <= addDaysISO(today, DUE_SOON_DAYS)) return 'por_vencer';
  return 'vigente';
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
