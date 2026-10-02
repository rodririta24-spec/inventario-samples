import { login, logout, onUser } from './firebase.js';
import { determineRole } from './data/access.js';
import { subscribeDevices, createDevice, updateDevice, deleteDevice, listHistory, bulkUpdate } from './data/devices.js';
import { addPhoto, getPhotos, deletePhoto } from './data/photos.js';
import { compressImageFile } from './lib/compress.js';
import { renderPanel } from './ui/panel.js';
import { openInlineEditor, closeInlineEditor, repositionInlineEditor } from './ui/inlineEdit.js';
import { withField, sameFieldValue, mergeFormChanges } from './lib/device.js';
import { CATEGORIES, STATUSES } from './lib/constants.js';
import { ValidationError, DuplicateSerialError } from './lib/errors.js';
import { filterDevices, summarize, sortDevices, distinctValues } from './lib/filters.js';
import { todayISO } from './lib/dates.js';
import { esc } from './lib/html.js';
import { $, toast, errorMessage, openDialog, closeDialog, setBusy } from './ui/dom.js';
import { initTheme, toggleTheme } from './ui/theme.js';
import { renderLogin, renderNoAccess, renderError } from './ui/screens.js';
import { deviceFieldsHTML, readDeviceFields, showFormError, hideFormError } from './ui/form.js';
import { renderSummary, renderToolbar, syncToolbar, renderTable } from './ui/list.js';
import { exportCSV } from './ui/export.js';
import { renderBulkBar, openBulkDialog } from './ui/bulk.js';
import { openAccessDialog } from './ui/access.js';

const app = document.getElementById('app');
const EMPTY_FILTERS = { q: '', category: '', status: '', owner: '', location: '', due: '', quick: '', showReturned: false };
const state = {
  user: null,
  role: null,
  devices: [],
  filters: { ...EMPTY_FILTERS },
  sort: { key: 'dueDate', dir: 'asc' },
  selected: new Set(),
  panelId: null,
  panelSig: null,
  panelApi: null,
  unsubscribe: null,
  saving: new Set(), // ids de equipos con un guardado en curso (inline o panel)
};

const isAdmin = () => state.role === 'admin';
const byId = (id) => state.devices.find((d) => d.id === id);
const visibleRows = () => sortDevices(filterDevices(state.devices, state.filters, todayISO()), state.sort.key, state.sort.dir);
const suggestions = () => ({
  product: distinctValues(state.devices, 'product'),
  model: distinctValues(state.devices, 'model'),
  owner: distinctValues(state.devices, 'owner'),
  location: distinctValues(state.devices, 'location'),
});

const SIG_FIELDS = ['product', 'category', 'model', 'color', 'serial', 'status', 'owner', 'location', 'requestDate', 'dueDate', 'returnedDate', 'photoIds'];
const deviceSig = (d) => JSON.stringify(SIG_FIELDS.map((f) => d[f] ?? null));

initTheme();

onUser(async (user) => {
  closeInlineEditor();
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.selected.clear();
  state.panelId = null;
  state.devices = [];
  if (!user) {
    renderLogin(app, () => login().catch((e) => toast(errorMessage(e), 'error')));
    return;
  }
  let role;
  try {
    role = await determineRole(user);
  } catch (e) {
    renderError(app, errorMessage(e), () => location.reload(), () => logout());
    return;
  }
  if (!role) {
    renderNoAccess(app, user.email, logout);
    return;
  }
  state.user = user;
  state.role = role;
  renderShell();
  state.unsubscribe = subscribeDevices(
    (devices) => {
      state.devices = devices;
      for (const id of state.selected) if (!byId(id)) state.selected.delete(id);
      renderMain();
      if (state.panelId) {
        const cur = byId(state.panelId);
        if (!cur) closePanel(true);
        else if (deviceSig(cur) !== state.panelSig) {
          const form = $('#panel')?.querySelector('#panel-form');
          const busy = form && (form.dataset.dirty === '1' || form.contains(document.activeElement));
          if (!busy) openPanel(state.panelId);
        }
      }
    },
    (e) => {
      if (e.code === 'permission-denied') {
        state.unsubscribe?.();
        state.unsubscribe = null;
        state.panelId = null;
        closeInlineEditor();
        closeDialog();
        renderNoAccess(app, state.user.email, logout);
        return;
      }
      toast(errorMessage(e), 'error');
    },
  );
});

