// Tutor Dashboard - Modern Firebase v10 Implementation
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getFunctions,
  httpsCallable
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

// Firebase configuration - Replace with your actual config
const firebaseConfig = {
  // Your Firebase config here
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Global state
let currentUser = null;
let tutorStats = null;
let unsubscribeStats = null;

// Initialize dashboard
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '/signin.html';
    return;
  }
  
  currentUser = user;
  
  // Verify user is a tutor
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists() || userDoc.data().role !== 'tutor') {
    window.location.href = '/';
    return;
  }
  
  initializeDashboard();
});

async function initializeDashboard() {
  try {
    setupEventListeners();
    startStatsMonitoring();
    await loadDashboardData();
    await checkTeachingPreferences();
    console.log('Dashboard initialized successfully');
  } catch (error) {
    console.error('Error initializing dashboard:', error);
    showError('Failed to load dashboard');
  }
}

function setupEventListeners() {
  // Header actions
  document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
  document.getElementById('profileBtn')?.addEventListener('click', () => {
    window.location.href = '/profile.html';
  });
  
  // Action bar
  document.getElementById('btnAssignHomework')?.addEventListener('click', () => 
    document.getElementById('modalSchedule')?.showModal()
  );
  document.getElementById('btnScheduleSession')?.addEventListener('click', () => 
    document.getElementById('modalSchedule')?.showModal()
  );
  
  // Start call button
  document.getElementById('btnStartCall')?.addEventListener('click', handleStartCall);
  
  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) modal.close();
    });
  });
  
  // Form submissions
  document.getElementById('formSchedule')?.addEventListener('submit', handleScheduleSubmit);
}

function startStatsMonitoring() {
  if (unsubscribeStats) unsubscribeStats();
  
  unsubscribeStats = onSnapshot(
    doc(db, 'tutor_stats', currentUser.uid),
    (snapshot) => {
      if (snapshot.exists()) {
        tutorStats = snapshot.data();
        updateStatsDisplay();
        updateUpNext();
      }
    },
    (error) => console.error('Error monitoring stats:', error)
  );
}

async function loadDashboardData() {
  try {
    await Promise.all([
      loadTodaySessions(),
      loadAssignedStudents(),
      loadHomeworkToGrade(),
      loadNewMessages(),
      loadNotifications()
    ]);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

async function loadTodaySessions() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const q = query(
      collection(db, 'sessions'),
      where('tutorId', '==', currentUser.uid),
      where('startAt', '>=', Timestamp.fromDate(today)),
      where('startAt', '<', Timestamp.fromDate(tomorrow)),
      orderBy('startAt', 'asc'),
      limit(5)
    );
    
    const snapshot = await getDocs(q);
    const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTodaySessions(sessions);
  } catch (error) {
    console.error('Error loading today sessions:', error);
    renderError('todayContent', 'Failed to load today\'s sessions');
  }
}

async function loadAssignedStudents() {
  try {
    const q = query(
      collection(db, 'tutors', currentUser.uid, 'students'),
      where('status', '==', 'active'),
      orderBy('assignedAt', 'desc'),
      limit(3)
    );
    
    const snapshot = await getDocs(q);
    const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAssignedStudents(students);
  } catch (error) {
    console.error('Error loading assigned students:', error);
    renderError('studentsContent', 'Failed to load assigned students');
  }
}

async function loadHomeworkToGrade() {
  try {
    const q = query(
      collection(db, 'homework'),
      where('tutorId', '==', currentUser.uid),
      where('status', '==', 'to_grade'),
      orderBy('dueAt', 'asc'),
      limit(3)
    );
    
    const snapshot = await getDocs(q);
    const homework = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderHomeworkToGrade(homework);
  } catch (error) {
    console.error('Error loading homework:', error);
    renderError('homeworkContent', 'Failed to load homework');
  }
}

async function loadNewMessages() {
  try {
    const q = query(
      collection(db, 'message_threads'),
      where('tutorId', '==', currentUser.uid),
      orderBy('lastMessageAt', 'desc'),
      limit(3)
    );
    
    const snapshot = await getDocs(q);
    const threads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderNewMessages(threads);
  } catch (error) {
    console.error('Error loading messages:', error);
    renderError('messagesContent', 'Failed to load messages');
  }
}

async function loadNotifications() {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('tutorId', '==', currentUser.uid),
      where('readAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    
    const snapshot = await getDocs(q);
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderNotifications(notifications);
    updateNotificationBadge(notifications.length);
  } catch (error) {
    console.error('Error loading notifications:', error);
    renderError('notificationsContent', 'Failed to load notifications');
  }
}

