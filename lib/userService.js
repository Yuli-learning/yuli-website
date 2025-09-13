import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
const db = getFirestore();

export async function ensureUserDoc(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  
  // Check if this is an admin email
  const ADMIN_EMAILS = ['lukas.yuli.uk@gmail.com', 'admin@yuli.com'];
  const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
  
  const base = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || (user.email ? user.email.split("@")[0] : "User"),
    photoURL: user.photoURL || "",
    role: isAdmin ? "admin" : "student",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    onboardingComplete: false,
    approved: true, // Always approve admin and default users
    isAdmin: isAdmin,
    verified: true,
    status: 'active'
  };
  
  if (!snap.exists()){
    console.log('Creating user doc for:', user.email, 'isAdmin:', isAdmin);
    await setDoc(ref, base);
    return { ...base, _new: true };
  }
  
  // Update existing user to ensure admin status is correct
  const updateData = { 
    lastLoginAt: serverTimestamp(), 
    updatedAt: serverTimestamp() 
  };
  if (isAdmin) {
    updateData.isAdmin = true;
    updateData.role = 'admin';
    updateData.approved = true;
    updateData.verified = true;
    updateData.status = 'active';
    console.log('Updating admin status for:', user.email);
  }
  await updateDoc(ref, updateData);
  return { ...snap.data(), _new: false };
}
