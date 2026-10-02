import { CATEGORIES, STATUSES, labelOf } from '../lib/constants.js';
import { formatDate } from '../lib/dates.js';
import { esc } from '../lib/html.js';
import { deviceFieldsHTML, readDeviceFields, showFormError, hideFormError } from './form.js';
import { openDialog, setBusy, errorMessage } from './dom.js';

const TYPE_LABEL = { alta: 'Alta', estado: 'Estado', owner: 'Owner', locacion: 'Locación', renovacion: 'Renovación', edicion: 'Edición' };

function fmtValue(type, v) {
  if (type === 'estado') return labelOf(STATUSES, v) || '—';
  if (type === 'renovacion') return formatDate(v) || '—';
  return v || '—';
}

function fmtTimestamp(ts) {
  return ts?.toDate ? ts.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'ahora';
}

function historyItemHTML(e) {
  const body = e.type === 'alta'
    ? 'Ingreso del equipo'
    : e.type === 'edicion'
      ? `${esc(e.field)}: ${esc(e.from)} → ${esc(e.to)}`
      : `${esc(fmtValue(e.type, e.from))} → ${esc(fmtValue(e.type, e.to))}`;
  return `<li><time>${fmtTimestamp(e.at)}</time><strong>${TYPE_LABEL[e.type] ?? esc(e.type)}</strong> · ${body}
    ${e.note ? `<div class="muted">${esc(e.note)}</div>` : ''}</li>`;
}

function detailsHTML(d) {
  const rows = [
    ['Categoría', labelOf(CATEGORIES, d.category)], ['Modelo', d.model], ['Color', d.color],
    ['Estado', labelOf(STATUSES, d.status)], ['Owner', d.owner], ['Locación', d.location],
    ['Fecha solicitud', formatDate(d.requestDate)], ['Vencimiento', formatDate(d.dueDate)],
    ['Devuelto el', formatDate(d.returnedDate)],
  ];
  return `<dl class="details">${rows.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function fillPhotos(container, photos, isAdmin, h) {
  if (!photos.length) {
    container.innerHTML = '<span class="muted">Sin fotos.</span>';
    return;
  }
  container.innerHTML = photos.map((p) => `
    <figure class="photo">
      <img src="${esc(p.data)}" alt="Foto de evidencia" data-view>
      ${isAdmin ? `<button class="photo-del" data-del="${esc(p.id)}" aria-label="Eliminar foto">✕</button>` : ''}
    </figure>`).join('');
  container.querySelectorAll('[data-view]').forEach((img) => {
    img.onclick = () => openDialog(`<img class="photo-full" src="${esc(img.src)}" alt="Foto de evidencia">
      <div class="form-actions"><button class="btn" data-close>Cerrar</button></div>`, { wide: true });
  });
  container.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => h.onDeletePhoto(b.dataset.del)));
}

// h: { onClose, onOpen(id), onSave(input, note), onDelete(), onAddPhotos(files), onDeletePhoto(id), loadHistory(), loadPhotos() }
export function renderPanel(el, device, { isAdmin, suggestions }, h) {
  el.hidden = false;
  el.innerHTML = `
    <div class="panel-head">
      <div><h2>${esc(device.product)}</h2><div class="mono muted">${esc(device.serial)}</div></div>
      <button class="icon-btn" data-close aria-label="Cerrar">✕</button>
    </div>
    <div class="panel-body">
      ${isAdmin ? `
        <form id="panel-form">
          ${deviceFieldsHTML(device, suggestions, 'panel')}
          ${device.returnedDate ? `<p class="muted">Devuelto el ${esc(formatDate(device.returnedDate))}</p>` : ''}
          <label class="block">Nota del cambio (opcional)<input name="note" placeholder="Ej: renovado por mail de SEASA"></label>
          <p class="form-error" hidden></p>
          <div class="form-actions">
            <button type="button" class="btn btn-danger" data-delete>Eliminar</button>
            <button type="submit" class="btn btn-primary">Guardar cambios</button>
          </div>
        </form>` : detailsHTML(device)}
      <section class="panel-section">
        <h3>Fotos</h3>
        ${isAdmin ? '<label class="dropzone" id="dropzone">Arrastrá fotos acá o hacé clic para elegir<input type="file" accept="image/*" multiple hidden id="photo-input"></label>' : ''}
        <div class="photos" id="panel-photos"><span class="muted">Cargando…</span></div>
      </section>
      <section class="panel-section">
        <h3>Historial</h3>
        <ol class="history" id="panel-history"><li class="muted">Cargando…</li></ol>
      </section>
    </div>`;

  el.querySelector('[data-close]').onclick = h.onClose;

  if (isAdmin) {
    const form = el.querySelector('#panel-form');
    form.addEventListener('input', () => { form.dataset.dirty = '1'; });
    form.onsubmit = async (e) => {
      e.preventDefault();
      hideFormError(form);
      setBusy(form, true);
      try {
        await h.onSave(readDeviceFields(form), form.elements.namedItem('note').value.trim());
      } catch (err) {
        showFormError(form, err, h.onOpen);
      } finally {
        setBusy(form, false);
      }
    };
    el.querySelector('[data-delete]').onclick = h.onDelete;
    const input = el.querySelector('#photo-input');
    const dz = el.querySelector('#dropzone');
    input.onchange = () => input.files.length && h.onAddPhotos([...input.files]);
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => {
      e.preventDefault();
      dz.classList.remove('over');
      const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
      if (files.length) h.onAddPhotos(files);
    };
  }

  const photosEl = el.querySelector('#panel-photos');
  const historyEl = el.querySelector('#panel-history');
  const reloadPhotos = () => h.loadPhotos()
    .then((photos) => fillPhotos(photosEl, photos, isAdmin, h))
    .catch((e) => { photosEl.innerHTML = `<span class="form-error">${esc(errorMessage(e))}</span>`; });
  reloadPhotos();
  h.loadHistory()
    .then((entries) => { historyEl.innerHTML = entries.length ? entries.map(historyItemHTML).join('') : '<li class="muted">Sin movimientos.</li>'; })
    .catch((e) => { historyEl.innerHTML = `<li class="form-error">${esc(errorMessage(e))}</li>`; });
  return { reloadPhotos };
}
