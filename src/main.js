import { login, logout, onUser } from './firebase.js';
import { determineRole } from './data/access.js';
import { renderLogin, renderNoAccess } from './ui/screens.js';
import { toast, errorMessage } from './ui/dom.js';
import { initTheme } from './ui/theme.js';

const app = document.getElementById('app');
initTheme();

onUser(async (user) => {
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
  app.innerHTML = `<div class="center-screen"><div class="card"><h1>Hola ${user.email}</h1><p>Rol: ${role}</p></div></div>`;
});
