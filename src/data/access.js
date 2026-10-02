import { db } from '../firebase.js';
import { ADMIN_EMAIL } from '../config.js';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, limit, arrayUnion, arrayRemove } from '../fs.js';
import { normalizeEmail, isValidEmail } from '../lib/email.js';

const accessRef = () => doc(db, 'config', 'access');

// 'admin' | 'reader' | null (sin acceso)
export async function determineRole(user) {
  if (user.emailVerified && normalizeEmail(user.email) === ADMIN_EMAIL) return 'admin';
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
  await updateDoc(accessRef(), { readers: arrayRemove(normalizeEmail(email)) });
}
