// /js/authBoot.js
import {
  auth, provider, onAuthStateChanged, signInWithPopup,
  db, doc, getDoc, setDoc, serverTimestamp
} from "./firebaseClient.js";

export async function ensureSignedIn() {
  if (!auth.currentUser) {
    await signInWithPopup(auth, provider);
  }
  return auth.currentUser;
}

// Try to read the user's role from /users/{uid}
// Falls back to null if not present
async function readRoleFromUsers(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? snap.data() : null;
    if (!data) return null;
    // Prefer explicit role, else map isAdmin -> admin
    return data.role || (data.isAdmin ? "admin" : null);
  } catch (e) {
    console.warn("Could not read role from /users:", e);
    return null;
  }
}

// Create/update /profiles/{uid}. On first write, set role.
// If profile exists but is missing role, and /users has role, fill it in.
async function upsertProfile(user) {
  const ref = doc(db, "profiles", user.uid);
  const snap = await getDoc(ref);

  // pull role from /users if available
  const roleFromUsers = await readRoleFromUsers(user.uid);

  const base = {
    displayName: user.displayName ?? "",
    email: user.email ?? "",
    photoURL: user.photoURL ?? "",
    photoUrl: user.photoURL ?? "",
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) {
    base.role = roleFromUsers || "student"; // default if unknown
    base.createdAt = serverTimestamp();
  } else {
    const existing = snap.data() || {};
    if (!existing.role && roleFromUsers) {
      base.role = roleFromUsers;
    }
  }

  await setDoc(ref, base, { merge: true });
}

export function bootAuth(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      await ensureSignedIn();
    }
    await upsertProfile(auth.currentUser);
    onReady(auth.currentUser);
  });
}
