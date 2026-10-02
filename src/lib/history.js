const TRACKED = [
  ['status', 'estado'],
  ['owner', 'owner'],
  ['location', 'locacion'],
  ['dueDate', 'renovacion'],
];
const EDIT_FIELDS = ['product', 'category', 'model', 'color', 'serial', 'requestDate'];

const val = (o, f) => o?.[f] ?? null;

export function applyStatusRules(before, after, today) {
  const next = { ...after };
  if (next.status === 'devuelto') {
    if (val(before, 'status') !== 'devuelto') next.returnedDate = today;
  } else {
    next.returnedDate = null;
  }
  return next;
}

export function diffToHistory(before, after, note = '') {
  if (!before) return [{ type: 'alta', field: null, from: null, to: null, note }];
  const entries = [];
  for (const [field, type] of TRACKED) {
    const from = val(before, field);
    const to = val(after, field);
    if (from !== to) entries.push({ type, field, from, to, note });
  }
  const edited = EDIT_FIELDS.filter((f) => val(before, f) !== val(after, f));
  if (edited.length) {
    entries.push({
      type: 'edicion',
      field: edited.join(', '),
      from: edited.map((f) => val(before, f) ?? '').join(' | '),
      to: edited.map((f) => val(after, f) ?? '').join(' | '),
      note,
    });
  }
  return entries;
}
