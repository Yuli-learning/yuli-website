// Firebase Auth helper (compat API, single init). Exposes window.Auth for use in inline scripts.
// Uses existing CDN compat scripts loaded in index.html.

(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyBy-UuSbSmrnVn7V2ub3w1MnalzhOitpu0",
    authDomain: "yuli-tutoring-platform.firebaseapp.com",
    projectId: "yuli-tutoring-platform",
    storageBucket: "yuli-tutoring-platform.appspot.com",
    messagingSenderId: "1070288563693",
    appId: "1:1070288563693:web:eaffd3f0a599ef48198be4",
    measurementId: "G-8BG29T3TYW"
  };

  function initFirebase() {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();
    // const analytics = firebase.analytics();
    return { auth, db, storage };
  }

  // Initialise immediately so a single app exists
const { auth, db, storage } = initFirebase();

  // Console log for debugging
  console.log({
    origin: window.location.origin,
    apiKeyFirst6: firebaseConfig.apiKey.slice(0, 6),
    bucket: firebaseConfig.storageBucket,
  });

  // Helpers
  function showToast(message, type = 'info') {
    // Fallback toast if app hasn't provided one
    try {
      if (window.showAuthSuccess && type === 'success') return window.showAuthSuccess(message);
      if (window.showAuthError && type === 'error') return window.showAuthError(message);
    } catch (_) {}
    console[type === 'error' ? 'error' : 'log'](message);
  }

  async function ensureUserDoc(user, profile) {
    const userRef = db.collection('users').doc(user.uid);
    const snap = await userRef.get();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    
    // Check if this is an admin email
    const ADMIN_EMAILS = ['lukas.yuli.uk@gmail.com', 'admin@yuli.com'];
    const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
    
    if (!snap.exists) {
      const userDoc = {
        email: user.email || null,
        displayName: profile?.displayName || user.displayName || null,
        role: isAdmin ? 'admin' : (profile?.role || 'student'),
        discountEligibility: profile?.discountEligibility || null,
        provider: (user.providerData && user.providerData[0]?.providerId) || 'password',
        createdAt: now,
        updatedAt: now,
        approved: true, // Always approve admin accounts and default users
        isAdmin: isAdmin,
        verified: true, // Auto-verify admins
        status: 'active'
      };
      
      console.log('Creating user doc for:', user.email, 'isAdmin:', isAdmin);
      await userRef.set(userDoc);
    } else {
      // Update existing user to ensure admin status is correct
      const updateData = { updatedAt: now };
      if (isAdmin) {
        updateData.isAdmin = true;
        updateData.role = 'admin';
        updateData.approved = true;
        updateData.verified = true;
        updateData.status = 'active';
        console.log('Updating admin status for:', user.email);
      }
      await userRef.update(updateData);
    }
  }

  function mapError(error) {
    const code = error && error.code;
    switch (code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email.';
      case 'auth/user-not-found':
        return 'No account found with that email.';
      case 'auth/wrong-password':
        return 'Incorrect password. Try again or use Forgot password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/popup-blocked':
        return 'Please allow popups for this site.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'auth/weak-password':
        return 'Please choose a stronger password (at least 8 characters).';
      case 'auth/operation-not-allowed':
        return 'Google sign-in is not enabled in Firebase Authentication. Enable Google provider in the Firebase Console.';
      case 'auth/unauthorized-domain':
        return 'Google sign-in is blocked for this origin. Open the site via http://localhost (or add this domain in Firebase Auth authorised domains).';
      case 'auth/operation-not-supported-in-this-environment':
        return 'This sign-in method requires serving the site over http://localhost or https://, not opening the HTML file directly.';
      case 'auth/cancelled-popup-request':
        return 'Another sign-in attempt is already in progress. Please try again.';
      default:
        return 'Couldn\'t complete the request. Please try again.';
    }
  }

  async function signInEmailPassword(email, password, remember) {
    await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    const cred = await auth.signInWithEmailAndPassword(email, password);
    await ensureUserDoc(cred.user);
    // Ensure public profile exists/updates exactly once per page
    try { if (!window.__didUpsertProfile) { window.__didUpsertProfile = true; const m = await import('./profiles.js'); await m.upsertMyProfile?.(); } } catch (_) {}
    return cred.user;
  }

  async function sendReset(email) {
    await auth.sendPasswordResetEmail(email);
  }

  async function signUpEmailPassword({ email, password, displayName, role, discountEligibility }) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const user = cred.user;
    if (displayName) {
      await user.updateProfile({ displayName });
    }

    const now = firebase.firestore.FieldValue.serverTimestamp();
    const uid = user.uid;
    const baseUserDoc = {
      uid,
      email: (user.email || email || '').toLowerCase(),
      displayName: displayName || user.displayName || null,
      createdAt: now,
    };

    // Check if this is an admin email
    const ADMIN_EMAILS = ['lukas.yuli.uk@gmail.com', 'admin@yuli.com'];
    const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

    // Admin flow - bypass all verification and approval
    if (isAdmin) {
      await db.collection('users').doc(uid).set({
        ...baseUserDoc,
        requestedRole: 'admin',
        role: 'admin',
        status: 'active',
        isAdmin: true,
        approved: true,
        verified: true,
        discountEligible: 'no',
      }, { merge: true });

      // Upsert public profile for admin (once)
      try { if (!window.__didUpsertProfile) { window.__didUpsertProfile = true; const m = await import('./profiles.js'); await m.upsertMyProfile?.(); } } catch (_) {}

      console.log('Admin account created for:', user.email);
      return user;
    }

    // Tutor application flow
    if (role === 'tutor') {
      await db.collection('users').doc(uid).set({
        ...baseUserDoc,
        requestedRole: 'tutor',
        role: 'none',
        status: 'pending_tutor',
      }, { merge: true });

      await db.collection('tutorApplications').doc(uid).set({
        uid,
        email: (user.email || email || '').toLowerCase(),
        displayName: displayName || user.displayName || null,
        createdAt: now,
        status: 'pending',
      }, { merge: true });

      try { await user.sendEmailVerification(); } catch (_) {}
      // Upsert public profile before sign-out/redirect (once)
      try { if (!window.__didUpsertProfile) { window.__didUpsertProfile = true; const m = await import('./profiles.js'); await m.upsertMyProfile?.(); } } catch (_) {}
      await auth.signOut();
      location.href = '/pages/pending-approval.html'; // Keep direct for pages subfolder
      return user;
    }

    // Default student flow
    await db.collection('users').doc(uid).set({
      ...baseUserDoc,
      requestedRole: 'student',
      role: 'student',
      status: 'active',
      discountEligible: discountEligibility || 'no',
    }, { merge: true });

    try { await user.sendEmailVerification(); } catch (_) {}
    // Upsert public profile for student flow (once)
    try { if (!window.__didUpsertProfile) { window.__didUpsertProfile = true; const m = await import('./profiles.js'); await m.upsertMyProfile?.(); } } catch (_) {}
    return user;
  }

  async function requireRole(role) {
    const user = auth.currentUser;
    if (!user) {
      import('./nav.js').then(({go}) => go('/'));
      return false;
    }
    const tokenResult = await user.getIdTokenResult(true);
    if (tokenResult.claims.role !== role) {
      if (role === 'tutor') {
        location.href = '/pages/pending-approval.html'; // Keep direct for pages subfolder
      } else {
        import('./nav.js').then(({go}) => go('/'));
      }
      return false;
    }
    return true;
  }

  async function signInWithGooglePopup() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { provider.setCustomParameters && provider.setCustomParameters({ prompt: 'select_account' }); } catch(_) {}
    try {
      const result = await auth.signInWithPopup(provider);
      
      // Check if this is an admin email and ensure proper setup
      const ADMIN_EMAILS = ['lukas.yuli.uk@gmail.com', 'admin@yuli.com'];
      const isAdmin = result.user.email && ADMIN_EMAILS.includes(result.user.email.toLowerCase());
      
      if (isAdmin) {
        console.log('Admin Google sign-in detected for:', result.user.email);
      }
      
      await ensureUserDoc(result.user);
      // Ensure public profile exists/updates after Google sign-in (once)
      try { if (!window.__didUpsertProfile) { window.__didUpsertProfile = true; const m = await import('./profiles.js'); await m.upsertMyProfile?.(); } } catch (_) {}
      return result.user;
    } catch (error) {
      // Fallback to redirect flow if popups are blocked or environment prevents them
      if (error && (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment')) {
        try {
          await auth.signInWithRedirect(provider);
          // The page will redirect; return a pending promise to stop further handling
          return new Promise(() => {});
        } catch (redirectErr) {
          throw redirectErr;
        }
      }
      if (error && error.code === 'auth/account-exists-with-different-credential') {
        const pendingEmail = error.email;
        const methods = await auth.fetchSignInMethodsForEmail(pendingEmail);
        if (methods.includes('password')) {
          throw new Error('This email is already registered with Email & password. Please sign in that way (or use Forgot password).');
        }
        if (methods.includes('google.com')) {
          throw new Error('This email is registered with Google. Please sign in with Google.');
        }
      }
      throw error;
    }
  }

  async function resendVerification() {
    const user = auth.currentUser;
    if (user && !user.emailVerified) {
      await user.sendEmailVerification();
      return true;
    }
    return false;
  }



  window.Auth = {
    initFirebase,
    auth,
    db,
    storage,
    signInEmailPassword,
    signInWithGooglePopup,
    signUpEmailPassword,
    sendReset,
    resendVerification,
    ensureUserDoc,
    mapError,
    requireRole,

  };


})();


