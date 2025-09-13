// /js/messages.js — drop-in working version

import {
  db, auth,
  collection, doc, query,
  where, orderBy, onSnapshot,
  getDocs, addDoc, setDoc,
  serverTimestamp
} from "./firebaseClient.js";
import { bootAuth } from "./authBoot.js";

// ------------ UI elements ------------
const peopleModal   = document.getElementById("peopleModal");
const closePeople   = document.getElementById("closePeopleModal");
const newChatBtn    = document.getElementById("newChatBtn");
const peopleList    = document.getElementById("peopleList");
const roleFilter    = document.getElementById("roleFilter");
const peopleSearch  = document.getElementById("peopleSearch");

// temp viewer & send bar (added in messages.html)
const threadBox     = document.getElementById("messageThread");
const inputEl       = document.getElementById("chatInput");
const sendBtn       = document.getElementById("chatSendBtn");

// Reusable confirm modal elements (from messages.html)
const _confirmModal = document.getElementById('confirmModal');
const _confirmText  = document.getElementById('confirmText');
const _confirmYes   = document.getElementById('confirmYes');
const _confirmNo    = document.getElementById('confirmNo');

async function confirmDialog(text = 'Are you sure?') {
  if (!_confirmModal || !_confirmText || !_confirmYes || !_confirmNo) {
    // Fallback to native confirm if modal is not present
    return Promise.resolve(window.confirm(text));
  }
  // Close any open message menus behind the modal
  try { document.querySelectorAll('.msg-wrap.menu-open').forEach(w => w.classList.remove('menu-open')); } catch (_) {}
  _confirmText.textContent = text;
  // Lock background scroll
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  _confirmModal.style.display = 'flex';
  return new Promise((resolve) => {
    const cleanup = () => {
      _confirmModal.style.display = 'none';
      // Restore scroll
      document.body.style.overflow = prevOverflow || '';
      _confirmYes.removeEventListener('click', onYes);
      _confirmNo.removeEventListener('click', onNo);
      _confirmModal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
    };
    const onYes = () => { cleanup(); resolve(true); };
    const onNo  = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => { if (e.target === _confirmModal) { onNo(); } };
    const onKey = (e) => { if (e.key === 'Escape') { onNo(); } };
    _confirmYes.addEventListener('click', onYes);
    _confirmNo.addEventListener('click', onNo);
    _confirmModal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    // set focus to Cancel for safety
    setTimeout(() => { try { _confirmNo.focus(); } catch (_) {} }, 0);
  });
}

let me = null;
let allProfiles = [];
const profileCache = new Map(); // uid -> {displayName, photoUrl, email, role}

