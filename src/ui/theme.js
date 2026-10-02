export function initTheme() {
  try {
    const t = localStorage.getItem('theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch { /* storage bloqueado: usa el tema del sistema */ }
}

export function toggleTheme() {
  const root = document.documentElement;
  const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* ignorar */ }
}
