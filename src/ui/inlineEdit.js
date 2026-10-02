import { esc } from '../lib/html.js';

// Editor flotante (uno solo a la vez) que vive en <body>, así sobrevive a los re-render de la tabla.
let current = null;

// opts: { anchor: Element, relocate?: () => Element|null, bounds?: () => {top,bottom,left,right}|null, kind: 'picker'|'date'|'text',
//         options?: [{ value, label }], value, suggestions?: string[], onCommit(value) }
export function openInlineEditor({ anchor, relocate, bounds, kind, options = [], value, suggestions = [], onCommit }) {
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

  const ed = { el, anchor, relocate, bounds, done: false };
  const finish = (commit, val) => {
    if (ed.done) return;
    ed.done = true;
    closeInlineEditor();
    if (commit) onCommit(val);
  };
  ed.finish = finish;
  // Fecha incompleta/ inválida: el input reporta '' con badInput; no debe interpretarse como "borrar vencimiento".
  const commitInput = () => {
    const input = el.querySelector('input');
    if (input.value === '' && input.validity.badInput) finish(false);
    else finish(true, input.value);
  };

  el.addEventListener('focusout', (e) => {
    if (el.contains(e.relatedTarget)) return;
    // Cambio de ventana/pestaña: no confirmar; el foco vuelve al input al regresar.
    if (!document.hasFocus()) return;
    if (kind === 'picker') finish(false);
    else commitInput();
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
        commitInput();
      }
    });
  }

  current = ed;
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);
  position();
  if (ed.done) return; // la celda no estaba visible

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

// Reubica el editor tras un re-render de la tabla (o lo cierra si su celda ya no está visible).
export function repositionInlineEditor() {
  position();
}

// Ubica el editor debajo de la celda (o arriba si no entra). Si la tabla se re-renderizó, busca la celda
// nueva con `relocate`. Si la celda ya no existe o quedó fuera de `bounds` (scroll), cierra sin confirmar.
function position(e) {
  if (!current) return;
  const { el } = current;
  if (e?.target instanceof Node && el.contains(e.target)) return;
  if (!current.anchor?.isConnected) current.anchor = current.relocate?.() ?? null;
  if (!current.anchor?.isConnected) {
    current.finish(false);
    return;
  }
  const r = current.anchor.getBoundingClientRect();
  const b = current.bounds?.();
  if (b) {
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    if (cy < b.top || cy > b.bottom || cx < b.left || cx > b.right) {
      current.finish(false);
      return;
    }
  }
  el.style.minWidth = `${Math.max(r.width, 200)}px`;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const below = r.bottom + 4;
  const top = below + h > window.innerHeight - 8 && r.top - h - 4 >= 8 ? r.top - h - 4 : below;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}
