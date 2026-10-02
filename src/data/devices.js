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
