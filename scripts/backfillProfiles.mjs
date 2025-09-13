// scripts/backfillProfiles.mjs
// One-time script to backfill /profiles from existing /users docs.
// Usage (serve locally, then open this file in the browser devtools as a module)
// or convert to a small admin page.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBy-UuSbSmrnVn7V2ub3w1MnalzhOitpu0",
  authDomain: "yuli-tutoring-platform.firebaseapp.com",
  projectId: "yuli-tutoring-platform",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function deriveName(d = {}, fallback = 'User'){
  const emailLocal = (d.email || '').split('@')[0] || '';
  return d.displayName || d.name || d.fullName || d.username || emailLocal || fallback;
}

async function backfill(){
  const snap = await getDocs(collection(db, 'users'));
  let created = 0, skipped = 0;
  for (const docSnap of snap.docs){
    const uid = docSnap.id;
    const user = docSnap.data() || {};
    const profRef = doc(db, 'profiles', uid);
    const p = await getDoc(profRef);
    const payload = {
      displayName: deriveName(user),
      photoURL: user.photoURL || user.photoUrl || null,
      email: user.email || null,
      updatedAt: serverTimestamp(),
    };
    if (!p.exists()) payload.createdAt = serverTimestamp();
    await setDoc(profRef, payload, { merge: true });
    created += p.exists() ? 0 : 1; skipped += p.exists() ? 1 : 0;
  }
  console.log(`[backfill] done. created: ${created}, merged existing: ${skipped}`);
}

onAuthStateChanged(auth, (u)=>{
  if (!u) { console.warn('Sign in first, then run backfill()'); return; }
  window.backfill = backfill;
  console.log('Ready. Call backfill() in the console.');
});
