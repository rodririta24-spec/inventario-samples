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
