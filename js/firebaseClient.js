import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc, updateDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBy-UuSbSmrnVn7V2ub3w1MnalzhOitpu0",
  authDomain: "yuli-tutoring-platform.firebaseapp.com",
  projectId: "yuli-tutoring-platform",
  storageBucket: "yuli-tutoring-platform.appspot.com",
  messagingSenderId: "1070288563693",
  appId: "1:1070288563693:web:eaffd3f0a599ef48198be4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export {
  // auth helpers
  onAuthStateChanged, signInWithPopup,

  // firestore helpers
  collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc, updateDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove
};
