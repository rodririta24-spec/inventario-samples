import { esc } from '../lib/html.js';

// Editor flotante (uno solo a la vez) que vive en <body>, así sobrevive a los re-render de la tabla.
let current = null;

// opts: { anchor: Element, relocate?: () => Element|null, kind: 'picker'|'date'|'text',
//         options?: [{ value, label }], value, suggestions?: string[], onCommit(value) }
export function openInlineEditor({ anchor, relocate, kind, options = [], value, suggestions = [], onCommit }) {
  closeInlineEditor();
  const el = document.createElement('div');
  el.className = `inline-editor inline-editor-${kind}`;
  el.tabIndex = -1;
  if (kind === 'picker') {
    el.setAttribute('role', 'listbox');
    el.innerHTML = options.map((o) => `<button type="button" class="inline-option${o.value === value ? ' current' : ''}" data-value="${esc(o.value)}"${o.value === value ? ' aria-selected="true"' : ''}>${esc(o.label)}</button>`).join('');
  } else if (kind === 'date') {
    el.innerHTML = `<input type="date" value="${esc(value ?? '')}" aria-label="Fecha">`;
  } else {
    el.innerHTML = `<input type="text" value="${esc(value ?? '')}" autocomplete="off"${suggestions.length ? ' list="inline-editor-dl"' : ''}>
      ${suggestions.length ? `<datalist id="inline-editor-dl">${suggestions.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>` : ''}`;
  }
  document.body.append(el);

  const ed = { el, anchor, relocate, done: false };
  const finish = (commit, val) => {
    if (ed.done) return;
    ed.done = true;
    closeInlineEditor();
    if (commit) onCommit(val);
  };
  ed.finish = finish;

  el.addEventListener('focusout', (e) => {
    if (el.contains(e.relatedTarget)) return;
    // Cambio de ventana/pestaña: no confirmar; el foco vuelve al input al regresar.
    if (!document.hasFocus()) return;
    if (kind === 'picker') finish(false);
    else finish(true, el.querySelector('input').value);
  });

  if (kind === 'picker') {
    el.querySelectorAll('[data-value]').forEach((b) => (b.onclick = () => finish(true, b.dataset.value)));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const btns = [...el.querySelectorAll('[data-value]')];
      const i = btns.indexOf(document.activeElement);
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
    });
  } else {
    const input = el.querySelector('input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true, input.value);
      }
    });
  }

  current = ed;
  position();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);

  if (kind === 'picker') (el.querySelector('.current') ?? el.querySelector('button'))?.focus();
  else {
    const input = el.querySelector('input');
    input.focus();
    if (kind === 'text') input.select();
  }
}

export function closeInlineEditor() {
  if (!current) return;
  const { el } = current;
  current.done = true;
  current = null;
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('scroll', position, true);
  window.removeEventListener('resize', position);
  el.remove();
}

function onKey(e) {
  if (e.key !== 'Escape' || !current) return;
  e.preventDefault();
  e.stopPropagation();
  current.finish(false);
}

// Ubica el editor debajo de la celda (o arriba si no entra). Si la tabla se re-renderizó,
// busca la celda nueva con `relocate`; si ya no existe, deja el editor donde estaba.
function position(e) {
  if (!current) return;
  const { el } = current;
  if (e?.target instanceof Node && el.contains(e.target)) return;
  if (!current.anchor?.isConnected) current.anchor = current.relocate?.() ?? current.anchor;
  if (!current.anchor?.isConnected) return;
  const r = current.anchor.getBoundingClientRect();
  el.style.minWidth = `${Math.max(r.width, 200)}px`;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const below = r.bottom + 4;
  const top = below + h > window.innerHeight - 8 && r.top - h - 4 >= 8 ? r.top - h - 4 : below;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}
