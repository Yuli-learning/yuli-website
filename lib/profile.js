import { auth, storage } from "./firebaseClient.js";
import { onAuthStateChanged, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";
import { replace } from "./nav.js";

const db = getFirestore();

// DOM elements
const avatarImg = document.getElementById("avatarImg");
const avatarWrap = document.getElementById("avatarWrap");
const fileInput = document.getElementById("fileInput");
const signOutBtn = document.getElementById("signOutBtn");
const editProfileBtn = document.getElementById("editProfileBtn");
const displayNameEl = document.getElementById("displayName");
const emailEl = document.getElementById("email");
const phoneEl = document.getElementById("phone");
const rateStatusEl = document.getElementById("rateStatus");

// Discount elements
const discountSection = document.getElementById("discountSection");
const discountStatus = document.getElementById("discountStatus");
const discountActions = document.getElementById("discountActions");
const discountProofInput = document.getElementById("discountProofInput");
const profileFooter = document.getElementById("profileFooter");

// Dashboard content elements
const upcomingSessionsEl = document.getElementById("upcomingSessions");
const lessonHistoryEl = document.getElementById("lessonHistoryContent");
const paymentsEl = document.getElementById("payments");
const progressEl = document.getElementById("progress");

// State
let currentUser = null;
let userProfile = null;
let listeners = [];
let isEditMode = false;
let originalDisplayName = '';

// Initialize
onAuthStateChanged(auth, async (user) => {
  if (!user) { 
    replace("/signin"); 
    return; 
  }

  currentUser = user;
  
  try {
    // Load or create user profile
    await loadUserProfile(user);
    
    // Render profile info
    renderProfileInfo();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load real-time data
    setupRealTimeListeners();
    
  } catch (error) {
    console.error("Failed to initialize profile:", error);
    showError("Failed to load profile data.");
  }
});

// Load user profile from Firestore
async function loadUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  
  if (!snap.exists()) {
    // Create new user profile
    const newProfile = {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? user.email?.split("@")[0] ?? "User",
      photoURL: user.photoURL ?? "",
      role: "student",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      onboardingComplete: false
    };
    await setDoc(userRef, newProfile);
    userProfile = newProfile;
  } else {
    userProfile = snap.data();
    // Update last login
    await updateDoc(userRef, { lastLoginAt: serverTimestamp() });
  }
}

