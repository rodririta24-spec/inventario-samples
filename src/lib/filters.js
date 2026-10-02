import { dueState } from './dates.js';

const SEARCH_FIELDS = ['product', 'model', 'serial', 'owner'];

export const QUICK = {
  en_poder: (d) => !['devuelto', 'perdido'].includes(d.status),
  por_vencer: (d, today) => dueState(d, today) === 'por_vencer',
  vencido: (d, today) => dueState(d, today) === 'vencido',
  asignados: (d) => d.status === 'asignado',
};

function matchesSearch(d, q) {
  const needle = (q ?? '').trim().toLowerCase();
  if (!needle) return true;
  return SEARCH_FIELDS.some((f) => String(d[f] ?? '').toLowerCase().includes(needle));
}

export function filterDevices(devices, f = {}, today) {
  return devices.filter((d) => {
    if (!f.showReturned && d.status === 'devuelto' && f.status !== 'devuelto') return false;
    if (f.quick && QUICK[f.quick] && !QUICK[f.quick](d, today)) return false;
    if (f.category && d.category !== f.category) return false;
    if (f.status && d.status !== f.status) return false;
    if (f.owner && d.owner !== f.owner) return false;
    if (f.location && d.location !== f.location) return false;
    if (f.due && dueState(d, today) !== f.due) return false;
    return matchesSearch(d, f.q);
  });
}

export function summarize(devices, today) {
  return Object.fromEntries(Object.entries(QUICK).map(([k, fn]) => [k, devices.filter((d) => fn(d, today)).length]));
}

export function sortDevices(devices, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return [...devices].sort((a, b) => {
    const va = a[key] ?? '';
    const vb = b[key] ?? '';
    if (va === '' && vb === '') return 0;
    if (va === '') return 1;
    if (vb === '') return -1;
    return sign * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  });
}

export function distinctValues(devices, field) {
  return [...new Set(devices.map((d) => d[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}
