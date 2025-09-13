import { auth } from "./lib/firebaseClient.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    orderBy, 
    onSnapshot,
    limit 
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { replace } from "./lib/nav.js";

const db = getFirestore();

// Real-time listeners array to cleanup on unmount
let listeners = [];

// DOM elements
const profileContent = document.getElementById('profile-content');
const lessonStatsContent = document.getElementById('lesson-stats-content');
const paymentsContent = document.getElementById('payments-content');
const bookingsContent = document.getElementById('bookings-content');
const logoutBtn = document.getElementById('logout-btn');

// Auth state handler
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        replace("/signin");
        return;
    }

    try {
        // Setup real-time listeners for all dashboard data
        await setupProfileListener(user);
        await setupLessonStatsListener(user);
        await setupPaymentsListener(user);
        await setupBookingsListener(user);
        
        console.log("Dashboard initialized with real-time data");
    } catch (error) {
        console.error("Failed to initialize dashboard:", error);
        showError("Failed to load dashboard data. Please refresh the page.");
    }
});

// Logout handler
logoutBtn?.addEventListener('click', async () => {
    try {
        // Cleanup listeners before logout
        cleanupListeners();
        await signOut(auth);
        replace("/");
    } catch (error) {
        console.error("Logout failed:", error);
    }
});

// Setup profile information listener
async function setupProfileListener(user) {
    const userRef = doc(db, "users", user.uid);
    
    const unsubscribe = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
            const userData = doc.data();
            renderProfile(user, userData);
        } else {
            renderProfile(user, {});
        }
    }, (error) => {
        console.error("Profile listener error:", error);
        renderProfileError();
    });
    
    listeners.push(unsubscribe);
}

// Setup lesson statistics listener
async function setupLessonStatsListener(user) {
    const lessonsRef = collection(db, "lessons");
    const lessonsQuery = query(
        lessonsRef,
        where("studentId", "==", user.uid)
    );
    
    const unsubscribe = onSnapshot(lessonsQuery, (snapshot) => {
        const lessons = [];
        snapshot.forEach(doc => {
            lessons.push({ id: doc.id, ...doc.data() });
        });
        renderLessonStats(lessons);
    }, (error) => {
        console.error("Lessons listener error:", error);
        renderLessonStatsError();
    });
    
    listeners.push(unsubscribe);
}

// Setup payments listener
async function setupPaymentsListener(user) {
    const paymentsRef = collection(db, "payments");
    const paymentsQuery = query(
        paymentsRef,
        where("studentId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(5)
    );
    
    const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
        const payments = [];
        snapshot.forEach(doc => {
            payments.push({ id: doc.id, ...doc.data() });
        });
        renderPayments(payments);
    }, (error) => {
        console.error("Payments listener error:", error);
        renderPaymentsError();
    });
    
    listeners.push(unsubscribe);
}

// Setup bookings listener
async function setupBookingsListener(user) {
    const bookingsRef = collection(db, "bookings");
    const now = new Date();
    const bookingsQuery = query(
        bookingsRef,
        where("studentId", "==", user.uid),
        where("scheduledDate", ">=", now),
        orderBy("scheduledDate", "asc"),
        limit(5)
    );
    
    const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
        const bookings = [];
        snapshot.forEach(doc => {
            bookings.push({ id: doc.id, ...doc.data() });
        });
        renderBookings(bookings);
    }, (error) => {
        console.error("Bookings listener error:", error);
        renderBookingsError();
    });
    
    listeners.push(unsubscribe);
}

// Render profile information
function renderProfile(user, userData) {
    const displayName = userData.displayName || user.displayName || "Student";
    const email = userData.email || user.email || "";
    const photoURL = userData.photoURL || user.photoURL;
    const role = userData.role || "student";
    const memberSince = userData.createdAt ? formatDate(userData.createdAt.toDate()) : "Recently";
    
    const avatarContent = photoURL 
        ? `<img src="${photoURL}" alt="Profile photo" />`
        : displayName.charAt(0).toUpperCase();
    
    profileContent.innerHTML = `
        <div class="profile-section">
            <div class="profile-avatar">${avatarContent}</div>
            <div class="profile-info">
                <h3>${escapeHtml(displayName)}</h3>
                <p>${escapeHtml(email)}</p>
                <span class="profile-badge">${escapeHtml(role.charAt(0).toUpperCase() + role.slice(1))}</span>
                <p style="margin-top: 8px; font-size: 14px;">Member since ${memberSince}</p>
            </div>
        </div>
        <a href="/profile" class="btn btn-primary" style="width: 100%;">
            <i class="fas fa-edit"></i>
            Edit Profile
        </a>
    `;
}

