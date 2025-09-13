// /js/backfillProfiles.js
import { db, collection, getDocs, doc, setDoc, serverTimestamp } from "./firebaseClient.js";

async function backfill() {
  const out = document.getElementById("backfillLog");
  const log = (m) => { console.log(m); if (out) out.textContent += m + "\n"; };

  try {
    log("Starting backfill…");
    const usersSnap = await getDocs(collection(db, "users"));
    log(`Found ${usersSnap.size} users.`);

    let count = 0;
    for (const d of usersSnap.docs) {
      const u = d.data() || {};
      const payload = {
        displayName: u.displayName || "",
        email: u.email || "",
        photoURL: u.photoURL || u.photoUrl || "",
        photoUrl: u.photoURL || u.photoUrl || "",
        role: (u.role || (u.isAdmin ? "admin" : "student")),
        createdAt: u.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, "profiles", d.id), payload, { merge: true });
      count++;
      if (count % 20 === 0) log(`Processed ${count}…`);
    }
    log(`Backfill complete. Wrote ${count} profiles.`);
  } catch (e) {
    if (out) out.textContent += "\nERROR: " + (e?.message || e);
    console.error(e);
  }
}

const btn = document.getElementById("runBackfillBtn");
if (btn) btn.addEventListener("click", backfill);