// Add a delete conversation button next to the send box (once)
function ensureDeleteConversationButton() {
  const bar = document.getElementById('simpleSendBar');
  if (!bar) return;
  // If profile panel already renders actions, skip adding button here
  if (document.getElementById('profileActions')) return;
  if (document.getElementById('deleteConvoBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'deleteConvoBtn';
  btn.textContent = 'Delete conversation';
  btn.style.cssText = 'padding:10px 14px;border:1px solid #fca5a5;border-radius:10px;color:#b91c1c;background:#ffe4e6;cursor:pointer;';
  bar.insertBefore(btn, bar.firstChild);
  btn.addEventListener('click', async () => {
    const convoId = window._currentConvoId;
    if (!convoId) return;
    const ok = await confirmDialog('Delete entire conversation? All messages will be permanently removed.');
    if (!ok) return;
    try {
      const { collection, getDocs, deleteDoc, doc } = await import('./firebaseClient.js');
      // Delete all messages in batches
      const msgsSnap = await getDocs(collection(db, 'conversations', convoId, 'messages'));
      const deletions = msgsSnap.docs.map(d => (async () => {
        try { await deleteDoc(doc(db, 'conversations', convoId, 'messages', d.id)); }
        catch(e){ /* ignore individual permission errors */ }
      })());
      await Promise.allSettled(deletions);
      // Try to delete conversation doc
      try {
        await deleteDoc(doc(db, 'conversations', convoId));
      } catch (eDel) {
        // If denied by rules, leave the conversation instead (remove self from members)
        try {
          const { updateDoc, arrayRemove, serverTimestamp } = await import('./firebaseClient.js');
          const myUid = auth.currentUser?.uid;
          await updateDoc(doc(db, 'conversations', convoId), {
            members: arrayRemove(myUid),
            lastMessage: 'Left conversation',
            updatedAt: serverTimestamp(),
          });
        } catch (_) { /* ignore */ }
      }
      // Reset UI and remove from sidebar
      removeConvoFromUI(convoId);
    } catch (err) {
      console.error('Failed to delete conversation', err);
      // Even if backend threw, clear UI optimistically; snapshot will correct if needed
      removeConvoFromUI(convoId);
    }
  });
}
window._currentConvoId = null;
window._unsubMsgs = null;
window._unsubConvoMeta = null;
window._unsubConvos = null;
window._conversations = [];
window._convoMeta = {}; // convoId -> doc data (includes lastRead)

// Remove a conversation from local UI immediately
function removeConvoFromUI(convoId){
  try {
    // Unsubscribe listeners
    if (window._unsubMsgs) { try{ window._unsubMsgs(); }catch(_){} window._unsubMsgs = null; }
    if (window._unsubConvoMeta) { try{ window._unsubConvoMeta(); }catch(_){} window._unsubConvoMeta = null; }
    // Clear current selection and thread
    if (window._currentConvoId === convoId) window._currentConvoId = null;
    if (threadBox) threadBox.innerHTML = '';
    // Drop from cached list and re-render sidebar
    window._conversations = (window._conversations || []).filter(c => c.id !== convoId);
    renderConversationsList(window._conversations);
    // Clear profile panel if it was for this convo
    try {
      const profileView = document.getElementById('profileView');
      if (profileView) profileView.innerHTML = '';
    } catch(_){}
  } catch(_){}
}

// ------------ boot ------------
bootAuth(async (user) => {
  me = user;

  // wire UI once we know who we are
  wirePeoplePicker();
  wireSendBox();
  wireSidebarTabs();
  wireProfileOpeners();

  // start left-panel listener if your app exposes one
  if (typeof window.startConversationsListener === "function") {
    window.startConversationsListener();
  } else {
    // fallback: basic listener so DMs appear in the left list if your code expects it
    startBasicConversationsListener();
  }
});

// ------------ helpers ------------
function ensureRoleOptions() {
  if (!roleFilter) return;
  const have = new Set(Array.from(roleFilter.options).map(o => o.value));
  const need = ["all","student","tutor","parent","admin"];
  const labels = { all:"All", student:"Students", tutor:"Tutors", parent:"Parents", admin:"Admins" };
  need.forEach(v => {
    if (!have.has(v)) {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = labels[v] || v;
      roleFilter.appendChild(opt);
    }
  });
  roleFilter.value = "all";
}
ensureRoleOptions();

function normalizeRole(r) {
  // Keep roles distinct so users can filter by Student or Parent separately
  return (r || "").toLowerCase(); // student | parent | tutor | admin | (empty)
}

function pairKeyFor(a,b){ return [a,b].sort().join("_"); }
function convoIdFor(a,b){ return "dm_" + pairKeyFor(a,b); }

function openModal(){ if (peopleModal) peopleModal.style.display = "flex"; }
function closeModal(){ if (peopleModal) peopleModal.style.display = "none"; }

// --- Read receipts: update my lastRead timestamp for the current conversation
async function updateMyLastRead(convoId){
  try {
    const uid = auth.currentUser?.uid;
    if (!uid || !convoId) return;
    const ref = doc(db, 'conversations', convoId);
    // dynamic field path: lastRead.<uid>
    await setDoc(ref, { lastRead: { [uid]: serverTimestamp() } }, { merge: true });
  } catch(_) { /* ignore best-effort */ }
}

// ------------ people picker ------------
function wirePeoplePicker() {
  newChatBtn?.addEventListener("click", async () => {
    await loadProfiles();
    openModal();
  });
  closePeople?.addEventListener("click", closeModal);
  roleFilter?.addEventListener("change", renderPeople);
  peopleSearch?.addEventListener("input", renderPeople);
}

async function loadProfiles() {
  const q = query(collection(db, "profiles"));
  const snap = await getDocs(q);
  allProfiles = [];
  snap.forEach(d => {
    // include everyone (including me); we'll hide self in render unless Admin tab
    allProfiles.push({ uid: d.id, ...d.data() });
  });
  renderPeople();
}

function renderPeople() {
  const role = roleFilter?.value || "all";
  const term = (peopleSearch?.value ?? "").toLowerCase();
  const myUid = auth.currentUser?.uid || "";
  const includeSelf = role === "admin"; // ONLY show yourself in the Admins tab

  const rows = allProfiles
    .filter(p => includeSelf ? true : p.uid !== myUid)
    .filter(p => role === "all" ? true : normalizeRole(p.role) === role)
    .filter(p => ((`${p.displayName ?? ""} ${p.email ?? ""}`).toLowerCase().includes(term)))
    .map(p => personRow(p))
    .join("");

  peopleList.innerHTML = rows || `<div style="padding:12px;">No people found.</div>`;

  peopleList.querySelectorAll(".personRow").forEach(el => {
    el.addEventListener("click", async () => {
      const otherUid = el.getAttribute("data-uid");
      if (otherUid === myUid) { alert("That’s you 🙂"); return; }
      const convoId = await openOrCreateDM_NoQuery(otherUid);
      afterConversationReady(convoId);
      closeModal();
    });
  });
}

function personRow(p) {
  const myUid = auth.currentUser?.uid || "";
  const isSelf = p.uid === myUid;
  const url = p.photoURL || p.photoUrl || "";
  const avatar = url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.displayName || "User")}`;
  const role = normalizeRole(p.role) || "—";
  const email = p.email || "";
  return `
    <div class="personRow" data-uid="${p.uid}"
         style="display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid #f1f1f1;cursor:pointer;">
      <img src="${avatar}" width="36" height="36" style="border-radius:50%;object-fit:cover;">
      <div style="display:flex;flex-direction:column;">
        <strong>${p.displayName || "(no name)"}${isSelf ? " (you)" : ""}</strong>
        <small>${role} • ${email}</small>
      </div>
    </div>`;
}

// ------------ DM create/open (no querying conversations) ------------
async function openOrCreateDM_NoQuery(otherUid) {
  const myUid = auth.currentUser?.uid;
  if (!myUid) throw new Error("Not signed in");

  const id = convoIdFor(myUid, otherUid);
  const ref = doc(db, "conversations", id);

  // Avoid duplicates: if it exists, return without adding a starter message
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // ensure members/pairKey are consistent (merge minimal data)
    await setDoc(ref, {
      type: "dm",
      pairKey: pairKeyFor(myUid, otherUid),
      members: [myUid, otherUid],
      archived: false,
    }, { merge: true });
    return id;
  }

  // Create new DM with initial starter message
  await setDoc(ref, {
    type: "dm",
    pairKey: pairKeyFor(myUid, otherUid),
    members: [myUid, otherUid],
    archived: false,
    name: "",
    photoUrl: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessage: "Started a conversation"
  }, { merge: true });

  await addDoc(collection(db, "conversations", id, "messages"), {
    senderId: myUid,
    text: "Started a conversation",
    createdAt: serverTimestamp()
  });

  await setDoc(ref, {
    updatedAt: serverTimestamp(),
    lastMessageAt: serverTimestamp()
  }, { merge: true });

  return id;
}

// ----------- After DM ready: open it -----------
function afterConversationReady(convoId) {
  // Always set the current convo id so the send box can work
  window._currentConvoId = convoId;

  // If the host page exposes its own opener, call it (e.g., to update a custom left list)
  if (typeof window.openConversation === "function") {
    try { window.openConversation(convoId); } catch (_) { /* ignore */ }
  }

  // Always ensure our own viewer gets wired so you can actually chat immediately
  openConversation(convoId);
  // Also populate profile panel for the other participant
  populateProfilePanelForConvo(convoId);
}

// ----------- Live open a conversation -----------
function highlightConversationInList(convoId) {
  document.querySelectorAll("[data-convo-id]")
    .forEach(el => el.classList.toggle("active", el.getAttribute("data-convo-id") === convoId));
}

function openConversation(convoId) {
  window._currentConvoId = convoId;
  highlightConversationInList(convoId);

  if (window._unsubMsgs) window._unsubMsgs();
  if (window._unsubConvoMeta) { try { window._unsubConvoMeta(); } catch(_){} }
  const msgsQ = query(
    collection(db, "conversations", convoId, "messages"),
    orderBy("createdAt", "asc")
  );
  window._unsubMsgs = onSnapshot(msgsQ, (snap) => {
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages(convoId, messages);
    // mark as read whenever we receive messages while viewing
    updateMyLastRead(convoId);
  });

  // Subscribe to conversation meta (to get lastRead, lastMessageAt, etc.)
  const cref = doc(db, 'conversations', convoId);
  window._unsubConvoMeta = onSnapshot(cref, (snap) => {
    if (snap.exists()) {
      window._convoMeta[convoId] = { id: snap.id, ...snap.data() };
      // re-render to update ticks/last active if needed
      // We don't have messages here; renderMessages will be called on msgs snapshot.
      // But we can still refresh the ticks by triggering a minimal pass if threadBox exists
      try {
        const lastMsgs = Array.from(threadBox?.querySelectorAll('.msg-row') || []).length;
        if (lastMsgs) { /* no-op: next msgs snapshot will adjust; keep cheap */ }
      } catch(_){}
    }
  });

  // Immediately set my lastRead on open
  updateMyLastRead(convoId);
}
window.openConversation = openConversation;

function renderMessages(convoId, messages) {
  if (!threadBox) return;
  const myUid = auth.currentUser?.uid;
  const meta = window._convoMeta[convoId] || {};
  const conv = (window._conversations || []).find(c => c.id === convoId) || meta;
  const otherUid = (conv.members || []).find(u => u !== myUid);
  const otherLastRead = otherUid && meta.lastRead ? meta.lastRead[otherUid] : null;
  const toMillis = (t) => t ? (t.toMillis ? t.toMillis() : (typeof t === 'number' ? t : 0)) : 0;
  threadBox.innerHTML = messages.map(m => {
    const mine = m.senderId === myUid;
    const isDeleted = !!m.deletedAt || m.text === 'Message deleted';
    const seen = mine && otherLastRead && toMillis(m.createdAt) <= toMillis(otherLastRead);
    return `
      <div class="msg-row" data-msg-id="${m.id}" style="display:flex;padding:6px 10px;${mine ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}">
        <div class="msg-wrap ${isDeleted ? '' : ''}" style="position:relative;max-width:70%;${mine ? 'padding-right:34px;' : ''}">
          <div class="msg-bubble" style="display:inline-block;border:1px solid #eee;border-radius:12px;padding:8px 12px;background:${isDeleted ? '#f8fafc' : (mine ? '#eff6ff' : '#ffffff')};color:${isDeleted ? '#94a3b8' : '#0f172a'};font-style:${isDeleted ? 'italic' : 'normal'};word-break:break-word;position:relative;">
            ${isDeleted ? 'Message deleted' : (m.text || "")}
          </div>
          ${mine && !isDeleted ? `
          <button class="msg-menu-btn" aria-label="Message menu" style="position:absolute;right:6px;top:6px;border:none;background:transparent;color:#0f172a;cursor:pointer;transition:opacity .15s;width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;z-index:50;pointer-events:auto;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="12" cy="19" r="2"/>
            </svg>
          </button>
          <span class="msg-status" title="${seen ? 'Seen' : 'Sent'}" style="position:absolute;right:-10px;top:50%;transform:translateY(-50%);font-size:12px;color:${seen ? '#2563eb' : '#94a3b8'};display:flex;gap:2px;align-items:center;z-index:45;">
            ${seen ? `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 14l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 17l3 3 10-10" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            ` : `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 14l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            `}
          </span>
          ` : ''}
          ${mine && !isDeleted ? `
          <div class="msg-menu" style="position:absolute;right:6px;top:40px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 10px 24px rgba(0,0,0,.08);min-width:140px;z-index:1000;overflow:hidden;">
            <button class="msg-del-action" data-msg-id="${m.id}" style="width:100%;text-align:left;padding:6px 10px;border:0;background:#fff;cursor:pointer;font-size:13px;line-height:1.2;white-space:nowrap;">
              🗑️ Delete message
            </button>
          </div>
          ` : ''}
        </div>
      </div>`;
  }).join("");
  // Ensure CSS is applied (create or update)
  const existingStyle = document.getElementById('msgMenuHoverStyle');
  const cssText = `.msg-menu{display:none}
      .msg-menu-btn{opacity:0}
      .msg-row:hover .msg-menu-btn{opacity:1 !important}
      .msg-wrap.menu-open .msg-menu{display:block !important}`;
  if (existingStyle) {
    existingStyle.textContent = cssText;
  } else {
    const style = document.createElement('style');
    style.id = 'msgMenuHoverStyle';
    style.textContent = cssText;
    document.head.appendChild(style);
  }
  threadBox.scrollTop = threadBox.scrollHeight;


  // Menu open/close on three-dots click
  threadBox.querySelectorAll('.msg-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = btn.closest('.msg-wrap');
      if (!wrap) return;
      // Close other open menus in the thread
      threadBox.querySelectorAll('.msg-wrap.menu-open').forEach(w => { if (w !== wrap) w.classList.remove('menu-open'); });
      wrap.classList.toggle('menu-open');
    });
  });

  // Global closers (only wire once)
  if (!window._msgMenuGlobalWired) {
    window._msgMenuGlobalWired = true;
    document.addEventListener('click', (e) => {
      // If clicking inside a menu or on the menu button, don't close here
      if (e.target.closest('.msg-menu') || e.target.closest('.msg-menu-btn')) return;
      threadBox?.querySelectorAll('.msg-wrap.menu-open').forEach(w => w.classList.remove('menu-open'));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        threadBox?.querySelectorAll('.msg-wrap.menu-open').forEach(w => w.classList.remove('menu-open'));
      }
    });
    threadBox?.addEventListener('scroll', () => {
      threadBox?.querySelectorAll('.msg-wrap.menu-open').forEach(w => w.classList.remove('menu-open'));
    });
  }

  // Delete action
  threadBox.querySelectorAll('.msg-del-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const msgId = btn.getAttribute('data-msg-id');
      if (!msgId) return;
      const ok = await confirmDialog('Delete this message? This cannot be undone.');
      if (!ok) return;
      try {
        const { deleteDoc, doc } = await import('./firebaseClient.js');
        await deleteDoc(doc(db, 'conversations', convoId, 'messages', msgId));
      } catch (err) {
        console.error('Failed to delete message', err);
        // Fallback: soft-delete if permission denied or delete disallowed
        try {
          const { setDoc, doc, serverTimestamp } = await import('./firebaseClient.js');
          const myUid = auth.currentUser?.uid || '';
          await setDoc(doc(db, 'conversations', convoId, 'messages', msgId), {
            text: 'Message deleted',
            deletedAt: serverTimestamp(),
            deletedBy: myUid
          }, { merge: true });
        } catch (e2) {
          alert('Failed to delete message.');
        }
      } finally {
        // Close menus after action
        const wrap = btn.closest('.msg-wrap');
        wrap?.classList.remove('menu-open');
      }
    });
  });

  ensureDeleteConversationButton();
}

