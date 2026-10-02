import { CATEGORIES, STATUSES, DUE_STATES, labelOf } from '../lib/constants.js';
import { dueState, formatDate } from '../lib/dates.js';
import { esc } from '../lib/html.js';
import { optionsHTML } from './form.js';

const CARDS = [
  ['en_poder', 'En mi poder'],
  ['por_vencer', 'Por vencer'],
  ['vencido', 'Vencidos'],
  ['asignados', 'Asignados a otros'],
];

const COLS = [
  ['product', 'Producto'], ['category', 'Categoría'], ['model', 'Modelo'], ['color', 'Color'],
  ['serial', 'Serial / IMEI'], ['status', 'Estado'], ['owner', 'Owner'], ['location', 'Locación'], ['dueDate', 'Vencimiento'],
];

export function renderSummary(el, summary, active, onPick) {
  el.innerHTML = CARDS.map(([k, label]) => `
    <button class="stat stat-${k}${active === k ? ' active' : ''}" data-quick="${k}">
      <span class="stat-value">${summary[k]}</span><span class="stat-label">${label}</span>
    </button>`).join('');
  el.querySelectorAll('[data-quick]').forEach((b) => (b.onclick = () => onPick(b.dataset.quick === active ? '' : b.dataset.quick)));
}

export function renderToolbar(el, onChange) {
  const dueOptions = Object.entries(DUE_STATES).map(([value, label]) => ({ value, label }));
  el.innerHTML = `
    <input type="search" id="f-q" placeholder="Buscar producto, modelo, serial/IMEI u owner…" aria-label="Buscar">
    <select id="f-category" aria-label="Categoría"><option value="">Todas las categorías</option>${optionsHTML(CATEGORIES)}</select>
    <select id="f-status" aria-label="Estado"><option value="">Todos los estados</option>${optionsHTML(STATUSES)}</select>
    <select id="f-owner" aria-label="Owner"></select>
    <select id="f-location" aria-label="Locación"></select>
    <select id="f-due" aria-label="Vencimiento"><option value="">Cualquier vencimiento</option>${optionsHTML(dueOptions)}</select>
    <label class="check"><input type="checkbox" id="f-returned"> Mostrar devueltos</label>
    <button class="btn btn-ghost" id="f-clear">Limpiar filtros</button>`;
  const bind = (id, key, prop = 'value', evt = 'change') => {
    const input = el.querySelector(id);
    input.addEventListener(evt, () => onChange({ [key]: input[prop] }));
  };
  bind('#f-q', 'q', 'value', 'input');
  bind('#f-category', 'category');
  bind('#f-status', 'status');
  bind('#f-owner', 'owner');
  bind('#f-location', 'location');
  bind('#f-due', 'due');
  bind('#f-returned', 'showReturned', 'checked');
  el.querySelector('#f-clear').onclick = () => onChange(null);
}

