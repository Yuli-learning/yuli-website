// resources.js — Render official specification links
// Exports:
//  - loadSpecLinks(): Promise<SpecMap>
//  - renderResources(targetEl: HTMLElement, options?: { subjects?: string[]; levels?: ("GCSE"|"A-Level")[] }): void
//
// Board names are fixed: "AQA", "Pearson Edexcel", "OCR", "WJEC/Eduqas", "CCEA", "CIE"
// Data source: /data/spec-links.json (authoritative mapping). Update that file to add subjects/links.

/**
 * @typedef {"AQA"|"Pearson Edexcel"|"OCR"|"WJEC/Eduqas"|"CCEA"|"CIE"} BoardName
 * @typedef {{ board: BoardName, url: string }} BoardLink
 * @typedef {{ [level in "GCSE"|"A-Level"]?: BoardLink[] }} LevelsMap
 * @typedef {{ [subject: string]: LevelsMap }} SpecMap
 */

/**
 * Cache-busted fetch of the JSON mapping.
 * @returns {Promise<SpecMap>}
 */
export async function loadSpecLinks() {
  const cacheBust = Date.now().toString(36);
  const res = await fetch(`/data/spec-links.json?v=${cacheBust}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load spec links: ${res.status}`);
  return /** @type {Promise<SpecMap>} */ (res.json());
}

/**
 * Render grouped list: Subject → Level → Board links
 * @param {HTMLElement} targetEl
 * @param {{ subjects?: string[], levels?: ("GCSE"|"A-Level")[] }} [options]
 * @param {SpecMap} [specs] optional preloaded map
 */
export async function renderResources(targetEl, options = {}, specs) {
  if (!targetEl) return;

  // Minimal styling hooks
  const css = `
    .res-subject { margin: 0 0 14px; font-weight: 700; font-size: 15px; color: #0f172a; }
    .res-level { margin: 6px 0 4px; font-weight: 600; font-size: 13px; color: #1f2937; }
    .res-list { list-style: none; margin: 0 0 8px; padding: 0; }
    .res-item { margin: 2px 0; }
    .res-link { display: inline-flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; text-decoration: none; border: 1px solid #e5e7eb; }
    .res-badge { display: inline-block; font-weight: 600; font-size: 12px; color: #111827; }
    .res-ext { color: #6b7280; font-size: 12px; }
    .res-group { padding: 8px 10px; border: 1px solid #f1f5f9; border-radius: 10px; background: #fafafa; margin-bottom: 10px; }
  `;
  injectOnce('res-inline-css', css);

  try {
    const data = specs || await loadSpecLinks();
    const subjectsFilter = Array.isArray(options.subjects) && options.subjects.length ? new Set(options.subjects) : null;
    const levelsFilter = Array.isArray(options.levels) && options.levels.length ? new Set(options.levels) : null;

    // Deterministic subject ordering
    const subjects = Object.keys(data).sort((a,b) => a.localeCompare(b));

    const frag = document.createDocumentFragment();

    for (const subject of subjects) {
      if (subjectsFilter && !subjectsFilter.has(subject)) continue;
      const levelsMap = data[subject] || {};

      const subjectHeader = el('div', { class: 'res-subject', text: subject });
      frag.appendChild(subjectHeader);

      const levelNames = Object.keys(levelsMap).filter(l => !levelsFilter || levelsFilter.has(l));
      for (const level of levelNames) {
        const boards = levelsMap[level] || {};
        const links = Object.entries(boards);
        if (links.length === 0) continue;

        const group = el('div', { class: 'res-group' });
        group.appendChild(el('div', { class: 'res-level', text: level }));

        const ul = el('ul', { class: 'res-list' });
        for (const [board, url] of links) {
          const a = document.createElement('a');
          a.className = 'res-link';
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.innerHTML = `${escapeHtml(board)} <span class="res-ext" aria-hidden="true">↗</span>`;
          const li = el('li', { class: 'res-item' });
          li.appendChild(a);
          ul.appendChild(li);
        }
        group.appendChild(ul);
        frag.appendChild(group);
      }
    }

    // Replace content
    targetEl.innerHTML = '';
    targetEl.appendChild(frag);
  } catch (err) {
    console.error('Resources render failed', err);
    targetEl.innerHTML = `<div class="empty-state"><div class="empty-state-message">Failed to load resources</div></div>`;
  }
}

