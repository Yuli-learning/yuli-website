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

// Show boot verification banner
window.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('bootBanner');
  if (banner) {
    banner.style.display = 'block';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 5000);
  }
});

// Initialize dashboard
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log('🔄 Redirecting non-authenticated user to signin');
    window.location.href = '/signin.html';
    return;
  }
  
  currentUser = user;
  
  // Verify user is a tutor
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists() || userDoc.data().role !== 'tutor') {
    console.log('🔄 Redirecting non-tutor user to profile page');
    window.location.href = '/profile.html';
    return;
  }
  
  console.log('✅ New Tutor Dashboard boot successful for user:', user.uid);
  initializeDashboard();
});

async function initializeDashboard() {
  try {
    setupEventListeners();
    startStatsMonitoring();
    await loadDashboardData();
    await checkTeachingPreferences();
    console.log('✅ Dashboard initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing dashboard:', error);
    showError('Failed to load dashboard');
  }
}

// Quick reply helper for message threads
async function sendThreadMessage(threadId, body, asSms=false){
  const user = auth.currentUser;
  if (!user) return;
  try {
    // write message
    await addDoc(collection(db, "message_threads", threadId, "messages"), {
      senderId: user.uid,
      kind: asSms ? 'sms' : 'text',
      body,
      createdAt: serverTimestamp(),
      readBy: [user.uid]
    });
    // update thread meta
    await updateDoc(doc(db, "message_threads", threadId), {
      lastMessageAt: serverTimestamp()
    });
    // optional SMS via callable
    if (asSms) {
      try {
        const call = httpsCallable(functions, 'sendSms');
        await call({ threadId, message: body });
      } catch (e) {
        console.warn('SMS stub failed or not configured', e);
      }
    }
  } catch (e) {
    console.error('Quick reply failed', e);
    showError('Failed to send reply');
  }
}

// Initialize dashboard when user is authenticated
onAuthStateChanged(auth, async (user) => {
  if (!user) { 
    location.href = "/index.html"; 
    return; 
  }

  // Check if user is a tutor
  const udoc = await getDoc(doc(db, "users", user.uid));
  if (!udoc.exists() || udoc.data().role !== "tutor") { 
    location.href="/index.html"; 
    return; 
  }
  
  initUI();
  startRealtime(user.uid);
  loadLists(user.uid);
});

function initUI(){
  // Modal triggers
  $("#btn-schedule").onclick = () => $("#modal-schedule").showModal();
  $("#btn-assign").onclick   = () => $("#modal-homework").showModal();
  $("#btn-message").onclick  = () => $("#modal-message").showModal();
  $("#btn-add-session").onclick = () => $("#modal-schedule").showModal();

  // Submit handlers
  $("#form-schedule").onsubmit = async (e) => {
    e.preventDefault();
    if (e.submitter?.value === "confirm") await createSession();
  };
  
  $("#form-homework").onsubmit = async (e) => {
    e.preventDefault();
    if (e.submitter?.value === "confirm") await assignHomework();
  };
  
  $("#form-message").onsubmit = async (e) => {
    e.preventDefault();
    if (e.submitter?.value === "confirm") await sendMessage();
  };

  // Other action buttons
  $("#btn-mark-read").onclick = markAllNotificationsRead;
  $("#btn-open-homework").onclick = () => window.location.href = "/profile.html";
  $("#btn-open-messages").onclick = () => window.location.href = "/messages.html";
  $("#btn-prepare").onclick = () => window.location.href = "/profile.html";
  $("#btn-add-student").onclick = () => window.location.href = "/profile.html";
  $("#btn-upload-resource").onclick = () => window.location.href = "/profile.html";

  // Student search
  $("#student-search").oninput = (e) => {
    const query = e.target.value.toLowerCase();
    const rows = $("#student-list").querySelectorAll('.list-row');
    rows.forEach(row => {
      const name = row.querySelector('strong')?.textContent.toLowerCase() || '';
      row.style.display = name.includes(query) ? '' : 'none';
    });
  };
}

