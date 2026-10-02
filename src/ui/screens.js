import { esc } from '../lib/html.js';

export function renderLogin(app, onLogin) {
  app.innerHTML = `
    <div class="center-screen"><div class="card">
      <h1>Inventario de Samples</h1>
      <p>Ingresá con tu cuenta de Google.</p>
      <button class="btn btn-primary" id="btn-login">Ingresar con Google</button>
    </div></div>`;
  app.querySelector('#btn-login').onclick = onLogin;
}

export function renderError(app, message, onRetry, onLogout) {
  app.innerHTML = `
    <div class="center-screen"><div class="card">
      <h1>Ocurrió un error</h1>
      <p>${esc(message)}</p>
      <div class="form-actions"><button class="btn btn-primary" id="btn-retry">Reintentar</button><button class="btn" id="btn-logout">Salir</button></div>
    </div></div>`;
  app.querySelector('#btn-retry').onclick = onRetry;
  app.querySelector('#btn-logout').onclick = onLogout;
}

export function renderNoAccess(app, email, onLogout) {
  app.innerHTML = `
    <div class="center-screen"><div class="card">
      <h1>No tenés acceso</h1>
      <p><strong>${esc(email)}</strong> no está autorizado para ver el inventario. Pedíselo a Rodrigo.</p>
      <button class="btn" id="btn-logout">Usar otra cuenta</button>
    </div></div>`;
  app.querySelector('#btn-logout').onclick = onLogout;
}