// Helpers
function el(tag, attrs) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'text') node.textContent = String(v);
      else node.setAttribute(k, String(v));
    }
  }
  return node;
}

function iconExternal() {
  const span = document.createElement('span');
  span.className = 'res-ext';
  span.innerHTML = '<i class="fas fa-external-link-alt" aria-hidden="true"></i>';
  return span;
}

function injectOnce(id, cssText) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = cssText;
  document.head.appendChild(style);
}

/**
 * Accessible accordion with search.
 * @param {HTMLElement} rootEl
 * @param {{ dataUrl?: string }} [opts]
 */
// Normalize and clean data: drop _comment, de-dup subjects (case-insensitive), remove empty levels
function normalizeSpecData(raw) {
  const map = new Map(); // key: lower-subject -> { name, levels }
  Object.entries(raw || {}).forEach(([subject, levels]) => {
    if (!subject || subject === '_comment') return;
    const key = subject.toLowerCase();
    const entry = map.get(key) || { name: subject, levels: {} };
    // Merge levels and drop empties
    Object.entries(levels || {}).forEach(([lvl, boards]) => {
      const cleaned = Object.entries(boards || {}).filter(([, url]) => !!url);
      if (cleaned.length > 0) {
        entry.levels[lvl] = Object.fromEntries(cleaned);
      }
    });
    // Only add if at least one non-empty level exists
    if (Object.keys(entry.levels).length > 0) {
      map.set(key, entry);
    }
  });
  // Sort A–Z by display name
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function renderResourcesAccordion(rootEl, opts = {}) {
  if (!rootEl) return;
  const dataUrl = opts.dataUrl || '/data/spec-links.json';
  // Styles
  injectOnce('res-accordion-css', `
    .res-card { border: 1px solid #e5e7eb; border-radius: 12px; background:#fff; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .res-search { padding: 10px; border-bottom: 1px solid #f1f5f9; }
    .res-search input { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 14px; }
    .res-helper { padding: 6px 12px 10px; color:#64748b; font-size:12px; }
    .acc-list { margin:0; padding:0; list-style:none; }
    .acc-item { border-top: 1px solid #f3f4f6; }
    .acc-header { display:flex; justify-content: space-between; align-items:center; width:100%; padding:12px 14px; min-height:44px; background:#fff; border:0; text-align:left; font-weight:700; font-size:14px; cursor:pointer; }
    .acc-badge { color:#6b7280; font-weight:600; font-size:12px; }
    .acc-panel { overflow: hidden; height:0; transition: height 150ms ease; }
    .acc-inner { padding: 10px 14px 12px; }
    .res-level-chip { font-weight:700; font-size:12px; color:#374151; margin: 8px 0 6px; }
    .res-links-list { list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:8px; }
    .res-link-btn {
      display:inline-flex; align-items:center; gap:.35rem;
      padding:.45rem .7rem; border:1px solid #e5e7eb;
      border-radius:999px; font-size:.9rem; font-weight:600;
      background:#fff; text-decoration:none; color:#111827;
    }
    .res-link-btn:hover{ background:#f8f9ff; }
    .res-link-btn .ext{ width:1em; height:1em; opacity:.7; display:inline-block; }
    .res-chip-sub{ font-size:.75rem; opacity:.65; margin-left:.25rem; }
    .res-mark { background: #fff3b0; }
    /* Defensively remove any numeric pseudo elements */
    .res-link-btn::before { content: none !important; }
    .res-link-disabled{ cursor:not-allowed; opacity:.55; background:#f9fafb; color:#6b7280; border-style:dashed; }
    .res-link-disabled:hover{ background:#f9fafb; }
  `);

  // Build container
  rootEl.innerHTML = '';
  const card = el('div', { class: 'res-card' });
  const searchWrap = el('div', { class: 'res-search' });
  const input = el('input', { type: 'search', placeholder: 'Search subject…', 'aria-label': 'Search subject' });
  searchWrap.appendChild(input);
  const helper = el('div', { class: 'res-helper', text: 'Official links • Opens in a new tab' });
  const list = el('ul', { class: 'acc-list', role: 'list' });
  card.appendChild(searchWrap);
  card.appendChild(helper);
  card.appendChild(list);
  rootEl.appendChild(card);
  // Skeleton while loading
  const sk = el('div', { class: 'res-skeleton', text: '' });
  sk.innerHTML = '<div style="padding:12px 14px; color:#94a3b8; font-size:13px;">Loading…</div>';
  list.appendChild(sk);

  // Load data
  const raw = opts.data || await loadSpecLinks();
  if (!raw || typeof raw !== 'object') {
    rootEl.textContent = 'No resources available.';
    return;
  }
  const normalized = normalizeSpecData(raw);
  const subjects = normalized.map(s => s.name);
  const openKey = 'resources.openSubjects';
  const searchKey = 'resources.search';
  const savedOpen = new Set(JSON.parse(localStorage.getItem(openKey) || '[]'));

  // Create items
  /** @type {HTMLButtonElement[]} */
  const headerButtons = [];
  // clear skeleton
  list.innerHTML = '';

  for (const subject of subjects) {
    const subjectData = (normalized.find(s => s.name === subject) || {}).levels || {};
    const levelKeys = Object.keys(subjectData).filter(l => (subjectData[l] && Object.keys(subjectData[l]).length));
    const totalLinks = levelKeys.reduce((acc, l)=> acc + Object.keys(subjectData[l]).length, 0);
    const item = el('li', { class: 'acc-item' });
    const headerId = `acc-h-${hash(subject)}`;
    const panelId = `acc-p-${hash(subject)}`;
    const btn = /** @type {HTMLButtonElement} */(el('button', { class: 'acc-header', id: headerId, 'aria-controls': panelId, 'aria-expanded': 'false', 'data-subject': subject }));
    btn.innerHTML = `${escapeHtml(subject)} <span class="acc-badge">• ${totalLinks} links</span>`;
    const panel = el('div', { class: 'acc-panel', id: panelId, role: 'region', 'aria-labelledby': headerId });
    const inner = el('div', { class: 'acc-inner' });

    for (const level of ['GCSE','A-Level']) {
      const levelMap = subjectData[level];
      const entries = levelMap ? Object.entries(levelMap) : [];
      if (entries.length > 0) {
        inner.appendChild(el('div', { class: 'res-level-chip', text: level }));
        const ul = el('ul', { class: 'res-links-list' });
        // turn into array of {board,url,lastChecked,status,finalUrl}
        // Supports two shapes:
        // 1) Object map: { "AQA": "https://...", ... }
        // 2) Array of objects: [ { board:"AQA", url:"https://..." }, ... ]
        const links = entries.map(([key, val]) => {
            const isIdx = (typeof key === 'string' && /^\d+$/.test(key));
            if (val && typeof val === 'object') {
              const url = val.url || '';
              const board = val.board || (isIdx ? undefined : key);
              const lastChecked = val.lastChecked || undefined;
              const status = val.status || undefined;
              const finalUrl = val.finalUrl || undefined;
              return { board, url, lastChecked, status, finalUrl };
            } else {
              const url = String(val || '');
              const board = (isIdx ? undefined : key);
              return { board, url };
            }
          })
          .filter(l => typeof l.url === 'string' && l.url.length > 0)
          .sort((a,b) => {
            const an = a.board || boardFromUrl(a.url);
            const bn = b.board || boardFromUrl(b.url);
            const ai = BOARD_ORDER.indexOf(an);
            const bi = BOARD_ORDER.indexOf(bn);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          });
        for (const link of links) {
          const board = link.board || boardFromUrl(link.url);
          const domain = (() => { try { return new URL(link.url).hostname.replace(/^www\./,''); } catch { return ''; } })();
          const li = el('li');
          const isBroken = (link.status === 'broken');
          if (isBroken) {
            const btn = document.createElement('span');
            btn.className = 'res-link-btn res-link-disabled';
            btn.setAttribute('role', 'button');
            btn.setAttribute('aria-disabled', 'true');
            btn.title = 'Link temporarily unavailable';
            const text = document.createElement('span');
            text.textContent = board;
            btn.appendChild(text);
            if (domain) {
              const sub = document.createElement('span');
              sub.className = 'res-chip-sub';
              sub.textContent = domain;
              btn.appendChild(sub);
            }
            li.appendChild(btn);
          } else {
            const a = document.createElement('a');
            a.className = 'res-link-btn';
            a.href = link.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.setAttribute('aria-label', `Open ${subject} ${level} specification on ${board}`);
            a.title = `${board}${domain ? ' • ' + domain : ''} (opens in new tab)`;
            const text = document.createElement('span');
            text.textContent = board;
            a.appendChild(text);
            if (domain) {
              const sub = document.createElement('span');
              sub.className = 'res-chip-sub';
              sub.textContent = domain;
              a.appendChild(sub);
            }
            // external icon (svg)
            const ext = document.createElementNS('http://www.w3.org/2000/svg','svg');
            ext.setAttribute('class','ext');
            ext.setAttribute('viewBox','0 0 24 24');
            ext.setAttribute('aria-hidden','true');
            const path = document.createElementNS('http://www.w3.org/2000/svg','path');
            path.setAttribute('d','M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z M5 5h7v2H7v10h10v-5h2v7H5V5z');
            path.setAttribute('fill','currentColor');
            ext.appendChild(path);
            a.appendChild(ext);
            li.appendChild(a);
          }
          ul.appendChild(li);
        }
        inner.appendChild(ul);
      }
    }
    panel.appendChild(inner);
    item.appendChild(btn);
    item.appendChild(panel);
    list.appendChild(item);
    headerButtons.push(btn);

    // Expand if saved
    if (savedOpen.has(subject)) expand(panel, btn, false);

    // Click toggle
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if (expanded) collapse(panel, btn); else expand(panel, btn, true);
      saveOpenState();
    });

    // Attach subject name for search
    item.dataset.subject = subject.toLowerCase();
    item.dataset.subjectRaw = subject;
  }

  // Keyboard navigation for headers
  list.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */(e.target);
    if (!(target instanceof HTMLButtonElement) || !target.classList.contains('acc-header')) return;
    const idx = headerButtons.indexOf(target);
    if (idx === -1) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); headerButtons[Math.min(headerButtons.length-1, idx+1)].focus(); break;
      case 'ArrowUp': e.preventDefault(); headerButtons[Math.max(0, idx-1)].focus(); break;
      case 'Home': e.preventDefault(); headerButtons[0].focus(); break;
      case 'End': e.preventDefault(); headerButtons[headerButtons.length-1].focus(); break;
      case 'Enter':
      case ' ': e.preventDefault(); target.click(); break;
    }
  });

  // Search filter
  // Restore last search
  const lastSearch = localStorage.getItem(searchKey) || '';
  if (lastSearch) { input.value = lastSearch; }
  // Apply search on input
  function applySearch() {
    const q = input.value.trim().toLowerCase();
    for (const li of /** @type {NodeListOf<HTMLLIElement>} */(list.querySelectorAll('.acc-item'))) {
      const name = li.dataset.subject || '';
      const raw = li.dataset.subjectRaw || '';
      const header = /** @type {HTMLButtonElement} */(li.querySelector('.acc-header'));
      const panel = /** @type {HTMLElement} */(li.querySelector('.acc-panel'));
      if (!q) {
        // Reset highlight
        header.innerHTML = `${escapeHtml(raw)} ${header.querySelector('.acc-badge')?.outerHTML || ''}`;
        if (!savedOpen.has(raw)) collapse(panel, header, false);
        li.style.display = '';
        continue;
      }
      const match = name.includes(q);
      li.style.display = match ? '' : 'none';
      if (match) {
        // Highlight
        const badge = header.querySelector('.acc-badge')?.outerHTML || '';
        header.innerHTML = `${highlight(raw, q)} ${badge}`;
        // Auto-expand
        expand(panel, header, true);
      }
    }
  }
  input.addEventListener('input', () => { localStorage.setItem(searchKey, input.value); applySearch(); });
  if (lastSearch) applySearch();

  function saveOpenState() {
    const open = [];
    for (const li of /** @type {NodeListOf<HTMLLIElement>} */(list.querySelectorAll('.acc-item'))) {
      const subject = li.dataset.subjectRaw;
      const btn = /** @type {HTMLButtonElement} */(li.querySelector('.acc-header'));
      if (btn?.getAttribute('aria-expanded') === 'true' && subject) open.push(subject);
    }
    localStorage.setItem(openKey, JSON.stringify(open));
  }
}