// Render profile information
function renderProfileInfo() {
  if (!userProfile) return;
  
  const displayName = userProfile.displayName || "User";
  originalDisplayName = displayName;
  
  if (isEditMode) {
    const currentRole = (userProfile.role || 'student').toLowerCase();
    const showFamilyRole = currentRole === 'student' || currentRole === 'parent' || !currentRole;
    displayNameEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        <input 
          type="text" 
          id="displayNameInput" 
          value="${escapeHtml(displayName)}"
          style="
            background: var(--surface);
            border: 2px solid var(--brand-primary);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 28px;
            font-weight: 700;
            color: var(--text-strong);
            width: 100%;
            max-width: 400px;
            outline: none;
          "
          maxlength="50"
          placeholder="Enter your name"
        />
        ${showFamilyRole ? `
        <div id="roleSelector" style="display:flex;gap:14px;align-items:center;">
          <span style="color: var(--text-soft); font-size: 14px;">Profile type:</span>
          <label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;">
            <input type="radio" name="profileRole" value="student" ${currentRole !== 'parent' ? 'checked' : ''} />
            <span>Student</span>
          </label>
          <label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;">
            <input type="radio" name="profileRole" value="parent" ${currentRole === 'parent' ? 'checked' : ''} />
            <span>Parent</span>
          </label>
        </div>
        ` : ''}
      </div>
    `;
    
    // Focus and select the input
    setTimeout(() => {
      const input = document.getElementById('displayNameInput');
      if (input) {
        input.focus();
        input.select();
        // Handle Enter key to save
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveProfile();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
          }
        });
      }
    }, 0);
  } else {
    displayNameEl.textContent = displayName;
  }
  
  emailEl.textContent = userProfile.email || "";
  
  // Show phone if available
  if (userProfile.phone) {
    phoneEl.textContent = userProfile.phone;
    phoneEl.style.display = "block";
  }
  
  // Set avatar
  const avatarUrl = userProfile.photoURL || 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || "U")}&background=6366f1&color=fff`;
  avatarImg.src = avatarUrl;
  
  // Update edit button
  updateEditButton();
  
  // Render rate status
  renderRateStatus();
  
  // Render discount section
  renderDiscountSection();
} // <- ADD THIS CLOSING BRACE FOR renderProfileInfo

// Cooldown helper functions (moved outside of renderProfileInfo)
function canUserReuploadNow() {
  if (userProfile.discountStatus !== 'rejected' || !userProfile.discountRejectedAt) return true;
  
  const rejectedAt = userProfile.discountRejectedAt.toDate ? userProfile.discountRejectedAt.toDate() : new Date(userProfile.discountRejectedAt);
  const cooldownHours = 24;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  
  return Date.now() - rejectedAt.getTime() > cooldownMs;
}

function getNextReuploadTime() {
  if (!userProfile.discountRejectedAt) return 'soon';
  
  const rejectedAt = userProfile.discountRejectedAt.toDate ? userProfile.discountRejectedAt.toDate() : new Date(userProfile.discountRejectedAt);
  const cooldownHours = 24;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const nextAllowedTime = new Date(rejectedAt.getTime() + cooldownMs);
  
  const now = new Date();
  if (nextAllowedTime <= now) return 'now';
  
  const hoursLeft = Math.ceil((nextAllowedTime - now) / (1000 * 60 * 60));
  if (hoursLeft < 24) {
    return `in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
  } else {
    return `tomorrow at ${nextAllowedTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
  
  // Render discount section
  renderDiscountSection(); 
  
// Render rate status
function renderRateStatus() {
  if (!rateStatusEl) return;
  
  let statusHTML = '';
  
  if (userProfile.discountStatus === 'approved') {
    statusHTML = `
      <div style="text-align: right;">
        <div class="badge badge--approved" style="margin-bottom: 8px;">
          ✅ Discount applied
        </div>
        <div style="font-size: 14px; color: var(--text-soft);">
          GCSE £12/hr • A-Level £18/hr
        </div>
      </div>
    `;
  } else {
    statusHTML = `
      <div style="text-align: right;">
        <div style="font-size: 14px; color: var(--text-soft); margin-bottom: 4px;">
          Standard rates apply
        </div>
        <div style="font-size: 14px; color: var(--text-soft);">
          GCSE £20/hr • A-Level £35/hr
        </div>
      </div>
    `;
  }
  
  rateStatusEl.innerHTML = statusHTML;
}

// Render discount section
function renderDiscountSection() {
  if (!discountSection || !discountStatus || !discountActions) return;
  
  const isDismissed = userProfile?.discountDismissed;
  const status = userProfile?.discountStatus;
  
  if (isDismissed && status !== 'approved') {
    discountSection.style.display = 'none';
    renderFooterDiscountLink();
    return;
  }
  
  discountSection.style.display = 'block';
  
  let statusHTML = '';
  let actionsHTML = '';
  
  if (status === 'approved') {
    statusHTML = `
      <div class="badge badge--approved">
        ✅ Discount applied — GCSE £12/hr • A-Level £18/hr
      </div>
    `;
  } else if (status === 'pending') {
    statusHTML = `
      <div class="badge badge--pending">
        ⏳ Proof uploaded — standard rates apply until approved
      </div>
    `;
  } else if (status === 'rejected') {
    const canReupload = canUserReuploadNow();
    const reuploadTime = getNextReuploadTime();
    
    statusHTML = `
  <div style="margin-bottom: 12px;">
    <div class="badge" style="background: #fef2f2; border-color: rgba(239,68,68,.25); color: #dc2626; margin-bottom: 12px;">
      ❌ Application not accepted
    </div>
    <div style="
      background: #f8fafc; 
      border: 1px solid #e2e8f0; 
      border-radius: 8px; 
      padding: 12px; 
      margin-bottom: 8px;
    ">
      <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 4px; font-size: 14px;">
        Feedback:
      </div>
      <div style="font-size: 14px; color: var(--text-soft); line-height: 1.4;">
        ${userProfile.discountRejectionReason || 'Please upload valid proof of eligibility that clearly shows your name and current benefit status.'}
      </div>
    </div>
    <div style="font-size: 13px; color: var(--text-soft); font-style: italic;">
      ${canReupload ? 'You can submit a new application above.' : `You can resubmit ${reuploadTime}.`}
    </div>
  </div>
`;
    actionsHTML = canReupload ? `
      <button id="uploadAgainBtn" class="btn btn-primary">
        Upload again
      </button>
    ` : `
      <button class="btn btn-secondary" disabled>
        Upload again (${reuploadTime})
      </button>
    `;
  } else {
    // Default state
    statusHTML = `
      <div style="color: var(--text-soft); margin-bottom: 12px;">
        Discounted rates are available with proof of eligibility (e.g., FSM/benefits).
      </div>
    `;
    actionsHTML = `
      <button id="uploadProofBtn" class="btn btn-primary">
        Upload proof
      </button>
      <button id="notEligibleBtn" class="btn btn-secondary">
        I'm not eligible
      </button>
    `;
  }
  
  discountStatus.innerHTML = statusHTML;
  discountActions.innerHTML = actionsHTML;
  
  // Setup discount action listeners
  setupDiscountActions();
}

// Setup discount action listeners
function setupDiscountActions() {
  const uploadProofBtn = document.getElementById('uploadProofBtn');
  const uploadAgainBtn = document.getElementById('uploadAgainBtn');
  const notEligibleBtn = document.getElementById('notEligibleBtn');
  
  if (uploadProofBtn || uploadAgainBtn) {
    const btn = uploadProofBtn || uploadAgainBtn;
    if (btn && !btn.disabled) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        discountProofInput.click();
      });
    }
  }
  
  if (notEligibleBtn) {
    notEligibleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleNotEligible();
    });
  }
}

