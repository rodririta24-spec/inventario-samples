import { CATEGORIES, STATUSES } from '../lib/constants.js';
import { FIELDS } from '../lib/device.js';
import { esc } from '../lib/html.js';
import { DuplicateSerialError } from '../lib/errors.js';
import { errorMessage } from './dom.js';

export const optionsHTML = (list, selected) =>
  list.map((o) => `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');

export const datalistHTML = (id, values = []) =>
  `<datalist id="${id}">${values.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;

export function deviceFieldsHTML(d = {}, suggestions = {}) {
  const v = (f) => esc(d[f] ?? '');
  return `
    <div class="form-grid">
      <label>Producto *<input name="product" required value="${v('product')}" list="dl-product" autocomplete="off"></label>
      <label>Categoría<select name="category">${optionsHTML(CATEGORIES, d.category ?? 'celular')}</select></label>
      <label>Modelo<input name="model" value="${v('model')}" list="dl-model" autocomplete="off"></label>
      <label>Color<input name="color" value="${v('color')}" autocomplete="off"></label>
      <label class="span-2">Serial / IMEI *<input name="serial" required value="${v('serial')}" autocomplete="off" class="mono"></label>
      <label>Estado<select name="status">${optionsHTML(STATUSES, d.status ?? 'en_stock')}</select></label>
      <label>Owner actual<input name="owner" value="${v('owner')}" list="dl-owner" autocomplete="off"></label>
      <label>Locación<input name="location" value="${v('location')}" list="dl-location" autocomplete="off"></label>
      <label>Fecha solicitud<input type="date" name="requestDate" value="${v('requestDate')}"></label>
      <label>Vencimiento<input type="date" name="dueDate" value="${v('dueDate')}"></label>
    </div>
    ${datalistHTML('dl-product', suggestions.product)}${datalistHTML('dl-model', suggestions.model)}
    ${datalistHTML('dl-owner', suggestions.owner)}${datalistHTML('dl-location', suggestions.location)}`;
}

export function readDeviceFields(form) {
  return Object.fromEntries(FIELDS.map((f) => [f, form.elements.namedItem(f)?.value ?? '']));
}

export function hideFormError(form) {
  const p = form.querySelector('.form-error');
  if (p) { p.hidden = true; p.innerHTML = ''; }
}

export function showFormError(form, err, onOpenExisting) {
  const p = form.querySelector('.form-error');
  p.hidden = false;
  if (err instanceof DuplicateSerialError) {
    const e = err.existing;
    p.innerHTML = `Ya existe: <strong>${esc(e.product)}</strong>${e.owner ? ` de ${esc(e.owner)}` : ''} (${esc(e.serial)}). `;
    if (onOpenExisting) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.textContent = 'Ver equipo';
      b.onclick = () => onOpenExisting(e.id);
      p.append(b);
    }
  } else {
    p.textContent = errorMessage(err);
  }
}