// ----------- Send box wiring -----------
function wireSendBox() {
  if (!inputEl || !sendBtn) return;

  const send = async () => {
    const convoId = window._currentConvoId;
    const text = (inputEl.value || "").trim();
    if (!convoId || !text) return;

    const myUid = auth.currentUser.uid;
    await addDoc(collection(db, "conversations", convoId, "messages"), {
      senderId: myUid,
      text,
      createdAt: serverTimestamp()
    });

    await setDoc(doc(db, "conversations", convoId), {
      lastMessage: text,
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp()
    }, { merge: true });

    inputEl.value = "";
  };

  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

// ----------- Fallback conversations listener (if your app didn't provide one) -----------
function startBasicConversationsListener() {
  const uid = auth.currentUser.uid;
  const q = query(
    collection(db, "conversations"),
    where("members", "array-contains", uid),
    orderBy("updatedAt", "desc")
  );
  if (window._unsubConvos) window._unsubConvos();
  window._unsubConvos = onSnapshot(q, async (snap) => {
    const convos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    window._conversations = convos;
    await renderConversationsList(convos);
  });
}

// ------------- Left list rendering -------------
async function renderConversationsList(convos) {
  const listEl = document.getElementById("conversationsList");
  if (!listEl) return;

  const myUid = auth.currentUser?.uid || "";

  // Deduplicate by other participant (keep most recently updated)
  const byOther = new Map(); // otherUid -> convo
  for (const c of convos) {
    const otherUid = (c.members || []).find(u => u !== myUid);
    if (!otherUid) continue;
    const prev = byOther.get(otherUid);
    const currTs = c.lastMessageAt || c.updatedAt || c.createdAt || 0;
    const prevTs = prev ? (prev.lastMessageAt || prev.updatedAt || prev.createdAt || 0) : -1;
    if (!prev || (currTs && prevTs && (currTs.toMillis ? currTs.toMillis() : currTs) > (prevTs.toMillis ? prevTs.toMillis() : prevTs))) {
      byOther.set(otherUid, c);
    }
  }
  const unique = byOther.size ? Array.from(byOther.values()) : convos;

  // Preload minimal profile info for other members
  const toFetch = [];
  for (const c of unique) {
    const otherUid = (c.members || []).find(u => u !== myUid);
    if (otherUid && !profileCache.has(otherUid)) toFetch.push(otherUid);
  }
  // Fetch missing profiles (best-effort)
  await Promise.all(toFetch.map(async (uid) => {
    try {
      const dref = doc(db, "profiles", uid);
      const { getDoc } = await import("./firebaseClient.js"); // use modular getDoc from our client
      const snap = await getDoc(dref);
      if (snap.exists()) profileCache.set(uid, { uid, ...snap.data() });
    } catch (_) { /* ignore */ }
  }));

  const html = unique.map((c) => {
    const otherUid = (c.members || []).find(u => u !== myUid) || "";
    const p = profileCache.get(otherUid) || {};
    const name = p.displayName || p.email || "Direct message";
    const avatar = (p.photoURL || p.photoUrl)
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
    const last = c.lastMessage || "Started a conversation";
    const active = (c.id === window._currentConvoId);
    return `
      <div class="conversation-item ${active ? "active" : ""}" data-convo-id="${c.id}"
           style="display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;">
        <img src="${avatar}" width="36" height="36" style="border-radius:10px;object-fit:cover;">
        <div style="display:flex;flex-direction:column;">
          <strong style="color:#0f172a;">${name}</strong>
          <small style="color:#64748b;">${last}</small>
        </div>
      </div>`;
  }).join("");

  if (!html) {
    listEl.innerHTML = `
      <div class="empty-state h-full">
        <i class="fas fa-comments"></i>
        <h3 class="text-lg font-semibold mb-2">No conversations yet</h3>
        <p class="text-sm">Start a conversation with your students to see them here.</p>
      </div>`;
  } else {
    listEl.innerHTML = html;
  }

  // Click handlers
  listEl.querySelectorAll("[data-convo-id]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-convo-id");
      if (id) afterConversationReady(id);
    });
  });
}