// Animation helpers
function expand(panel, btn, animate = true) {
  if (!panel || !btn) return;
  const startHeight = panel.getBoundingClientRect().height;
  panel.style.height = startHeight + 'px';
  panel.style.display = 'block';
  const endHeight = panel.scrollHeight;
  if (animate) requestAnimationFrame(() => {
    panel.style.height = endHeight + 'px';
  }); else panel.style.height = endHeight + 'px';
  panel.addEventListener('transitionend', function handler() {
    panel.style.height = 'auto';
    panel.removeEventListener('transitionend', handler);
  });
  btn.setAttribute('aria-expanded', 'true');
}

function collapse(panel, btn, animate = true) {
  if (!panel || !btn) return;
  const startHeight = panel.scrollHeight;
  panel.style.height = startHeight + 'px';
  // Force reflow
  panel.getBoundingClientRect();
  if (animate) requestAnimationFrame(() => { panel.style.height = '0px'; }); else panel.style.height = '0px';
  btn.setAttribute('aria-expanded', 'false');
}

// Utils
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
function highlight(text, query) {
  const i = text.toLowerCase().indexOf(query);
  if (i === -1) return escapeHtml(text);
  const before = escapeHtml(text.slice(0,i));
  const mid = escapeHtml(text.slice(i, i+query.length));
  const after = escapeHtml(text.slice(i+query.length));
  return `${before}<mark class="res-mark">${mid}</mark>${after}`;
}
function hash(s) { let h=0; for (let i=0;i<s.length;i++){ h=(h<<5)-h + s.charCodeAt(i); h|=0; } return Math.abs(h).toString(36); }
// Board helpers
const BOARD_ORDER = ["AQA", "Pearson Edexcel", "OCR", "WJEC/Eduqas", "CCEA", "CIE"];
const DOMAIN_TO_BOARD = {
  "aqa.org.uk": "AQA",
  "qualifications.pearson.com": "Pearson Edexcel",
  "ocr.org.uk": "OCR",
  "eduqas.co.uk": "WJEC/Eduqas",
  "wjec.co.uk": "WJEC/Eduqas",
  "ccea.org.uk": "CCEA",
  "cambridgeinternational.org": "CIE",
  "cie.org.uk": "CIE",
};
function boardFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return DOMAIN_TO_BOARD[host] || host;
  } catch { return 'Spec'; }
}

