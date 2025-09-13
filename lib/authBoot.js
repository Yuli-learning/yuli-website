import { auth } from "./firebaseClient.js";
import { upsertMyProfile } from "./profiles.js";

import { setPersistence, browserLocalPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import { replace } from "./nav.js";

console.log("[nav]", { href: location.href });

await setPersistence(auth, browserLocalPersistence);

let __didUpsertProfile = false;
onAuthStateChanged(auth, async (user) => {

  const path = location.pathname.split("/").pop(); // static file name
  const isSignInPage = /signin\.html$/.test(path);
  const isHomePage = path === "" || path === "index.html";
  
  if (!user){

    // If not signed in and not already on signin or home, go to signin
    if (!isSignInPage && !isHomePage) replace("/signin");
    return;
  }
  
  // If signed in, ensure a public display profile exists/updates
  if (!__didUpsertProfile) {
    __didUpsertProfile = true;
    try { await upsertMyProfile(); } catch (e) { console.warn('[profiles] upsert on sign-in failed', e); }
  }

  // If signed in and on signin page, go home
  if (isSignInPage){
    replace("/");
  }
  
  // Logged-in users can stay on any page they're on
});