function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <h1>Inventario de Samples</h1>
      <div class="topbar-actions">
        ${isAdmin() ? '<button class="btn btn-primary" id="btn-new">+ Nuevo equipo</button><button class="btn" id="btn-access">Accesos</button>' : ''}
        <button class="btn" id="btn-export">Exportar CSV</button>
        <button class="icon-btn" id="btn-theme" title="Cambiar tema" aria-label="Cambiar tema">◐</button>
        <span class="user">${esc(state.user.email)}${isAdmin() ? '' : ' · solo lectura'}</span>
        <button class="btn btn-ghost" id="btn-logout">Salir</button>
      </div>
    </header>
    <main class="main">
      <section id="summary" class="summary"></section>
      <section id="toolbar" class="toolbar"></section>
      <section id="bulkbar" class="bulkbar" hidden></section>
      <div class="table-wrap"><table id="table" class="table"></table></div>
    </main>
    <aside id="panel" class="panel" hidden></aside>`;
  renderToolbar($('#toolbar'), (patch) => {
    state.filters = patch ? { ...state.filters, ...patch } : { ...EMPTY_FILTERS };
    renderMain();
  });
  $('#btn-new')?.addEventListener('click', () => openNewDeviceDialog());
  $('#btn-access')?.addEventListener('click', openAccessDialog);
  $('#btn-export').onclick = () => exportCSV(visibleRows(), todayISO());
  $('#btn-theme').onclick = toggleTheme;
  $('#btn-logout').onclick = () => logout();
}

function renderMain() {
  const today = todayISO();
  renderSummary($('#summary'), summarize(state.devices, today), state.filters.quick, (quick) => {
    state.filters.quick = quick;
    renderMain();
  });
  syncToolbar($('#toolbar'), state.filters, distinctValues(state.devices, 'owner'), distinctValues(state.devices, 'location'));
  const rows = visibleRows();
  renderTable($('#table'), rows, { sort: state.sort, selected: state.selected, isAdmin: isAdmin(), today }, {
    onSort: (key) => {
      state.sort = { key, dir: state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc' };
      renderMain();
    },
    onSelect: (id, on) => {
      if (on) state.selected.add(id); else state.selected.delete(id);
      renderMain();
    },
    onSelectAll: (on, ids) => {
      for (const id of ids) if (on) state.selected.add(id); else state.selected.delete(id);
      renderMain();
    },
    onOpen: openPanel,
    onInlineEdit,
  });
  if (isAdmin()) {
    const visible = new Set(rows.map((r) => r.id));
    const hidden = [...state.selected].filter((id) => !visible.has(id)).length;
    renderBulkBar($('#bulkbar'), state.selected.size, onBulkAction, hidden);
  }
  repositionInlineEditor();
}

const INLINE_SAVED = {
  product: 'Producto actualizado', category: 'Categoría actualizada', model: 'Modelo actualizado', color: 'Color actualizado',
  serial: 'Serial actualizado', status: 'Estado actualizado', owner: 'Owner actualizado', location: 'Locación actualizada',
  dueDate: 'Vencimiento actualizado',
};

const panelIsDirty = () => $('#panel')?.querySelector('#panel-form')?.dataset.dirty === '1';

// Zona visible de la tabla: el contenedor con scroll horizontal, recortado por la topbar sticky.
function tableBounds() {
  const wrap = $('.table-wrap')?.getBoundingClientRect();
  if (!wrap) return null;
  const topbar = $('.topbar')?.getBoundingClientRect();
  return {
    top: Math.max(wrap.top, topbar?.bottom ?? 0, 0),
    bottom: Math.min(wrap.bottom, window.innerHeight),
    left: Math.max(wrap.left, 0),
    right: Math.min(wrap.right, window.innerWidth),
  };
}

function onInlineEdit(id, field, cell) {
  const device = byId(id);
  if (!isAdmin() || !device || !(field in INLINE_SAVED)) return;
  if (state.saving.has(id)) {
    toast('Guardando…', 'info');
    return;
  }
  if (state.panelId === id && panelIsDirty()) {
    toast('Guardá o descartá los cambios del panel primero', 'info');
    return;
  }
  const cellSelector = `tr[data-id="${CSS.escape(id)}"] td[data-edit="${field}"]`;
  const base = {
    anchor: cell,
    relocate: () => document.querySelector(cellSelector),
    bounds: tableBounds,
    value: device[field] ?? '',
    onCommit: (value) => commitInlineEdit(id, field, device[field], value),
  };
  if (field === 'status' || field === 'category') {
    openInlineEditor({ ...base, kind: 'picker', options: field === 'status' ? STATUSES : CATEGORIES });
  } else if (field === 'dueDate') {
    openInlineEditor({ ...base, kind: 'date' });
  } else {
    const list = field === 'owner' || field === 'location' ? distinctValues(state.devices, field) : [];
    openInlineEditor({ ...base, kind: 'text', suggestions: list });
  }
}

async function commitInlineEdit(id, field, original, value) {
  // Se relee el equipo al confirmar: la tabla pudo re-renderizarse mientras el editor estaba abierto.
  const device = byId(id);
  if (!device) {
    if (!sameFieldValue(original, value)) toast('El equipo ya no existe', 'error');
    return;
  }
  if (sameFieldValue(device[field], value)) return;
  if (state.saving.has(id)) {
    toast('Guardando…', 'info');
    return;
  }
  const panelWasOpen = state.panelId === id;
  state.saving.add(id);
  try {
    const { id: newId, changed } = await updateDevice(device, withField(device, field, value));
    toast(changed ? INLINE_SAVED[field] : 'Sin cambios', changed ? 'success' : 'info');
    // Cambio de serial = nuevo ID: si el panel mostraba este equipo y se cerró por el snapshot, reabrirlo.
    if (panelWasOpen && newId !== id && !state.panelId && byId(newId)) openPanel(newId);
  } catch (err) {
    if (err instanceof ValidationError) toast(err.message, 'error');
    else if (err instanceof DuplicateSerialError) toast(`Ya existe: ${err.existing.product} (${err.existing.serial})`, 'error');
    else toast(errorMessage(err), 'error');
  } finally {
    state.saving.delete(id);
  }
}

function onBulkAction(action) {
  if (action === 'clear') {
    state.selected.clear();
    renderMain();
    return;
  }
  const devices = [...state.selected].map(byId).filter(Boolean);
  openBulkDialog(action, devices.length, suggestions(), async (patch, note) => {
    const res = await bulkUpdate(devices, patch, note);
    if (res.invalid.length) {
      toast(`${res.invalid.length} equipo(s) no se modificaron: ${res.invalid[0].errors[0]}`, 'error');
    } else if (res.failed.length) {
      toast(`${res.ok} actualizados, ${res.failed.length} fallaron. Quedaron seleccionados para reintentar.`, 'error');
    } else {
      toast(`${res.ok} equipo(s) actualizados${res.skipped ? ` (${res.skipped} sin cambios)` : ''}`, 'success');
    }
    state.selected = new Set([...res.failed, ...res.invalid.map((i) => i.id)]);
    renderMain();
  });
}

function openPanel(id) {
  const device = byId(id);
  if (!device) return;
  state.panelId = id;
  state.panelSig = deviceSig(device);
  state.panelApi = renderPanel($('#panel'), device, { isAdmin: isAdmin(), suggestions: suggestions() }, {
    onClose: () => closePanel(),
    onOpen: openPanel,
    onSave: async (input, note) => {
      // Diff contra el equipo más reciente, aplicando solo lo que el usuario tocó en el formulario:
      // así un cambio inline hecho después de abrir el panel no se revierte en silencio.
      const latest = byId(state.panelId) ?? device;
      state.saving.add(latest.id);
      try {
        const { id: newId, changed } = await updateDevice(latest, mergeFormChanges(device, latest, input), note);
        toast(changed ? 'Cambios guardados' : 'Sin cambios', changed ? 'success' : 'info');
        openPanel(newId);
      } finally {
        state.saving.delete(latest.id);
      }
    },
    onDelete: async () => {
      if (!confirm(`¿Eliminar ${device.product} (${device.serial})? Se borran también su historial y sus fotos.`)) return;
      try {
        await deleteDevice(device);
        closePanel(true);
        toast('Equipo eliminado', 'success');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
    onAddPhotos: async (files) => {
      toast(`Subiendo ${files.length} foto(s)…`);
      for (const f of files) {
        const data = await compressImageFile(f).catch(() => null);
        if (!data) {
          toast(`No se pudo comprimir "${f.name}" lo suficiente. Probá con otra foto.`, 'error');
          continue;
        }
        try {
          await addPhoto(device.id, data);
        } catch (e) {
          toast(errorMessage(e), 'error');
        }
      }
      if (state.panelId === device.id) state.panelApi?.reloadPhotos();
    },
    onDeletePhoto: async (photoId) => {
      if (!confirm('¿Eliminar esta foto?')) return;
      try {
        await deletePhoto(device.id, photoId);
        if (state.panelId === device.id) state.panelApi?.reloadPhotos();
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
    loadHistory: () => listHistory(device.id),
    loadPhotos: () => getPhotos(byId(device.id)?.photoIds ?? []),
  });
}

function closePanel(force = false) {
  const el = $('#panel');
  if (!el) return;
  if (!force && el.querySelector('#panel-form')?.dataset.dirty === '1' && !confirm('¿Descartar los cambios sin guardar?')) return;
  state.panelId = null;
  state.panelSig = null;
  state.panelApi = null;
  el.hidden = true;
  el.innerHTML = '';
}

function openNewDeviceDialog() {
  const dlg = openDialog(`
    <h2>Nuevo equipo</h2>
    <form id="new-form">
      ${deviceFieldsHTML({}, suggestions(), 'new')}
      <p class="form-error" hidden></p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn-primary order-last" value="close">Guardar</button>
        <button type="submit" class="btn" value="another">Guardar y cargar otro igual</button>
      </div>
    </form>`, { wide: true });
  const form = dlg.querySelector('#new-form');
  form.elements.namedItem('product').focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const mode = e.submitter?.value ?? 'close';
    const input = readDeviceFields(form);
    hideFormError(form);
    setBusy(form, true);
    try {
      await createDevice(input);
      toast(`${input.product.trim()} guardado`, 'success');
      if (mode === 'another') {
        form.elements.namedItem('serial').value = '';
        form.elements.namedItem('color').value = '';
        form.elements.namedItem('serial').focus();
      } else {
        closeDialog();
      }
    } catch (err) {
      showFormError(form, err, (id) => { closeDialog(); openPanel(id); });
    } finally {
      setBusy(form, false);
    }
  };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#dialog').open && state.panelId && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) closePanel();
});
