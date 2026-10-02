import { login, logout, onUser } from './firebase.js';
import { determineRole } from './data/access.js';
import { subscribeDevices, createDevice, updateDevice, deleteDevice, listHistory } from './data/devices.js';
import { addPhoto, getPhotos, deletePhoto } from './data/photos.js';
import { compressImageFile } from './lib/compress.js';
import { renderPanel } from './ui/panel.js';
import { filterDevices, summarize, sortDevices, distinctValues } from './lib/filters.js';
import { todayISO } from './lib/dates.js';
import { esc } from './lib/html.js';
import { $, toast, errorMessage, openDialog, closeDialog, setBusy } from './ui/dom.js';
import { initTheme, toggleTheme } from './ui/theme.js';
import { renderLogin, renderNoAccess } from './ui/screens.js';
import { deviceFieldsHTML, readDeviceFields, showFormError, hideFormError } from './ui/form.js';
import { renderSummary, renderToolbar, syncToolbar, renderTable } from './ui/list.js';
import { exportCSV } from './ui/export.js';

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
  unsubscribe: null,
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

initTheme();

onUser(async (user) => {
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
    toast(errorMessage(e), 'error');
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
      if (state.panelId && !byId(state.panelId)) closePanel();
    },
    (e) => toast(errorMessage(e), 'error'),
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
  renderTable($('#table'), visibleRows(), { sort: state.sort, selected: state.selected, isAdmin: isAdmin(), today }, {
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
  });
}

function openPanel(id) {
  const device = byId(id);
  if (!device) return;
  state.panelId = id;
  renderPanel($('#panel'), device, { isAdmin: isAdmin(), suggestions: suggestions() }, {
    onClose: closePanel,
    onOpen: openPanel,
    onSave: async (input, note) => {
      const newId = await updateDevice(device, input, note);
      toast('Cambios guardados', 'success');
      openPanel(newId);
    },
    onDelete: async () => {
      if (!confirm(`¿Eliminar ${device.product} (${device.serial})? Se borran también su historial y sus fotos.`)) return;
      try {
        await deleteDevice(device);
        closePanel();
        toast('Equipo eliminado', 'success');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
    onAddPhotos: async (files) => {
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
      openPanel(device.id);
    },
    onDeletePhoto: async (photoId) => {
      if (!confirm('¿Eliminar esta foto?')) return;
      try {
        await deletePhoto(device.id, photoId);
        openPanel(device.id);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
    loadHistory: () => listHistory(device.id),
    loadPhotos: () => getPhotos(device.photoIds ?? []),
  });
}

function closePanel() {
  state.panelId = null;
  const el = $('#panel');
  el.hidden = true;
  el.innerHTML = '';
}

function openNewDeviceDialog() {
  const dlg = openDialog(`
    <h2>Nuevo equipo</h2>
    <form id="new-form">
      ${deviceFieldsHTML({}, suggestions())}
      <p class="form-error" hidden></p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="submit" class="btn" value="another">Guardar y cargar otro igual</button>
        <button type="submit" class="btn btn-primary" value="close">Guardar</button>
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
  if (e.key === 'Escape' && !$('#dialog').open && state.panelId) closePanel();
});