const valueOptions = (placeholder, values) =>
  `<option value="">${placeholder}</option>${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;

function setValueOptions(select, placeholder, values, active) {
  const list = active && !values.includes(active) ? [...values, active] : values;
  const key = list.join('\u0001');
  if (select.dataset.opts === key) return;
  select.innerHTML = valueOptions(placeholder, list);
  select.dataset.opts = key;
}

// Refleja `filters` en los controles y actualiza las opciones de owner/locación.
export function syncToolbar(el, filters, owners, locations) {
  setValueOptions(el.querySelector('#f-owner'), 'Todos los owners', owners, filters.owner);
  setValueOptions(el.querySelector('#f-location'), 'Todas las locaciones', locations, filters.location);
  const q = el.querySelector('#f-q');
  if (document.activeElement !== q) q.value = filters.q;
  el.querySelector('#f-category').value = filters.category;
  el.querySelector('#f-status').value = filters.status;
  el.querySelector('#f-owner').value = filters.owner;
  el.querySelector('#f-location').value = filters.location;
  el.querySelector('#f-due').value = filters.due;
  el.querySelector('#f-returned').checked = filters.showReturned;
}

// Edición inline (solo admin): clic simple abre selector/fecha/texto; doble clic edita los campos de texto libre.
const EDIT_MODES = {
  category: 'click', status: 'click', owner: 'click', location: 'click', dueDate: 'click',
  product: 'dblclick', model: 'dblclick', color: 'dblclick', serial: 'dblclick',
};
const OPEN_DELAY_MS = 250;
let pendingOpen = null;
const cancelPendingOpen = () => {
  clearTimeout(pendingOpen);
  pendingOpen = null;
};

// handlers: { onSort, onSelect, onSelectAll, onOpen(id), onInlineEdit(id, field, cellEl) }
export function renderTable(el, rows, ctx, handlers) {
  const { sort, selected, isAdmin, today } = ctx;
  const edit = (field, cls = '') => {
    const mode = isAdmin && EDIT_MODES[field];
    const classes = [cls, mode ? 'cell-edit' : ''].filter(Boolean).join(' ');
    return `${classes ? ` class="${classes}"` : ''}${mode
      ? ` data-edit="${field}" data-edit-mode="${mode}" title="${mode === 'click' ? 'Clic para editar' : 'Doble clic para editar'}"`
      : ''}`;
  };
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const head = `<tr>
    ${isAdmin ? `<th class="col-check"><input type="checkbox" id="sel-all" ${allSelected ? 'checked' : ''} aria-label="Seleccionar todos"></th>` : ''}
    ${COLS.map(([k, l]) => `<th data-sort="${k}" class="sortable${sort.key === k ? ` sorted-${sort.dir}` : ''}">${l}</th>`).join('')}
  </tr>`;
  const body = rows.length
    ? rows.map((d) => {
        const ds = dueState(d, today);
        return `<tr data-id="${esc(d.id)}" tabindex="0" class="${selected.has(d.id) ? 'selected' : ''}">
          ${isAdmin ? `<td class="col-check"><input type="checkbox" data-sel="${esc(d.id)}" ${selected.has(d.id) ? 'checked' : ''} aria-label="Seleccionar"></td>` : ''}
          <td${edit('product', 'strong')}>${esc(d.product)}</td>
          <td${edit('category')}>${esc(labelOf(CATEGORIES, d.category))}</td>
          <td${edit('model')}>${esc(d.model)}</td>
          <td${edit('color')}>${esc(d.color)}</td>
          <td${edit('serial', 'mono')}>${esc(d.serial)}</td>
          <td${edit('status')}><span class="pill pill-${esc(d.status)}">${esc(labelOf(STATUSES, d.status))}</span></td>
          <td${edit('owner')}>${esc(d.owner)}</td>
          <td${edit('location')}>${esc(d.location)}</td>
          <td${edit('dueDate')}>${d.dueDate ? `<span class="due due-${ds ?? 'none'}" title="${esc(DUE_STATES[ds] ?? '')}">${esc(formatDate(d.dueDate))}</span>` : ''}</td>
        </tr>`;
      }).join('')
    : `<tr><td class="empty" colspan="${COLS.length + (isAdmin ? 1 : 0)}">No hay equipos que coincidan.</td></tr>`;
  el.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;

  el.querySelectorAll('th[data-sort]').forEach((th) => (th.onclick = () => handlers.onSort(th.dataset.sort)));
  el.querySelector('#sel-all')?.addEventListener('change', (e) => handlers.onSelectAll(e.target.checked, rows.map((r) => r.id)));
  el.querySelectorAll('[data-sel]').forEach((cb) => {
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => handlers.onSelect(cb.dataset.sel, cb.checked);
  });
  el.querySelectorAll('td.col-check').forEach((td) => (td.onclick = (e) => e.stopPropagation()));
  el.querySelectorAll('tbody tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    tr.onclick = (e) => {
      cancelPendingOpen();
      const cell = e.target.closest('td[data-edit]');
      if (cell?.dataset.editMode === 'click') {
        handlers.onInlineEdit(id, cell.dataset.edit, cell);
      } else if (cell?.dataset.editMode === 'dblclick') {
        // Se demora la apertura del panel para que un doble clic no la dispare.
        if (e.detail <= 1) pendingOpen = setTimeout(() => { pendingOpen = null; handlers.onOpen(id); }, OPEN_DELAY_MS);
      } else {
        handlers.onOpen(id);
      }
    };
    tr.ondblclick = (e) => {
      const cell = e.target.closest('td[data-edit]');
      if (cell?.dataset.editMode !== 'dblclick') return;
      cancelPendingOpen();
      window.getSelection()?.removeAllRanges();
      handlers.onInlineEdit(id, cell.dataset.edit, cell);
    };
    tr.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target === tr) handlers.onOpen(id);
    };
  });
}
