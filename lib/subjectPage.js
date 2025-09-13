import { auth } from "./firebaseClient.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { DateTime } from "https://cdn.jsdelivr.net/npm/luxon@3/build/es6/luxon.js";
import { go } from "./nav.js";

const db = getFirestore();

// Pricing aligned with booking page
const PRICING = {
  GCSE: { standard: 20, discounted: 12 },
  "A-Level": { standard: 35, discounted: 18 },
};

const EXAM_BOARDS = ["AQA", "Edexcel", "OCR"]; // per spec for these pages

function getParams() {
  const url = new URL(window.location.href);
  return {
    board: url.searchParams.get("board") || "",
    type: url.searchParams.get("type") || "",
    theme: url.searchParams.get("theme") || "",
  };
}

function subjectSlugFromPath() {
  // expects /subjects/gcse-<slug>.html
  const m = (window.location.pathname || '').match(/gcse-([a-z-]+)\.html$/);
  return m ? m[1] : '';
}

async function loadCopy() {
  const res = await fetch('/data/subject-pages.json');
  return res.json();
}

function el(sel){ return document.querySelector(sel); }

let currentType = '1to1'; // default

function renderHero(copy, subjectLabel) {
  const title = copy.title || `GCSE ${subjectLabel}, made clear.`;
  el('#page-title').textContent = title;
  el('#page-sub').textContent = `I’m Lukas. I teach one-to-one, online, with a shared whiteboard. Understanding first, exam technique second.`;
  // Show a minimal pill only for Mathematics to indicate both session types
  const badges = el('#badges');
  if (badges){
    badges.innerHTML = '';
    const pageSlug = (location.pathname.split('/').pop() || '').replace('gcse-','').replace('.html','');
    if (pageSlug === 'mathematics') {
      badges.innerHTML = `<span class="badge">1:1 & Group</span>`;
    }
  }
}

function renderCover(copy){
  const list = el('#cover-list');
  list.innerHTML = (copy.cover || []).map(item => `<li>${item}</li>`).join('');
  const toneEl = el('#tone');
  if (toneEl) toneEl.textContent = copy.tone || '';
}

function renderResources(board) {
  const b = board || 'Any';
  const base = {
    AQA: {
      formula: 'https://www.aqa.org.uk/subjects/mathematics/gcse/mathematics-8300/assessment-resources',
      papers: 'https://www.aqa.org.uk/find-past-papers-and-mark-schemes',
      topics: 'https://www.aqa.org.uk/subjects'
    },
    Edexcel: {
      formula: 'https://qualifications.pearson.com/en/qualifications/edexcel-gcses.html',
      papers: 'https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html',
      topics: 'https://qualifications.pearson.com'
    },
    OCR: {
      formula: 'https://www.ocr.org.uk/qualifications/by-subject/mathematics/',
      papers: 'https://www.ocr.org.uk/qualifications/past-paper-finder/',
      topics: 'https://www.ocr.org.uk/qualifications/'
    }
  };
  const links = base[board] || base.AQA;
  el('#resources').innerHTML = `
    <a class="res-btn compact" href="${links.formula}" target="_blank" rel="noopener noreferrer"><i class="fas fa-scroll"></i> Formula sheet</a>
    <a class="res-btn compact" href="${links.papers}" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-lines"></i> Past papers</a>
    <a class="res-btn compact" href="${links.topics}" target="_blank" rel="noopener noreferrer"><i class="fas fa-list"></i> Topic list</a>
  `;
}

function updateCTAs(subjectSlug, board){
  const selectedBoard = board || '';
  const level = 'GCSE';
  const url = `/booking.html?level=${encodeURIComponent(level)}&subject=${encodeURIComponent(subjectSlug)}${selectedBoard ? `&board=${encodeURIComponent(selectedBoard)}` : ''}&type=${encodeURIComponent(currentType)}`;
  const buttons = document.querySelectorAll('[data-cta="book"],[data-cta="availability"]');
  buttons.forEach(btn => {
    btn.onclick = (e)=>{ e.preventDefault(); window.location.href = url; };
  });
}

function setSelectDefaults(board){
  const levelSel = el('#level');
  const boardSel = el('#board');
  levelSel.value = 'GCSE';
  if (board && EXAM_BOARDS.includes(board)) boardSel.value = board;
}

function wireSelects(subjectSlug){
  const boardSel = el('#board');
  boardSel.addEventListener('change', ()=>{
    const b = boardSel.value;
    updateCTAs(subjectSlug, b);
    renderResources(b);
    updateStickyPrice();
    updateStickyMeta();
  });
}

function wireTypeToggle(subjectSlug){
  const one = el('#type-one');
  const grp = el('#type-group');
  if (!one || !grp) return; // only present on mathematics page
  const set = (t)=>{
    currentType = t;
    one.classList.toggle('is-selected', t==='1to1');
    grp.classList.toggle('is-selected', t==='group');
    const b = el('#board')?.value || '';
    updateCTAs(subjectSlug, b);
    updateStickyPrice();
    updateStickyMeta();
  };
  one.addEventListener('click', ()=> set('1to1'));
  grp.addEventListener('click', ()=> set('group'));
}

