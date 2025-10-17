// lib/firebase.js - COMPLETE FIXED VERSION
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence, onAuthStateChanged, getAuth } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
// FIXED: Only import app, no circular reference
import app from "./firebaseClient.js";

// Initialize Firestore and Auth from the imported app
const db = getFirestore(app);
const auth = getAuth(app);

// Set persistence
await setPersistence(auth, browserLocalPersistence);

// Login handler function
export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Login successful");
    return { success: true, user: userCredential.user };
  } catch (error) {
    let errorMessage;
    
    switch (error.code) {
      case "auth/user-not-found":
        errorMessage = "No account found with that email.";
        break;
      case "auth/wrong-password":
        errorMessage = "Incorrect password. Please try again.";
        break;
      default:
        errorMessage = "Something went wrong. Please try again later.";
        break;
    }
    
    console.error("Login error:", errorMessage);
    return { success: false, error: errorMessage };
  }
};

// Admin email list
const ADMIN_EMAILS = [
  'lukas.yuli.uk@gmail.com',
  'admin@yuli.com'
];

// Check if user is admin
export const isAdmin = async (user) => {
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
};

// Create user account with role and verification status
export const createUser = async (email, password, userData) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    const isUserAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    const needsVerification = userData.role === 'tutor' && !isUserAdmin;
    
    const userDoc = {
      email: email.toLowerCase(),
      name: userData.name,
      role: userData.role,
      discountEligible: userData.discountEligible || 'no',
      verified: isUserAdmin ? true : (userData.role === 'student'),
      isAdmin: isUserAdmin,
      needsVerification: needsVerification,
      createdAt: new Date(),
      status: needsVerification ? 'pending' : 'active'
    };
    
    await setDoc(doc(db, 'users', user.uid), userDoc);
    
    return { 
      success: true, 
      user: user, 
      userData: userDoc,
      needsVerification: needsVerification 
    };
  } catch (error) {
    let errorMessage;
    switch (error.code) {
      case "auth/email-already-in-use":
        errorMessage = "An account with this email already exists.";
        break;
      case "auth/weak-password":
        errorMessage = "Password should be at least 6 characters.";
        break;
      case "auth/invalid-email":
        errorMessage = "Please enter a valid email address.";
        break;
      default:
        errorMessage = "Something went wrong. Please try again later.";
        break;
    }
    
    console.error("Registration error:", errorMessage);
    return { success: false, error: errorMessage };
  }
};

// Get pending tutor applications (admin only)
export const getPendingTutors = async () => {
  try {
    const q = query(
      collection(db, 'users'), 
      where('role', '==', 'tutor'),
      where('verified', '==', false)
    );
    const querySnapshot = await getDocs(q);
    const pendingTutors = [];
    
    querySnapshot.forEach((doc) => {
      pendingTutors.push({ id: doc.id, ...doc.data() });
    });
    
    return { success: true, tutors: pendingTutors };
  } catch (error) {
    console.error("Error fetching pending tutors:", error);
    return { success: false, error: "Failed to fetch pending tutors" };
  }
};

// Approve/reject tutor application (admin only)
export const updateTutorStatus = async (tutorId, approved) => {
  try {
    const userRef = doc(db, 'users', tutorId);
    await updateDoc(userRef, {
      verified: approved,
      status: approved ? 'active' : 'rejected',
      verifiedAt: new Date(),
      needsVerification: false
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error updating tutor status:", error);
    return { success: false, error: "Failed to update tutor status" };
  }
};

// Add listener for auth state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log('User authenticated:', user.email);
    } else {
        console.log('User signed out');
    }
});

// Export auth and db for other files to use
export { auth, db };