// Rendering functions
function renderTodaySessions(sessions) {
  const content = document.getElementById('todayContent');
  if (!content) return;
  
  if (!sessions.length) {
    content.innerHTML = `<div class="empty-state"><h4>No sessions today</h4><p>Your schedule is clear</p></div>`;
    return;
  }
  
  content.innerHTML = sessions.map(session => `
    <div class="session-item">
      <div class="session-info">
        <h4 class="session-title">${session.subject || 'Session'}</h4>
        <p class="session-meta">${formatTime(session.startAt)} - ${formatTime(session.endAt)}</p>
        <p class="session-meta">with ${session.studentName}</p>
      </div>
      <div class="session-actions">
        <button class="btn btn-primary btn-sm" onclick="startVideoCall('${session.id}')" 
                ${!canJoinSession(session) ? 'disabled' : ''}>
          <i class="fas fa-video"></i> Join
        </button>
      </div>
    </div>
  `).join('');
}

function renderAssignedStudents(students) {
  const content = document.getElementById('studentsContent');
  if (!content) return;
  
  if (!students.length) {
    content.innerHTML = `<div class="empty-state"><h4>No students assigned yet</h4><p>Students will appear here when assigned to you</p></div>`;
    return;
  }
  
  content.innerHTML = students.map(student => `
    <div class="student-item">
      <div class="student-avatar">${student.name.charAt(0).toUpperCase()}</div>
      <div class="student-info">
        <h4 class="student-name">${student.name}</h4>
        <p class="student-subject">${student.subject} - ${student.level}</p>
      </div>
      <div class="student-actions">
        <button class="btn btn-secondary btn-sm" onclick="messageStudent('${student.id}')">
          <i class="fas fa-comment"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function renderHomeworkToGrade(homework) {
  const content = document.getElementById('homeworkContent');
  if (!content) return;
  
  if (!homework.length) {
    content.innerHTML = `<div class="empty-state"><h4>No homework to grade</h4><p>All caught up!</p></div>`;
    return;
  }
  
  content.innerHTML = homework.map(hw => {
    const isOverdue = hw.dueAt.toDate() < new Date();
    return `
      <div class="homework-item">
        <div class="homework-info">
          <h4 class="homework-title">${hw.title}</h4>
          <p class="homework-due ${isOverdue ? 'homework-overdue' : ''}">
            Due ${formatDate(hw.dueAt)}
            ${isOverdue ? '<span class="homework-badge overdue">Overdue</span>' : ''}
          </p>
        </div>
        <button class="btn btn-primary btn-sm">Grade</button>
      </div>
    `;
  }).join('');
}

function renderNewMessages(threads) {
  const content = document.getElementById('messagesContent');
  if (!content) return;
  
  if (!threads.length) {
    content.innerHTML = `<div class="empty-state"><h4>No new messages</h4><p>Your inbox is clear</p></div>`;
    return;
  }
  
  content.innerHTML = threads.map(thread => `
    <div class="message-item">
      <div class="message-header">
        <span class="message-sender">${thread.studentName}</span>
        <span class="message-time">${formatTime(thread.lastMessageAt)}</span>
      </div>
      <div class="message-reply">
        <input type="text" placeholder="Quick reply..." data-thread="${thread.id}">
        <button class="btn btn-primary btn-sm">Send</button>
      </div>
    </div>
  `).join('');
}

function renderNotifications(notifications) {
  const content = document.getElementById('notificationsContent');
  if (!content) return;
  
  if (!notifications.length) {
    content.innerHTML = `<div class="empty-state"><h4>No notifications</h4><p>You're all caught up</p></div>`;
    return;
  }
  
  content.innerHTML = notifications.map(notif => `
    <div class="notification-item">
      <div class="notification-icon ${notif.severity === 'critical' ? 'critical' : ''}">
        <i class="fas fa-bell"></i>
      </div>
      <div class="notification-content">
        <p class="notification-message">${notif.message}</p>
        <p class="notification-time">${formatTime(notif.createdAt)}</p>
      </div>
    </div>
  `).join('');
}

function updateStatsDisplay() {
  if (!tutorStats) return;
  
  const earningsAmount = document.getElementById('earningsAmount');
  const earningsSubtitle = document.getElementById('earningsSubtitle');
  
  if (earningsAmount) {
    earningsAmount.textContent = `£${(tutorStats.earningsMTD || 0).toFixed(2)}`;
  }
  
  if (earningsSubtitle && tutorStats.lastPayout) {
    earningsSubtitle.textContent = 
      `MTD • Last payout £${tutorStats.lastPayout.amount} on ${formatDate(tutorStats.lastPayout.paidAt)}`;
  }
  
  updateNotificationBadge(tutorStats.notifUnread || 0);
}

function updateUpNext() {
  const upNextContent = document.getElementById('upNextContent');
  const btnStartCall = document.getElementById('btnStartCall');
  
  if (!tutorStats?.nextSessionId) {
    if (upNextContent) {
      upNextContent.innerHTML = `<div class="empty-state"><h4>No upcoming sessions</h4><p>Schedule your next session to get started</p></div>`;
    }
    if (btnStartCall) btnStartCall.disabled = true;
    return;
  }
  
  getDoc(doc(db, 'sessions', tutorStats.nextSessionId))
    .then(sessionDoc => {
      if (sessionDoc.exists()) {
        const session = sessionDoc.data();
        renderUpNext(session);
      }
    })
    .catch(error => console.error('Error loading next session:', error));
}