// Handle "I'm not eligible" button
async function handleNotEligible() {
  const confirmed = confirm(
    "Are you sure you're not eligible for discounted rates? You can re-enable this later if your circumstances change."
  );
  
  if (confirmed) {
    try {
      await updateUserProfile({ discountDismissed: true });
      renderDiscountSection();
    } catch (error) {
      console.error('Failed to update discount dismissal:', error);
      alert('Failed to save changes. Please try again.');
    }
  }
}

// Render footer discount link
function renderFooterDiscountLink() {
  if (!profileFooter) return;
  
  profileFooter.innerHTML = `
    <p>
      Changed circumstances? 
      <a href="#" id="checkDiscountAgain">Check discount eligibility again</a>
    </p>
  `;
  
  const checkAgainLink = document.getElementById('checkDiscountAgain');
  if (checkAgainLink) {
    checkAgainLink.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      try {
        await updateUserProfile({ discountDismissed: false });
        renderDiscountSection();
      } catch (error) {
        console.error('Failed to restore discount section:', error);
      }
    });
  }
}

// Toggle edit mode
function toggleEditMode() {
  if (isEditMode) {
    saveProfile();
  } else {
    isEditMode = true;
    renderProfileInfo();
  }
}

// Update edit button appearance
function updateEditButton() {
  if (!editProfileBtn) return;
  
  if (isEditMode) {
    editProfileBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width: 16px; height: 16px;">
        <polyline points="20,6 9,17 4,12"/>
      </svg>
      Save
    `;
    editProfileBtn.className = 'btn btn-primary';
  } else {
    editProfileBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width: 16px; height: 16px;">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Edit profile
    `;
    editProfileBtn.className = 'btn btn-secondary';
  }
}

