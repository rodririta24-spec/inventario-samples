export const CATEGORIES = [
  { value: 'celular', label: 'Celular' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'wearable', label: 'Wearable' },
  { value: 'audio', label: 'Audio' },
  { value: 'tv', label: 'TV' },
  { value: 'otro', label: 'Otro' },
];

export const STATUSES = [
  { value: 'en_stock', label: 'En stock' },
  { value: 'asignado', label: 'Asignado' },
  { value: 'devuelto', label: 'Devuelto' },
  { value: 'perdido', label: 'Perdido' },
  { value: 'no_return', label: 'No return' },
];

export const DUE_STATES = { vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencido' };

export const DUE_SOON_DAYS = 30;
export const INACTIVE_STATUSES = ['devuelto', 'perdido', 'no_return'];

export const labelOf = (list, value) => list.find((i) => i.value === value)?.label ?? value ?? '';