// ------------- Mini summary + Drawer API -------------

/**
 * Render a compact summary (subject count + top 6 subject chips).
 * @param {HTMLElement} el
 */
export async function renderResourcesMini(el) {
  if (!el) return;
  // Minimal professional description only (no chips)
  injectOnce('res-mini-css', `
    #resourcesCard .muted { color:#64748b; font-size: 13px; }
  `);
  el.innerHTML = '<p class="muted">Official exam board specification links.</p>';
}

/**
 * Open slide-over drawer with accordion. Lazy-loads data on first open.
 */
let drawerSingleton = null; // { root, backdrop, panel, content, title, listeners:[], opener:HTMLElement|null, trapCleanup:Function|null, isOpen:boolean, isAnimating:boolean }

export async function openResourcesDrawer(opts = {}) {
  if (!drawerSingleton) drawerSingleton = ensureDrawerRoot();
  const d = drawerSingleton;
  if (d.isOpen || d.isAnimating) return;
  d.isAnimating = true;
  d.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // Temporarily disable the opener to prevent double-activations
  const restoreOpener = (() => {
    if (d.opener && 'disabled' in d.opener) {
      const el = /** @type {HTMLButtonElement} */(d.opener);
      const prev = el.disabled;
      el.disabled = true;
      return () => { el.disabled = prev; };
    }
    return () => {};
  })();
  d._restoreOpener = restoreOpener;

  // Prepare content
  d.content.innerHTML = '';
  d.title.textContent = 'Resources';
  const accHost = document.createElement('div');
  accHost.id = 'resources-drawer-content';
  d.content.appendChild(accHost);

  // Open DOM
  d.root.removeAttribute('aria-hidden');
  applyInert(true);
  lockScroll();
  requestAnimationFrame(() => {
    d.backdrop.classList.add('open');
    d.panel.classList.add('open');
    // enable pointer events only when open to avoid early clicks
    d.backdrop.style.pointerEvents = 'auto';
  });

  // Lazy render
  try {
    await renderResourcesAccordion(accHost, {});
    // Focus the search input if present, else first focusable
    const search = d.panel.querySelector('input[type="search"], input[type="text"]');
    /** @type {HTMLElement|null} */
    const focusTarget = search || d.panel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusTarget) focusTarget.focus();
  } catch {
    accHost.textContent = 'Failed to load resources';
  }

  // Listeners (once)
  if (!d._listenersBound) {
    const escHandler = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeResourcesDrawer(); } };
    const clickBackdrop = (e) => { if (e.target === d.backdrop) closeResourcesDrawer(); };
    d.listeners = [
      { target: window, type: 'keydown', fn: escHandler },
      { target: d.backdrop, type: 'click', fn: clickBackdrop },
      { target: window, type: 'visibilitychange', fn: () => { if (document.visibilityState === 'hidden') closeResourcesDrawer(); } },
      { target: window, type: 'beforeunload', fn: () => { unlockScroll(true); } },
    ];
    d.listeners.forEach(({ target, type, fn }) => target.addEventListener(type, fn));
    d._listenersBound = true;
  }
  if (d.trapCleanup) d.trapCleanup();
  d.trapCleanup = trapFocus(d.panel);

  // Deep-link expand
  if (opts.subjectToOpen) {
    const btn = d.panel.querySelector(`.acc-header[data-subject="${CSS.escape(opts.subjectToOpen)}"]`);
    if (btn instanceof HTMLElement) btn.click();
  }

  // Done
  setTimeout(() => { d.isAnimating = false; d.isOpen = true; }, 250);
}

