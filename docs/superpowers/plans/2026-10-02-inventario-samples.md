# Inventario de Samples — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web estática (GitHub Pages) para inventariar dispositivos en comodato, con Firestore como base, login de Google, un único admin editor y lectores por lista de mails.

**Architecture:** `index.html` + ES modules sin bundler. La lógica pura vive en `src/lib/` (testeada con Vitest en Node). El acceso a Firestore vive en `src/data/` y la UI en `src/ui/`; ambas se validan con E2E manual. Las reglas de Firestore imponen los permisos y se testean contra el emulador.

**Tech Stack:** HTML/CSS/JS vanilla (ES modules), Firebase JS SDK 12 desde CDN gstatic, Firestore, Firebase Auth (Google), Vitest, `@firebase/rules-unit-testing`, Firebase CLI 15, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-02-inventario-samples-design.md`

**Convenciones:**
- Repo: `C:\Users\rodri\inventario-samples`. Shell: PowerShell (en PS 5.1 no hay `&&`, usar `;`).
- Todo commit lleva el trailer: `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Fechas de negocio (`requestDate`, `dueDate`, `returnedDate`) se guardan como strings `YYYY-MM-DD`; `createdAt`/`updatedAt`/`at` como `serverTimestamp()`.
- El admin está fijo en `src/config.js` y en `firestore.rules` (`rodri.rita24@gmail.com`). `config/access` solo guarda `readers` (desviación menor del spec: no hace falta `adminEmail` en la base).
- `src/lib/**` NO importa nada de la CDN (tiene que correr en Node).

---

## Estructura de archivos

```
index.html                 shell HTML mínimo
styles.css                 estilos + tokens claro/oscuro
src/config.js              firebaseConfig + ADMIN_EMAIL
src/firebase.js            init app/auth/db, login/logout/onUser
src/fs.js                  re-export del SDK Firestore (versión de la CDN en un solo lugar)
src/main.js                estado de la app y wiring de pantallas
src/lib/constants.js       categorías, estados, labels, umbral 30 días
src/lib/serial.js          normalizeSerial, serialToDocId
src/lib/email.js           normalizeEmail, isValidEmail
src/lib/dates.js           todayISO, addDaysISO, dueState, formatDate
src/lib/history.js         applyStatusRules, diffToHistory
src/lib/device.js          FIELDS, cleanInput, validateDevice, prepareSave, prepareBulk
src/lib/errors.js          ValidationError, DuplicateSerialError
src/lib/batch.js           chunkOps
src/lib/filters.js         filterDevices, summarize, sortDevices, distinctValues
src/lib/csv.js             toCSV
src/lib/compress.js        fitWithin, compressWithEncoder, compressImageFile
src/lib/html.js            esc
src/data/devices.js        subscribe/create/update/move/bulk/delete/history
src/data/photos.js         addPhoto, getPhotos, deletePhoto
src/data/access.js         determineRole, getReaders, addReader, removeReader
src/ui/dom.js              $, toast, errorMessage, openDialog, closeDialog, setBusy
src/ui/theme.js            initTheme, toggleTheme
src/ui/screens.js          renderLogin, renderNoAccess
src/ui/form.js             deviceFieldsHTML, readDeviceFields, showFormError, hideFormError
src/ui/list.js             renderSummary, renderToolbar, syncToolbar, renderTable
src/ui/panel.js            renderPanel (ficha + fotos + historial)
src/ui/bulk.js             renderBulkBar, openBulkDialog
src/ui/access.js           openAccessDialog
src/ui/export.js           exportCSV
firestore.rules, firestore.indexes.json, firebase.json, .firebaserc
tests/unit/*.test.js       Vitest (lib)
tests/rules/firestore.rules.test.js
```

---

### Task 0: Tooling del proyecto

**Files:** Create: `package.json`, `.gitignore`, `firebase.json`, `firestore.indexes.json`

- [ ] **Step 1: Instalar JDK 21 (lo pide el emulador de Firestore)**

Run: `winget install --id EclipseAdoptium.Temurin.21.JDK -e --accept-source-agreements --accept-package-agreements`
Después abrir una terminal nueva (o refrescar `$env:Path`) y correr `java -version`. Esperado: `openjdk version "21...`.

- [ ] **Step 2: Crear `package.json`**

```json
{
  "name": "inventario-samples",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run tests/unit",
    "test:rules": "firebase emulators:exec --only firestore --project demo-inventario \"vitest run tests/rules\"",
    "dev": "http-server . -p 5173 -c-1"
  }
}
```

- [ ] **Step 3: Instalar dependencias de desarrollo**

Run: `npm i -D vitest @firebase/rules-unit-testing firebase http-server`
Esperado: instala sin errores de peer dependencies. Si `@firebase/rules-unit-testing` pide otra versión mayor de `firebase`, instalar la que pida.

- [ ] **Step 4: Crear `.gitignore`**

```
node_modules/
firebase-debug.log
firestore-debug.log
ui-debug.log
.firebase/
```

- [ ] **Step 5: Crear `firebase.json` y `firestore.indexes.json`**

`firebase.json`:
```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": { "firestore": { "port": 8080 }, "ui": { "enabled": false } }
}
```

`firestore.indexes.json`:
```json
{ "indexes": [], "fieldOverrides": [] }
```

- [ ] **Step 6: Commit**

```
git add package.json package-lock.json .gitignore firebase.json firestore.indexes.json
git commit -m "chore: project tooling (vitest, rules testing, dev server)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Constantes, HTML escape y serial

> **Nota post-revisión (commit 5336236):** el código final de `serialToDocId` codifica `%`→`%25` y `/`→`%2F` (en vez de `/`→`_`), limita el ID a 1500 bytes, y `validateDevice` valida el serial y el formato de fechas. Otros endurecimientos: BOM como escape, guard de fórmulas en CSV, clamp ≥1px en compresión, `imageOrientation: 'from-image'`, quick filter desconocido ignorado. El código de abajo es la versión original.

**Files:** Create: `src/lib/constants.js`, `src/lib/html.js`, `src/lib/serial.js`. Test: `tests/unit/serial.test.js`, `tests/unit/html.test.js`

- [ ] **Step 1: Escribir los tests**

`tests/unit/serial.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { normalizeSerial, serialToDocId } from '../../src/lib/serial.js';

describe('normalizeSerial', () => {
  it('trims and uppercases', () => expect(normalizeSerial('  rf2r50852re ')).toBe('RF2R50852RE'));
  it('collapses inner whitespace', () => expect(normalizeSerial('A   b')).toBe('A B'));
  it('handles null/undefined', () => {
    expect(normalizeSerial(null)).toBe('');
    expect(normalizeSerial(undefined)).toBe('');
  });
});

describe('serialToDocId', () => {
  it('replaces slashes', () => expect(serialToDocId('sm/123')).toBe('SM_123'));
  it('throws on empty', () => expect(() => serialToDocId('   ')).toThrow('Serial vacío'));
  it('throws on dot ids', () => expect(() => serialToDocId('..')).toThrow());
});
```

`tests/unit/html.test.js`:
```js
import { it, expect } from 'vitest';
import { esc } from '../../src/lib/html.js';

