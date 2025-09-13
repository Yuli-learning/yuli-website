// Enhanced Tutor Dashboard - Modern Firebase v10 Implementation
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
  Timestamp,
  arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getFunctions,
  httpsCallable
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBy-UuSbSmrnVn7V2ub3w1MnalzhOitpu0",
  authDomain: "yuli-tutoring-platform.firebaseapp.com",
  projectId: "yuli-tutoring-platform",
  storageBucket: "yuli-tutoring-platform.appspot.com",
  messagingSenderId: "1070288563693",
  appId: "1:1070288563693:web:eaffd3f0a599ef48198be4"
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
let activeSubjectFilter = null;
let countdownInterval = null;
let nextSession = null;
let teachingSubjects = [];
let cachedData = {
  allSessions: null,
  allStudents: null,
  allHomework: null
};

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
    await loadTeachingSubjects();
    startStatsMonitoring();
    await loadDashboardData();
    console.log('✅ Enhanced Dashboard initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing dashboard:', error);
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
  document.getElementById('btnPrepareLesson')?.addEventListener('click', () => 
    window.location.href = '/resources.html'
  );
  document.getElementById('btnAssignHomework')?.addEventListener('click', () => 
    document.getElementById('modalSchedule')?.showModal()
  );
  document.getElementById('btnMessageStudent')?.addEventListener('click', () => 
    window.location.href = '/messages.html'
  );
  document.getElementById('btnScheduleSession')?.addEventListener('click', () => 
    document.getElementById('modalSchedule')?.showModal()
  );
  
  // Notifications
  document.getElementById('markAllReadBtn')?.addEventListener('click', markAllNotificationsRead);
  
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

async function loadTeachingSubjects() {
  try {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data();
    const subjectChips = document.getElementById('subjectChips');
    const noSubjectsBanner = document.getElementById('noSubjectsBanner');
    
    // Debug logging
    const subjectCount = userData.teaching?.subjects?.length || 0;
    const subjectLabels = userData.teaching?.subjects?.map(s => `${s.level} ${s.subject}`).join(', ') || 'none';
    console.log(`[Chips] subjects loaded: ${subjectCount} — ${subjectLabels}`);
    
    if (!userData.teaching?.subjects?.length) {
      if (noSubjectsBanner) noSubjectsBanner.style.display = 'flex';
      if (subjectChips) subjectChips.innerHTML = '';
      console.log('[Chips] active: setup banner shown');
      return;
    }
    
    if (noSubjectsBanner) noSubjectsBanner.style.display = 'none';
    
    // Store teaching subjects globally
    teachingSubjects = userData.teaching.subjects;
    
    // Restore last selected chip from localStorage
    const lastSelectedChip = localStorage.getItem('yuli_selected_subject_chip');
    
    if (subjectChips) {
      renderSubjectChips(lastSelectedChip);
      setupChipEventListeners();
    }
    
    // Debug log active chip
    const activeLabel = lastSelectedChip === 'all' || !lastSelectedChip ? 'All' : 
      teachingSubjects.find(s => `${s.level}_${s.subject}` === lastSelectedChip) ? 
      teachingSubjects.find(s => `${s.level}_${s.subject}` === lastSelectedChip).level + ' ' + 
      teachingSubjects.find(s => `${s.level}_${s.subject}` === lastSelectedChip).subject : 'All';
    console.log(`[Chips] active: ${activeLabel}`);
    
    // Sync global state
    syncGlobalState();
  } catch (error) {
    console.error('Error loading teaching subjects:', error);
  }
}

