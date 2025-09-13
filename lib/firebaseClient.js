// /lib/firebaseClient.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getStorage, ref } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBy-UuSbSmrnVn7V2ub3w1MnalzhOitpu0",
  authDomain: "yuli-tutoring-platform.firebaseapp.com",
  projectId: "yuli-tutoring-platform",
  storageBucket: "yuli-tutoring-platform.appspot.com",
  messagingSenderId: "1070288563693",
  appId: "1:1070288563693:web:eaffd3f0a599ef48198be4",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Force the exact bucket we've configured CORS for:
export const storage = getStorage(app, "gs://yuli-tutoring-platform.firebasestorage.app");

// Debug: log the bucket the SDK is actually using
const rootRef = ref(storage, "/");
console.log("Firebase Storage bucket in use:", rootRef.bucket);
const provider = new GoogleAuthProvider();

export async function signInWithGoogle(){
  return await signInWithPopup(auth, provider);
}

// simple readiness log
console.log("[FB ready]", {
  origin: location.origin,
  hasAuth: !!auth,
  bucket: firebaseConfig.storageBucket,
  apiKeyFirst6: String(firebaseConfig.apiKey).slice(0,6),
});
export default app;
// Also export app as a named export for modules that expect { app, auth, db }
export { app };