let userProfile = null;
function priceFor(level, type){
  // Only GCSE pages use session type; A-Level would remain as before
  const isGroup = type === 'group';
  const base = isGroup ? 10 : PRICING[level].standard; // 20 for 1:1 GCSE
  const disc = isGroup ? 8 : PRICING[level].discounted; // 12 for 1:1 GCSE
  const perStudent = isGroup ? ' (per student)' : '';
  if (userProfile?.discountStatus === 'approved') return { mode:type, show:`You pay £${disc}/hr`, crossed:`£${base}`, tail: perStudent, note:"✓ Discount applied" };
  if (userProfile?.discountStatus === 'pending') return { mode:type, show:`£${base}/hr`, tail: `${perStudent}`, note:'Discount pending' };
  return { mode:type, show:`From £${base}/hr · Discounts available.`, tail: perStudent };
}

function updateStickyPrice(){
  const p = priceFor('GCSE', currentType);
  const priceEl = el('#sticky-price');
  const extraEl = el('#sticky-extra');
  const noteEl = el('#sticky-note');
  if (!priceEl || !extraEl) return;
  // Build price line formats
  if (p.crossed){
    // approved
    priceEl.innerHTML = `${p.show} <span class="price-original" style="text-decoration:line-through;color:#94a3b8;margin-left:6px;">${p.crossed}</span>${p.tail}`;
    extraEl.textContent = p.note || '';
  } else {
    priceEl.textContent = `${p.show}${p.tail}`;
    extraEl.textContent = p.note || '';
  }
  if (noteEl){
    noteEl.innerHTML = `Pay per session. Reschedule up to 24h before. ${(!userProfile || userProfile?.discountStatus !== 'approved') ? `<a href="/profile.html#discount" class="muted" style="text-decoration:underline;">Eligible for a lower rate? Upload proof in your profile →</a>` : ''}`;
  }
}

function updateStickyMeta(){
  const boardSel = el('#board');
  const b = boardSel?.value || '';
  const meta = el('#sticky-meta');
  const typeLabel = currentType === 'group' ? 'Group' : '1:1';
  if (meta) meta.textContent = `${typeLabel} • ${b || 'Any board'} · 60 min`;
}

function renderTutorCard(){
  const card = el('#tutor-card');
  if (!card) return;
  card.innerHTML = `
    <div class="tutor">
      <img src="/assets/lukas-jovaisa.jpg" alt="Lukas photo" />
      <div>
        <strong>Lukas Jovaisa</strong><br/>
        <small>University Maths student • 4 years tutoring • DBS checked</small>
      </div>
    </div>
  `;
}

function listenNextTimes(subjectLabel){
  const list = el('#next-times');
  if (!list) return;
  list.innerHTML = '';
  const now = new Date();
  const qq = query(
    collection(db,'availability'),
    where('isBooked','==', false),
    where('start', ">=", Timestamp.fromDate(now)),
    orderBy('start','asc')
  );
  return onSnapshot(qq, (snap)=>{
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const items = [];
    snap.forEach(d=>{
      const data = d.data();
      if (data.level !== 'GCSE') return;
      if (data.subject !== subjectLabel) return;
      const s = DateTime.fromJSDate(data.start.toDate(), { zone:'utc' }).setZone(zone);
      const e = DateTime.fromJSDate(data.end.toDate(), { zone:'utc' }).setZone(zone);
      items.push(`${s.toFormat('ccc dd LLL')}, ${s.toFormat('h:mma').toLowerCase()}–${e.toFormat('h:mma').toLowerCase()}`);
    });
    const top = items.slice(0,3);
    list.innerHTML = top.length ? top.map(t=>`<div class="muted">${t}</div>`).join('') : '';
  });
}

function subjectLabelFromSlug(slug){
  const map = {
    'mathematics': 'Mathematics',
    'further-maths': 'Further Maths',
    'biology': 'Biology',
    'chemistry': 'Chemistry',
    'physics': 'Physics',
    'geography': 'Geography',
  };
  return map[slug] || slug;
}

export async function initSubjectPage(){
  const slug = subjectSlugFromPath();
  const subjectLabel = subjectLabelFromSlug(slug);
  const params = getParams();

  // Opt-in theme: Gradient Minimal
  if (params.theme === 'neo') {
    document.body.setAttribute('data-theme','neo');
  }

  // Load copy
  const all = await loadCopy();
  const copy = all.gcse?.[slug] || {};

  // Header links
  const logo = el('#logoLink');
  const back = el('#backLink');
  logo?.addEventListener('click', (e)=>{ e.preventDefault(); go('/'); });
  back?.addEventListener('click', (e)=>{ e.preventDefault(); go('#subjects'); });

  renderHero(copy, subjectLabel);
  renderCover(copy);
  renderResources(params.board);
  setSelectDefaults(params.board);
  // Parse type from URL (1to1 | group)
  if (params.type === 'group' || params.type === '1to1') currentType = params.type; else currentType = '1to1';
  wireSelects(slug);
  wireTypeToggle(slug);
  renderTutorCard();
  updateCTAs(slug, params.board);
  updateStickyPrice();
  updateStickyMeta();

  // Auth-based pricing display
  onAuthStateChanged(auth, async (user)=>{
    if (!user){ userProfile = null; updateStickyPrice(); return; }
    try{
      const snap = await getDoc(doc(db,'users', user.uid));
      userProfile = snap.exists() ? snap.data() : {};
    }catch(_){ userProfile = {}; }
    updateStickyPrice();
  });

  // Next times
  listenNextTimes(subjectLabel);
}

// Auto-init when included
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSubjectPage);
} else {
  initSubjectPage();
}