function renderSubjectChips(selectedChip = null) {
  const subjectChips = document.getElementById('subjectChips');
  if (!subjectChips) return;
  
  // Create chips HTML
  const allChip = `
    <button class="subject-chip" 
            data-subject="all" 
            role="tab" 
            aria-selected="${selectedChip === 'all' || !selectedChip ? 'true' : 'false'}"
            tabindex="${selectedChip === 'all' || !selectedChip ? '0' : '-1'}"
            aria-label="Show all subjects">
      All
    </button>
  `;
  
  const subjectChipsHtml = teachingSubjects.map(subjectObj => {
    const chipKey = `${subjectObj.level}_${subjectObj.subject}`;
    const chipLabel = `${subjectObj.level} ${subjectObj.subject}`;
    const isSelected = selectedChip === chipKey;
    const count = getSubjectCount(subjectObj);
    
    return `
      <button class="subject-chip" 
              data-subject="${chipKey}"
              data-level="${subjectObj.level}"
              data-subject-name="${subjectObj.subject}"
              role="tab" 
              aria-selected="${isSelected ? 'true' : 'false'}"
              tabindex="${isSelected ? '0' : '-1'}"
              aria-label="Filter by ${chipLabel}">
        ${chipLabel}
        ${count > 0 ? `<span class="chip-count">${count}</span>` : ''}
      </button>
    `;
  }).join('');
  
  const clearButton = `
    <button class="clear-filters" 
            aria-label="Clear all filters"
            title="Clear filters">
      <i class="fas fa-times" style="font-size: 10px;"></i>
    </button>
  `;
  
  subjectChips.innerHTML = allChip + subjectChipsHtml + clearButton;
  
  // Set active chip
  if (selectedChip && selectedChip !== 'all') {
    activeSubjectFilter = selectedChip;
    const activeChip = subjectChips.querySelector(`[data-subject="${selectedChip}"]`);
    if (activeChip) {
      activeChip.classList.add('active');
      activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  } else {
    activeSubjectFilter = null;
    const allChipElement = subjectChips.querySelector('[data-subject="all"]');
    if (allChipElement) allChipElement.classList.add('active');
  }
}

function getSubjectCount(subjectObj) {
  if (!tutorStats?.subjects) return 0;
  const subjectKey = `${subjectObj.level}_${subjectObj.subject}`;
  return tutorStats.subjects[subjectKey]?.sessionsToday || 0;
}

function setupChipEventListeners() {
  const subjectChips = document.getElementById('subjectChips');
  if (!subjectChips) return;
  
  // Click handlers
  subjectChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.subject-chip');
    const clearBtn = e.target.closest('.clear-filters');
    
    if (chip) {
      selectSubjectChip(chip.dataset.subject, chip);
    } else if (clearBtn) {
      selectSubjectChip('all');
    }
  });
  
  // Keyboard navigation
  subjectChips.addEventListener('keydown', (e) => {
    const chips = Array.from(subjectChips.querySelectorAll('.subject-chip'));
    const currentIndex = chips.findIndex(chip => chip.tabIndex === 0);
    let newIndex = currentIndex;
    
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : chips.length - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = currentIndex < chips.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (chips[currentIndex]) {
          selectSubjectChip(chips[currentIndex].dataset.subject, chips[currentIndex]);
        }
        return;
      default:
        return;
    }
    
    // Update focus
    chips.forEach((chip, index) => {
      chip.tabIndex = index === newIndex ? 0 : -1;
      if (index === newIndex) {
        chip.focus();
        chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });
  });
}

function selectSubjectChip(subjectKey, chipElement = null) {
  const subjectChips = document.getElementById('subjectChips');
  if (!subjectChips) return;
  
  const allChips = subjectChips.querySelectorAll('.subject-chip');
  
  // Update active state
  allChips.forEach(chip => {
    chip.classList.remove('active');
    chip.setAttribute('aria-selected', 'false');
    chip.tabIndex = -1;
  });
  
  let activeLabel = 'All';
  
  if (subjectKey === 'all') {
    activeSubjectFilter = null;
    const allChip = subjectChips.querySelector('[data-subject="all"]');
    if (allChip) {
      allChip.classList.add('active');
      allChip.setAttribute('aria-selected', 'true');
      allChip.tabIndex = 0;
    }
    localStorage.setItem('yuli_selected_subject_chip', 'all');
    activeLabel = 'All';
  } else {
    activeSubjectFilter = subjectKey;
    const targetChip = chipElement || subjectChips.querySelector(`[data-subject="${subjectKey}"]`);
    if (targetChip) {
      targetChip.classList.add('active');
      targetChip.setAttribute('aria-selected', 'true');
      targetChip.tabIndex = 0;
      targetChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    localStorage.setItem('yuli_selected_subject_chip', subjectKey);
    
    // Get label for debug
    const subject = teachingSubjects.find(s => `${s.level}_${s.subject}` === subjectKey);
    activeLabel = subject ? `${subject.level} ${subject.subject}` : subjectKey;
  }
  
  // Debug log active chip
  console.log(`[Chips] active: ${activeLabel}`);
  
  // Clear cached data to force refresh with new filter
  clearCachedData();
  
  // Sync global state
  syncGlobalState();
  
  // Reload filtered data
  loadDashboardData();
}

function clearCachedData() {
  cachedData.allSessions = null;
  cachedData.allStudents = null;
  cachedData.allHomework = null;
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
        // Update chip counts when stats change
        updateChipCounts();
      }
    },
    (error) => console.error('Error monitoring stats:', error)
  );
}

