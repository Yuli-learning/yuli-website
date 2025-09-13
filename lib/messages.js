// lib/messages.js
// Real-time messaging UI logic using Firebase modular SDK
import { auth, db } from './firebaseClient.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  collection, query, where, orderBy, onSnapshot, addDoc, doc, getDoc, setDoc, serverTimestamp, getDocs, limit
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

// DOM elements
const listEl = document.getElementById('conversation-list');
const threadEl = document.getElementById('message-thread');
const partnerEl = document.getElementById('active-partner');
const inputEl = document.getElementById('message-input-profile');
const sendBtn = document.getElementById('send-message-btn-profile');

// State
let me = null;
let activeConvId = null;
let activePartner = null; // { uid, displayName, photoURL }
let unsubscribeThread = null;

function qsParam(name){
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function renderAvatar(user, size = 38){
  const letter = (user?.displayName || user?.email || 'U').charAt(0).toUpperCase();
  const url = user?.photoURL;
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = user.displayName || 'User';
    img.width = size; img.height = size;
    img.style.borderRadius = '50%';
    img.style.objectFit = 'cover';
    return img;
  }
  const span = document.createElement('div');
  span.className = 'avatar';
  span.textContent = letter;
  return span;
}

async function getUserProfile(uid){
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : { uid };
  } catch (e){
    console.warn('getUserProfile failed', e);
    return { uid };
  }
}

function renderPartnerHeader(user){
  partnerEl.innerHTML = '';
  if (!user) return;
  partnerEl.appendChild(renderAvatar(user, 32));
  const name = document.createElement('div');
  name.style.fontWeight = '600';
  name.textContent = user.displayName || user.email || 'User';
  partnerEl.appendChild(name);
}

function renderMessage(msg){
  const wrap = document.createElement('div');
  const mine = msg.senderId === me.uid;
  wrap.style.display = 'flex';
  wrap.style.margin = '6px 0';
  wrap.style.justifyContent = mine ? 'flex-end' : 'flex-start';

  const bubble = document.createElement('div');
  bubble.textContent = msg.text || '';
  bubble.style.maxWidth = '70%';
  bubble.style.padding = '8px 12px';
  bubble.style.borderRadius = '14px';
  bubble.style.background = mine ? '#4f46e5' : '#ffffff';
  bubble.style.border = '1px solid #e5e7eb';
  bubble.style.color = mine ? '#fff' : '#111827';

  wrap.appendChild(bubble);
  return wrap;
}

function scrollThreadToBottom(){
  requestAnimationFrame(() => {
    threadEl.scrollTop = threadEl.scrollHeight;
  });
}

function listenToThread(convId){
  if (unsubscribeThread) unsubscribeThread();
  threadEl.innerHTML = '';
  unsubscribeThread = onSnapshot(
    query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'asc')),
    (snap) => {
      threadEl.innerHTML = '';
      snap.forEach(docSnap => {
        const m = { id: docSnap.id, ...docSnap.data() };
        threadEl.appendChild(renderMessage(m));
      });
      scrollThreadToBottom();
    },
    (err) => console.error('thread listener error', err)
  );
}

async function getOrCreateDM(uidA, uidB){
  const members = [uidA, uidB].sort();
  // Try to find an existing conversation
  const q = query(
    collection(db, 'conversations'),
    where('members', 'array-contains', members[0]),
    limit(20)
  );
  const possible = await getDocs(q);
  let existing = null;
  possible.forEach(d => {
    const data = d.data();
    if (Array.isArray(data.members) && data.members.length === 2 && data.members.includes(members[1])) {
      existing = { id: d.id, ...data };
    }
  });
  if (existing) return existing.id;

  // Create a new conversation doc
  const convDoc = await addDoc(collection(db, 'conversations'), {
    type: 'dm',
    members,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: ''
  });
  return convDoc.id;
}

async function openConversationWith(partnerUid){
  if (!me || !partnerUid) return;
  activePartner = await getUserProfile(partnerUid);
  renderPartnerHeader(activePartner);
  activeConvId = await getOrCreateDM(me.uid, partnerUid);
  listenToThread(activeConvId);
}

async function startConversationsListener(){
  if (!me) return;
  if (!listEl) return;

  // Conversations list: all threads where I'm a member, newest first
  const q = query(
    collection(db, 'conversations'),
    where('members', 'array-contains', me.uid),
    orderBy('updatedAt', 'desc')
  );

  if (window._unsubConvos) window._unsubConvos();
  window._unsubConvos = onSnapshot(q, async (snap) => {
    const items = [];
    for (const docSnap of snap.docs){
      const c = { id: docSnap.id, ...docSnap.data() };
      // Determine partner id (for 1:1 DMs)
      const partnerId = (c.members || []).find(x => x !== me.uid);
      const partner = partnerId ? await getUserProfile(partnerId) : null;
      items.push({ conv: c, partner });
    }
    // Already ordered by Firestore; no extra filters on lastMessage
    listEl.innerHTML = '';
    for (const item of items){
      const row = document.createElement('div');
      row.className = 'conv-item';
      const avatar = renderAvatar(item.partner);
      const label = document.createElement('div');
      label.style.display = 'flex';
      label.style.flexDirection = 'column';
      label.style.gap = '2px';
      const name = document.createElement('div');
      name.style.fontWeight = '600';
      name.textContent = item.partner?.displayName || 'Conversation';
      const preview = document.createElement('div');
      preview.style.fontSize = '12px';
      preview.style.color = '#6b7280';
      preview.textContent = item.conv.lastMessage || '';
      label.appendChild(name);
      label.appendChild(preview);
      row.appendChild(avatar);
      row.appendChild(label);
      row.addEventListener('click', () => {
        activeConvId = item.conv.id;
        activePartner = item.partner;
        renderPartnerHeader(activePartner);
        listenToThread(item.conv.id);
      });
      listEl.appendChild(row);
    }
  }, (err) => console.error('conversation list error', err));
}

// expose for other modules if needed
window.startConversationsListener = startConversationsListener;

async function sendMessage(){
  const text = (inputEl.value || '').trim();
  if (!text || !me || !activeConvId) return;
  inputEl.value = '';
  try {
    await addDoc(collection(db, 'conversations', activeConvId, 'messages'), {
      text,
      senderId: me.uid,
      createdAt: serverTimestamp(),
    });
    // update conversation preview
    await setDoc(doc(db, 'conversations', activeConvId), {
      lastMessage: text,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e){
    console.error('sendMessage failed', e);
  }
}

function wireComposer(){
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (inputEl) inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendMessage();
    }
  });
}

function init(){
  wireComposer();
  onAuthStateChanged(auth, async (user) => {
    if (!user){
      // Redirect to sign-in or show message
      partnerEl.innerHTML = '';
      threadEl.innerHTML = '<div>Please sign in to view messages.</div>';
      return;
    }
    me = user;
    await startConversationsListener();

    const partnerUid = qsParam('partner');
    if (partnerUid){
      await openConversationWith(partnerUid);
    }
  });
}

// Start
init();