it('escapes html special chars', () => {
  expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
it('stringifies null as empty', () => expect(esc(null)).toBe(''));
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Esperado: FAIL, no se encuentran los módulos.

- [ ] **Step 3: Implementar**

`src/lib/constants.js`:
```js
export const CATEGORIES = [
  { value: 'celular', label: 'Celular' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'wearable', label: 'Wearable' },
  { value: 'audio', label: 'Audio' },
  { value: 'tv', label: 'TV' },
  { value: 'otro', label: 'Otro' },
];

export const STATUSES = [
  { value: 'en_stock', label: 'En stock' },
  { value: 'asignado', label: 'Asignado' },
  { value: 'devuelto', label: 'Devuelto' },
  { value: 'perdido', label: 'Perdido' },
  { value: 'no_return', label: 'No return' },
];

export const DUE_STATES = { vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencido' };

export const DUE_SOON_DAYS = 30;
export const INACTIVE_STATUSES = ['devuelto', 'perdido', 'no_return'];

export const labelOf = (list, value) => list.find((i) => i.value === value)?.label ?? value ?? '';
```

`src/lib/html.js`:
```js
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
```

`src/lib/serial.js`:
```js
export function normalizeSerial(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function serialToDocId(raw) {
  const s = normalizeSerial(raw);
  if (!s) throw new Error('Serial vacío');
  const id = s.replace(/\//g, '_');
  if (id === '.' || id === '..' || /^__.*__$/.test(id)) throw new Error(`Serial inválido: ${s}`);
  return id;
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Esperado: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib tests/unit
git commit -m "feat: constants, html escape and serial normalization" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fechas y estado de vencimiento

**Files:** Create: `src/lib/dates.js`. Test: `tests/unit/dates.test.js`

- [ ] **Step 1: Escribir los tests**

```js
import { describe, it, expect } from 'vitest';
import { todayISO, addDaysISO, dueState, formatDate } from '../../src/lib/dates.js';

describe('todayISO', () => {
  it('formats local date', () => expect(todayISO(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02'));
});

describe('addDaysISO', () => {
  it('crosses months', () => expect(addDaysISO('2026-01-31', 30)).toBe('2026-03-02'));
  it('crosses years', () => expect(addDaysISO('2026-12-15', 30)).toBe('2027-01-14'));
});

describe('dueState', () => {
  const today = '2026-10-02';
  const d = (dueDate, status = 'asignado') => ({ dueDate, status });
  it('null without dueDate', () => expect(dueState(d(null), today)).toBeNull());
  it('null for inactive statuses', () => {
    for (const s of ['devuelto', 'perdido', 'no_return']) expect(dueState(d('2020-01-01', s), today)).toBeNull();
  });
  it('vencido when past', () => expect(dueState(d('2026-10-01'), today)).toBe('vencido'));
  it('por_vencer on same day', () => expect(dueState(d('2026-10-02'), today)).toBe('por_vencer'));
  it('por_vencer at +30 days', () => expect(dueState(d('2026-11-01'), today)).toBe('por_vencer'));
  it('vigente at +31 days', () => expect(dueState(d('2026-11-02'), today)).toBe('vigente'));
  it('applies to en_stock too', () => expect(dueState(d('2026-10-01', 'en_stock'), today)).toBe('vencido'));
});

describe('formatDate', () => {
  it('formats dd/mm/yyyy', () => expect(formatDate('2026-10-02')).toBe('02/10/2026'));
  it('empty for falsy', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test`. Esperado: FAIL en `dates.test.js`.

- [ ] **Step 3: Implementar `src/lib/dates.js`**

```js
import { DUE_SOON_DAYS, INACTIVE_STATUSES } from './constants.js';

const pad = (n) => String(n).padStart(2, '0');

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dueState(device, today = todayISO()) {
  if (!device.dueDate || INACTIVE_STATUSES.includes(device.status)) return null;
  if (device.dueDate < today) return 'vencido';
  if (device.dueDate <= addDaysISO(today, DUE_SOON_DAYS)) return 'por_vencer';
  return 'vigente';
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
```

- [ ] **Step 4: Correr y ver que pasa.** Run: `npm test`. Esperado: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/dates.js tests/unit/dates.test.js
git commit -m "feat: due date state with 30-day threshold" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Historial y regla de fecha de devolución

**Files:** Create: `src/lib/history.js`. Test: `tests/unit/history.test.js`

- [ ] **Step 1: Escribir los tests**

```js
import { describe, it, expect } from 'vitest';
import { applyStatusRules, diffToHistory } from '../../src/lib/history.js';

const today = '2026-10-02';

describe('applyStatusRules', () => {
  it('sets returnedDate when becoming devuelto', () => {
    const r = applyStatusRules({ status: 'asignado', returnedDate: null }, { status: 'devuelto', returnedDate: null }, today);
    expect(r.returnedDate).toBe(today);
  });
  it('sets returnedDate when created as devuelto', () => {
    expect(applyStatusRules(null, { status: 'devuelto' }, today).returnedDate).toBe(today);
  });
  it('keeps returnedDate while staying devuelto', () => {
    const r = applyStatusRules({ status: 'devuelto', returnedDate: '2026-01-01' }, { status: 'devuelto', returnedDate: '2026-01-01' }, today);
    expect(r.returnedDate).toBe('2026-01-01');
  });
  it('clears returnedDate when leaving devuelto', () => {
    const r = applyStatusRules({ status: 'devuelto', returnedDate: '2026-01-01' }, { status: 'en_stock', returnedDate: '2026-01-01' }, today);
    expect(r.returnedDate).toBeNull();
  });
  it('does not mutate input', () => {
    const after = { status: 'devuelto' };
    applyStatusRules(null, after, today);
    expect(after).toEqual({ status: 'devuelto' });
  });
});

describe('diffToHistory', () => {
  const base = { product: 'A54', category: 'celular', model: 'SM-A546E', color: 'Negro', serial: 'X1', status: 'en_stock', owner: null, location: 'Cajón', requestDate: '2026-01-01', dueDate: '2026-06-01' };

  it('alta when no before', () => {
    expect(diffToHistory(null, base, 'n')).toEqual([{ type: 'alta', field: null, from: null, to: null, note: 'n' }]);
  });
  it('empty when nothing changed (undefined == null)', () => {
    expect(diffToHistory(base, { ...base, owner: undefined })).toEqual([]);
  });
  it('estado entry', () => {
    expect(diffToHistory(base, { ...base, status: 'asignado' })).toEqual([
      { type: 'estado', field: 'status', from: 'en_stock', to: 'asignado', note: '' },
    ]);
  });
  it('renovacion entry for dueDate', () => {
    const [e] = diffToHistory(base, { ...base, dueDate: '2026-12-01' }, 'renovado');
    expect(e).toEqual({ type: 'renovacion', field: 'dueDate', from: '2026-06-01', to: '2026-12-01', note: 'renovado' });
  });
  it('owner and location produce two entries', () => {
    const r = diffToHistory(base, { ...base, owner: 'Ana', location: 'Oficina' });
    expect(r.map((e) => e.type)).toEqual(['owner', 'locacion']);
  });
  it('other fields collapse into one edicion entry', () => {
    const r = diffToHistory(base, { ...base, product: 'A55', color: 'Lima' });
    expect(r).toEqual([{ type: 'edicion', field: 'product, color', from: 'A54 | Negro', to: 'A55 | Lima', note: '' }]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `npm test`. Esperado: FAIL.

- [ ] **Step 3: Implementar `src/lib/history.js`**

```js
const TRACKED = [
  ['status', 'estado'],
  ['owner', 'owner'],
  ['location', 'locacion'],
  ['dueDate', 'renovacion'],
];
const EDIT_FIELDS = ['product', 'category', 'model', 'color', 'serial', 'requestDate'];

const val = (o, f) => o?.[f] ?? null;

export function applyStatusRules(before, after, today) {
  const next = { ...after };
  if (next.status === 'devuelto') {
    if (val(before, 'status') !== 'devuelto') next.returnedDate = today;
  } else {
    next.returnedDate = null;
  }
  return next;
}

export function diffToHistory(before, after, note = '') {
  if (!before) return [{ type: 'alta', field: null, from: null, to: null, note }];
  const entries = [];
  for (const [field, type] of TRACKED) {
    const from = val(before, field);
    const to = val(after, field);
    if (from !== to) entries.push({ type, field, from, to, note });
  }
  const edited = EDIT_FIELDS.filter((f) => val(before, f) !== val(after, f));
  if (edited.length) {
    entries.push({
      type: 'edicion',
      field: edited.join(', '),
      from: edited.map((f) => val(before, f) ?? '').join(' | '),
      to: edited.map((f) => val(after, f) ?? '').join(' | '),
      note,
    });
  }
  return entries;
}
```

- [ ] **Step 4: Correr y ver que pasa.** Run: `npm test`. Esperado: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/history.js tests/unit/history.test.js
git commit -m "feat: history diff and automatic return date" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Modelo del equipo (limpieza, validación, preparación de guardado), errores y chunking

**Files:** Create: `src/lib/device.js`, `src/lib/errors.js`, `src/lib/batch.js`. Test: `tests/unit/device.test.js`, `tests/unit/batch.test.js`

- [ ] **Step 1: Escribir los tests**

`tests/unit/device.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { cleanInput, validateDevice, prepareSave, prepareBulk } from '../../src/lib/device.js';

const today = '2026-10-02';
const input = { product: ' Z Flip5 ', category: 'celular', model: '', color: 'Mint', serial: ' 350290890120226 ', status: 'en_stock', owner: '', location: 'Cajón Cheil', requestDate: '2026-09-01', dueDate: '2027-03-01' };

describe('cleanInput', () => {
  it('trims, nulls empties and normalizes serial', () => {
    const c = cleanInput({ ...input, serial: ' ab/1 ' });
    expect(c.product).toBe('Z Flip5');
    expect(c.model).toBeNull();
    expect(c.owner).toBeNull();
    expect(c.serial).toBe('AB/1');
  });
  it('ignores unknown fields', () => expect(cleanInput({ ...input, hack: 1 }).hack).toBeUndefined());
});

describe('validateDevice', () => {
  const ok = cleanInput(input);
  it('accepts valid', () => expect(validateDevice(ok)).toEqual([]));
  it('requires product', () => expect(validateDevice({ ...ok, product: null })).toContain('Falta el producto'));
  it('requires serial', () => expect(validateDevice({ ...ok, serial: null })).toContain('Falta el serial / IMEI'));
  it('checks category', () => expect(validateDevice({ ...ok, category: 'x' })).toContain('Categoría inválida'));
  it('checks status', () => expect(validateDevice({ ...ok, status: 'x' })).toContain('Estado inválido'));
  it('dueDate not before requestDate', () =>
    expect(validateDevice({ ...ok, dueDate: '2026-08-01' })).toContain('El vencimiento no puede ser anterior a la fecha de solicitud'));
});

describe('prepareSave', () => {
  it('new device: alta entry, returnedDate null', () => {
    const r = prepareSave(null, input, today);
    expect(r.errors).toEqual([]);
    expect(r.data.returnedDate).toBeNull();
    expect(r.data.serial).toBe('350290890120226');
    expect(r.history.map((h) => h.type)).toEqual(['alta']);
  });
  it('returns errors without data', () => {
    const r = prepareSave(null, { ...input, product: '' }, today);
    expect(r.errors.length).toBe(1);
    expect(r.data).toBeUndefined();
  });
  it('becoming devuelto sets date and logs estado', () => {
    const before = { id: '350290890120226', ...prepareSave(null, input, today).data, photoIds: [] };
    const r = prepareSave(before, { ...input, status: 'devuelto' }, today, 'ok');
    expect(r.data.returnedDate).toBe(today);
    expect(r.history).toEqual([{ type: 'estado', field: 'status', from: 'en_stock', to: 'devuelto', note: 'ok' }]);
    expect(r.data.photoIds).toBeUndefined();
  });
});

describe('prepareBulk', () => {
  it('applies a partial patch over the existing device', () => {
    const before = { id: 'X', ...prepareSave(null, input, today).data };
    const r = prepareBulk(before, { dueDate: '2027-09-01' }, today, 'Renovación');
    expect(r.data.dueDate).toBe('2027-09-01');
    expect(r.data.product).toBe('Z Flip5');
    expect(r.history).toEqual([{ type: 'renovacion', field: 'dueDate', from: '2027-03-01', to: '2027-09-01', note: 'Renovación' }]);
  });
});
```

`tests/unit/batch.test.js`:
```js
import { it, expect } from 'vitest';
import { chunkOps } from '../../src/lib/batch.js';

const op = (n) => ({ history: new Array(n).fill({}) });

it('groups ops so each chunk stays within max writes', () => {
  const ops = [op(1), op(1), op(1)]; // 2 writes each
  expect(chunkOps(ops, 4).map((c) => c.length)).toEqual([2, 1]);
});
it('never splits a single op even if it alone exceeds max', () => {
  expect(chunkOps([op(10)], 4).map((c) => c.length)).toEqual([1]);
});
it('empty input gives no chunks', () => expect(chunkOps([], 4)).toEqual([]));
```

- [ ] **Step 2: Correr y ver que fallan.** Run: `npm test`. Esperado: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/errors.js`:
```js
export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join('. '));
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class DuplicateSerialError extends Error {
  constructor(existing) {
    super(`Ya existe un equipo con el serial ${existing.serial}`);
    this.name = 'DuplicateSerialError';
    this.existing = existing;
  }
}
```

`src/lib/device.js`:
```js
import { CATEGORIES, STATUSES } from './constants.js';
import { normalizeSerial } from './serial.js';
import { applyStatusRules, diffToHistory } from './history.js';

export const FIELDS = ['product', 'category', 'model', 'color', 'serial', 'status', 'owner', 'location', 'requestDate', 'dueDate'];

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? null]));

export function cleanInput(input) {
  const out = {};
  for (const f of FIELDS) {
    let v = input?.[f];
    if (typeof v === 'string') v = v.trim();
    out[f] = v === '' || v == null ? null : v;
  }
  if (out.serial) out.serial = normalizeSerial(out.serial);
  return out;
}

export function validateDevice(d) {
  const errors = [];
  if (!d.product) errors.push('Falta el producto');
  if (!d.serial) errors.push('Falta el serial / IMEI');
  if (!CATEGORIES.some((c) => c.value === d.category)) errors.push('Categoría inválida');
  if (!STATUSES.some((s) => s.value === d.status)) errors.push('Estado inválido');
  if (d.requestDate && d.dueDate && d.dueDate < d.requestDate) errors.push('El vencimiento no puede ser anterior a la fecha de solicitud');
  return errors;
}

export function prepareSave(before, input, today, note = '') {
  const cleaned = cleanInput(input);
  const errors = validateDevice(cleaned);
  if (errors.length) return { errors };
  const merged = { returnedDate: before?.returnedDate ?? null, ...cleaned };
  const data = applyStatusRules(before, merged, today);
  const history = diffToHistory(before, data, note);
  return { errors: [], data, history };
}

export function prepareBulk(before, patch, today, note = '') {
  return prepareSave(before, { ...pick(before, FIELDS), ...patch }, today, note);
}
```

`src/lib/batch.js`:
```js
// Agrupa operaciones {history: [...]} para que cada batch tenga a lo sumo `max` escrituras
// (1 por el equipo + 1 por cada entrada de historial).
export function chunkOps(ops, max = 450) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const op of ops) {
    const n = 1 + op.history.length;
    if (current.length && size + n > max) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(op);
    size += n;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
```

- [ ] **Step 4: Correr y ver que pasa.** Run: `npm test`. Esperado: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib tests/unit
git commit -m "feat: device model validation, save preparation and batch chunking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Filtros, resumen, orden y CSV

**Files:** Create: `src/lib/filters.js`, `src/lib/csv.js`. Test: `tests/unit/filters.test.js`, `tests/unit/csv.test.js`

- [ ] **Step 1: Escribir los tests**

`tests/unit/filters.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { filterDevices, summarize, sortDevices, distinctValues } from '../../src/lib/filters.js';

const today = '2026-10-02';
const devs = [
  { id: 'a', product: 'Z Flip5', model: 'SM-F731B', serial: '111', category: 'celular', status: 'asignado', owner: 'Ana', location: 'Oficina', dueDate: '2026-10-10' },
  { id: 'b', product: 'Watch6', model: 'SM-R930', serial: '222', category: 'wearable', status: 'en_stock', owner: null, location: 'Cajón', dueDate: '2026-09-01' },
  { id: 'c', product: 'Tab S9', model: 'SM-X710', serial: '333', category: 'tablet', status: 'devuelto', owner: null, location: null, dueDate: '2026-01-01' },
  { id: 'd', product: 'Buds3', model: 'SM-R530', serial: '444', category: 'audio', status: 'perdido', owner: 'Beto', location: null, dueDate: null },
  { id: 'e', product: 'A55', model: 'SM-A556', serial: '555', category: 'celular', status: 'en_stock', owner: null, location: 'Cajón', dueDate: '2027-06-01' },
];
const ids = (r) => r.map((d) => d.id);

describe('filterDevices', () => {
  it('hides devueltos by default', () => expect(ids(filterDevices(devs, {}, today))).toEqual(['a', 'b', 'd', 'e']));
  it('shows devueltos with toggle', () => expect(ids(filterDevices(devs, { showReturned: true }, today))).toHaveLength(5));
  it('status filter devuelto shows them even without toggle', () => expect(ids(filterDevices(devs, { status: 'devuelto' }, today))).toEqual(['c']));
  it('search matches serial, model, owner (case-insensitive)', () => {
    expect(ids(filterDevices(devs, { q: '222' }, today))).toEqual(['b']);
    expect(ids(filterDevices(devs, { q: 'sm-f731' }, today))).toEqual(['a']);
    expect(ids(filterDevices(devs, { q: 'ana' }, today))).toEqual(['a']);
  });
  it('category / owner / location / due filters', () => {
    expect(ids(filterDevices(devs, { category: 'celular' }, today))).toEqual(['a', 'e']);
    expect(ids(filterDevices(devs, { owner: 'Beto' }, today))).toEqual(['d']);
    expect(ids(filterDevices(devs, { location: 'Cajón' }, today))).toEqual(['b', 'e']);
    expect(ids(filterDevices(devs, { due: 'vencido' }, today))).toEqual(['b']);
  });
  it('quick filters', () => {
    expect(ids(filterDevices(devs, { quick: 'por_vencer' }, today))).toEqual(['a']);
    expect(ids(filterDevices(devs, { quick: 'asignados' }, today))).toEqual(['a']);
    expect(ids(filterDevices(devs, { quick: 'en_poder' }, today))).toEqual(['a', 'b', 'e']);
  });
});

describe('summarize', () => {
  it('counts quick categories', () =>
    expect(summarize(devs, today)).toEqual({ en_poder: 3, por_vencer: 1, vencido: 1, asignados: 1 }));
});

describe('sortDevices', () => {
  it('sorts asc with empties last', () => expect(ids(sortDevices(devs, 'dueDate', 'asc'))).toEqual(['c', 'b', 'a', 'e', 'd']));
  it('sorts desc with empties still last', () => expect(ids(sortDevices(devs, 'dueDate', 'desc'))).toEqual(['e', 'a', 'b', 'c', 'd']));
  it('does not mutate', () => {
    const copy = [...devs];
    sortDevices(devs, 'product', 'asc');
    expect(devs).toEqual(copy);
  });
});

describe('distinctValues', () => {
  it('unique, non-empty, sorted', () => expect(distinctValues(devs, 'location')).toEqual(['Cajón', 'Oficina']));
});
```

`tests/unit/csv.test.js`:
```js
import { it, expect } from 'vitest';
import { toCSV } from '../../src/lib/csv.js';

const cols = [
  { label: 'Producto', value: (r) => r.p },
  { label: 'Nota', value: (r) => r.n },
];

it('starts with BOM and uses ; and CRLF', () => {
  expect(toCSV([{ p: 'A54', n: null }], cols)).toBe('\uFEFFProducto;Nota\r\nA54;');
});
it('quotes values with separator, quotes or newlines', () => {
  expect(toCSV([{ p: 'a;b', n: 'di "hola"\nchau' }], cols)).toBe('\uFEFFProducto;Nota\r\n"a;b";"di ""hola""\nchau"');
});
```

- [ ] **Step 2: Correr y ver que fallan.** Run: `npm test`. Esperado: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/filters.js`:
```js
import { dueState } from './dates.js';

const SEARCH_FIELDS = ['product', 'model', 'serial', 'owner'];

export const QUICK = {
  en_poder: (d) => !['devuelto', 'perdido'].includes(d.status),
  por_vencer: (d, today) => dueState(d, today) === 'por_vencer',
  vencido: (d, today) => dueState(d, today) === 'vencido',
  asignados: (d) => d.status === 'asignado',
};

function matchesSearch(d, q) {
  const needle = (q ?? '').trim().toLowerCase();
  if (!needle) return true;
  return SEARCH_FIELDS.some((f) => String(d[f] ?? '').toLowerCase().includes(needle));
}

export function filterDevices(devices, f = {}, today) {
  return devices.filter((d) => {
    if (!f.showReturned && d.status === 'devuelto' && f.status !== 'devuelto') return false;
    if (f.quick && !QUICK[f.quick](d, today)) return false;
    if (f.category && d.category !== f.category) return false;
    if (f.status && d.status !== f.status) return false;
    if (f.owner && d.owner !== f.owner) return false;
    if (f.location && d.location !== f.location) return false;
    if (f.due && dueState(d, today) !== f.due) return false;
    return matchesSearch(d, f.q);
  });
}

export function summarize(devices, today) {
  return Object.fromEntries(Object.entries(QUICK).map(([k, fn]) => [k, devices.filter((d) => fn(d, today)).length]));
}

export function sortDevices(devices, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return [...devices].sort((a, b) => {
    const va = a[key] ?? '';
    const vb = b[key] ?? '';
    if (va === '' && vb === '') return 0;
    if (va === '') return 1;
    if (vb === '') return -1;
    return sign * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  });
}

export function distinctValues(devices, field) {
  return [...new Set(devices.map((d) => d[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}
```

`src/lib/csv.js`:
```js
export function toCSV(rows, columns, sep = ';') {
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map((c) => q(c.label)).join(sep),
    ...rows.map((r) => columns.map((c) => q(c.value(r))).join(sep)),
  ];
  return '\uFEFF' + lines.join('\r\n');
}
```

- [ ] **Step 4: Correr y ver que pasa.** Run: `npm test`. Esperado: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib tests/unit
git commit -m "feat: filtering, summary, sorting and CSV export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Compresión de fotos y normalización de emails

**Files:** Create: `src/lib/compress.js`, `src/lib/email.js`. Test: `tests/unit/compress.test.js`, `tests/unit/email.test.js`

- [ ] **Step 1: Escribir los tests**

`tests/unit/compress.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { fitWithin, compressWithEncoder, TARGET_BYTES, HARD_LIMIT_BYTES } from '../../src/lib/compress.js';

describe('fitWithin', () => {
  it('scales landscape', () => expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 }));
  it('scales portrait', () => expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 }));
  it('keeps small images', () => expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 }));
});

describe('compressWithEncoder', () => {
  // Encoder falso: el tamaño depende de ancho y calidad.
  const fake = (bytesFor) => {
    const calls = [];
    const encode = async (w, h, q) => {
      calls.push([w, h, q]);
      return 'x'.repeat(bytesFor(w, q));
    };
    return { encode, calls };
  };

  it('returns first attempt under target', async () => {
    const { encode, calls } = fake(() => 1000);
    expect((await compressWithEncoder(encode, { width: 1280, height: 960 })).length).toBe(1000);
    expect(calls).toEqual([[1280, 960, 0.7]]);
  });

  it('lowers quality, then size', async () => {
    const { encode, calls } = fake((w, q) => (w < 1280 && q <= 0.6 ? 1000 : TARGET_BYTES + 1));
    await compressWithEncoder(encode, { width: 1280, height: 960 });
    expect(calls.at(-1)).toEqual([960, 720, 0.6]);
  });

  it('falls back to smallest result under hard limit', async () => {
    const { encode } = fake((w, q) => TARGET_BYTES + Math.round(w * q));
    const r = await compressWithEncoder(encode, { width: 1280, height: 960 });
    expect(r.length).toBe(TARGET_BYTES + Math.round(640 * 0.4));
  });

  it('returns null when nothing fits the hard limit', async () => {
    const { encode } = fake(() => HARD_LIMIT_BYTES + 1);
    expect(await compressWithEncoder(encode, { width: 1280, height: 960 })).toBeNull();
  });
});
```

`tests/unit/email.test.js`:
```js
import { it, expect } from 'vitest';
import { normalizeEmail, isValidEmail } from '../../src/lib/email.js';

it('normalizes', () => expect(normalizeEmail('  Ana@Cheil.COM ')).toBe('ana@cheil.com'));
it('validates', () => {
  expect(isValidEmail('ana@cheil.com')).toBe(true);
  expect(isValidEmail('ana@')).toBe(false);
  expect(isValidEmail('')).toBe(false);
});
```

- [ ] **Step 2: Correr y ver que fallan.** Run: `npm test`. Esperado: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/compress.js`:
```js
export const MAX_SIDE = 1280;
export const TARGET_BYTES = 700_000;      // largo del dataURL base64
export const HARD_LIMIT_BYTES = 950_000;  // margen bajo el límite de 1 MiB del documento
const SCALES = [1, 0.75, 0.5];
const QUALITIES = [0.7, 0.6, 0.5, 0.4];

export function fitWithin(width, height, max = MAX_SIDE) {
  const ratio = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

// encode(width, height, quality) => Promise<dataURL string>
export async function compressWithEncoder(encode, { width, height }) {
  let best = null;
  for (const scale of SCALES) {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    for (const q of QUALITIES) {
      const data = await encode(w, h, q);
      if (data.length <= TARGET_BYTES) return data;
      if (!best || data.length < best.length) best = data;
    }
  }
  return best && best.length <= HARD_LIMIT_BYTES ? best : null;
}

// Solo navegador. Devuelve un dataURL JPEG o null si no se pudo achicar lo suficiente.
export async function compressImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  const encode = async (w, h, q) => {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', q);
  };
  try {
    return await compressWithEncoder(encode, size);
  } finally {
    bitmap.close();
  }
}
```

`src/lib/email.js`:
```js
export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase();
export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(e));
```

- [ ] **Step 4: Correr y ver que pasa.** Run: `npm test`. Esperado: PASS (todos los tests unitarios).

- [ ] **Step 5: Commit**

```
git add src/lib tests/unit
git commit -m "feat: photo compression and email normalization" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Reglas de seguridad de Firestore

**Files:** Create: `firestore.rules`. Test: `tests/rules/firestore.rules.test.js`

- [ ] **Step 1: Escribir los tests**

```js
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const ADMIN = 'rodri.rita24@gmail.com';
const READER = 'lector@example.com';
const STRANGER = 'otro@example.com';
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-inventario',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/access'), { readers: [READER] });
    await setDoc(doc(db, 'devices/ABC'), { product: 'Z Flip5', serial: 'ABC' });
    await setDoc(doc(db, 'devices/ABC/history/h1'), { type: 'alta' });
    await setDoc(doc(db, 'photos/p1'), { deviceId: 'ABC', data: 'x' });
  });
});

afterAll(() => env.cleanup());

const as = (email, verified = true) => env.authenticatedContext(email, { email, email_verified: verified }).firestore();

describe('admin', () => {
  it('reads and writes everything', async () => {
    const db = as(ADMIN);
    await assertSucceeds(getDocs(collection(db, 'devices')));
    await assertSucceeds(setDoc(doc(db, 'devices/NEW'), { product: 'A55' }));
    await assertSucceeds(setDoc(doc(db, 'devices/ABC/history/h2'), { type: 'estado' }));
    await assertSucceeds(setDoc(doc(db, 'photos/p2'), { deviceId: 'ABC' }));
    await assertSucceeds(getDoc(doc(db, 'config/access')));
    await assertSucceeds(setDoc(doc(db, 'config/access'), { readers: [] }));
    await assertSucceeds(deleteDoc(doc(db, 'devices/ABC')));
  });
  it('unverified admin email cannot write', async () => {
    await assertFails(setDoc(doc(as(ADMIN, false), 'devices/NEW'), { product: 'A55' }));
  });
});

describe('reader', () => {
  it('reads devices, history and photos', async () => {
    const db = as(READER);
    await assertSucceeds(getDocs(collection(db, 'devices')));
    await assertSucceeds(getDocs(collection(db, 'devices/ABC/history')));
    await assertSucceeds(getDoc(doc(db, 'photos/p1')));
  });
  it('cannot write anything', async () => {
    const db = as(READER);
    await assertFails(setDoc(doc(db, 'devices/NEW'), { product: 'A55' }));
    await assertFails(setDoc(doc(db, 'devices/ABC/history/h2'), { type: 'x' }));
    await assertFails(setDoc(doc(db, 'photos/p2'), { deviceId: 'ABC' }));
    await assertFails(deleteDoc(doc(db, 'devices/ABC')));
  });
  it('cannot read or write config/access', async () => {
    const db = as(READER);
    await assertFails(getDoc(doc(db, 'config/access')));
    await assertFails(setDoc(doc(db, 'config/access'), { readers: [READER, STRANGER] }));
  });
});

describe('outsiders', () => {
  it('stranger cannot read', async () => {
    await assertFails(getDocs(collection(as(STRANGER), 'devices')));
    await assertFails(getDoc(doc(as(STRANGER), 'photos/p1')));
  });
  it('unauthenticated cannot read', async () => {
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'devices')));
  });
  it('stranger denied cleanly when config/access is missing', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'config/access')));
    await assertFails(getDocs(collection(as(STRANGER), 'devices')));
    await assertSucceeds(getDocs(collection(as(ADMIN), 'devices')));
  });
});
```

- [ ] **Step 2: Crear un `firestore.rules` que niegue todo y correr para ver que fallan**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

Run: `npm run test:rules`
Esperado: arranca el emulador y fallan los tests de admin y reader (los de outsiders pasan).

- [ ] **Step 3: Implementar las reglas reales en `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null && request.auth.token.email_verified == true;
    }
    function isAdmin() {
      return signedIn() && request.auth.token.email == 'rodri.rita24@gmail.com';
    }
    function isReader() {
      return signedIn()
        && exists(/databases/$(database)/documents/config/access)
        && request.auth.token.email in get(/databases/$(database)/documents/config/access).data.readers;
    }
    function canRead() { return isAdmin() || isReader(); }

    match /devices/{deviceId} {
      allow read: if canRead();
      allow write: if isAdmin();
      match /history/{entryId} {
        allow read: if canRead();
        allow write: if isAdmin();
      }
    }
    match /photos/{photoId} {
      allow read: if canRead();
      allow write: if isAdmin();
    }
    match /config/access {
      allow read, write: if isAdmin();
    }
  }
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm run test:rules`
Esperado: PASS en todos los tests.

- [ ] **Step 5: Commit**

```
git add firestore.rules tests/rules
git commit -m "feat: firestore security rules (admin writes, readers by allowlist)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Proyecto Firebase real (pasos guiados con el usuario)

**Files:** Create: `.firebaserc`, `src/config.js`

Los pasos que piden la cuenta del usuario se le explican y los ejecuta él cuando hace falta login interactivo.

- [ ] **Step 1: Login de Firebase CLI.** Verificar con `firebase login:list`. Si no hay cuenta, el usuario corre `firebase login` en su terminal.

- [ ] **Step 2: Crear el proyecto**

Run: `firebase projects:create inventario-samples-rr --display-name "Inventario Samples"`
Si el ID está tomado, probar `inventario-samples-rr2` y usar ese ID en todo lo que sigue.

- [ ] **Step 3: Crear la base Firestore**

Run: `firebase firestore:databases:create "(default)" --location=southamerica-east1 --project inventario-samples-rr`

- [ ] **Step 4: Activar Google Sign-In (usuario, en consola)**

Usuario: https://console.firebase.google.com/project/inventario-samples-rr/authentication → "Comenzar" → Método de acceso → Google → Habilitar → mail de soporte → Guardar.

- [ ] **Step 5: Registrar la web app y obtener la config**

Run: `firebase apps:create web "Inventario Web" --project inventario-samples-rr`
Run: `firebase apps:sdkconfig web --project inventario-samples-rr`
Copiar el objeto `firebaseConfig` de la salida a `src/config.js`:

```js
export const ADMIN_EMAIL = 'rodri.rita24@gmail.com';

// Salida de `firebase apps:sdkconfig web --project inventario-samples-rr`
export const firebaseConfig = {
  apiKey: '…',
  authDomain: 'inventario-samples-rr.firebaseapp.com',
  projectId: 'inventario-samples-rr',
  storageBucket: '…',
  messagingSenderId: '…',
  appId: '…',
};
```
(Los `…` son los valores reales que imprime el comando: se pegan tal cual. La apiKey web de Firebase es pública por diseño; la seguridad está en las reglas.)

- [ ] **Step 6: `.firebaserc` y deploy de reglas**

`.firebaserc`:
```json
{ "projects": { "default": "inventario-samples-rr" } }
```
Run: `firebase deploy --only firestore:rules`
Esperado: `Deploy complete!`

- [ ] **Step 7: Commit**

```
git add .firebaserc src/config.js
git commit -m "chore: firebase project config" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Init de Firebase y capa de datos

**Files:** Create: `src/fs.js`, `src/firebase.js`, `src/data/devices.js`, `src/data/photos.js`, `src/data/access.js`

La capa de datos es delgada: toda la lógica de negocio ya está testeada en `src/lib`. Se valida en el E2E (Task 14).

- [ ] **Step 1: Verificar la versión del SDK**

Run: `npm view firebase version`. Usar esa versión en las URLs de `src/fs.js` y `src/firebase.js` (abajo figura `12.0.0`; reemplazarla en ambos archivos si la última es otra 12.x).

- [ ] **Step 2: `src/fs.js`**

```js
export * from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
```

- [ ] **Step 3: `src/firebase.js`**

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import { getFirestore } from './fs.js';
import { firebaseConfig } from './config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);
export const onUser = (cb) => onAuthStateChanged(auth, cb);
```

- [ ] **Step 4: `src/data/devices.js`**

```js
import { db } from '../firebase.js';
import { collection, doc, getDoc, getDocs, onSnapshot, writeBatch, serverTimestamp, query, orderBy } from '../fs.js';
import { serialToDocId } from '../lib/serial.js';
import { prepareSave, prepareBulk } from '../lib/device.js';
import { todayISO } from '../lib/dates.js';
import { chunkOps } from '../lib/batch.js';
import { ValidationError, DuplicateSerialError } from '../lib/errors.js';

const deviceRef = (id) => doc(db, 'devices', id);
const historyCol = (id) => collection(db, 'devices', id, 'history');

function addHistory(batch, deviceId, entries) {
  for (const e of entries) batch.set(doc(historyCol(deviceId)), { ...e, at: serverTimestamp() });
}

async function assertSerialFree(id) {
  const snap = await getDoc(deviceRef(id));
  if (snap.exists()) throw new DuplicateSerialError({ id, ...snap.data() });
}

export function subscribeDevices(onData, onError) {
  return onSnapshot(
    collection(db, 'devices'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

export async function createDevice(input, note = '') {
  const { errors, data, history } = prepareSave(null, input, todayISO(), note);
  if (errors.length) throw new ValidationError(errors);
  const id = serialToDocId(data.serial);
  await assertSerialFree(id);
  const batch = writeBatch(db);
  batch.set(deviceRef(id), { ...data, photoIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  addHistory(batch, id, history);
  await batch.commit();
  return id;
}

export async function updateDevice(before, input, note = '') {
  const { errors, data, history } = prepareSave(before, input, todayISO(), note);
  if (errors.length) throw new ValidationError(errors);
  const newId = serialToDocId(data.serial);
  if (newId !== before.id) return moveDevice(before, data, history, newId);
  if (!history.length) return before.id;
  const batch = writeBatch(db);
  batch.update(deviceRef(before.id), { ...data, updatedAt: serverTimestamp() });
  addHistory(batch, before.id, history);
  await batch.commit();
  return before.id;
}

// Cambio de serial = cambio de ID del documento: copia equipo + historial al nuevo ID y borra el viejo.
async function moveDevice(before, data, history, newId) {
  await assertSerialFree(newId);
  const oldHistory = await getDocs(historyCol(before.id));
  const batch = writeBatch(db);
  batch.set(deviceRef(newId), {
    ...data,
    photoIds: before.photoIds ?? [],
    createdAt: before.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  oldHistory.forEach((h) => {
    batch.set(doc(historyCol(newId), h.id), h.data());
    batch.delete(h.ref);
  });
  addHistory(batch, newId, history);
  for (const pid of before.photoIds ?? []) batch.update(doc(db, 'photos', pid), { deviceId: newId });
  batch.delete(deviceRef(before.id));
  await batch.commit();
  return newId;
}

export async function bulkUpdate(devices, patch, note = '') {
  const today = todayISO();
  const ops = [];
  for (const d of devices) {
    const { errors, data, history } = prepareBulk(d, patch, today, note);
    if (errors.length || !history.length) continue;
    ops.push({ id: d.id, data, history });
  }
  let ok = 0;
  const failed = [];
  for (const chunk of chunkOps(ops)) {
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.update(deviceRef(op.id), { ...op.data, updatedAt: serverTimestamp() });
      addHistory(batch, op.id, op.history);
    }
    try {
      await batch.commit();
      ok += chunk.length;
    } catch (e) {
      console.error('bulkUpdate chunk failed', e);
      failed.push(...chunk.map((o) => o.id));
    }
  }
  return { ok, failed, skipped: devices.length - ops.length };
}

export async function deleteDevice(device) {
  const history = await getDocs(historyCol(device.id));
  const batch = writeBatch(db);
  history.forEach((h) => batch.delete(h.ref));
  for (const pid of device.photoIds ?? []) batch.delete(doc(db, 'photos', pid));
  batch.delete(deviceRef(device.id));
  await batch.commit();
}

export async function listHistory(deviceId) {
  const snap = await getDocs(query(historyCol(deviceId), orderBy('at', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
```

- [ ] **Step 5: `src/data/photos.js`**

```js
import { db } from '../firebase.js';
import { collection, doc, getDoc, writeBatch, serverTimestamp, arrayUnion, arrayRemove } from '../fs.js';

export async function addPhoto(deviceId, dataUrl) {
  const ref = doc(collection(db, 'photos'));
  const batch = writeBatch(db);
  batch.set(ref, { deviceId, data: dataUrl, createdAt: serverTimestamp() });
  batch.update(doc(db, 'devices', deviceId), { photoIds: arrayUnion(ref.id), updatedAt: serverTimestamp() });
  await batch.commit();
  return ref.id;
}

export async function getPhotos(ids) {
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'photos', id))));
  return snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
}

export async function deletePhoto(deviceId, photoId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'photos', photoId));
  batch.update(doc(db, 'devices', deviceId), { photoIds: arrayRemove(photoId), updatedAt: serverTimestamp() });
  await batch.commit();
}
```

- [ ] **Step 6: `src/data/access.js`**

```js
import { db } from '../firebase.js';
import { ADMIN_EMAIL } from '../config.js';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, limit, arrayUnion, arrayRemove } from '../fs.js';
import { normalizeEmail, isValidEmail } from '../lib/email.js';

const accessRef = () => doc(db, 'config', 'access');

// 'admin' | 'reader' | null (sin acceso)
export async function determineRole(user) {
  if (normalizeEmail(user.email) === ADMIN_EMAIL) return 'admin';
  try {
    await getDocs(query(collection(db, 'devices'), limit(1)));
    return 'reader';
  } catch (e) {
    if (e.code === 'permission-denied') return null;
    throw e;
  }
}

export async function getReaders() {
  const snap = await getDoc(accessRef());
  return [...(snap.data()?.readers ?? [])].sort();
}

export async function addReader(email) {
  const e = normalizeEmail(email);
  if (!isValidEmail(e)) throw new Error('Mail inválido');
  if (e === ADMIN_EMAIL) throw new Error('Ese es el mail del administrador');
  await setDoc(accessRef(), { readers: arrayUnion(e) }, { merge: true });
}

export async function removeReader(email) {
  await updateDoc(accessRef(), { readers: arrayRemove(email) });
}
```

- [ ] **Step 7: Commit**

```
git add src/fs.js src/firebase.js src/data
git commit -m "feat: firebase init and firestore data layer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Shell, estilos, login y pantalla sin acceso

**Files:** Create: `index.html`, `styles.css`, `src/ui/dom.js`, `src/ui/theme.js`, `src/ui/screens.js`, `src/main.js` (versión inicial)

- [ ] **Step 1: `index.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Inventario de Samples</title>
  <link rel="stylesheet" href="styles.css">
  <script type="module" src="src/main.js"></script>
</head>
<body>
  <div id="app"><div class="center-screen"><span class="muted">Cargando…</span></div></div>
  <dialog id="dialog"></dialog>
  <div id="toasts" class="toasts" aria-live="polite"></div>
</body>
</html>
```

- [ ] **Step 2: `styles.css`**

```css
:root {
  --bg: #f5f6f8; --surface: #ffffff; --surface-2: #eef0f4; --border: #dfe3ea;
  --text: #1b2130; --muted: #6a7284; --primary: #2f6fec; --primary-text: #ffffff;
  --danger: #d14343; --ok: #1d8f4e; --warn: #b07800;
  --ok-bg: #e2f5ea; --warn-bg: #fff2cf; --danger-bg: #fde5e5; --neutral-bg: #eceef2;
  --shadow: 0 1px 3px rgba(16, 24, 40, .08); --radius: 10px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #101318; --surface: #191e26; --surface-2: #222934; --border: #2d3541;
    --text: #e5e8ee; --muted: #959eae; --primary: #5b8ff9; --primary-text: #0b1020;
    --danger: #f07070; --ok: #4cc483; --warn: #e2b13c;
    --ok-bg: #15321f; --warn-bg: #382d10; --danger-bg: #3b1b1b; --neutral-bg: #262d38;
    --shadow: 0 1px 3px rgba(0, 0, 0, .4);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #101318; --surface: #191e26; --surface-2: #222934; --border: #2d3541;
  --text: #e5e8ee; --muted: #959eae; --primary: #5b8ff9; --primary-text: #0b1020;
  --danger: #f07070; --ok: #4cc483; --warn: #e2b13c;
  --ok-bg: #15321f; --warn-bg: #382d10; --danger-bg: #3b1b1b; --neutral-bg: #262d38;
  --shadow: 0 1px 3px rgba(0, 0, 0, .4);
  color-scheme: dark;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, "Segoe UI", Roboto, sans-serif; }
h1, h2, h3 { margin: 0; line-height: 1.2; }
h1 { font-size: 18px; } h2 { font-size: 17px; } h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 8px; }
.muted { color: var(--muted); }
.mono { font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
.strong { font-weight: 600; }

.btn { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 8px; padding: 7px 12px; font: inherit; cursor: pointer; }
.btn:hover { background: var(--surface-2); }
.btn:disabled { opacity: .55; cursor: wait; }
.btn-primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.btn-primary:hover { filter: brightness(1.08); background: var(--primary); }
.btn-danger { color: var(--danger); border-color: var(--danger); }
.btn-ghost { border-color: transparent; background: transparent; }
.icon-btn { border: 0; background: transparent; color: var(--text); font-size: 16px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.icon-btn:hover { background: var(--surface-2); }
.link { border: 0; background: none; color: var(--primary); text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }

input, select { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; min-width: 0; }
input:focus, select:focus { outline: 2px solid var(--primary); outline-offset: -1px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
label.check { flex-direction: row; align-items: center; gap: 6px; font-size: 13px; color: var(--text); }
label.block { margin-top: 12px; }

.center-screen { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 28px; max-width: 420px; text-align: center; }
.card p { color: var(--muted); }

.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 5; }
.topbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.user { color: var(--muted); font-size: 13px; }
.main { padding: 16px 20px 40px; max-width: 1500px; margin: 0 auto; }

.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 14px; }
.stat { text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; cursor: pointer; color: var(--text); font: inherit; box-shadow: var(--shadow); }
.stat.active { outline: 2px solid var(--primary); }
.stat-value { display: block; font-size: 26px; font-weight: 700; }
.stat-label { color: var(--muted); font-size: 13px; }
.stat-por_vencer .stat-value { color: var(--warn); }
.stat-vencido .stat-value { color: var(--danger); }

.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.toolbar input[type="search"] { flex: 1 1 280px; }
.bulkbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px 12px; margin-bottom: 12px; border-radius: var(--radius); background: var(--surface-2); border: 1px solid var(--border); }

.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
.table th { font-size: 12px; color: var(--muted); font-weight: 600; background: var(--surface); position: sticky; top: 0; }
.table th.sortable { cursor: pointer; user-select: none; }
.table th.sorted-asc::after { content: " ▲"; }
.table th.sorted-desc::after { content: " ▼"; }
.table tbody tr { cursor: pointer; }
.table tbody tr:hover { background: var(--surface-2); }
.table tbody tr.selected { background: color-mix(in srgb, var(--primary) 12%, transparent); }
.table td.empty { text-align: center; color: var(--muted); padding: 32px; cursor: default; }
.col-check { width: 36px; }

.pill, .due { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; background: var(--neutral-bg); }
.pill-asignado { background: color-mix(in srgb, var(--primary) 18%, transparent); }
.pill-perdido, .pill-no_return { background: var(--danger-bg); color: var(--danger); }
.pill-devuelto { color: var(--muted); }
.due-vigente { background: var(--ok-bg); color: var(--ok); }
.due-por_vencer { background: var(--warn-bg); color: var(--warn); }
.due-vencido { background: var(--danger-bg); color: var(--danger); }
.due-none { color: var(--muted); }

.panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); background: var(--surface); border-left: 1px solid var(--border); box-shadow: -8px 0 24px rgba(0, 0, 0, .12); z-index: 10; display: flex; flex-direction: column; }
.panel[hidden] { display: none; }
.panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.panel-body { padding: 16px 18px 32px; overflow-y: auto; }
.panel-section { margin-top: 22px; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.span-2 { grid-column: span 2; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.form-error { color: var(--danger); background: var(--danger-bg); border-radius: 8px; padding: 8px 10px; margin: 12px 0 0; }
.form-error[hidden] { display: none; }

.details { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
.details dt { color: var(--muted); }
.details dd { margin: 0; }

.dropzone { display: block; border: 2px dashed var(--border); border-radius: var(--radius); padding: 14px; text-align: center; cursor: pointer; margin-bottom: 10px; color: var(--muted); font-size: 13px; }
.dropzone.over { border-color: var(--primary); color: var(--primary); }
.photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
.photo { position: relative; margin: 0; }
.photo img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; cursor: zoom-in; display: block; }
.photo-del { position: absolute; top: 4px; right: 4px; border: 0; border-radius: 50%; width: 24px; height: 24px; background: rgba(0, 0, 0, .6); color: #fff; cursor: pointer; }
.photo-full { max-width: 100%; max-height: 75vh; display: block; margin: 0 auto; border-radius: 8px; }

.history { list-style: none; margin: 0; padding: 0; }
.history li { padding: 8px 0; border-bottom: 1px solid var(--border); }
.history time { color: var(--muted); font-size: 12px; display: block; }

dialog { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); padding: 20px; width: min(440px, calc(100vw - 32px)); box-shadow: 0 20px 50px rgba(0, 0, 0, .25); }
dialog.wide { width: min(720px, calc(100vw - 32px)); }
dialog::backdrop { background: rgba(10, 14, 20, .45); }
dialog h2 { margin-bottom: 12px; }
.readers { list-style: none; padding: 0; margin: 12px 0; }
.readers li { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); }
.row { display: flex; gap: 8px; }
.row input { flex: 1; }

.toasts { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; z-index: 50; }
.toast { background: var(--text); color: var(--bg); padding: 10px 16px; border-radius: 8px; box-shadow: var(--shadow); max-width: min(560px, calc(100vw - 32px)); }
.toast-error { background: var(--danger); color: #fff; }
.toast-success { background: var(--ok); color: #fff; }

@media (max-width: 640px) {
  .form-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: auto; }
  .topbar, .main { padding-left: 16px; padding-right: 16px; }
}
```

- [ ] **Step 3: `src/ui/dom.js`**

```js
export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 3500);
}

export function errorMessage(err) {
  if (err?.code === 'permission-denied') return 'No tenés permiso para hacer eso.';
  if (err?.code === 'unavailable') return 'Sin conexión con la base. Revisá internet y probá de nuevo.';
  if (err?.code === 'auth/popup-closed-by-user') return 'Se cerró la ventana de login.';
  return err?.message || 'Ocurrió un error inesperado.';
}

export function openDialog(html, { wide = false } = {}) {
  const dlg = $('#dialog');
  dlg.className = wide ? 'wide' : '';
  dlg.innerHTML = html;
  dlg.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeDialog));
  if (!dlg.open) dlg.showModal();
  return dlg;
}

export function closeDialog() {
  const dlg = $('#dialog');
  if (dlg.open) dlg.close();
  dlg.innerHTML = '';
}

export function setBusy(form, busy) {
  form.querySelectorAll('button').forEach((b) => (b.disabled = busy));
}
```

- [ ] **Step 4: `src/ui/theme.js`**

```js
export function initTheme() {
  try {
    const t = localStorage.getItem('theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch { /* storage bloqueado: usa el tema del sistema */ }
}

export function toggleTheme() {
  const root = document.documentElement;
  const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* ignorar */ }
}
```

- [ ] **Step 5: `src/ui/screens.js`**

```js
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

export function renderNoAccess(app, email, onLogout) {
  app.innerHTML = `
    <div class="center-screen"><div class="card">
      <h1>No tenés acceso</h1>
      <p><strong>${esc(email)}</strong> no está autorizado para ver el inventario. Pedíselo a Rodrigo.</p>
      <button class="btn" id="btn-logout">Usar otra cuenta</button>
    </div></div>`;
  app.querySelector('#btn-logout').onclick = onLogout;
}
```

- [ ] **Step 6: `src/main.js` inicial (solo auth, para validar login)**

```js
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
```

- [ ] **Step 7: Verificar en el navegador**

Run (en background): `npm run dev`
Abrir `http://localhost:5173`. Esperado: pantalla de login; al ingresar con la cuenta admin se ve "Rol: admin". Consola sin errores. (`localhost` ya viene autorizado en Firebase Auth.)

- [ ] **Step 8: Commit**

```
git add index.html styles.css src/ui src/main.js
git commit -m "feat: app shell, theme, login and no-access screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Formulario compartido, lista principal y alta de equipos

**Files:** Create: `src/ui/form.js`, `src/ui/list.js`, `src/ui/export.js`. Modify: `src/main.js` (reemplazo completo)

- [ ] **Step 1: `src/ui/form.js`**

```js
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
```

- [ ] **Step 2: `src/ui/list.js`**

```js
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

// Refleja `filters` en los controles y actualiza las opciones de owner/locación.
export function syncToolbar(el, filters, owners, locations) {
  el.querySelector('#f-owner').innerHTML = valueOptions('Todos los owners', owners);
  el.querySelector('#f-location').innerHTML = valueOptions('Todas las locaciones', locations);
  const q = el.querySelector('#f-q');
  if (document.activeElement !== q) q.value = filters.q;
  el.querySelector('#f-category').value = filters.category;
  el.querySelector('#f-status').value = filters.status;
  el.querySelector('#f-owner').value = filters.owner;
  el.querySelector('#f-location').value = filters.location;
  el.querySelector('#f-due').value = filters.due;
  el.querySelector('#f-returned').checked = filters.showReturned;
}

export function renderTable(el, rows, ctx, handlers) {
  const { sort, selected, isAdmin, today } = ctx;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const head = `<tr>
    ${isAdmin ? `<th class="col-check"><input type="checkbox" id="sel-all" ${allSelected ? 'checked' : ''} aria-label="Seleccionar todos"></th>` : ''}
    ${COLS.map(([k, l]) => `<th data-sort="${k}" class="sortable${sort.key === k ? ` sorted-${sort.dir}` : ''}">${l}</th>`).join('')}
  </tr>`;
  const body = rows.length
    ? rows.map((d) => {
        const ds = dueState(d, today);
        return `<tr data-id="${esc(d.id)}" class="${selected.has(d.id) ? 'selected' : ''}">
          ${isAdmin ? `<td class="col-check"><input type="checkbox" data-sel="${esc(d.id)}" ${selected.has(d.id) ? 'checked' : ''} aria-label="Seleccionar"></td>` : ''}
          <td class="strong">${esc(d.product)}</td>
          <td>${esc(labelOf(CATEGORIES, d.category))}</td>
          <td>${esc(d.model)}</td>
          <td>${esc(d.color)}</td>
          <td class="mono">${esc(d.serial)}</td>
          <td><span class="pill pill-${esc(d.status)}">${esc(labelOf(STATUSES, d.status))}</span></td>
          <td>${esc(d.owner)}</td>
          <td>${esc(d.location)}</td>
          <td>${d.dueDate ? `<span class="due due-${ds ?? 'none'}" title="${esc(DUE_STATES[ds] ?? '')}">${formatDate(d.dueDate)}</span>` : ''}</td>
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
  el.querySelectorAll('tbody tr[data-id]').forEach((tr) => (tr.onclick = () => handlers.onOpen(tr.dataset.id)));
}
```

- [ ] **Step 3: `src/ui/export.js`**

```js
import { toCSV } from '../lib/csv.js';
import { CATEGORIES, STATUSES, DUE_STATES, labelOf } from '../lib/constants.js';
import { dueState, formatDate } from '../lib/dates.js';

export function exportCSV(rows, today) {
  const columns = [
    { label: 'Producto', value: (d) => d.product },
    { label: 'Categoría', value: (d) => labelOf(CATEGORIES, d.category) },
    { label: 'Modelo', value: (d) => d.model },
    { label: 'Color', value: (d) => d.color },
    { label: 'Serial / IMEI', value: (d) => d.serial },
    { label: 'Estado', value: (d) => labelOf(STATUSES, d.status) },
    { label: 'Owner', value: (d) => d.owner },
    { label: 'Locación', value: (d) => d.location },
    { label: 'Fecha solicitud', value: (d) => formatDate(d.requestDate) },
    { label: 'Vencimiento', value: (d) => formatDate(d.dueDate) },
    { label: 'Estado vencimiento', value: (d) => DUE_STATES[dueState(d, today)] ?? '' },
    { label: 'Fecha devolución', value: (d) => formatDate(d.returnedDate) },
  ];
  const blob = new Blob([toCSV(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventario-${today}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
```

- [ ] **Step 4: Reemplazar `src/main.js` completo**

```js
import { login, logout, onUser } from './firebase.js';
import { determineRole } from './data/access.js';
import { subscribeDevices, createDevice } from './data/devices.js';
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
  // Se completa en la Task 12.
  state.panelId = id;
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
```

- [ ] **Step 5: Verificar en el navegador**

Con `npm run dev` corriendo, recargar `http://localhost:5173` y loguearse como admin. Verificar:
1. Se ven las 4 tarjetas en 0 y la tabla con "No hay equipos que coincidan."
2. "+ Nuevo equipo": cargar Z Flip5 / celular / Mint / serial `TEST-0001` / vencimiento dentro de 20 días → Guardar. Aparece en la tabla con badge amarillo y la tarjeta "Por vencer" en 1.
3. "+ Nuevo equipo" con el mismo serial `test-0001` → aparece "Ya existe: Z Flip5…" y no se guarda.
4. "Guardar y cargar otro igual" con serial `TEST-0002` → el form queda abierto con todo menos serial y color.
5. Buscar `0002` filtra a un equipo; ordenar por "Producto" alterna ▲/▼; clic en "Por vencer" filtra.
6. "Exportar CSV" descarga un archivo que abre bien en Excel (acentos correctos y columnas separadas).

- [ ] **Step 6: Commit**

```
git add src/ui src/main.js
git commit -m "feat: main list, filters, summary cards, new device dialog and CSV export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Panel de ficha (edición, historial, fotos, borrar)

**Files:** Create: `src/ui/panel.js`. Modify: `src/main.js` (imports y `openPanel`)

- [ ] **Step 1: `src/ui/panel.js`**

```js
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
          ${deviceFieldsHTML(device, suggestions)}
          ${device.returnedDate ? `<p class="muted">Devuelto el ${formatDate(device.returnedDate)}</p>` : ''}
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
  h.loadPhotos()
    .then((photos) => fillPhotos(photosEl, photos, isAdmin, h))
    .catch((e) => { photosEl.innerHTML = `<span class="form-error">${esc(errorMessage(e))}</span>`; });
  h.loadHistory()
    .then((entries) => { historyEl.innerHTML = entries.length ? entries.map(historyItemHTML).join('') : '<li class="muted">Sin movimientos.</li>'; })
    .catch((e) => { historyEl.innerHTML = `<li class="form-error">${esc(errorMessage(e))}</li>`; });
}
```

- [ ] **Step 2: Conectar en `src/main.js`**

Reemplazar la línea de import de `./data/devices.js` por la primera línea de abajo y agregar las otras tres:

```js
import { subscribeDevices, createDevice, updateDevice, deleteDevice, listHistory } from './data/devices.js';
import { addPhoto, getPhotos, deletePhoto } from './data/photos.js';
import { compressImageFile } from './lib/compress.js';
import { renderPanel } from './ui/panel.js';
```

Reemplazar la función `openPanel` provisoria por:

```js
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
```

Agregar al final de `src/main.js` el cierre con Escape:

```js
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#dialog').open && state.panelId) closePanel();
});
```

- [ ] **Step 3: Verificar en el navegador**

1. Clic en `TEST-0001` → se abre el panel con los datos y el historial con "Alta · Ingreso del equipo".
2. Cambiar estado a Asignado, owner "Ana" y nota "prueba" → Guardar. El historial muestra las entradas Estado y Owner con la nota, y la tabla se actualiza.
3. Cambiar vencimiento → aparece una entrada "Renovación" con fechas dd/mm/aaaa.
4. Estado → Devuelto → aparece "Devuelto el <hoy>" y el equipo se oculta de la tabla (salvo con "Mostrar devueltos").
5. Subir una foto de celular de más de 3 MB → aparece en la galería; clic la amplía; ✕ la borra. En DevTools → Network, el documento de `photos` pesa menos de 700 KB.
6. Cambiar el serial a `TEST-0001B` → el panel se reabre con el serial nuevo, el historial anterior se conserva y la foto sigue.
7. Eliminar → confirmación → desaparece de la tabla.

- [ ] **Step 4: Commit**

```
git add src/ui/panel.js src/main.js
git commit -m "feat: device panel with edit, history, photos and delete" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Acciones en bloque y pantalla de accesos

**Files:** Create: `src/ui/bulk.js`, `src/ui/access.js`. Modify: `src/main.js`

- [ ] **Step 1: `src/ui/bulk.js`**

```js
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

export function renderBulkBar(el, count, onAction) {
  el.hidden = count === 0;
  if (!count) { el.innerHTML = ''; return; }
  el.innerHTML = `<span><strong>${count}</strong> seleccionado(s)</span>
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
```

- [ ] **Step 2: `src/ui/access.js`**

```js
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
```

- [ ] **Step 3: Conectar en `src/main.js`**

Agregar `bulkUpdate` al import de `./data/devices.js` y estos imports:

```js
import { renderBulkBar, openBulkDialog } from './ui/bulk.js';
import { openAccessDialog } from './ui/access.js';
```

En `renderShell()`, después de la línea de `#btn-new`, agregar:

```js
  $('#btn-access')?.addEventListener('click', openAccessDialog);
```

Al final de `renderMain()`, agregar:

```js
  if (isAdmin()) renderBulkBar($('#bulkbar'), state.selected.size, onBulkAction);
```

Agregar la función:

```js
function onBulkAction(action) {
  if (action === 'clear') {
    state.selected.clear();
    renderMain();
    return;
  }
  const devices = [...state.selected].map(byId).filter(Boolean);
  openBulkDialog(action, devices.length, suggestions(), async (patch, note) => {
    const res = await bulkUpdate(devices, patch, note);
    if (res.failed.length) {
      toast(`${res.ok} actualizados, ${res.failed.length} fallaron. Quedaron seleccionados para reintentar.`, 'error');
    } else {
      toast(`${res.ok} equipo(s) actualizados${res.skipped ? ` (${res.skipped} sin cambios)` : ''}`, 'success');
    }
    state.selected = new Set(res.failed);
    renderMain();
  });
}
```

- [ ] **Step 4: Verificar en el navegador**

1. Cargar 3 equipos de prueba. Seleccionar 2 con checkbox → aparece la barra "2 seleccionado(s)".
2. "Renovar vencimiento" → fecha nueva + nota → Aplicar. Los 2 muestran la fecha nueva y cada historial tiene "Renovación" con la nota.
3. "Marcar devuelto" → se ocultan, y con "Mostrar devueltos" aparecen con fecha de devolución de hoy (en la ficha).
4. El checkbox del encabezado selecciona todos los visibles.
5. "Accesos" → agregar un segundo mail tuyo (o uno de prueba) → aparece en la lista; "Quitar" lo saca.

- [ ] **Step 5: Commit**

```
git add src/ui/bulk.js src/ui/access.js src/main.js
git commit -m "feat: bulk actions and reader access management" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Publicación y E2E final

**Files:** ninguno nuevo (GitHub + Firebase console)

- [ ] **Step 1: Correr todos los tests**

Run: `npm test` → PASS. Run: `npm run test:rules` → PASS.

- [ ] **Step 2: Confirmar con el usuario la visibilidad del repo**

GitHub Pages gratis requiere repo **público** (el código y la config web de Firebase quedan visibles; los datos no, porque los protegen las reglas). Confirmar antes de crear.

- [ ] **Step 3: Crear el repo y pushear**

Run: `gh repo create inventario-samples --public --source . --push`
Run: `gh api -X POST repos/{owner}/inventario-samples/pages -f "source[branch]=main" -f "source[path]=/"`
Run: `gh api repos/{owner}/inventario-samples/pages --jq .html_url`
Esperado: `https://<usuario>.github.io/inventario-samples/`

- [ ] **Step 4: Autorizar el dominio en Firebase Auth (usuario, en consola)**

Firebase console → Authentication → Settings → Dominios autorizados → Agregar `<usuario>.github.io`.

- [ ] **Step 5: E2E en producción**

1. Abrir la URL de Pages → login admin → crear un equipo de ejemplo ficticio (ej. "Galaxy Demo", serial `DEMO-0001`).
2. Agregar en Accesos un mail secundario. En una ventana de incógnito, loguearse con ese mail: ve la lista y la ficha en solo lectura, sin botones de edición ni checkboxes, con "· solo lectura" arriba.
3. En incógnito, con un mail que no está en la lista: aparece la pantalla "No tenés acceso".
4. Quitar el mail secundario de Accesos; al recargar la ventana de incógnito pasa a "No tenés acceso".
5. Borrar los equipos de prueba (`TEST-*`). `DEMO-0001` lo borra el usuario cuando quiera.

- [ ] **Step 6: Commit final si hubo ajustes**

```
git add -A
git commit -m "chore: production fixes after E2E" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```