// Save profile changes
async function saveProfile() {
  const input = document.getElementById('displayNameInput');
  if (!input || !currentUser) return;
  
  const newDisplayName = input.value.trim();
  const roleInput = /** @type {HTMLInputElement|null} */(document.querySelector('input[name="profileRole"]:checked'));
  const selectedRole = (roleInput?.value || userProfile.role || 'student').toLowerCase();
  const validRole = ['student','parent','tutor','admin'].includes(selectedRole) ? selectedRole : 'student';
  
  if (!newDisplayName) {
    alert('Name cannot be empty');
    input.focus();
    return;
  }
  
  if (newDisplayName === originalDisplayName && validRole === (userProfile.role || 'student')) {
    // No changes, just exit edit mode
    cancelEdit();
    return;
  }
  
  try {
    // Show loading state
    editProfileBtn.disabled = true;
    editProfileBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width: 16px; height: 16px; animation: spin 1s linear infinite;">
        <line x1="12" y1="2" x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="2" y1="12" x2="6" y2="12"/>
        <line x1="18" y1="12" x2="22" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      Saving...
    `;
    
    // Update Firebase Auth profile
    await updateProfile(currentUser, { displayName: newDisplayName });
    
    // Update Firestore user document (and mirror to profiles)
    await updateUserProfile({ displayName: newDisplayName, role: validRole });
    
    // Exit edit mode and re-enable button
    editProfileBtn.disabled = false;
    isEditMode = false;
    renderProfileInfo();
    
  } catch (error) {
    console.error('Failed to update profile:', error);
    alert('Failed to save changes. Please try again.');
    
    // Reset button state
    editProfileBtn.disabled = false;
    updateEditButton();
    input.focus();
  }
}

// Cancel edit mode
function cancelEdit() {
  isEditMode = false;
  renderProfileInfo();
}

// Setup event listeners
function setupEventListeners() {
  // Avatar upload
  if (avatarWrap && fileInput) {
    avatarWrap.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleAvatarUpload);
  }
  
  // Sign out
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      await signOut(auth);
      replace("/");
    });
  }
  
  // Edit profile
  if (editProfileBtn) {
    editProfileBtn.addEventListener("click", toggleEditMode);
  }
  
  // Discount proof upload
  if (discountProofInput) {
    discountProofInput.addEventListener('change', handleDiscountUpload);
  }
}

// Handle avatar upload
async function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  if (!file || !currentUser) return;

  // Check cooldown first
  if (!canUserReuploadNow()) {
    alert(`You can upload again ${getNextReuploadTime()}. This prevents spam and gives admins time to review applications properly.`);
    return;
  }
  
  try {
    const storageRef = ref(storage, `avatars/${currentUser.uid}/avatar.jpg`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    
    await updateProfile(currentUser, { photoURL: url });
    await updateUserProfile({ photoURL: url });
    
    avatarImg.src = `${url}?t=${Date.now()}`;
    
  } catch (error) {
    console.error("Avatar upload failed:", error);
    alert("Failed to upload avatar. Please try again.");
  }
}

// Handle discount proof upload
async function handleDiscountUpload(e) {
  const file = e.target.files?.[0];
  if (!file || !currentUser) return;
  
  // Validate file
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    alert('File size must be less than 5MB');
    return;
  }
  
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  if (!allowedTypes.includes(file.type)) {
    alert('Please upload a PDF or image file (JPG, PNG)');
    return;
  }
  
  try {
    // Show loading state
    const uploadBtn = document.getElementById('uploadProofBtn') || document.getElementById('uploadAgainBtn');
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    }
    
    // Upload to Storage
    const filename = `${Date.now()}-${file.name}`;
    const storageRef = ref(storage, `discountProofs/${currentUser.uid}/${filename}`);
    await uploadBytes(storageRef, file);
    
    // Get download URL
    const url = await getDownloadURL(storageRef);
    
    // Update Firestore
    await updateUserProfile({
      discountStatus: 'pending',
      discountProofUrl: url,
      discountRejectionReason: null
    });
    
    // Re-render discount section
    renderDiscountSection();
    
  } catch (error) {
    console.error('Discount upload failed:', error);
    alert('Upload failed. Please try again.');
  } finally {
    discountProofInput.value = '';
  }
}

// Setup real-time listeners for dashboard data
function setupRealTimeListeners() {
  if (!currentUser) return;
  
  // Clear existing listeners
  cleanupListeners();
  
  // Show initial skeleton loading states
  showSkeleton('upcomingSessions');
  showSkeleton('lessonHistory');
  showSkeleton('payments');
  showSkeleton('progress');
  
  // Upcoming sessions - only future sessions
  const upcomingQuery = query(
    collection(db, "bookings"),
    where("userId", "==", currentUser.uid),
    where("status", "in", ["confirmed", "pending_payment"]),
    where("start", ">", Timestamp.now()),
    orderBy("start", "asc"),
    limit(5)
  );
  
  const upcomingUnsubscribe = onSnapshot(upcomingQuery, (snapshot) => {
    console.log("Current user UID:", currentUser.uid);
    console.log("Query returned", snapshot.size, "documents");
    
    const sessions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log("Booking data:", data);
      console.log("Booking userId:", data.userId);
      console.log("Booking start:", data.start);
      sessions.push({ id: doc.id, ...data });
    });
    console.log("Final sessions array:", sessions);
    renderUpcomingSessions(sessions);
  }, (error) => {
    console.error("Upcoming sessions error:", error);
    renderUpcomingSessionsError();
  });
  listeners.push(upcomingUnsubscribe);
  
  // Lesson history - past sessions (completed OR confirmed but past)
const historyQuery = query(
  collection(db, "bookings"),
  where("userId", "==", currentUser.uid),
  where("start", "<=", Timestamp.now()),
  orderBy("start", "desc"),
  limit(20)
);
  
  const historyUnsubscribe = onSnapshot(historyQuery, (snapshot) => {
    const lessons = [];
    snapshot.forEach(doc => {
      lessons.push({ id: doc.id, ...doc.data() });
    });
    renderLessonHistory(lessons);
  }, (error) => {
    console.error("Lesson history error:", error);
    renderLessonHistoryError();
  });
  listeners.push(historyUnsubscribe);
  
  // Payments
  const paymentsQuery = query(
    collection(db, "payments"),
    where("userId", "==", currentUser.uid),
    orderBy("createdAt", "desc"),
    limit(10)
  );
  
  const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
    const payments = [];
    snapshot.forEach(doc => {
      payments.push({ id: doc.id, ...doc.data() });
    });
    renderPayments(payments);
  }, (error) => {
    console.error("Payments error:", error);
    renderPaymentsError();
  });
  listeners.push(paymentsUnsubscribe);
  
  // Progress stats (derived from bookings)
  const allBookingsQuery = query(
    collection(db, "bookings"),
    where("userId", "==", currentUser.uid)
  );
  
  const progressUnsubscribe = onSnapshot(allBookingsQuery, (snapshot) => {
    const bookings = [];
    snapshot.forEach(doc => {
      bookings.push({ id: doc.id, ...doc.data() });
    });
    renderProgress(bookings);
  }, (error) => {
    console.error("Progress error:", error);
    renderProgressError();
  });
  listeners.push(progressUnsubscribe);
}

// Helper functions for skeleton and empty states
function showSkeleton(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.innerHTML = `
    <div class="skeleton skeleton--title"></div>
    <div class="skeleton skeleton--row"></div>
    <div class="skeleton skeleton--row"></div>
    <div class="skeleton skeleton--subtitle"></div>
  `;
}

function renderEmpty(elementId, { title, desc, ctaText, ctaHref }) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const ctaHTML = ctaText && ctaHref ? `<a href="${ctaHref}" class="empty__cta">${ctaText}</a>` : '';
  
  element.innerHTML = `
    <div class="empty">
      <svg class="icon icon--muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
        <circle cx="12" cy="12" r="9"/>
      </svg>
      <h3 class="empty__title">${title}</h3>
      <p class="empty__desc">${desc}</p>
      ${ctaHTML}
    </div>
  `;
}

// Render upcoming sessions
function renderUpcomingSessions(sessions) {
  if (!upcomingSessionsEl) return;
  
  if (sessions.length === 0) {
    renderEmpty('upcomingSessions', {
      title: 'No upcoming sessions yet',
      desc: 'Book your first session to see it here.',
      ctaText: 'Book a session',
      ctaHref: '#'  // Changed from '/booking.html' to '#'
    });
    
    // Add the click handler after the empty state is rendered
    setTimeout(() => {
      const bookSessionLink = upcomingSessionsEl.querySelector('.empty__cta');
      if (bookSessionLink && bookSessionLink.textContent.includes('Book a session')) {
        bookSessionLink.addEventListener('click', function(e) {
          e.preventDefault();
          if (typeof handleBookingFromProfile === 'function') {
            handleBookingFromProfile();
          }
        });
      }
    }, 0);
    
    return;
  }
  
  const sessionsHTML = sessions.map(session => {
    const date = session.start ? formatDateTime(session.start.toDate()) : 'TBD';
    
    return `
      <div class="list-item">
        <div class="list-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width: 16px; height: 16px;">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${escapeHtml(session.subject || 'Subject TBD')} • ${escapeHtml(session.level || 'Level TBD')} • ${escapeHtml(session.examBoard || 'Any board')}</div>
          <div class="list-item-subtitle">${date}</div>
        </div>
      </div>
    `;
  }).join('');
  
  upcomingSessionsEl.innerHTML = sessionsHTML;
}

// Render lesson history
function renderLessonHistory(lessons) {
  if (!lessonHistoryEl) return;
  
  if (lessons.length === 0) {
    renderEmpty('lessonHistory', {
      title: 'No past lessons yet',
      desc: 'Completed lessons will appear here.'
    });
    return;
  }
  
  const lessonsHTML = lessons.map(lesson => {
    const date = lesson.start ? formatDate(lesson.start.toDate()) : 'TBD';
    
    // Determine status - if it's in the past but still "confirmed", show as "completed"
    let displayStatus = lesson.status;
    let badgeClass = 'badge--pending';
    
    if (lesson.start && lesson.start.toDate() < new Date()) {
      if (lesson.status === 'confirmed') {
        displayStatus = 'completed';
        badgeClass = 'badge--approved';
      } else if (lesson.status === 'completed') {
        badgeClass = 'badge--approved';
      }
    }
    
    return `
      <div class="list-item">
        <div class="list-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width: 16px; height: 16px;">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${escapeHtml(lesson.subject || 'Subject')} • ${escapeHtml(lesson.examBoard || 'Any board')}</div>
          <div class="list-item-subtitle">${date}</div>
        </div>
        <div class="list-item-meta">
          <span class="badge ${badgeClass}">${displayStatus}</span>
        </div>
      </div>
    `;
  }).join('');
  
  lessonHistoryEl.innerHTML = lessonsHTML;
}

// Render payments
function renderPayments(payments) {
  if (!paymentsEl) return;
  
  if (payments.length === 0) {
    renderEmpty('payments', {
      title: 'No payments yet',
      desc: 'Receipts will show after checkout.'
    });
    return;
  }
  
  const paymentsHTML = payments.map(payment => {
    const amount = payment.amount ? `£${(payment.amount / 100).toFixed(2)}` : 'N/A';
    const date = payment.createdAt ? formatDate(payment.createdAt.toDate()) : 'Unknown';
    // Only show status badge for failed payments
const statusBadge = payment.status !== 'succeeded' ? 
`<span class="badge badge--pending">${payment.status}</span>` : '';

return `
<div class="list-item">
    <div class="list-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width: 16px; height: 16px;">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
    </div>
    <div class="list-item-content">
        <div class="list-item-title">${amount}</div>
        <div class="list-item-subtitle">${escapeHtml(payment.description || 'Tutoring session')}</div>
    </div>
    <div class="list-item-meta">
        ${statusBadge}
        <div style="margin-top: 4px;">${date}</div>
    </div>
</div>
`;
  }).join('');
  
  paymentsEl.innerHTML = paymentsHTML;
}

// Render progress stats
function renderProgress(bookings) {
  if (!progressEl) return;
  
  const completed = bookings.filter(b => b.status === 'completed').length;
  const noShow = bookings.filter(b => b.status === 'no_show').length;
  const totalHours = completed; // Assuming 1 hour per session
  
  if (completed === 0 && noShow === 0) {
    renderEmpty('progress', {
      title: 'Your learning stats will appear here',
      desc: 'Complete your first lesson to see progress.'
    });
    return;
  }
  
  progressEl.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center;">
      <div>
        <div style="font-size: 32px; font-weight: 700; color: var(--brand-primary); margin-bottom: 8px;">${completed}</div>
        <div style="color: var(--text-soft); font-size: 14px;">Lessons<br>Completed</div>
      </div>
      <div>
        <div style="font-size: 32px; font-weight: 700; color: var(--brand-secondary); margin-bottom: 8px;">${totalHours}</div>
        <div style="color: var(--text-soft); font-size: 14px;">Hours<br>Learned</div>
      </div>
      <div>
        <div style="font-size: 32px; font-weight: 700; color: var(--success); margin-bottom: 8px;">${Math.round((completed / (completed + noShow)) * 100) || 0}%</div>
        <div style="color: var(--text-soft); font-size: 14px;">Attendance<br>Rate</div>
      </div>
    </div>
  `;
}

// Error renderers - use calm empty states instead of red errors
function renderUpcomingSessionsError() {
  console.warn('[Profile] Failed to load upcoming sessions');
  renderEmpty('upcomingSessions', {
    title: 'Temporarily unavailable',
    desc: 'Please refresh to try again shortly.'
  });
}

function renderLessonHistoryError() {
  console.warn('[Profile] Failed to load lesson history');
  renderEmpty('lessonHistory', {
    title: 'Temporarily unavailable',
    desc: 'Please refresh to try again shortly.'
  });
}

function renderPaymentsError() {
  console.warn('[Profile] Failed to load payments');
  renderEmpty('payments', {
    title: 'Temporarily unavailable',
    desc: 'Please refresh to try again shortly.'
  });
}

function renderProgressError() {
  console.warn('[Profile] Failed to load progress');
  renderEmpty('progress', {
    title: 'Temporarily unavailable',
    desc: 'Please refresh to try again shortly.'
  });
}

// Utility functions
function formatDate(date) {
  return date.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(date) {
  return date.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  console.error(message);
  // Could implement a toast notification here
}

async function updateUserProfile(updates) {
  if (!currentUser) return;
  
  try {
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    
    // Update local state
    userProfile = { ...userProfile, ...updates };
    
    // Mirror essential fields into /profiles for global lookups (e.g., messages picker)
    const profilePayload = {
      displayName: userProfile.displayName || currentUser.displayName || '',
      email: userProfile.email || currentUser.email || '',
      photoURL: userProfile.photoURL || userProfile.photoUrl || currentUser.photoURL || '',
      photoUrl: userProfile.photoURL || userProfile.photoUrl || currentUser.photoURL || '',
      role: userProfile.role || 'student',
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, "profiles", currentUser.uid), profilePayload, { merge: true });

    // Re-render relevant sections
    renderRateStatus();
    
  } catch (error) {
    console.error("Failed to update profile:", error);
    throw error;
  }
}

function cleanupListeners() {
  listeners.forEach(unsubscribe => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  });
  listeners = [];
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanupListeners);