function updateChipCounts() {
  const subjectChips = document.getElementById('subjectChips');
  if (!subjectChips || !tutorStats?.subjects) return;
  
  teachingSubjects.forEach(subjectObj => {
    const chipKey = `${subjectObj.level}_${subjectObj.subject}`;
    const count = tutorStats.subjects[chipKey]?.sessionsToday || 0;
    const chip = subjectChips.querySelector(`[data-subject="${chipKey}"]`);
    
    if (chip) {
      const existingCount = chip.querySelector('.chip-count');
      if (count > 0) {
        if (existingCount) {
          existingCount.textContent = count;
        } else {
          chip.insertAdjacentHTML('beforeend', `<span class="chip-count">${count}</span>`);
        }
      } else if (existingCount) {
        existingCount.remove();
      }
    }
  });
}

async function loadDashboardData() {
  try {
    await Promise.all([
      loadTodaySessions(),
      loadAssignedStudents(),
      loadHomeworkToGrade(),
      loadNewMessages(),
      loadNotifications(),
      loadResources(),
      loadPinnedStudents()
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
    
    // Load all sessions for today if not cached
    if (!cachedData.allSessions) {
      const q = query(
        collection(db, 'sessions'),
        where('tutorId', '==', currentUser.uid),
        where('startAt', '>=', Timestamp.fromDate(today)),
        where('startAt', '<', Timestamp.fromDate(tomorrow)),
        where('status', '!=', 'cancelled'),
        orderBy('status'),
        orderBy('startAt', 'asc')
      );
      
      const snapshot = await getDocs(q);
      cachedData.allSessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    let filteredSessions = cachedData.allSessions;
    
    // Apply subject filter if active
    if (activeSubjectFilter && activeSubjectFilter !== 'all') {
      const [level, subject] = activeSubjectFilter.split('_');
      filteredSessions = cachedData.allSessions.filter(session => {
        // Match on subject and level if both are stored
        if (session.level && session.subject) {
          return session.level === level && session.subject === subject;
        }
        // Fallback to subject-only matching
        return session.subject === subject;
      });
    }
    
    renderTodaySessions(filteredSessions);
  } catch (error) {
    console.error('Error loading today sessions:', error);
    renderError('todayContent', 'Failed to load today\'s sessions');
  }
}

async function loadAssignedStudents() {
  try {
    // Load all assigned students if not cached
    if (!cachedData.allStudents) {
      const q = query(
        collection(db, 'tutors', currentUser.uid, 'students'),
        where('status', '==', 'active'),
        orderBy('assignedAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      cachedData.allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Enrich with activity for all students
      for (const student of cachedData.allStudents) {
        await enrichStudentWithActivity(student);
      }
    }
    
    let filteredStudents = cachedData.allStudents;
    
    // Apply subject filter if active
    if (activeSubjectFilter && activeSubjectFilter !== 'all') {
      const [level, subject] = activeSubjectFilter.split('_');
      filteredStudents = cachedData.allStudents.filter(student => {
        // Match on subject and level if both are stored
        if (student.level && student.subject) {
          return student.level === level && student.subject === subject;
        }
        // Fallback to subject-only matching
        return student.subject === subject;
      });
    }
    
    renderAssignedStudents(filteredStudents.slice(0, 3));
  } catch (error) {
    console.error('Error loading assigned students:', error);
    renderError('studentsContent', 'Failed to load assigned students');
  }
}

async function enrichStudentWithActivity(student) {
  try {
    // Check for next session
    const nextSessionQuery = query(
      collection(db, 'sessions'),
      where('tutorId', '==', currentUser.uid),
      where('studentId', '==', student.id),
      where('startAt', '>', Timestamp.now()),
      orderBy('startAt', 'asc'),
      limit(1)
    );
    
    const nextSessionSnapshot = await getDocs(nextSessionQuery);
    if (!nextSessionSnapshot.empty) {
      const nextSession = nextSessionSnapshot.docs[0].data();
      student.nextActivity = {
        type: 'session',
        date: nextSession.startAt,
        text: `Next session ${formatDate(nextSession.startAt)}`
      };
      return;
    }
    
    // Check for last message
    const lastMessageQuery = query(
      collection(db, 'message_threads'),
      where('tutorId', '==', currentUser.uid),
      where('studentId', '==', student.id),
      orderBy('lastMessageAt', 'desc'),
      limit(1)
    );
    
    const lastMessageSnapshot = await getDocs(lastMessageQuery);
    if (!lastMessageSnapshot.empty) {
      const lastMessage = lastMessageSnapshot.docs[0].data();
      student.nextActivity = {
        type: 'message',
        date: lastMessage.lastMessageAt,
        text: `Last message ${formatRelativeTime(lastMessage.lastMessageAt)}`
      };
      return;
    }
    
    student.nextActivity = {
      type: 'none',
      text: 'No recent activity'
    };
  } catch (error) {
    console.error('Error enriching student activity:', error);
    student.nextActivity = { type: 'none', text: 'Activity unavailable' };
  }
}

async function loadHomeworkToGrade() {
  try {
    // Load all homework to grade if not cached
    if (!cachedData.allHomework) {
      const q = query(
        collection(db, 'homework'),
        where('tutorId', '==', currentUser.uid),
        where('status', '==', 'to_grade'),
        orderBy('dueAt', 'asc')
      );
      
      const snapshot = await getDocs(q);
      cachedData.allHomework = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    let filteredHomework = cachedData.allHomework;
    
    // Apply subject filter if active
    if (activeSubjectFilter && activeSubjectFilter !== 'all') {
      const [level, subject] = activeSubjectFilter.split('_');
      filteredHomework = cachedData.allHomework.filter(hw => {
        // Check if homework has subject and level fields
        if (!hw.subject) {
          // Log missing fields for backfill (one-time info)
          if (!window.homeworkBackfillLogged) {
            console.info('📝 Some homework docs missing subject/level fields - consider backfilling');
            window.homeworkBackfillLogged = true;
          }
          // Include in "All" results only
          return false;
        }
        
        // Match on subject and level if both are stored
        if (hw.level && hw.subject) {
          return hw.level === level && hw.subject === subject;
        }
        // Fallback to subject-only matching
        return hw.subject === subject;
      });
    }
    
    renderHomeworkToGrade(filteredHomework.slice(0, 3));
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
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const snapshot = await getDocs(q);
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Separate critical alerts from regular notifications
    const criticalAlerts = notifications.filter(n => n.severity === 'critical').slice(0, 5);
    const regularNotifications = notifications.filter(n => n.severity !== 'critical').slice(0, 5);
    const unreadNotifications = regularNotifications.filter(n => !n.readAt);
    
    renderNotifications(regularNotifications);
    renderAlerts(criticalAlerts);
    updateNotificationBadge(unreadNotifications.length);
  } catch (error) {
    console.error('Error loading notifications:', error);
    renderError('notificationsContent', 'Failed to load notifications');
  }
}

async function loadResources() {
  try {
    const q = query(
      collection(db, 'resources'),
      where('tutorId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(3)
    );
    
    const snapshot = await getDocs(q);
    const resources = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderResources(resources);
  } catch (error) {
    console.error('Error loading resources:', error);
    renderError('resourcesContent', 'Failed to load resources');
  }
}

async function loadPinnedStudents() {
  try {
    const q = query(
      collection(db, 'tutors', currentUser.uid, 'students'),
      where('pinned', '==', true),
      orderBy('pinnedOrder', 'asc'),
      limit(3)
    );
    
    const snapshot = await getDocs(q);
    const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPinnedStudents(students);
  } catch (error) {
    console.error('Error loading pinned students:', error);
    renderError('pinnedStudentsContent', 'Failed to load pinned students');
  }
}

// Note: Utility functions will be loaded via separate script tags

// Export global variables for other modules
window.currentUser = null;
window.tutorStats = null;
window.nextSession = null;
window.activeSubjectFilter = null;
window.countdownInterval = null;
window.teachingSubjects = [];
window.cachedData = {
  allSessions: null,
  allStudents: null,
  allHomework: null
};

// Export Firebase instances
window.auth = auth;
window.db = db;
window.functions = functions;

// Export Firebase functions for global access
window.doc = doc;
window.getDoc = getDoc;
window.getDocs = getDocs;
window.setDoc = setDoc;
window.addDoc = addDoc;
window.updateDoc = updateDoc;
window.collection = collection;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.limit = limit;
window.onSnapshot = onSnapshot;
window.serverTimestamp = serverTimestamp;
window.Timestamp = Timestamp;
window.signOut = signOut;
window.httpsCallable = httpsCallable;
window.arrayUnion = arrayUnion;

// Export main functions for global access
window.loadDashboardData = loadDashboardData;
window.loadTodaySessions = loadTodaySessions;
window.loadAssignedStudents = loadAssignedStudents;
window.loadHomeworkToGrade = loadHomeworkToGrade;
window.loadNewMessages = loadNewMessages;
window.loadNotifications = loadNotifications;
window.loadResources = loadResources;
window.loadPinnedStudents = loadPinnedStudents;
window.updateUpNext = updateUpNext;

// Update global state when user changes
onAuthStateChanged(auth, (user) => {
  window.currentUser = user;
});

// Update global stats when they change
function updateGlobalStats(stats) {
  window.tutorStats = stats;
  updateStatsDisplay();
}

// Update global state when local variables change
function syncGlobalState() {
  window.currentUser = currentUser;
  window.tutorStats = tutorStats;
  window.nextSession = nextSession;
  window.activeSubjectFilter = activeSubjectFilter;
  window.teachingSubjects = teachingSubjects;
  window.cachedData = cachedData;
}
