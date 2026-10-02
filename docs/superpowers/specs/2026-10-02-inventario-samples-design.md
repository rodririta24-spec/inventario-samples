# Inventario de Samples — Diseño

**Fecha:** 2026-10-02
**Estado:** Aprobado en brainstorming, pendiente de revisión del documento

## Objetivo

App web para administrar el inventario de dispositivos (celulares, tablets, laptops, wearables, audio, TV, etc.) recibidos en comodato. Reemplaza el viejo Google Sheet "WAREHOUSE PRODUCTOS SEASA @ CHEIL", pero **no depende de ningún Sheet**: tiene base de datos propia. La base arranca vacía; del Sheet viejo solo se toma la estructura de campos.

## Usuarios y acceso

- **Admin (único editor):** Rodrigo (rodri.rita24@gmail.com).
- **Lectores:** lista de mails autorizados que administra el admin desde la app. Ven todo, no editan nada.
- Cualquier otro mail ve la pantalla "No tenés acceso, pedíselo a Rodrigo".
- Uso desde PC (desktop). No hay APK ni versión mobile dedicada.

## Arquitectura

```
index.html (GitHub Pages)  ──login Google──►  Firebase Auth
        │
        └── lee/escribe ──►  Firestore
                              ├─ devices/{deviceId}
                              │    └─ history/{entryId}
                              ├─ photos/{photoId}
                              └─ config/access
```

- **Frontend:** un `index.html` estático (misma línea que Dashboard-contenidos) con Firebase JS SDK desde CDN. Lógica pura en módulos JS separados para poder testearla.
- **Backend:** Firebase, en un **proyecto nuevo** separado del Dashboard. Plan gratuito (Spark), sin Firebase Storage.
- **Hosting:** repo GitHub nuevo `inventario-samples` con GitHub Pages.

### Reglas de seguridad de Firestore

- `config/access` contiene `adminEmail` y `readers: [emails]`.
- **Lectura** de `devices`, `history`, `photos`: permitida si `request.auth.token.email` es el admin o está en `readers`, y el email está verificado.
- **Escritura** de todo (incluido `config/access`): solo el admin.
- **Lectura de `config/access`:** solo el admin. Un lector no ve la lista de lectores; la UI determina si el usuario es lector intentando leer `devices`.

## Modelo de datos

### `devices/{deviceId}`

| Campo | Tipo | Reglas |
|---|---|---|
| `product` | string | obligatorio, ej. "Z Flip5" |
| `category` | enum | `celular`, `tablet`, `laptop`, `wearable`, `audio`, `tv`, `otro` |
| `model` | string | opcional |
| `color` | string | opcional |
| `serial` | string | obligatorio, **único** (normalizado: trim + mayúsculas) |
| `status` | enum | `en_stock`, `asignado`, `devuelto`, `perdido`, `no_return` |
| `owner` | string | opcional, autocompletado con valores existentes |
| `location` | string | opcional, autocompletado con valores existentes |
| `requestDate` | date | opcional |
| `dueDate` | date | opcional |
| `returnedDate` | date | **automático**: se setea con la fecha del día cuando `status` pasa a `devuelto`; se borra si sale de `devuelto` |
| `photoIds` | string[] | referencias a `photos` |
| `createdAt`, `updatedAt` | timestamp | automáticos |

**Estado de vencimiento** (calculado en el cliente, no se guarda):
- Sin dato: no hay `dueDate`, o el `status` es `devuelto`, `perdido` o `no_return`.
- `vencido`: `dueDate` < hoy.
- `por_vencer`: hoy ≤ `dueDate` ≤ hoy + 30 días.
- `vigente`: `dueDate` > hoy + 30 días.

Para que el serial sea único, el ID del documento es el serial normalizado. Así Firestore garantiza la unicidad y la verificación es un `get` directo. Si el serial contiene `/`, ese carácter se reemplaza por `_` en el ID; el campo `serial` conserva el valor original. Editar el serial de un equipo existente equivale a "mover" el documento: en un batch se crea el nuevo doc con su historial y se borra el viejo, con una entrada de historial `edicion` que registra el cambio de serial.

### `devices/{deviceId}/history/{entryId}`

| Campo | Tipo |
|---|---|
| `at` | timestamp |
| `type` | `alta`, `estado`, `owner`, `locacion`, `renovacion`, `edicion` |
| `field` | nombre del campo cambiado |
| `from`, `to` | valor anterior y nuevo |
| `note` | string opcional |

