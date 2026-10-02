import { getReaders, addReader, removeReader } from '../data/access.js';
import { esc } from '../lib/html.js';
import { openDialog, toast, errorMessage } from './dom.js';

export function openAccessDialog() {
  const dlg = openDialog(`
    <h2>Accesos</h2>
    <p class="muted">Estas personas pueden ver el inventario, pero no editarlo.</p>
    <ul class="readers" id="readers"><li class="muted">Cargando…</li></ul>
    <form id="add-reader" class="row">
      <input type="email" name="email" placeholder="mail@ejemplo.com" required aria-label="Mail a agregar">
      <button class="btn btn-primary">Agregar</button>
    </form>
    <div class="form-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
  const list = dlg.querySelector('#readers');
  const form = dlg.querySelector('#add-reader');

  const refresh = async () => {
    try {
      const readers = await getReaders();
      list.innerHTML = readers.length
        ? readers.map((r) => `<li><span>${esc(r)}</span><button type="button" class="btn btn-ghost" data-remove="${esc(r)}">Quitar</button></li>`).join('')
        : '<li class="muted">Todavía no agregaste a nadie.</li>';
      list.querySelectorAll('[data-remove]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm(`¿Quitar el acceso a ${b.dataset.remove}?`)) return;
          try {
            await removeReader(b.dataset.remove);
            refresh();
          } catch (e) {
            toast(errorMessage(e), 'error');
          }
        };
      });
    } catch (e) {
      list.innerHTML = `<li class="form-error">${esc(errorMessage(e))}</li>`;
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const input = form.elements.namedItem('email');
    try {
      await addReader(input.value);
      input.value = '';
      toast('Acceso agregado', 'success');
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  refresh();
}