export function closeResourcesDrawer() {
  const d = drawerSingleton;
  if (!d || !d.isOpen) return;
  d.isAnimating = true;
  d.backdrop.classList.remove('open');
  d.panel.classList.remove('open');
  d.backdrop.style.pointerEvents = 'none';
  // cleanup focus trap
  if (d.trapCleanup) { d.trapCleanup(); d.trapCleanup = null; }
  // Reset accordion open state and search so next open starts neutral and collapsed
  try {
    localStorage.removeItem('resources.openSubjects');
    localStorage.removeItem('resources.search');
  } catch {}
  setTimeout(() => {
    d.root.setAttribute('aria-hidden', 'true');
    d.content.innerHTML = '';
    applyInert(false);
    unlockScroll();
    // restore focus
    if (d.opener && d.opener instanceof HTMLElement) { try { d.opener.focus(); } catch {} }
    if (typeof d._restoreOpener === 'function') { try { d._restoreOpener(); } catch {} d._restoreOpener = null; }
    d.isAnimating = false;
    d.isOpen = false;
  }, 220);
  // Remove transient deep-link param/hash
  clearResourcesDeepLink();
}

function ensureDrawerRoot() {
  let root = document.getElementById('resources-drawer-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'resources-drawer-root';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  injectOnce('res-drawer-css', `
    .resources-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.35); opacity:0; transition:opacity .2s; z-index: 1000; pointer-events:none; }
    .resources-backdrop.open{ opacity:1; }
    .resources-panel{ position:fixed; top:0; right:0; height:100vh; width:clamp(320px,36vw,420px); background:#fff; box-shadow: -8px 0 24px rgba(0,0,0,.1); transform: translateX(100%); display:flex; flex-direction:column; transition: transform .25s ease; z-index: 1001; padding-right: env(safe-area-inset-right); }
    .resources-panel.open{ transform: translateX(0); }
    .resources-header{ display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid #f1f5f9; }
    .resources-title{ margin:0; font-weight:700; font-size:16px; }
    .res-close{ border:0; background:transparent; font-size:18px; cursor:pointer; padding:6px; min-height:44px; }
    .resources-content{ overflow-y:auto; padding:12px 10px 16px; height: 100%; }
    @media (max-width: 768px){ .resources-panel{ width:100vw; } }
  `);
  // Clear and rebuild structure each time to ensure listeners are fresh
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'resources-backdrop';
  backdrop.setAttribute('role','presentation');
  const panel = document.createElement('div');
  panel.className = 'resources-panel';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  const header = document.createElement('div');
  header.className = 'resources-header';
  const title = document.createElement('h3');
  title.className = 'resources-title';
  title.id = 'resources-title';
  panel.setAttribute('aria-labelledby','resources-title');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'res-close';
  closeBtn.setAttribute('aria-label','Close resources');
  closeBtn.innerHTML = '&times;';
  header.appendChild(title);
  header.appendChild(closeBtn);
  const content = document.createElement('div');
  content.className = 'resources-content';
  panel.appendChild(header);
  panel.appendChild(content);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);
  const instance = { root, backdrop, panel, content, title, listeners: [], opener: null, trapCleanup: null, isOpen: false, isAnimating: false, _listenersBound: false };
  closeBtn.addEventListener('click', () => closeResourcesDrawer());
  return instance;
}

function trapFocus(container) {
  const FOCUSABLE = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const getNodes = () => /** @type {HTMLElement[]} */(Array.from(container.querySelectorAll(FOCUSABLE)));
  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    const nodes = getNodes();
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  container.addEventListener('keydown', onKeyDown);
  return () => container.removeEventListener('keydown', onKeyDown);
}

// small helper
function elCreate(tag, className) { const n = document.createElement(tag); if (className) n.className = className; return n; }

// Scroll locking with scrollbar compensation
let prevOverflow = ''; let prevPaddingRight = ''; let scrollLocked = false;
function lockScroll() {
  if (scrollLocked) return;
  const sw = window.innerWidth - document.documentElement.clientWidth;
  const body = document.body;
  prevOverflow = body.style.overflow;
  prevPaddingRight = body.style.paddingRight;
  body.style.overflow = 'hidden';
  if (sw > 0) body.style.paddingRight = `${sw}px`;
  scrollLocked = true;
}
function unlockScroll(force = false) {
  if (!scrollLocked && !force) return;
  const body = document.body;
  body.style.overflow = prevOverflow || '';
  body.style.paddingRight = prevPaddingRight || '';
  scrollLocked = false;
}

// Inert main app while dialog open
function applyInert(isOn) {
  const root = document.querySelector('#app-root, #app, #root, main');
  if (!root) return;
  if (isOn) {
    root.setAttribute('aria-hidden', 'true');
    try { root.inert = true; } catch {}
  } else {
    root.removeAttribute('aria-hidden');
    try { root.inert = false; } catch {}
  }
}

// Deep link helpers
export function maybeOpenResourcesFromDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URL(window.location.href).hash;
  let subject = null;
  if (params.has('resources')) subject = params.get('resources');
  else if (hash && hash.startsWith('#resources=')) subject = decodeURIComponent(hash.split('=')[1] || '');
  if (subject) {
    openResourcesDrawer({ subjectToOpen: subject });
  }
}
function clearResourcesDeepLink() {
  const url = new URL(window.location.href);
  url.searchParams.delete('resources');
  if (url.hash && url.hash.startsWith('#resources=')) url.hash = '';
  history.replaceState({}, '', url);
}