Se genera automáticamente en cada guardado: una entrada por cada campo relevante que cambió (`status`, `owner`, `location`, `dueDate`; los cambios de `dueDate` se registran como `renovacion`). El alta genera una entrada `alta`. Los cambios en otros campos generan una única entrada `edicion`.

### `photos/{photoId}`

- `deviceId`, `data` (JPEG en base64), `createdAt`.
- Compresión en el navegador: lado mayor de 1280 px, JPEG con calidad 0.7. Si supera los ~700 KB, baja la calidad en pasos hasta 0.4 y luego reduce dimensiones. Si aun así no entra en el límite de 1 MB del documento, la foto se rechaza con un aviso.
- Las fotos son opcionales; un equipo puede tener 0 o más.

## Pantallas

### Lista principal
- **Tarjetas resumen:** en mi poder (no devueltos), por vencer, vencidos y asignados a otros. Al hacer clic aplican el filtro correspondiente.
- **Buscador** único sobre producto, modelo, serial y owner.
- **Filtros:** categoría, estado, owner, locación y estado de vencimiento. Los devueltos se ocultan por defecto (toggle para mostrarlos).
- **Tabla** ordenable con badge de vencimiento: verde vigente, amarillo por vencer, rojo vencido.
- **Selección múltiple y acciones en bloque (solo admin):** renovar vencimiento (nueva fecha), cambiar estado, cambiar owner, cambiar locación y marcar devuelto. Se ejecutan en un `writeBatch` atómico, incluidas las entradas de historial.
- **Exportar CSV/Excel** de la vista filtrada actual (generado en el cliente).

### Ficha del equipo (panel lateral)
- Datos editables por el admin y de solo lectura para los lectores.
- Galería de fotos con subida por arrastre o selector (solo admin) y visor ampliado.
- Historial cronológico (el más reciente primero).
- Borrar equipo (solo admin, con confirmación; borra también su historial y sus fotos).

### Alta de equipo (solo admin)
- Formulario con autocompletado en owner y locación.
- **"Guardar y cargar otro igual":** conserva todo salvo serial y color, para cargar lotes rápido.

### Accesos (solo admin)
- Agregar y quitar mails lectores.

### Estilo
- Línea visual del Dashboard, con modo claro y oscuro, orientado a desktop.

## Manejo de errores

- **Serial duplicado:** muestra "Ya existe: {producto} de {owner}" con link a ese equipo y no guarda.
- **Error de red o de Firestore:** muestra un aviso visible y el formulario conserva lo escrito.
- **Foto que no entra:** muestra un aviso y el equipo se guarda igual sin esa foto.
- **Mail no autorizado:** muestra la pantalla de "sin acceso" con botón para cerrar sesión.
- **Lector:** la UI oculta los controles de edición; las reglas rechazan cualquier escritura.
- **Acciones en bloque:** son atómicas (todo o nada). El límite de 500 operaciones por batch se respeta partiendo en varios batches; en ese caso se informa si alguno falló.

## Pruebas

- **Reglas de seguridad:** se testean con el Firebase Emulator Suite y `@firebase/rules-unit-testing`. El admin lee y escribe; el lector lee pero no escribe; un mail ajeno no lee; el lector no lee `config/access`.
- **Lógica pura** (estado de vencimiento, normalización de serial, diff a historial, compresión con dimensiones y tope de tamaño): tests unitarios con Vitest.
- **End-to-end manual** en el navegador antes de publicar: alta, alta en serie, edición, renovación en bloque, devolución (fecha automática), fotos, rol lector y mail sin acceso.

## Puesta en marcha

1. Proyecto Firebase nuevo, con Google Sign-In activado y el dominio de GitHub Pages autorizado (pasos guiados para el usuario).
2. Deploy de las reglas de Firestore con Firebase CLI.
3. Carga inicial de `config/access` con el mail admin.
4. Repo GitHub `inventario-samples` con Pages; commit y push automático tras cada cambio.
5. Un único equipo ficticio de ejemplo para probar, que se borra después.

## Fuera de alcance (por ahora)

- Lotes o comodatos como entidad propia.
- Campos de batería, retail mode, nombre de comodato, solicitantes, nro de req y PDF de comodato.
- App Android.
- Notificaciones de vencimiento por mail.
- Importación desde el Sheet viejo.
