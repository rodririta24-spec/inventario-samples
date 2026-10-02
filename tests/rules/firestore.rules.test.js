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