// ---------------- Profile panel wiring ----------------
function wireSidebarTabs() {
  const profileBtn = document.getElementById('profileTabBtn');
  const dashboardBtn = document.getElementById('dashboardTabBtn');
  const sidebarTitle = document.getElementById('sidebarTitle');
  const profileView = document.getElementById('profileView');
  const dashboardView = document.getElementById('dashboardView');
  if (!profileBtn || !dashboardBtn || !sidebarTitle || !profileView || !dashboardView) return;

  const setTab = (tab) => {
    if (tab === 'profile') {
      profileBtn.classList.add('active');
      dashboardBtn.classList.remove('active');
      profileView.classList.remove('hidden');
      dashboardView.classList.add('hidden');
      sidebarTitle.textContent = 'Profile';
    } else {
      dashboardBtn.classList.add('active');
      profileBtn.classList.remove('active');
      dashboardView.classList.remove('hidden');
      profileView.classList.add('hidden');
      sidebarTitle.textContent = 'Dashboard';
    }
  };

  profileBtn.addEventListener('click', () => setTab('profile'));
  dashboardBtn.addEventListener('click', () => setTab('dashboard'));

  // expose for programmatic use
  window._setSidebarTab = setTab;
}

function wireProfileOpeners() {
  const moreBtn = document.getElementById('moreOptionsBtn');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      if (window._currentConvoId) {
        populateProfilePanelForConvo(window._currentConvoId);
        if (window._setSidebarTab) window._setSidebarTab('profile');
      }
    });
  }
}

