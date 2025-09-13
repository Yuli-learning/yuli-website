// lib/profiles.js
// Utilities to write and read public display profiles under /profiles/{uid}
import { auth, db } from './firebaseClient.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

function deriveName(d = {}, fallback = 'User') {
  const emailLocal = (d.email || '').split('@')[0] || '';
  const name = d.displayName
    || d.name
    || d.fullName
    || d.username
    || ((d.firstName || d.givenName) ? [d.firstName || d.givenName, d.lastName || d.familyName].filter(Boolean).join(' ') : '')
    || emailLocal
    || fallback;
  return String(name).trim() || fallback;
}

export async function upsertMyProfile(extra = {}) {
  const u = auth.currentUser;
  if (!u) return;
  const payload = {
    displayName: deriveName({ displayName: u.displayName, email: u.email, ...extra }),
    photoURL: extra.photoURL ?? u.photoURL ?? null,
    email: extra.email ?? u.email ?? null,
    bio: extra.bio ?? null,
    // timestamps
    updatedAt: serverTimestamp(),
  };
  // Only set createdAt if the doc doesn't exist yet
  const ref = doc(db, 'profiles', u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(ref, payload, { merge: true });
}

export async function getProfile(uid) {
  if (!uid) return { displayName: 'User' };
  try {
    const snap = await getDoc(doc(db, 'profiles', uid));
    if (!snap.exists()) return { displayName: 'User' };
    const d = snap.data() || {};
    const displayName = deriveName(d, 'User');
    const photoURL = d.photoURL || null;
    const email = d.email || null;
    const bio = d.bio || null;
    return { displayName, photoURL, email, bio };
  } catch (e) {
    console.warn('[profiles.getProfile] failed', e);
    return { displayName: 'User' };
  }
}

export default { upsertMyProfile, getProfile };
