export function toCSV(rows, columns, sep = ';') {
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map((c) => q(c.label)).join(sep),
    ...rows.map((r) => columns.map((c) => q(c.value(r))).join(sep)),
  ];
  return '﻿' + lines.join('\r\n');
}