// Render lesson statistics
function renderLessonStats(lessons) {
    const completedLessons = lessons.filter(lesson => lesson.status === 'completed').length;
    const upcomingLessons = lessons.filter(lesson => lesson.status === 'scheduled').length;
    const totalHours = lessons.reduce((sum, lesson) => {
        return sum + (lesson.duration || 0);
    }, 0);
    
    lessonStatsContent.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 16px; text-align: center;">
            <div>
                <div class="metric-large">${completedLessons}</div>
                <div class="metric-label">Completed</div>
            </div>
            <div>
                <div class="metric-large">${upcomingLessons}</div>
                <div class="metric-label">Upcoming</div>
            </div>
            <div>
                <div class="metric-large">${Math.round(totalHours / 60)}</div>
                <div class="metric-label">Hours</div>
            </div>
        </div>
    `;
}

// Render payments
function renderPayments(payments) {
    if (payments.length === 0) {
        paymentsContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-credit-card"></i>
                <h3>No payments yet</h3>
                <p>Your payment history will appear here</p>
            </div>
        `;
        return;
    }
    
    const paymentsHtml = payments.map(payment => {
        const statusClass = payment.status === 'completed' ? 'status-completed' : 
                           payment.status === 'pending' ? 'status-pending' : 'status-pending';
        const amount = payment.amount ? `£${(payment.amount / 100).toFixed(2)}` : 'N/A';
        const date = payment.createdAt ? formatDate(payment.createdAt.toDate()) : 'Unknown';
        
        return `
            <div class="list-item">
                <div class="list-icon">
                    <i class="fas fa-pound-sign"></i>
                </div>
                <div class="list-content">
                    <div class="list-title">${amount}</div>
                    <div class="list-subtitle">${escapeHtml(payment.description || 'Tutoring session')}</div>
                </div>
                <div>
                    <span class="status-badge ${statusClass}">${escapeHtml(payment.status || 'pending')}</span>
                    <div class="list-meta">${date}</div>
                </div>
            </div>
        `;
    }).join('');
    
    paymentsContent.innerHTML = paymentsHtml;
}

// Render upcoming bookings
function renderBookings(bookings) {
    if (bookings.length === 0) {
        bookingsContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-alt"></i>
                <h3>No upcoming sessions</h3>
                <p>Book your next tutoring session to get started</p>
            </div>
        `;
        return;
    }
    
    const bookingsHtml = bookings.map(booking => {
        const date = booking.scheduledDate ? formatDateTime(booking.scheduledDate.toDate()) : 'TBD';
        const subject = booking.subject || 'General';
        const tutor = booking.tutorName || 'Tutor';
        
        return `
            <div class="list-item">
                <div class="list-icon">
                    <i class="fas fa-chalkboard-teacher"></i>
                </div>
                <div class="list-content">
                    <div class="list-title">${escapeHtml(subject)}</div>
                    <div class="list-subtitle">with ${escapeHtml(tutor)}</div>
                </div>
                <div class="list-meta">${date}</div>
            </div>
        `;
    }).join('');
    
    bookingsContent.innerHTML = bookingsHtml;
}

// Error rendering functions
function renderProfileError() {
    profileContent.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Failed to load profile</h3>
            <p>Please refresh the page to try again</p>
        </div>
    `;
}

function renderLessonStatsError() {
    lessonStatsContent.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Failed to load lesson data</h3>
            <p>Please refresh the page to try again</p>
        </div>
    `;
}

function renderPaymentsError() {
    paymentsContent.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Failed to load payments</h3>
            <p>Please refresh the page to try again</p>
        </div>
    `;
}

function renderBookingsError() {
    bookingsContent.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Failed to load bookings</h3>
            <p>Please refresh the page to try again</p>
        </div>
    `;
}

// Utility functions
function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    // Create a simple error notification
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #dc2626;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 1000;
        max-width: 300px;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
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
