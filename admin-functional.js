// Fully Functional Admin Dashboard with Live Firebase Integration
import { auth, db } from './lib/firebaseClient.js';
import { go, replace } from './lib/nav.js';
import { 
  onAuthStateChanged, 
  signOut 
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  addDoc,
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  getCountFromServer,
  limit,
  startAfter
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

console.log('🚀 Starting functional admin dashboard...');

// State Management
let currentUser = null;
let currentTab = 'tutors';
let currentFilter = 'all';
let searchQuery = '';
let searchTimeout = null;
let currentPage = 0;
const PAGE_SIZE = 50;

// Notification state
let notificationFilter = 'unread'; // 'unread', 'all', 'past'
let allNotifications = [];

// Discount applications state
let discountApplications = [];
let discountFilter = 'pending';
let discountSearchQuery = '';
let unsubscribeDiscountApps = null;

// Unsubscribe functions for real-time listeners
let unsubscribeTutorApps = null;
let unsubscribeTutors = null;
let unsubscribeStudents = null;
let unsubscribeAssignments = null;
let unsubscribeNotifications = null;

// Data cache
let dashboardData = {
  tutorApplications: [],
  tutors: [],
  students: [],
  assignments: [],
  analytics: {
    activeTutors: 0,
    activeStudents: 0,
    totalAssignments: 0,
    recentAssignments: 0
  }
};

// Admin email check
const ADMIN_EMAILS = ['lukas.yuli.uk@gmail.com'];

function isAdmin(user) {
  return user && ADMIN_EMAILS.includes(user.email);
}

// Toast notification system
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
    <span>${message}</span>
  `;
  
  // Add toast styles if not already present
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fff;
        border: 1px solid #e0e7ff;
        border-radius: 12px;
        padding: 12px 16px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
      }
      .toast-success { border-left: 4px solid #16a34a; }
      .toast-error { border-left: 4px solid #ef4444; }
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Auth State Management
onAuthStateChanged(auth, async (user) => {
  console.log('🔐 Auth state changed:', user ? user.email : 'No user');
  
  if (!user) {
    console.log('❌ No user - redirecting to signin');
    replace('/signin');
    return;
  }
  
  // Hard admin gate - check Firestore user role
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();
    
    if (!userData || userData.role !== 'admin') {
      console.log('❌ User is not admin:', user.email, 'Role:', userData?.role);
      replace('/dashboard');
      return;
    }
    
    console.log('✅ Admin access confirmed for:', user.email);
    currentUser = user;
    
    // Initialize dashboard
    await initializeDashboard();
    
  } catch (error) {
    console.error('❌ Error checking admin status:', error);
    replace('/dashboard');
  }
});

// Initialize Dashboard
async function initializeDashboard() {
  try {
    // Set up event listeners
    setupEventListeners();
    
    // Start real-time listeners
    setupRealtimeListeners();
    
    // Load analytics
    await loadAnalytics();
    
    console.log('✅ Admin dashboard initialized');
  } catch (error) {
    console.error('❌ Error initializing dashboard:', error);
    showToast('Failed to initialize dashboard', 'error');
  }
}

// Event Listeners
function setupEventListeners() {
  // Sign out button
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
        replace('/signin');
      } catch (error) {
        console.error('Sign out error:', error);
        showToast('Failed to sign out', 'error');
      }
    });
  }
}

// Setup discount applications listener
function setupDiscountApplicationsListener() {
  const discountQuery = query(
    collection(db, 'users'),
    where('discountStatus', 'in', ['pending', 'approved', 'rejected']),
    orderBy('updatedAt', 'desc')
  );
  
  unsubscribeDiscountApps = onSnapshot(discountQuery, (snapshot) => {
    discountApplications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderDiscountApplications();
  }, (error) => {
    console.error('Error listening to discount applications:', error);
  });
}

// Real-time Listeners
function setupRealtimeListeners() {
  // Tutor Applications listener
  const tutorAppsQuery = query(
    collection(db, 'tutorApplications'),
    orderBy('createdAt', 'desc')
  );
  
  unsubscribeTutorApps = onSnapshot(tutorAppsQuery, (snapshot) => {
    dashboardData.tutorApplications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderTutorApplications();
    updateAnalytics();
  }, (error) => {
    console.error('Error listening to tutor applications:', error);
  });

  // Admin Notifications listener
  const notificationsQuery = query(
    collection(db, 'adminNotifications'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  
  unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderNotifications(notifications);
  }, (error) => {
    console.error('Error listening to notifications:', error);
  });

  // Setup discount applications listener
  setupDiscountApplicationsListener();
  
  // Tutors listener
  const tutorsQuery = query(
    collection(db, 'users'),
    where('role', '==', 'tutor'),
    orderBy('createdAt', 'desc')
  );
  
  unsubscribeTutors = onSnapshot(tutorsQuery, (snapshot) => {
    dashboardData.tutors = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    if (currentTab === 'tutors') renderPeopleManagement();
    populateAssignmentDropdowns();
    updateAnalytics();
  }, (error) => {
    console.error('Error listening to tutors:', error);
  });
  
  // Students listener
  const studentsQuery = query(
    collection(db, 'users'),
    where('role', '==', 'student'),
    orderBy('createdAt', 'desc')
  );
  
  unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
    dashboardData.students = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    if (currentTab === 'students') renderPeopleManagement();
    populateAssignmentDropdowns();
    updateAnalytics();
  }, (error) => {
    console.error('Error listening to students:', error);
  });
  
  // Assignments listener
  const assignmentsQuery = query(
    collection(db, 'assignments'),
    orderBy('assignedAt', 'desc')
  );
  
  unsubscribeAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
    dashboardData.assignments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderAssignments();
    updateAnalytics();
  }, (error) => {
    console.error('Error listening to assignments:', error);
  });
}

// Analytics
async function loadAnalytics() {
  try {
    // Get counts using getCountFromServer for better performance
    const [tutorsCount, studentsCount, assignmentsCount] = await Promise.all([
      getCountFromServer(query(collection(db, 'users'), where('role', '==', 'tutor'))),
      getCountFromServer(query(collection(db, 'users'), where('role', '==', 'student'))),
      getCountFromServer(collection(db, 'assignments'))
    ]);
    
    // Get recent assignments (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentAssignments = await getDocs(
      query(
        collection(db, 'assignments'),
        where('assignedAt', '>=', sevenDaysAgo)
      )
    );
    
    dashboardData.analytics = {
      activeTutors: tutorsCount.data().count,
      activeStudents: studentsCount.data().count,
      totalAssignments: assignmentsCount.data().count,
      recentAssignments: recentAssignments.size
    };
    
    renderAnalytics();
    
  } catch (error) {
    console.error('Error loading analytics:', error);
    dashboardData.analytics = {
      activeTutors: 0,
      activeStudents: 0,
      totalAssignments: 0,
      recentAssignments: 0
    };
    renderAnalytics();
  }
}

function updateAnalytics() {
  dashboardData.analytics.activeTutors = dashboardData.tutors.length;
  dashboardData.analytics.activeStudents = dashboardData.students.length;
  dashboardData.analytics.totalAssignments = dashboardData.assignments.length;
  
  // Count recent assignments
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  dashboardData.analytics.recentAssignments = dashboardData.assignments.filter(assignment => {
    const assignedAt = assignment.assignedAt?.toDate?.() || new Date(assignment.assignedAt);
    return assignedAt >= sevenDaysAgo;
  }).length;
  
  renderAnalytics();
}

// Utility Functions
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (error) {
    return 'Invalid date';
  }
}

function debounce(func, wait) {
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(searchTimeout);
      func(...args);
    };
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(later, wait);
  };
}

// Notification Functions
function renderNotifications(notifications) {
  const container = document.getElementById('bookingNotifications');
  if (!container) return;
  
  allNotifications = notifications;
  
  if (!document.getElementById('notificationTabs')) {
    const tabsHTML = `
      <div class="notification-tabs" id="notificationTabs" style="margin-bottom: 16px; display: flex; gap: 8px; border-bottom: 1px solid var(--border);">
        <button class="tab-btn active" onclick="filterNotifications('unread')" id="tab-unread">
          New (<span id="unreadCount">0</span>)
        </button>
        <button class="tab-btn" onclick="filterNotifications('all')" id="tab-all">
          All
        </button>
        <button class="tab-btn" onclick="filterNotifications('past')" id="tab-past">
          Past Sessions
        </button>
        <div style="margin-left: auto; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="clearReadNotifications()" style="font-size: 12px; padding: 6px 12px;">
            <i class="fas fa-trash"></i> Clear Read
          </button>
          <button class="btn btn-danger" onclick="clearAllNotifications()" style="font-size: 12px; padding: 6px 12px;">
            <i class="fas fa-trash-alt"></i> Clear All
          </button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforebegin', tabsHTML);
  }
  
  const filteredNotifications = getFilteredNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;
  const unreadCountEl = document.getElementById('unreadCount');
  if (unreadCountEl) unreadCountEl.textContent = unreadCount;
  
  if (filteredNotifications.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-bell"></i>
        <p>No notifications yet</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredNotifications.map(notification => {
    const isRead = notification.read;
    
    return `
      <div class="list-item ${isRead ? 'notification-read' : ''}" id="notification-${notification.id}">
        <div class="item-header">
          <div class="item-info">
            <h4>${notification.title || 'New Notification'}</h4>
            <p>${notification.message || 'No message'}</p>
            <div class="item-meta">
              ${notification.createdAt ? formatDate(notification.createdAt.toDate()) : 'Unknown date'}
              ${isRead ? '<span class="status-badge read">Read</span>' : '<span class="status-badge unread">New</span>'}
            </div>
          </div>
          <div class="item-actions">
            ${!isRead ? `
              <button class="btn btn-primary" onclick="markAsRead('${notification.id}')">
                <i class="fas fa-check"></i> Mark Read
              </button>
            ` : ''}
            <button class="btn btn-secondary" onclick="viewBookingDetails('${notification.bookingId || notification.id}')">
              <i class="fas fa-eye"></i> View Details
            </button>
            <button class="btn btn-danger" onclick="deleteNotification('${notification.id}')" style="padding: 6px 12px;">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getFilteredNotifications() {
  switch (notificationFilter) {
    case 'unread':
      return allNotifications.filter(n => !n.read);
    case 'past':
      return allNotifications.filter(n => {
        if (!n.createdAt) return false;
        const notificationDate = n.createdAt.toDate();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return notificationDate < sevenDaysAgo;
      });
    case 'all':
    default:
      return allNotifications;
  }
}

// Discount Applications Functions
function renderDiscountApplications() {
  const container = document.getElementById('discountApplications');
  if (!container) return;
  
  let appsToShow = discountApplications;
  
  // Apply status filter
  if (discountFilter !== 'all') {
    appsToShow = appsToShow.filter(app => app.discountStatus === discountFilter);
  }
  
  // Apply search filter
  if (discountSearchQuery) {
    appsToShow = appsToShow.filter(app => 
      app.displayName?.toLowerCase().includes(discountSearchQuery.toLowerCase()) ||
      app.email?.toLowerCase().includes(discountSearchQuery.toLowerCase())
    );
  }
  
  if (appsToShow.length === 0) {
    const emptyMessage = discountFilter === 'pending' ? 'No pending applications' : 
                        discountFilter === 'approved' ? 'No approved applications' :
                        discountFilter === 'rejected' ? 'No rejected applications' :
                        'No discount applications found';
    
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-percentage"></i>
        <p>${discountSearchQuery ? 'No applications match your search' : emptyMessage}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = appsToShow.map(app => {
    const statusBadge = getDiscountStatusBadge(app.discountStatus);
    const timeInfo = getDiscountTimeInfo(app);
    
    return `
      <div class="list-item" id="discount-app-${app.id}">
        <div class="item-header">
          <div class="item-info">
            <h4>${app.displayName || 'Unknown User'}</h4>
            <p>${app.email}</p>
            <div class="item-meta">
              ${statusBadge}
              ${timeInfo}
              ${app.discountStatus === 'rejected' && app.discountRejectionReason ? 
                `<br><small style="color: var(--danger);">Reason: ${app.discountRejectionReason}</small>` : ''}
            </div>
          </div>
          <div class="item-actions">
            ${app.discountProofUrl ? `
              <button class="btn btn-secondary" onclick="viewDiscountProof('${app.discountProofUrl}', '${app.displayName || 'User'}')">
                <i class="fas fa-eye"></i> View Proof
              </button>
            ` : ''}
            ${app.discountStatus === 'pending' ? `
              <button class="btn btn-success" onclick="approveDiscountApplication('${app.id}')">
                <i class="fas fa-check"></i> Approve
              </button>
              <button class="btn btn-danger" onclick="rejectDiscountApplication('${app.id}')">
                <i class="fas fa-times"></i> Reject
              </button>
            ` : ''}
            ${app.discountStatus === 'approved' ? `
              <button class="btn btn-danger" onclick="revokeDiscountApplication('${app.id}')">
                <i class="fas fa-ban"></i> Revoke
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getDiscountStatusBadge(status) {
  switch (status) {
    case 'pending':
      return '<span class="status-badge pending">Pending Review</span>';
    case 'approved':
      return '<span class="status-badge approved">Approved</span>';
    case 'rejected':
      return '<span class="status-badge rejected">Rejected</span>';
    default:
      return '<span class="status-badge">Unknown</span>';
  }
}

function getDiscountTimeInfo(app) {
  const timeStr = app.updatedAt ? formatDate(app.updatedAt) : 'Unknown date';
  
  if (app.discountStatus === 'approved' && app.discountApprovedAt) {
    return `Applied: ${timeStr} • Approved: ${formatDate(app.discountApprovedAt)}`;
  } else if (app.discountStatus === 'rejected' && app.discountRejectedAt) {
    return `Applied: ${timeStr} • Rejected: ${formatDate(app.discountRejectedAt)}`;
  } else {
    return `Applied: ${timeStr}`;
  }
}

// Rendering Functions
function renderAnalytics() {
  // Update stat numbers in the mini cards
  const tutorCountEl = document.getElementById('tutorCount');
  const studentCountEl = document.getElementById('studentCount');
  const assignmentCountEl = document.getElementById('assignmentCount');
  const recentCountEl = document.getElementById('recentCount');
  
  if (tutorCountEl) tutorCountEl.textContent = dashboardData.analytics.activeTutors;
  if (studentCountEl) studentCountEl.textContent = dashboardData.analytics.activeStudents;
  if (assignmentCountEl) assignmentCountEl.textContent = dashboardData.analytics.totalAssignments;
  if (recentCountEl) recentCountEl.textContent = dashboardData.analytics.recentAssignments;
}

function renderTutorApplications() {
  const container = document.getElementById('tutorApplications');
  if (!container) return;
  
  let appsToShow = dashboardData.tutorApplications;
  
  if (searchQuery) {
    appsToShow = appsToShow.filter(app => 
      app.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.subjects?.some(subject => subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }
  
  if (appsToShow.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard-list"></i>
        <p>${searchQuery ? 'No applications match your search' : 'No tutor applications yet'}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = appsToShow.map(app => `
    <div class="list-item" id="app-${app.id}">
      <div class="item-header">
        <div class="item-info">
          <h4>${app.name || 'No name provided'}</h4>
          <p>${app.email}</p>
          <div class="item-meta">
            <span class="status-badge pending">pending</span>
            Applied: ${formatDate(app.createdAt)}
            ${app.subjects ? `• Subjects: ${app.subjects.join(', ')}` : ''}
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-secondary" onclick="viewApplication('${app.id}')">
            <i class="fas fa-eye"></i> View
          </button>
          <button class="btn btn-success" onclick="approveApplication('${app.id}')">
            <i class="fas fa-check"></i> Approve
          </button>
          <button class="btn btn-danger" onclick="rejectApplication('${app.id}')">
            <i class="fas fa-times"></i> Reject
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderPeopleManagement() {
  const container = document.getElementById('peopleList');
  if (!container) return;
  
  let peopleToShow = currentTab === 'tutors' ? dashboardData.tutors : dashboardData.students;
  
  if (searchQuery) {
    peopleToShow = peopleToShow.filter(person => 
      (person.displayName || person.name)?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }
  
  if (peopleToShow.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <p>${searchQuery ? `No ${currentTab} match your search` : `No ${currentTab} found`}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = peopleToShow.map(person => `
    <div class="list-item">
      <div class="item-header">
        <div class="item-info">
          <h4>${person.displayName || person.name || 'Unknown'}</h4>
          <p>${person.email}</p>
          <div class="item-meta">
            <span class="status-badge ${person.status || 'active'}">${person.status || 'active'}</span>
            Joined: ${formatDate(person.createdAt)}
            ${person.lastLoginAt ? `• Last login: ${formatDate(person.lastLoginAt)}` : ''}
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-secondary" onclick="viewProfile('${person.id}')">
            <i class="fas fa-eye"></i> View
          </button>
          <button class="btn btn-secondary" onclick="copyEmail('${person.email}')">
            <i class="fas fa-copy"></i> Copy Email
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderAssignments() {
  const container = document.getElementById('assignmentsList');
  if (!container) return;
  
  if (dashboardData.assignments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-link"></i>
        <p>No assignments yet</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = dashboardData.assignments.map(assignment => {
    const student = dashboardData.students.find(s => s.id === assignment.studentUid);
    const tutor = dashboardData.tutors.find(t => t.id === assignment.tutorUid);
    
    return `
      <div class="list-item">
        <div class="item-header">
          <div class="item-info">
            <h4>${student?.displayName || student?.name || 'Unknown Student'} ↔ ${tutor?.displayName || tutor?.name || 'Unknown Tutor'}</h4>
            <p>${student?.email || 'No email'} • ${tutor?.email || 'No email'}</p>
            <div class="item-meta">
              Assigned: ${formatDate(assignment.assignedAt)}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-danger" onclick="removeAssignment('${assignment.id}')">
              <i class="fas fa-trash"></i> Remove
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function populateAssignmentDropdowns() {
  const studentSelect = document.getElementById('studentSelect');
  const tutorSelect = document.getElementById('tutorSelect');
  
  if (studentSelect) {
    studentSelect.innerHTML = `
      <option value="">Choose student...</option>
      ${dashboardData.students.map(student => 
        `<option value="${student.id}">${student.displayName || student.name || student.email}</option>`
      ).join('')}
    `;
  }
  
  if (tutorSelect) {
    tutorSelect.innerHTML = `
      <option value="">Choose tutor...</option>
      ${dashboardData.tutors.map(tutor => 
        `<option value="${tutor.id}">${tutor.displayName || tutor.name || tutor.email}</option>`
      ).join('')}
    `;
  }
}

// Window Functions (for onclick handlers)
window.filterNotifications = function(filter) {
  notificationFilter = filter;
  
  document.querySelectorAll('.notification-tabs .tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`tab-${filter}`).classList.add('active');
  
  renderNotifications(allNotifications);
};

window.markAsRead = async function(notificationId) {
  try {
    await updateDoc(doc(db, 'adminNotifications', notificationId), {
      read: true,
      readAt: serverTimestamp()
    });
    showToast('Notification marked as read');
  } catch (error) {
    console.error('Error marking notification as read:', error);
    showToast('Failed to mark notification as read', 'error');
  }
};

window.viewBookingDetails = async function(bookingId) {
  if (!bookingId) {
    showToast('No booking details available', 'error');
    return;
  }
  
  try {
    const bookingDoc = await getDoc(doc(db, 'bookings', bookingId));
    if (!bookingDoc.exists()) {
      showToast('Booking not found', 'error');
      return;
    }
    
    const booking = bookingDoc.data();
    const details = `
Booking Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subject: ${booking.subject || 'N/A'}
Level: ${booking.level || 'N/A'}
Exam Board: ${booking.examBoard || 'N/A'}
Current Grade: ${booking.currentGrade || 'N/A'}
Target Grade: ${booking.targetGrade || 'N/A'}

Date: ${booking.date || 'N/A'}
Time: ${booking.time || 'N/A'}
Duration: ${booking.duration ? booking.duration + ' minutes' : 'N/A'}
Price: £${booking.price || '0'}

Student Email: ${booking.contactEmail || 'N/A'}
Phone: ${booking.contactPhone || 'N/A'}
Contact Method: ${booking.contactMethod || 'N/A'}

Notes: ${booking.notes || 'None'}
Status: ${booking.status || 'confirmed'}

Booking ID: ${bookingId}
Created: ${booking.createdAt ? new Date(booking.createdAt.seconds * 1000).toLocaleString() : 'N/A'}
    `;
    
    alert(details);
    
  } catch (error) {
    console.error('Error fetching booking details:', error);
    showToast('Failed to load booking details', 'error');
  }
};

// Discount Application Functions
window.filterDiscountApps = function(filter) {
  discountFilter = filter;
  
  const section = document.querySelector('#discountApplications').closest('.section-card');
  const filterButtons = section.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.toLowerCase().includes(filter) || (filter === 'all' && btn.textContent === 'All')) {
      btn.classList.add('active');
    }
  });
  
  renderDiscountApplications();
};

window.searchDiscountApps = debounce(function(query) {
  discountSearchQuery = query.toLowerCase();
  renderDiscountApplications();
}, 150);

window.viewDiscountProof = function(proofUrl, userName) {
  if (!proofUrl) {
    showToast('No proof document available', 'error');
    return;
  }
  window.open(proofUrl, '_blank');
  showToast(`Opening ${userName}'s proof document`);
};

window.approveDiscountApplication = async function(userId) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      discountStatus: 'approved',
      discountApprovedAt: serverTimestamp(),
      discountRejectionReason: null
    });
    showToast('Discount application approved!');
  } catch (error) {
    console.error('Error approving discount application:', error);
    showToast('Failed to approve application', 'error');
  }
};

window.rejectDiscountApplication = async function(userId) {
  const reason = prompt('Reason for rejection (optional):');
  if (reason === null) return;
  
  try {
    await updateDoc(doc(db, 'users', userId), {
      discountStatus: 'rejected',
      discountRejectedAt: serverTimestamp(),
      discountRejectionReason: reason || 'No reason provided'
    });
    showToast('Discount application rejected');
  } catch (error) {
    console.error('Error rejecting discount application:', error);
    showToast('Failed to reject application', 'error');
  }
};

window.revokeDiscountApplication = async function(userId) {
  if (!confirm('Are you sure you want to revoke this discount approval?')) return;
  
  try {
    await updateDoc(doc(db, 'users', userId), {
      discountStatus: 'rejected',
      discountRejectedAt: serverTimestamp(),
      discountRejectionReason: 'Revoked by admin'
    });
    showToast('Discount approval revoked');
  } catch (error) {
    console.error('Error revoking discount:', error);
    showToast('Failed to revoke discount', 'error');
  }
};

// Tutor Application Functions
window.filterTutors = function(filter) {
  currentFilter = filter;
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  renderTutorApplications();
};

window.searchTutors = debounce(function(query) {
  searchQuery = query.toLowerCase();
  renderTutorApplications();
}, 150);

window.approveApplication = async function(appId) {
  try {
    const app = dashboardData.tutorApplications.find(a => a.id === appId);
    if (!app) throw new Error('Application not found');
    
    await updateDoc(doc(db, 'users', app.uid), {
      role: 'tutor',
      status: 'approved',
      approvedAt: serverTimestamp(),
      subjects: app.subjects || []
    });
    
    await deleteDoc(doc(db, 'tutorApplications', appId));
    showToast('Tutor approved successfully!');
    
  } catch (error) {
    console.error('Error approving tutor:', error);
    showToast('Failed to approve tutor', 'error');
  }
};

window.rejectApplication = async function(appId) {
  try {
    await deleteDoc(doc(db, 'tutorApplications', appId));
    showToast('Application rejected');
  } catch (error) {
    console.error('Error rejecting application:', error);
    showToast('Failed to reject application', 'error');
  }
};

window.viewApplication = function(appId) {
  const app = dashboardData.tutorApplications.find(a => a.id === appId);
  if (!app) return;
  
  alert(`
Application Details:
Name: ${app.name || 'Not provided'}
Email: ${app.email}
Subjects: ${app.subjects?.join(', ') || 'None specified'}
Applied: ${formatDate(app.createdAt)}
  `);
};

// People Management Functions
window.switchTab = function(tab) {
  currentTab = tab;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  searchQuery = '';
  const searchInput = document.querySelector('input[placeholder="Search people..."]');
  if (searchInput) searchInput.value = '';
  
  renderPeopleManagement();
};

window.searchPeople = debounce(function(query) {
  searchQuery = query.toLowerCase();
  renderPeopleManagement();
}, 150);

window.viewProfile = function(userId) {
  const person = [...dashboardData.tutors, ...dashboardData.students].find(p => p.id === userId);
  if (!person) return;
  
  const assignmentCount = dashboardData.assignments.filter(a => 
    a.studentUid === userId || a.tutorUid === userId
  ).length;
  
  alert(`
Profile Details:
Name: ${person.displayName || person.name || 'Not provided'}
Email: ${person.email}
Role: ${person.role || 'Unknown'}
Status: ${person.status || 'Active'}
Joined: ${formatDate(person.createdAt)}
Last Login: ${person.lastLoginAt ? formatDate(person.lastLoginAt) : 'Never'}
Assignments: ${assignmentCount}
  `);
};

window.copyEmail = function(email) {
  navigator.clipboard.writeText(email).then(() => {
    showToast('Email copied to clipboard');
  }).catch(() => {
    showToast('Failed to copy email', 'error');
  });
};

// Assignment Functions
window.assignStudentToTutor = async function() {
  const studentId = document.getElementById('studentSelect').value;
  const tutorId = document.getElementById('tutorSelect').value;
  
  if (!studentId || !tutorId) {
    showToast('Please select both student and tutor', 'error');
    return;
  }
  
  const existingAssignment = dashboardData.assignments.find(a => 
    a.studentUid === studentId && a.tutorUid === tutorId
  );
  
  if (existingAssignment) {
    showToast('This assignment already exists', 'error');
    return;
  }
  
  try {
    await addDoc(collection(db, 'assignments'), {
      studentUid: studentId,
      tutorUid: tutorId,
      assignedAt: serverTimestamp()
    });
    
    document.getElementById('studentSelect').value = '';
    document.getElementById('tutorSelect').value = '';
    
    showToast('Assignment created successfully!');
    
  } catch (error) {
    console.error('Error creating assignment:', error);
    showToast('Failed to create assignment', 'error');
  }
};

window.removeAssignment = async function(assignmentId) {
  if (!confirm('Are you sure you want to remove this assignment?')) return;
  
  try {
    await deleteDoc(doc(db, 'assignments', assignmentId));
    showToast('Assignment removed');
  } catch (error) {
    console.error('Error removing assignment:', error);
    showToast('Failed to remove assignment', 'error');
  }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (unsubscribeTutorApps) unsubscribeTutorApps();
  if (unsubscribeTutors) unsubscribeTutors();
  if (unsubscribeStudents) unsubscribeStudents();
  if (unsubscribeAssignments) unsubscribeAssignments();
  if (unsubscribeNotifications) unsubscribeNotifications();
  if (unsubscribeDiscountApps) unsubscribeDiscountApps();
});

console.log('✅ Functional admin dashboard script loaded');

// Delete individual notification
window.deleteNotification = async function(notificationId) {
  if (!confirm('Are you sure you want to delete this notification?')) return;
  
  try {
    await deleteDoc(doc(db, 'adminNotifications', notificationId));
    showToast('Notification deleted');
  } catch (error) {
    console.error('Error deleting notification:', error);
    showToast('Failed to delete notification', 'error');
  }
};

// Delete all read notifications
window.clearReadNotifications = async function() {
  const readNotifications = allNotifications.filter(n => n.read);
  
  if (readNotifications.length === 0) {
    showToast('No read notifications to clear', 'error');
    return;
  }
  
  if (!confirm(`Delete all ${readNotifications.length} read notifications?`)) return;
  
  try {
    const deletePromises = readNotifications.map(notification => 
      deleteDoc(doc(db, 'adminNotifications', notification.id))
    );
    
    await Promise.all(deletePromises);
    showToast(`Deleted ${readNotifications.length} read notifications`);
  } catch (error) {
    console.error('Error clearing read notifications:', error);
    showToast('Failed to clear read notifications', 'error');
  }
};

// Delete all notifications
window.clearAllNotifications = async function() {
  if (allNotifications.length === 0) {
    showToast('No notifications to clear', 'error');
    return;
  }
  
  const confirmation = prompt(`Type "DELETE ALL" to confirm deletion of all ${allNotifications.length} notifications:`);
  if (confirmation !== 'DELETE ALL') return;
  
  try {
    const deletePromises = allNotifications.map(notification => 
      deleteDoc(doc(db, 'adminNotifications', notification.id))
    );
    
    await Promise.all(deletePromises);
    showToast(`Deleted all ${allNotifications.length} notifications`);
  } catch (error) {
    console.error('Error clearing all notifications:', error);
    showToast('Failed to clear all notifications', 'error');
  }
};