function renderUpNext(session) {
  const upNextContent = document.getElementById('upNextContent');
  const btnStartCall = document.getElementById('btnStartCall');
  
  const now = Date.now();
  const start = session.startAt.toDate().getTime();
  const end = session.endAt.toDate().getTime();
  const canJoin = now >= (start - 5 * 60 * 1000) && now <= (end + 15 * 60 * 1000);
  
  if (upNextContent) {
    upNextContent.innerHTML = `
      <div class="session-item">
        <div class="session-info">
          <h4 class="session-title">${session.subject || 'Session'}</h4>
          <p class="session-meta">${formatTime(session.startAt)} - ${formatTime(session.endAt)}</p>
          <p class="session-meta">with ${session.studentName}</p>
        </div>
      </div>
    `;
  }
  
  if (btnStartCall) {
    btnStartCall.disabled = !canJoin;
    btnStartCall.onclick = () => startVideoCall(tutorStats.nextSessionId);
  }
}

// Event handlers
async function handleSignOut() {
  try {
    await signOut(auth);
    window.location.href = '/';
  } catch (error) {
    console.error('Error signing out:', error);
    showError('Failed to sign out');
  }
}

async function handleStartCall() {
  if (!tutorStats?.nextSessionId) return;
  
  try {
    await startVideoCall(tutorStats.nextSessionId);
  } catch (error) {
    console.error('Error starting call:', error);
    showError('Failed to start video call');
  }
}

async function startVideoCall(sessionId) {
  try {
    const videoToken = httpsCallable(functions, 'videoToken');
    const result = await videoToken({ sessionId });
    
    const { token, url } = result.data;
    
    if (!token || !url) {
      throw new Error('Invalid video token response');
    }
    
    const videoWindow = window.open(
      `/pages/video.html?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`,
      '_blank',
      'width=1200,height=800'
    );
    
    if (!videoWindow) {
      showError('Please allow popups to join the video call');
    }
  } catch (error) {
    console.error('Error starting video call:', error);
    showError(error.message || 'Failed to start video call');
  }
}

async function handleScheduleSubmit(e) {
  e.preventDefault();
  
  const sessionData = {
    tutorId: currentUser.uid,
    studentId: document.getElementById('schedStudent').value,
    subject: document.getElementById('schedSubject').value,
    startAt: Timestamp.fromDate(new Date(document.getElementById('schedStart').value)),
    endAt: Timestamp.fromDate(new Date(document.getElementById('schedEnd').value)),
    status: 'scheduled',
    createdAt: serverTimestamp()
  };
  
  try {
    await addDoc(collection(db, 'sessions'), sessionData);
    document.getElementById('modalSchedule').close();
    showSuccess('Session scheduled successfully');
    await loadTodaySessions();
  } catch (error) {
    console.error('Error scheduling session:', error);
    showError('Failed to schedule session');
  }
}

// Utility functions
function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count.toString();
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }
}

function canJoinSession(session) {
  const now = Date.now();
  const start = session.startAt.toDate().getTime();
  const end = session.endAt.toDate().getTime();
  return now >= (start - 5 * 60 * 1000) && now <= (end + 15 * 60 * 1000);
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function renderError(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `<div class="empty-state"><h4>Error</h4><p>${message}</p></div>`;
  }
}

function showSuccess(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: var(--success);
    color: white; padding: 12px 20px; border-radius: 8px; z-index: 1000;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showError(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: var(--danger);
    color: white; padding: 12px 20px; border-radius: 8px; z-index: 1000;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function checkTeachingPreferences() {
  try {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data();
    const teachingStatus = document.getElementById('teachingStatus');
    
    if (!teachingStatus) return;
    
    if (!userData.teaching || !userData.teaching.subjects?.length) {
      teachingStatus.innerHTML = `
        <div class="status-badge setup-needed">
          <i class="fas fa-exclamation-triangle"></i> Setup needed
        </div>
        <a href="/profile.html" class="btn btn-secondary btn-sm">Complete Profile</a>
      `;
    } else {
      teachingStatus.innerHTML = `
        <div class="status-badge active">
          <i class="fas fa-check-circle"></i> Active
        </div>
        <div class="teaching-rate">£${userData.teaching.ratePerHour || 25}/hour</div>
      `;
    }
  } catch (error) {
    console.error('Error checking teaching preferences:', error);
  }
}

// Global functions for onclick handlers
window.startVideoCall = startVideoCall;
window.messageStudent = (studentId) => {
  window.location.href = `/messages.html?student=${studentId}`;
};
