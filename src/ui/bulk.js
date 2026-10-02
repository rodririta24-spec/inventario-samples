import { STATUSES } from '../lib/constants.js';
import { openDialog, closeDialog, setBusy } from './dom.js';
import { optionsHTML, datalistHTML, showFormError } from './form.js';

const ACTIONS = {
  renovar: { button: 'Renovar vencimiento', title: 'Renovar vencimiento', field: 'dueDate',
    input: () => '<label class="block">Nuevo vencimiento<input type="date" name="bulkValue" required></label>' },
  estado: { button: 'Cambiar estado', title: 'Cambiar estado', field: 'status',
    input: () => `<label class="block">Nuevo estado<select name="bulkValue">${optionsHTML(STATUSES, 'asignado')}</select></label>` },
  owner: { button: 'Cambiar owner', title: 'Cambiar owner', field: 'owner',
    input: (s) => `<label class="block">Nuevo owner (vacío = sin owner)<input name="bulkValue" list="dl-bulk" autocomplete="off"></label>${datalistHTML('dl-bulk', s.owner)}` },
  locacion: { button: 'Cambiar locación', title: 'Cambiar locación', field: 'location',
    input: (s) => `<label class="block">Nueva locación (vacío = sin locación)<input name="bulkValue" list="dl-bulk" autocomplete="off"></label>${datalistHTML('dl-bulk', s.location)}` },
  devuelto: { button: 'Marcar devuelto', title: 'Marcar como devuelto', field: 'status', fixed: 'devuelto',
    input: () => '<p>La fecha de devolución se completa sola con la de hoy.</p>' },
};

export function renderBulkBar(el, count, onAction, hidden = 0) {
  el.hidden = count === 0;
  if (!count) { el.innerHTML = ''; return; }
  el.innerHTML = `<span><strong>${count}</strong> seleccionado(s)${hidden ? ` (${hidden} ocultos por filtros)` : ''}</span>
    ${Object.entries(ACTIONS).map(([k, a]) => `<button class="btn" data-act="${k}">${a.button}</button>`).join('')}
    <button class="btn btn-ghost" data-act="clear">Quitar selección</button>`;
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => onAction(b.dataset.act)));
}

// onSubmit(patch, note) => Promise; si lanza, el error se muestra en el diálogo.
export function openBulkDialog(action, count, suggestions, onSubmit) {
  const a = ACTIONS[action];
  const dlg = openDialog(`
    <h2>${a.title}</h2>
    <p class="muted">Se aplica a ${count} equipo(s).</p>
    <form id="bulk-form">
      ${a.input(suggestions)}
      <label class="block">Nota (opcional)<input name="note"></label>
      <p class="form-error" hidden></p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn-primary">Aplicar</button>
      </div>
    </form>`);
  const form = dlg.querySelector('#bulk-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const value = a.fixed ?? form.elements.namedItem('bulkValue').value.trim();
    setBusy(form, true);
    try {
      await onSubmit({ [a.field]: value }, form.elements.namedItem('note').value.trim());
      closeDialog();
    } catch (err) {
      showFormError(form, err);
    } finally {
      setBusy(form, false);
    }
  };
}