let countdownInterval = null;
function startRealtime(tutorId){
  try {
    // Live counts and hero derive from tutor_stats
    onSnapshot(doc(db, "tutor_stats", tutorId), async (snap) => {
      const stats = snap.data() || {};
      // Earnings
      renderEarnings(stats);
      
      // Alerts badge: keep card visible if any critical
      // handled via list query below
      
      // Up next from stats.nextSessionId for accuracy
      if (stats.nextSessionId) {
        const sdoc = await getDoc(doc(db, "sessions", stats.nextSessionId));
        if (sdoc.exists()) {
          renderNext(sdoc.id, sdoc.data());
          // setup countdown
          setupCountdown(sdoc.data());
        } else {
          renderNext(null, null);
        }
      } else {
        renderNext(null, null);
      }
    });

  } catch (error) {
    console.error("Error starting realtime:", error);
    showError("Failed to start realtime updates");
  }
}

function setupCountdown(session){
  if (countdownInterval) clearInterval(countdownInterval);
  if (!session?.startAt) return;
  const target = session.startAt.toDate().getTime();
  const el = document.querySelector('#card-next .card-title');
  countdownInterval = setInterval(()=>{
    const delta = target - Date.now();
    if (delta <= 0) { clearInterval(countdownInterval); return; }
    const m = Math.floor(delta/60000), s = Math.floor((delta%60000)/1000);
    if (el) el.textContent = `⏱ Next Session · ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);
}

async function loadLists(tutorId){
  try {
    const now = Timestamp.now();
    
    // Today's schedule
    const todayStart = new Date(); 
    todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(); 
    todayEnd.setHours(23,59,59,999);
    
    const todayQ = query(
      collection(db,"sessions"),
      where("tutorId","==",tutorId),
      where("startAt",">=", Timestamp.fromDate(todayStart)),
      where("startAt","<=", Timestamp.fromDate(todayEnd)),
      orderBy("startAt","asc"), 
      limit(5)
    );
    const todayDocs = await getDocs(todayQ);
    renderToday(todayDocs.docs.map(d=>({id:d.id,...d.data()})));

    // Load homework to grade
    const hwQ = query(
      collection(db,"homework"),
      where("tutorId","==",tutorId),
      where("status","==","to_grade"),
      orderBy("dueAt","asc"),
      limit(3)
    );
    const hwDocs = await getDocs(hwQ);
    renderGrade(hwDocs.docs.map(d=>({id:d.id,...d.data()})));

    // Load unread message threads
    const thrQ = query(
      collection(db,"message_threads"),
      where("tutorId","==",tutorId),
      orderBy("lastMessageAt","desc"),
      limit(3)
    );
    const thrDocs = await getDocs(thrQ);
    renderMessages(thrDocs.docs.map(d=>({id:d.id,...d.data()})));

    // Load alerts (critical only)
    const alertQ = query(
      collection(db,"notifications"),
      where("tutorId","==",tutorId),
      orderBy("createdAt","desc"), 
      limit(10)
    );
    const alertDocs = await getDocs(alertQ);
    const critical = alertDocs.docs.map(d=>({id:d.id,...d.data()})).filter(n=>n.severity==='critical').slice(0,5);
    renderAlerts(critical);

    // Load students
    const stuQ = query(
      collection(db,"students"), 
      where("tutorId","==",tutorId), 
      orderBy("pinned","desc"),
      orderBy("name","asc"), 
      limit(3)
    );
    const stuDocs = await getDocs(stuQ);
    renderStudents(stuDocs.docs.map(d=>({id:d.id,...d.data()})));

    // Load resources
    const resQ = query(
      collection(db,"resources"), 
      where("tutorId","==",tutorId), 
      orderBy("createdAt","desc"), 
      limit(3)
    );
    const resDocs = await getDocs(resQ);
    renderResources(resDocs.docs.map(d=>({id:d.id,...d.data()})));

    // Load notifications
    const notifQ = query(
      collection(db,"notifications"),
      where("tutorId","==",tutorId),
      where("readAt","==",null),
      orderBy("createdAt","desc"),
      limit(5)
    );
    const notifDocs = await getDocs(notifQ);
    renderNotifications(notifDocs.docs.map(d=>({id:d.id,...d.data()})));

  } catch (error) {
    console.error("Error loading dashboard lists:", error);
    showError("Failed to load dashboard data");
  }
}

// Formatting helper
function fmt(dt){
  const d = dt.toDate ? dt.toDate() : dt; 
  return new Intl.DateTimeFormat(undefined,{dateStyle:'medium', timeStyle:'short'}).format(d);
}

function renderNext(id, data){
  const el = $("#next-body");
  if (!id){ 
    el.innerHTML = `<div class="empty-state">
      <h3>No upcoming sessions</h3>
      <p>Schedule your next session to get started</p>
    </div>`; 
    $("#btn-start-call").disabled = true; 
    return; 
  }
  
  el.innerHTML = `
    <div class="list-row">
      <div>
        <strong>${data.subject||'Session'}</strong>
        <div class="card-sub">${fmt(data.startAt)} – ${fmt(data.endAt)}</div>
      </div>
      <div>
        <span class="card-sub">Student:</span> 
        <strong>${data.studentName||data.studentId}</strong>
      </div>
    </div>`;
  
  // Enable Start Call button within join window (5 min before to 15 min after)
  const now = Date.now();
  const start = data.startAt.toDate().getTime();
  const end = data.endAt.toDate().getTime();
  const canJoin = now >= (start - 5*60*1000) && now <= (end + 15*60*1000);
  
  const btn = $("#btn-start-call");
  btn.disabled = !canJoin;
  btn.onclick = () => startVideo(id);
}

function renderToday(rows){
  const list = $("#today-list");
  if (!rows.length){ 
    list.innerHTML = `<div class="empty-state">
      <h3>No sessions today</h3>
      <p>Your schedule is clear</p>
    </div>`; 
    return; 
  }
  
  list.innerHTML = rows.map(s=>`
    <div class="list-row">
      <div>
        <strong>${s.subject||'Session'}</strong>
        <div class="card-sub">${fmt(s.startAt)}</div>
      </div>
      <button class="btn btn-primary" ${joinDisabled(s)} title="${joinTitle(s)}" onclick="startVideo('${s.id}')">Join</button>
    </div>`).join('');
}

function joinDisabled(s){
  const now = Date.now();
  const start = s.startAt.toDate().getTime();
  const end = s.endAt.toDate().getTime();
  return (now < start-5*60*1000 || now > end+15*60*1000) ? 'disabled' : '';
}

function joinTitle(s){
  const now = Date.now();
  const start = s.startAt.toDate().getTime();
  const end = s.endAt.toDate().getTime();
  const locked = now < start-5*60*1000 || now > end+15*60*1000;
  return locked ? 'Unlocks 5 min before start' : 'Join video call';
}

function renderGrade(rows){
  const list = $("#grade-list");
  list.innerHTML = rows.length ? rows.map(h=>`
    <div class="list-row">
      <div>
        <strong>${h.title}</strong>
        <div class="card-sub">Due ${fmt(h.dueAt)}</div>
      </div>
      <button class="btn">Grade</button>
    </div>`).join('') : `<div class="empty-state">
    <h3>No homework pending</h3>
    <p>All caught up!</p>
  </div>`;
}

function renderMessages(rows){
  const list = $("#message-list");
  list.innerHTML = rows.length ? rows.map(t=>`
    <div class="list-row">
      <div style="flex:1;">
        <strong>${t.studentName||t.studentId}</strong>
        <div class="card-sub">Updated ${fmt(t.lastMessageAt)}</div>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <input data-thread="${t.id}" class="quick-reply" placeholder="Quick reply..." style="flex:1; padding:6px 8px; border:1px solid #e8ecf3; border-radius:8px;">
          <button class="btn" data-send="${t.id}">Send</button>
        </div>
      </div>
    </div>`).join('') : `<div class="empty-state">
    <h3>No new messages</h3>
    <p>Your inbox is clear</p>
  </div>`;

  // attach quick reply handlers
  list.querySelectorAll('button[data-send]').forEach(btn=>{
    btn.onclick = async () => {
      const threadId = btn.getAttribute('data-send');
      const input = list.querySelector(`input[data-thread="${threadId}"]`);
      if (!input?.value) return;
      await sendThreadMessage(threadId, input.value, /*asSms*/ false);
      input.value = '';
    };
  });
}

function renderAlerts(rows){
  const list = $("#alert-list");
  list.innerHTML = rows.length ? rows.map(a=>`
    <div class="list-row">
      <div>${a.message}</div>
      <span class="card-sub">${a.severity||'info'}</span>
    </div>`).join('') : `<div class="empty-state">
    <h3>No alerts</h3>
    <p>Everything looks good</p>
  </div>`;
}

function renderStudents(rows){
  const list = $("#student-list");
  list.innerHTML = rows.length ? rows.map(s=>`
    <div class="list-row">
      <div>
        <strong>${s.name}</strong>
        <div class="card-sub">${s.email||s.phone||''}</div>
      </div>
      <button class="btn">View</button>
    </div>`).join('') : `<div class="empty-state">
    <h3>No students assigned yet</h3>
    <p>Students will appear here when assigned to you</p>
  </div>`;
  
  // Populate select inputs in modals
  const selects = ["#sched-student","#hw-student","#msg-student"].map($);
  selects.forEach(sel => {
    if (sel) {
      sel.innerHTML = '<option value="">Select a student...</option>' + 
        rows.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    }
  });
}

function renderResources(rows){
  const list = $("#resource-list");
  list.innerHTML = rows.length ? rows.map(r=>`
    <div class="list-row">
      <div>
        <strong>${r.name}</strong>
        <div class="card-sub">${fmt(r.createdAt)}</div>
      </div>
      <a class="btn" href="${r.url}" target="_blank" rel="noopener">Open</a>
    </div>`).join('') : `<div class="empty-state">
    <h3>No resources uploaded yet</h3>
    <p>Upload teaching materials and resources</p>
  </div>`;
}

function renderEarnings(stats={}){
  const kpi = $("#earnings-kpi");
  const sub = $("#earnings-sub");
  const mtd = typeof stats.earningsMTD === 'number' ? stats.earningsMTD : null;
  const last = stats.lastPayout;
  kpi.textContent = mtd != null ? `£${mtd.toFixed(2)}` : '—';
  sub.textContent = last?.paidAt ? `MTD • Last payout £${(last.amount||0).toFixed?.(2) || last.amount} on ${fmt(last.paidAt)}` : 'Month-to-date';
}

function renderNotifications(rows){
  const list = $("#notif-list");
  list.innerHTML = rows.length ? rows.map(n=>`
    <div class="list-row">
      <div>
        <strong>${n.message}</strong>
        <div class="card-sub">${fmt(n.createdAt)}</div>
      </div>
      <span class="card-sub">${n.severity||'info'}</span>
    </div>`).join('') : `<div class="empty-state">
    <h3>No notifications</h3>
    <p>You're all caught up</p>
  </div>`;
}

// Action functions
async function createSession(){
  const user = auth.currentUser; 
  if (!user) return;
  
  const studentId = $("#sched-student").value;
  const studentName = $("#sched-student").selectedOptions[0]?.textContent || "";
  
  if (!studentId) {
    alert("Please select a student");
    return;
  }
  
  try {
    const data = {
      tutorId: user.uid, 
      studentId, 
      studentName,
      subject: $("#sched-subject").value,
      startAt: Timestamp.fromDate(new Date($("#sched-start").value)),
      endAt: Timestamp.fromDate(new Date($("#sched-end").value)),
      status: "scheduled", 
      createdAt: serverTimestamp()
    };
    
    await addDoc(collection(db,"sessions"), data);
    $("#modal-schedule").close();
    
    // Clear form
    $("#form-schedule").reset();
    
    // Reload lists quickly
    loadLists(user.uid);
    showSuccess("Session scheduled successfully!");
    
  } catch (error) {
    console.error("Error creating session:", error);
    showError("Failed to schedule session");
  }
}

async function assignHomework(){
  const user = auth.currentUser; 
  if (!user) return;
  
  const studentId = $("#hw-student").value;
  if (!studentId) {
    alert("Please select a student");
    return;
  }
  
  try {
    const data = {
      tutorId: user.uid, 
      studentId,
      title: $("#hw-title").value, 
      description: $("#hw-desc").value,
      dueAt: Timestamp.fromDate(new Date($("#hw-due").value)),
      status: "assigned", 
      createdAt: serverTimestamp()
    };
    
    await addDoc(collection(db,"homework"), data);
    $("#modal-homework").close();
    
    // Clear form
    $("#form-homework").reset();
    
    // Reload lists
    loadLists(user.uid);
    showSuccess("Homework assigned successfully!");
    
  } catch (error) {
    console.error("Error assigning homework:", error);
    showError("Failed to assign homework");
  }
}

async function sendMessage(){
  const user = auth.currentUser; 
  if (!user) return;
  
  const studentId = $("#msg-student").value;
  if (!studentId) {
    alert("Please select a student");
    return;
  }
  
  try {
    // Ensure thread exists and add message
    const threadId = `${user.uid}_${studentId}`;
    await setDoc(doc(db, "message_threads", threadId), {
      tutorId: user.uid,
      studentId,
      studentName: $("#msg-student").selectedOptions[0]?.textContent || "",
      lastMessageAt: serverTimestamp(),
      [`unreadBy.${studentId}`]: 1
    }, { merge: true });

    await addDoc(collection(db, "message_threads", threadId, "messages"), {
      senderId: user.uid, 
      kind: 'text',
      body: $("#msg-body").value, 
      createdAt: serverTimestamp(), 
      readBy: [user.uid]
    });

    // Optional SMS via callable
    const sendSMS = $("#msg-sms").checked;
    if (sendSMS) {
      try {
        const call = httpsCallable(fns, 'sendSms');
        await call({ to: null, message: $("#msg-body").value, studentId, threadId });
      } catch (e) {
        console.warn('SMS stub failed or not configured', e);
      }
    }
    
    $("#modal-message").close();
    
    // Clear form
    $("#form-message").reset();
    
    // Reload lists
    loadLists(user.uid);
    showSuccess("Message sent successfully!");
    
  } catch (error) {
    console.error("Error sending message:", error);
    showError("Failed to send message");
  }
}

async function markAllNotificationsRead(){
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const notifQ = query(
      collection(db,"notifications"),
      where("tutorId","==",user.uid),
      where("readAt","==",null)
    );
    const notifDocs = await getDocs(notifQ);
    
    const promises = notifDocs.docs.map(doc => 
      updateDoc(doc.ref, { readAt: serverTimestamp() })
    );
    
    await Promise.all(promises);
    loadLists(user.uid);
    showSuccess("All notifications marked as read");
    
  } catch (error) {
    console.error("Error marking notifications read:", error);
    showError("Failed to mark notifications as read");
  }
}

// LiveKit video integration via callable
async function startVideo(sessionId){
  try {
    // Dev debug log (no secrets)
    console.log('[video] requesting token via callable for session', sessionId);

    const call = httpsCallable(fns, 'videoToken');
    const resp = await call({ sessionId });
    const { token, url } = resp.data || {};
    if (!token || !url) throw new Error('Missing token or URL');

    console.log('[video] received token (first 8):', String(token).slice(0,8));
    
    // Open video call in new window
    const roomWin = window.open(
      `/pages/video.html?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`,
      '_blank',
      'width=1200,height=800'
    );
    
    if (!roomWin) {
      alert("Please allow popups to join the video call.");
    }
    
  } catch (error) {
    console.error("Error starting video call:", error);
    const msg = (error.code === 'functions/permission-denied') ? "You're not part of this session." : (error.message || 'Unable to start video call.');
    showError(msg);
  }
}

// Utility functions
function showSuccess(message) {
  // Simple success notification - could be enhanced with a proper toast system
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 1000;
    background: var(--success); color: white; padding: 12px 20px;
    border-radius: 8px; box-shadow: var(--shadow-md);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function showError(message) {
  // Simple error notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 1000;
    background: var(--danger); color: white; padding: 12px 20px;
    border-radius: 8px; box-shadow: var(--shadow-md);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 5000);
}