async function populateProfilePanelForConvo(convoId) {
  try {
    const profileView = document.getElementById('profileView');
    if (!profileView) return;
    const myUid = auth.currentUser?.uid || '';
    const convo = (window._conversations || []).find(c => c.id === convoId);
    if (!convo) return;
    const otherUid = (convo.members || []).find(u => u !== myUid);
    if (!otherUid) return;

    // Use cached profile if present; otherwise fetch from profiles
    let p = profileCache.get(otherUid);
    if (!p) {
      const { getDoc } = await import('./firebaseClient.js');
      const dref = doc(db, 'profiles', otherUid);
      const snap = await getDoc(dref);
      if (snap.exists()) {
        p = { uid: otherUid, ...snap.data() };
        profileCache.set(otherUid, p);
      } else {
        p = { uid: otherUid };
      }
    }

    const name = p.displayName || p.email || 'User';
    const role = p.role || '';
    const bio  = p.bio || '';
    const email = p.email || '';
    const avatar = (p.photoURL || p.photoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;

    // Last active derived from other user's lastRead or conversation timestamps
    const meta = window._convoMeta[convoId] || {};
    const otherLastRead = (meta.lastRead && meta.lastRead[otherUid]) || null;
    const lastMsgAt = (meta.lastMessageAt || meta.updatedAt || meta.createdAt || null);
    const fmtAgo = (t) => {
      const ms = t ? (t.toMillis ? t.toMillis() : t) : 0;
      if (!ms) return '—';
      const diff = Date.now() - ms;
      const m = Math.floor(diff/60000);
      if (m < 1) return 'just now';
      if (m < 60) return `${m} min ago`;
      const h = Math.floor(m/60); if (h < 24) return `${h} hr${h>1?'s':''} ago`;
      const d = Math.floor(h/24); return `${d} day${d>1?'s':''} ago`;
    };

    const lastActiveText = otherLastRead ? fmtAgo(otherLastRead) : (lastMsgAt ? fmtAgo(lastMsgAt) : '—');

    profileView.innerHTML = `
      <div class="space-y-5" style="overflow-x:hidden;">
        <div class="flex items-center gap-4">
          <img src="${avatar}" alt="${name}" class="w-16 h-16 rounded-xl object-cover border border-slate-200"/>
          <div class="min-w-0">
            <div class="text-lg font-semibold text-slate-800 truncate" title="${name}">${name}</div>
            ${role ? `<span class="inline-block mt-1 text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100">${role}</span>` : ''}
            <div class="text-xs text-slate-500 mt-1">Last active: ${lastActiveText}</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3" id="profileActions">
          <button class="py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" id="profileEmailBtn" title="Send email">
            <i class="fas fa-envelope mr-2"></i>Email
          </button>
          <button class="py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" id="profileScheduleBtn" title="Schedule session">
            <i class="fas fa-calendar mr-2"></i>Schedule
          </button>
          <button class="col-span-2 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors" id="profileDeleteConvoBtn" title="Delete entire conversation">
            <i class="fas fa-trash mr-2"></i>Delete conversation
          </button>
        </div>

        ${bio ? `
        <div class="space-y-1">
          <div class="text-sm text-slate-500">Bio</div>
          <div class="text-sm text-slate-700 bg-white border border-slate-200 rounded-md p-3" style="overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap;">${bio}</div>
        </div>` : ''}

        <div class="space-y-2">
          <button id="toggleProfileDetails" class="text-sm text-slate-600 hover:text-slate-800 underline decoration-slate-300 decoration-1 underline-offset-2">
            More details
          </button>
          <div id="profileDetails" class="hidden space-y-1">
            <div class="text-sm text-slate-500">Conversation ID</div>
            <div class="flex items-center gap-2">
              <code id="convoIdText" class="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1" style="overflow-wrap:anywhere;word-break:break-word;">${convoId}</code>
              <button id="copyConvoIdBtn" class="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50" title="Copy conversation ID">Copy</button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (window._setSidebarTab) window._setSidebarTab('profile');

    // Wire actions
    const delBtn = document.getElementById('profileDeleteConvoBtn');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        const ok = await confirmDialog('Delete entire conversation? All messages will be permanently removed.');
        if (!ok) return;
        try {
          const { collection, getDocs, deleteDoc, doc } = await import('./firebaseClient.js');
          const msgsSnap = await getDocs(collection(db, 'conversations', convoId, 'messages'));
          const deletions = msgsSnap.docs.map(d => (async () => {
            try { await deleteDoc(doc(db, 'conversations', convoId, 'messages', d.id)); }
            catch(e){ /* ignore individual permission errors */ }
          })());
          await Promise.allSettled(deletions);
          try {
            await deleteDoc(doc(db, 'conversations', convoId));
          } catch (eDel) {
            try {
              const { updateDoc, arrayRemove, serverTimestamp } = await import('./firebaseClient.js');
              const myUid = auth.currentUser?.uid;
              await updateDoc(doc(db, 'conversations', convoId), {
                members: arrayRemove(myUid),
                lastMessage: 'Left conversation',
                updatedAt: serverTimestamp(),
              });
            } catch (_) { /* ignore */ }
          }
          removeConvoFromUI(convoId);
        } catch (err) {
          console.error('Failed to delete conversation', err);
          removeConvoFromUI(convoId);
        }
      });
    }

    // Wire details toggler & copy button
    const toggleDetails = document.getElementById('toggleProfileDetails');
    const detailsBox = document.getElementById('profileDetails');
    if (toggleDetails && detailsBox) {
      toggleDetails.addEventListener('click', () => {
        const hidden = detailsBox.classList.contains('hidden');
        detailsBox.classList.toggle('hidden');
        toggleDetails.textContent = hidden ? 'Hide details' : 'More details';
      });
    }
    const copyBtn = document.getElementById('copyConvoIdBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const code = document.getElementById('convoIdText');
        const text = code?.textContent || '';
        try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied!'; setTimeout(() => copyBtn.textContent = 'Copy', 1200); } catch (_) {}
      });
    }

    // Wire email button
    const emailBtn = document.getElementById('profileEmailBtn');
    if (emailBtn && email) {
      emailBtn.addEventListener('click', () => {
        const subject = encodeURIComponent(`Yuli | Message from ${auth.currentUser?.displayName || 'a tutor'}`);
        const body = encodeURIComponent('Hi ' + (name.split(' ')[0] || '') + ',');
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
      });
    } else if (emailBtn && !email) {
      emailBtn.setAttribute('disabled','true');
      emailBtn.classList.add('opacity-60','cursor-not-allowed');
      emailBtn.title = 'No email available';
    }
  } catch (e) {
    console.warn('populateProfilePanelForConvo failed', e);
  }
}
