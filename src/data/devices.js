import { db } from '../firebase.js';
import { collection, doc, getDoc, getDocs, onSnapshot, writeBatch, runTransaction, serverTimestamp, query, orderBy } from '../fs.js';
import { serialToDocId } from '../lib/serial.js';
import { prepareSave, prepareBulk } from '../lib/device.js';
import { todayISO } from '../lib/dates.js';
import { chunkOps, chunk } from '../lib/batch.js';
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
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(deviceRef(id));
    if (snap.exists()) throw new DuplicateSerialError({ id, ...snap.data() });
    tx.set(deviceRef(id), { ...data, photoIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    for (const e of history) tx.set(doc(historyCol(id)), { ...e, at: serverTimestamp() });
  });
  return id;
}

export async function updateDevice(before, input, note = '') {
  const { errors, data, history } = prepareSave(before, input, todayISO(), note);
  if (errors.length) throw new ValidationError(errors);
  const newId = serialToDocId(data.serial);
  if (newId !== before.id) return { id: await moveDevice(before, data, history, newId), changed: true };
  if (!history.length) return { id: before.id, changed: false };
  const batch = writeBatch(db);
  batch.update(deviceRef(before.id), { ...data, updatedAt: serverTimestamp() });
  addHistory(batch, before.id, history);
  await batch.commit();
  return { id: before.id, changed: true };
}

// Cambio de serial = cambio de ID del documento. Se hace por etapas para no pasar el límite de
// 500 escrituras por batch: copiar historial viejo, batch final (equipo, fotos, borrar viejo), borrar historial viejo.
async function moveDevice(before, data, history, newId) {
  await assertSerialFree(newId);
  const oldSnap = await getDoc(deviceRef(before.id));
  if (!oldSnap.exists()) throw new Error('El equipo ya no existe');
  const current = oldSnap.data();
  const oldHistory = (await getDocs(historyCol(before.id))).docs;

  try {
    for (const part of chunk(oldHistory, 450)) {
      const batch = writeBatch(db);
      for (const h of part) batch.set(doc(historyCol(newId), h.id), h.data({ serverTimestamps: 'estimate' }));
      await batch.commit();
    }
  } catch (e) {
    try {
      for (const part of chunk(oldHistory, 450)) {
        const batch = writeBatch(db);
        for (const h of part) batch.delete(doc(historyCol(newId), h.id));
        await batch.commit();
      }
    } catch (cleanupErr) {
      console.error('moveDevice cleanup failed', cleanupErr);
    }
    throw e;
  }

  const photoIds = current.photoIds ?? [];
  const existingPhotos = [];
  for (const pid of photoIds) {
    if ((await getDoc(doc(db, 'photos', pid))).exists()) existingPhotos.push(pid);
  }
  const batch = writeBatch(db);
  batch.set(deviceRef(newId), {
    ...data,
    photoIds,
    createdAt: current.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  addHistory(batch, newId, history);
  for (const pid of existingPhotos) batch.update(doc(db, 'photos', pid), { deviceId: newId });
  batch.delete(deviceRef(before.id));
  await batch.commit();

  for (const part of chunk(oldHistory, 450)) {
    const del = writeBatch(db);
    for (const h of part) del.delete(h.ref);
    await del.commit();
  }
  return newId;
}

export async function bulkUpdate(devices, patch, note = '') {
  const today = todayISO();
  const ops = [];
  const invalid = [];
  for (const d of devices) {
    const { errors, data, history } = prepareBulk(d, patch, today, note);
    if (errors.length) {
      invalid.push({ id: d.id, errors });
      continue;
    }
    if (!history.length) continue;
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
  return { ok, failed, skipped: devices.length - ops.length - invalid.length, invalid };
}

export async function deleteDevice(device) {
  const history = (await getDocs(historyCol(device.id))).docs;
  for (const part of chunk(history, 450)) {
    const batch = writeBatch(db);
    for (const h of part) batch.delete(h.ref);
    await batch.commit();
  }
  const batch = writeBatch(db);
  for (const pid of device.photoIds ?? []) batch.delete(doc(db, 'photos', pid));
  batch.delete(deviceRef(device.id));
  await batch.commit();
}

export async function listHistory(deviceId) {
  const snap = await getDocs(query(historyCol(deviceId), orderBy('at', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
