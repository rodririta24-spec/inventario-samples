import { toCSV } from '../lib/csv.js';
import { CATEGORIES, STATUSES, DUE_STATES, labelOf } from '../lib/constants.js';
import { dueState, formatDate } from '../lib/dates.js';

export function exportCSV(rows, today) {
  const columns = [
    { label: 'Producto', value: (d) => d.product },
    { label: 'Categoría', value: (d) => labelOf(CATEGORIES, d.category) },
    { label: 'Modelo', value: (d) => d.model },
    { label: 'Color', value: (d) => d.color },
    { label: 'Serial / IMEI', value: (d) => d.serial },
    { label: 'Estado', value: (d) => labelOf(STATUSES, d.status) },
    { label: 'Owner', value: (d) => d.owner },
    { label: 'Locación', value: (d) => d.location },
    { label: 'Fecha solicitud', value: (d) => formatDate(d.requestDate) },
    { label: 'Vencimiento', value: (d) => formatDate(d.dueDate) },
    { label: 'Estado vencimiento', value: (d) => DUE_STATES[dueState(d, today)] ?? '' },
    { label: 'Fecha devolución', value: (d) => formatDate(d.returnedDate) },
  ];
  const blob = new Blob([toCSV(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventario-${today}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
