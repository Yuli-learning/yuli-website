import { auth } from "./firebaseClient.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    collection, 
    addDoc, 
    deleteDoc,
    query, 
    where, 
    orderBy, 
    onSnapshot,
    serverTimestamp,
    Timestamp,
    getDoc,
    getDocs,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { DateTime } from "https://cdn.jsdelivr.net/npm/luxon@3/build/es6/luxon.js";

const db = getFirestore();

let currentUser = null;
let availabilityListener = null;

// Available subjects and exam boards
const SUBJECTS = [
    'Mathematics', 'English Literature', 'Biology', 'Chemistry', 'Physics'
];

const EXAM_BOARDS = ['AQA', 'Edexcel', 'OCR', 'WJEC', 'CIE'];

// Weekday ordering for recurring rules
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Initialize tutor availability management
 */
export function initTutorAvailability() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            setupAvailabilityListener();
            // Try to load and cache tutor timezone for the form default
            loadTutorTimezone().catch(() => {});
        } else {
            currentUser = null;
            if (availabilityListener) {
                availabilityListener();
                availabilityListener = null;
            }
        }
    });
}

/**
 * Setup real-time availability listener
 */
function setupAvailabilityListener() {
    if (!currentUser) return;
    
    const availabilityRef = collection(db, "availability");
    const availabilityQuery = query(
        availabilityRef,
        where("tutorId", "==", currentUser.uid),
        orderBy("start", "asc")
    );
    
    availabilityListener = onSnapshot(availabilityQuery, (snapshot) => {
        const slots = [];
        snapshot.forEach(doc => {
            slots.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        renderAvailabilityList(slots);
    });
}

// Timezone helpers
async function loadTutorTimezone() {
    if (!currentUser) return null;
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};
        if (data.tutorTimezone) {
            window.__tutorTimezoneCache = data.tutorTimezone;
        }
        return data.tutorTimezone || null;
    } catch (e) {
        return null;
    }
}

async function saveTutorTimezone(tz) {
    if (!currentUser || !tz) return;
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, { tutorTimezone: tz }, { merge: true });
        window.__tutorTimezoneCache = tz;
    } catch (e) {
        console.warn('Failed to save tutor timezone', e);
    }
}

/**
 * Add new availability slot
 */
export async function addAvailabilitySlot(slotData) {
    if (!currentUser) {
        throw new Error('User not authenticated');
    }
    
    try {
        const slotDoc = {
            tutorId: currentUser.uid,
            subject: slotData.subject,
            level: slotData.level,
            examBoards: slotData.examBoards,
            start: Timestamp.fromDate(slotData.start),
            end: Timestamp.fromDate(slotData.end),
            tutorTimezone: slotData.tutorTimezone,
            isBooked: false,
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, "availability"), slotDoc);
        console.log('Availability slot added:', docRef.id);
        return docRef.id;
        
    } catch (error) {
        console.error('Failed to add availability slot:', error);
        throw error;
    }
}

/**
 * Remove availability slot
 */
export async function removeAvailabilitySlot(slotId) {
    if (!currentUser) {
        throw new Error('User not authenticated');
    }
    
    try {
        await deleteDoc(doc(db, "availability", slotId));
        console.log('Availability slot removed:', slotId);
        
    } catch (error) {
        console.error('Failed to remove availability slot:', error);
        throw error;
    }
}

/**
 * Create availability modal
 */
export function createAvailabilityModal() {
    // Remove existing modal if present
    const existing = document.getElementById('availability-modal');
    if (existing) existing.remove();
    
    const modalHTML = `
        <div id="availability-modal" class="modal-overlay" role="dialog" aria-labelledby="modal-title" aria-modal="true">
            <div class="modal-container">
                <!-- Header -->
                <header class="modal-header">
                    <h3 id="modal-title" class="modal-title">Set Availability</h3>
                    <p class="modal-subtitle">Choose the time windows students can book. Changes apply to new bookings.</p>
                </header>

                <!-- Body -->
                <div class="modal-body">
                    <!-- Toolbar -->
                    <div class="toolbar">
                        <button type="button" id="copy-mon-weekdays" class="toolbar-btn" title="Copy Monday schedule to Tuesday through Friday">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                            </svg>
                            Copy Mon → Weekdays
                        </button>
                        <div class="toolbar-divider"></div>
                        <div class="preset-dropdown">
                            <button type="button" id="preset-btn" class="toolbar-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                                </svg>
                                Preset ▼
                            </button>
                            <div id="preset-menu" class="preset-menu" hidden>
                                <button type="button" data-preset="weekdays-16-20">Weekdays 16:00–20:00</button>
                                <button type="button" data-preset="evenings-18-21">Evenings 18:00–21:00</button>
                                <button type="button" data-preset="weekends-10-14">Weekends 10:00–14:00</button>
                            </div>
                        </div>
                        <button type="button" id="clear-all" class="toolbar-btn toolbar-btn-danger" title="Remove all time slots">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2"/>
                                <line x1="10" x2="10" y1="11" y2="17"/>
                                <line x1="14" x2="14" y1="11" y2="17"/>
                            </svg>
                            Clear all
                        </button>
                    </div>

                    <!-- Settings Bar -->
                    <div class="settings-bar">
                        <div class="settings-group">
                            <label for="slot-timezone" class="settings-label">Timezone</label>
                            <select id="slot-timezone" class="settings-select">
                                <option value="Europe/London">Europe/London</option>
                                <option value="America/New_York">America/New_York</option>
                                <option value="America/Los_Angeles">America/Los_Angeles</option>
                                <option value="Europe/Paris">Europe/Paris</option>
                                <option value="Asia/Tokyo">Asia/Tokyo</option>
                            </select>
                        </div>
                        <div class="settings-group">
                            <label class="settings-label">Time Format</label>
                            <div class="toggle-group">
                                <input type="radio" id="format-24" name="timeFormat" value="24" checked>
                                <label for="format-24" class="toggle-label">24h</label>
                                <input type="radio" id="format-12" name="timeFormat" value="12">
                                <label for="format-12" class="toggle-label">12h</label>
                            </div>
                        </div>
                    </div>

                    <!-- Days Grid -->
                    <div id="days-grid" class="days-grid"></div>

                    <!-- Exam Boards Section -->
                    <div class="exam-boards-section">
                        <h4 class="section-title">Exam Boards</h4>
                        <div class="checkbox-grid" id="exam-boards-group">
                            ${EXAM_BOARDS.map(board => `
                                <label class="checkbox-item">
                                    <input type="checkbox" name="examBoards" value="${board}">
                                    <span class="checkbox-label">${board}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <footer class="modal-footer">
                    <button type="button" id="modal-cancel" class="btn-secondary">Cancel</button>
                    <button type="button" id="modal-save" class="btn-primary">Save availability</button>
                </footer>
            </div>
        </div>

        <!-- Time Picker Popover -->
        <div id="time-picker-popover" class="time-picker-popover" hidden>
            <div class="time-picker-content">
                <div class="time-picker-header">
                    <span class="time-picker-title">Set Time Window</span>
                </div>
                <div class="time-picker-body">
                    <div class="time-input-group">
                        <label>Start</label>
                        <input type="time" id="start-time" step="900">
                    </div>
                    <div class="time-input-group">
                        <label>End</label>
                        <input type="time" id="end-time" step="900">
                    </div>
                    <div id="time-error" class="time-error" hidden></div>
                </div>
                <div class="time-picker-footer">
                    <button type="button" id="time-cancel" class="btn-ghost">Cancel</button>
                    <button type="button" id="time-save" class="btn-primary">Save</button>
                </div>
            </div>
        </div>

        <div class="availability-list-container">
            <h3>Current Availability</h3>
            <div id="availability-list" class="availability-list">
                <div class="loading">Loading availability...</div>
            </div>
        </div>

        <style>
            .availability-form-container {
                background: white;
                border-radius: 12px;
                padding: 24px;
                margin-bottom: 24px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .availability-form { max-width: 900px; }
            .form-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:16px; margin-bottom:16px; }
            .form-group { display:flex; flex-direction:column; gap:8px; }
            .form-group label { font-weight:600; color:#374151; font-size:14px; }
            .form-group input { padding:12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; }
            .checkbox-group { display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap:12px; }
            .checkbox-label { display:flex; align-items:center; gap:8px; cursor:pointer; }
            .form-actions { display:flex; gap:12px; margin-top:16px; }
            .btn-primary, .btn-secondary { padding:10px 16px; border-radius:8px; font-weight:600; cursor:pointer; border:none; }
            .btn-primary { background:#6366f1; color:#fff; }
            .btn-secondary { background:#f3f4f6; color:#374151; }

            .weekly-editor { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px; }
            .day-card { border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#fff; }
            .day-title { font-weight:700; margin-bottom:8px; color:#111827; }
            .range-chip { display:inline-flex; align-items:center; gap:8px; padding:6px 10px; background:#eef2ff; color:#4338ca; border:1px solid #e0e7ff; border-radius:999px; font-weight:600; font-size:12px; margin:6px 6px 0 0; }
            .range-chip button { background:transparent; border:none; color:#6b7280; cursor:pointer; font-weight:700; }
            .add-time { margin-top:8px; font-size:12px; color:#6366f1; cursor:pointer; font-weight:600; }

            .availability-list-container { background:#fff; border-radius:12px; padding:24px; box-shadow:0 2px 8px rgba(0,0,0,0.1); }
            .slot-item { display:grid; grid-template-columns:1fr auto; gap:12px 16px; align-items:center; padding:16px; border:1px solid #e5e7eb; border-radius:12px; margin-bottom:12px; transition: box-shadow .16s ease, border-color .16s ease, transform .16s ease; background:#fff; }
            .slot-item:hover { box-shadow:0 6px 18px rgba(0,0,0,0.08); border-color:#d1d5db; }
            .slot-info { flex:1; }
            .slot-title { font-weight:700; color:#111827; margin-bottom:6px; letter-spacing:.1px; }
            .slot-details { color:#6b7280; font-size:14px; display:flex; flex-wrap:wrap; gap:6px 10px; }
            .slot-actions { display:flex; gap:8px; align-items:center; }
            .btn-small { padding:6px 12px; font-size:12px; border-radius:6px; border:none; cursor:pointer; }
            .btn-danger { background:#ef4444; color:#fff; }
            .slot-status { padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600; }
            .status-available { background:#dcfce7; color:#166534; }
            .status-booked { background:#fef3c7; color:#92400e; }

            .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
            .chip { display:inline-flex; align-items:center; height:24px; padding:0 10px; border-radius:999px; background:#f3f4f6; color:#374151; font-size:12px; font-weight:600; border:1px solid #e5e7eb; }

            @media (max-width: 640px) {
                .slot-item { grid-template-columns: 1fr; }
                .slot-actions { justify-content:flex-start; }
            }
        </style>
    `;
    
    container.innerHTML = formHTML;
    
    // Setup weekly editor handlers and initial state
    setupFormHandlers();
}

/**
 * Setup form event handlers
 */
function setupFormHandlers() {
    const form = document.getElementById('availability-form');
    const weeklyEditor = document.getElementById('weekly-editor');
    const tzInput = document.getElementById('slot-timezone');
    const copyBtn = document.getElementById('copy-mon-weekdays');
    const clearBtn = document.getElementById('clear-all');
    const presetBtn = document.getElementById('preset-weekdays-16-20');

    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    tzInput.value = (window.__tutorTimezoneCache) || browserTz || 'Europe/London';

    const state = {
        rules: DAYS.map(d => ({ day: d, ranges: [] })),
        boards: new Set(),
    };

    // Load any saved rules and boards
    loadAvailabilityRules().then(saved => {
        if (saved) {
            if (saved.tutorTimezone && !tzInput.value) tzInput.value = saved.tutorTimezone;
            if (Array.isArray(saved.examBoards)) {
                saved.examBoards.forEach(b => state.boards.add(b));
                document.querySelectorAll('input[name="examBoards"]').forEach(cb => cb.checked = state.boards.has(cb.value));
            }
            if (Array.isArray(saved.availabilityRules)) {
                const map = new Map(saved.availabilityRules.map(r => [r.day, r.ranges || []]));
                state.rules.forEach(r => { r.ranges = (map.get(r.day) || []).map(x => ({ start: x.start, end: x.end })); });
            }
        }
        renderWeeklyEditor(weeklyEditor, state);
    }).catch(() => renderWeeklyEditor(weeklyEditor, state));

    // Exam board selection
    document.getElementById('exam-boards-group')?.addEventListener('change', (e) => {
        if (e.target && e.target.name === 'examBoards') {
            if (e.target.checked) state.boards.add(e.target.value); else state.boards.delete(e.target.value);
        }
    });

    copyBtn?.addEventListener('click', () => {
        const mon = state.rules.find(r => r.day === 'Mon');
        ['Tue','Wed','Thu','Fri'].forEach(d => {
            const t = state.rules.find(r => r.day === d);
            t.ranges = mon ? mon.ranges.map(x => ({...x})) : [];
        });
        renderWeeklyEditor(weeklyEditor, state);
    });

    clearBtn?.addEventListener('click', () => {
        state.rules.forEach(r => r.ranges = []);
        renderWeeklyEditor(weeklyEditor, state);
    });

    presetBtn?.addEventListener('click', () => {
        state.rules.forEach(r => {
            if (['Mon','Tue','Wed','Thu','Fri'].includes(r.day)) {
                r.ranges = [{ start: '16:00', end: '20:00' }];
            } else {
                r.ranges = [];
            }
        });
        renderWeeklyEditor(weeklyEditor, state);
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tz = (tzInput.value || '').trim() || 'Europe/London';
            await saveTutorTimezone(tz);
            const rules = state.rules.map(r => ({ day: r.day, ranges: r.ranges }));
            const boards = Array.from(state.boards);
            await saveAvailabilityRules({ availabilityRules: rules, tutorTimezone: tz, examBoards: boards });
            await materializeFutureSlotsFromRules(rules, tz, boards, 12);
            alert('Availability saved and future slots updated.');
        });
    }
}

/**
 * Handle form submission
 */
// Renders the weekly editor UI chips and handles inline actions
function renderWeeklyEditor(container, state) {
    if (!container) return;
    container.innerHTML = DAYS.map(day => {
        const rule = state.rules.find(r => r.day === day);
        const chips = (rule?.ranges || []).map((rg, idx) => `
            <span class="range-chip" data-day="${day}" data-idx="${idx}">${rg.start}–${rg.end}
                <button type="button" class="edit-range" title="Edit">Edit</button>
                <button type="button" class="remove-range" title="Remove">×</button>
            </span>
        `).join('');
        return `
            <div class="day-card" data-day="${day}">
                <div class="day-title">${day}</div>
                <div class="ranges">${chips || '<span style="color:#6b7280; font-size:12px;">No times</span>'}</div>
                <div class="add-time" data-add-day="${day}">Add time</div>
            </div>
        `;
    }).join('');

    // Wire up add/edit/remove
    container.querySelectorAll('.add-time').forEach(el => {
        el.addEventListener('click', () => {
            const day = el.getAttribute('data-add-day');
            const input = prompt('Enter time range as HH:MM-HH:MM (24h)');
            if (!input) return;
            const m = input.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
            if (!m) return alert('Invalid format. Example: 16:00-20:00');
            const [ , start, end ] = m;
            const r = state.rules.find(x => x.day === day);
            r.ranges.push({ start, end });
            renderWeeklyEditor(container, state);
        });
    });
    container.querySelectorAll('.remove-range').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrap = btn.closest('.range-chip');
            const day = wrap.getAttribute('data-day');
            const idx = parseInt(wrap.getAttribute('data-idx'), 10);
            const r = state.rules.find(x => x.day === day);
            r.ranges.splice(idx, 1);
            renderWeeklyEditor(container, state);
        });
    });
    container.querySelectorAll('.edit-range').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrap = btn.closest('.range-chip');
            const day = wrap.getAttribute('data-day');
            const idx = parseInt(wrap.getAttribute('data-idx'), 10);
            const r = state.rules.find(x => x.day === day);
            const current = r.ranges[idx];
            const input = prompt('Edit time range HH:MM-HH:MM', `${current.start}-${current.end}`);
            if (!input) return;
            const m = input.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
            if (!m) return alert('Invalid format. Example: 16:00-20:00');
            const [ , start, end ] = m;
            r.ranges[idx] = { start, end };
            renderWeeklyEditor(container, state);
        });
    });
}

// Persist rules and boards to users doc
async function saveAvailabilityRules(payload) {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, payload, { merge: true });
}

// Load rules and boards from users doc
async function loadAvailabilityRules() {
    if (!currentUser) return null;
    try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        return null;
    }
}

// Create a 12-week rolling set of slots from weekly rules
async function materializeFutureSlotsFromRules(rules, tutorTimezone, examBoards, weeks = 12) {
    if (!currentUser) return;

    // Fetch existing future slots for this tutor
    const nowUtc = DateTime.utc();
    const availabilityRef = collection(db, 'availability');
    // We cannot query with compound conditions here without an index for 'start >= now' and tutorId; assume index exists
    // Fallback: we'll filter client-side after the onSnapshot listener; here we just reconstruct target set and remove by id when needed via additional reads.

    // Build target set of UTC intervals for next N weeks
    const targets = [];
    let startDate = DateTime.now().setZone(tutorTimezone).startOf('day');
    const endWindow = startDate.plus({ weeks });

    for (let d = startDate; d < endWindow; d = d.plus({ days: 1 })) {
        const dayName = d.toFormat('ccc'); // Mon, Tue, ...
        const rule = rules.find(r => r.day === dayName);
        if (!rule || !Array.isArray(rule.ranges)) continue;
        for (const rg of rule.ranges) {
            const [sh, sm] = rg.start.split(':').map(Number);
            const [eh, em] = rg.end.split(':').map(Number);
            const startLocal = d.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
            const endLocal = d.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
            if (endLocal <= startLocal) continue;
            targets.push({
                key: `${startLocal.toISO()}_${endLocal.toISO()}`,
                startUtc: startLocal.setZone('utc'),
                endUtc: endLocal.setZone('utc'),
            });
        }
    }

    // Read existing future slots and decide add/remove
    const existing = [];
    const qAll = query(availabilityRef, where('tutorId', '==', currentUser.uid), orderBy('start', 'asc'));
    const snap = await getDocs(qAll);
    const targetKeys = new Set(targets.map(t => t.key));
    const needAdd = [];
    const canRemove = [];

    snap.forEach(docSnap => {
        const data = docSnap.data();
        const start = DateTime.fromJSDate(data.start.toDate(), { zone: 'utc' });
        const end = DateTime.fromJSDate(data.end.toDate(), { zone: 'utc' });
        if (end <= nowUtc) return; // past slot
        const startLocal = start.setZone(tutorTimezone);
        const endLocal = end.setZone(tutorTimezone);
        const key = `${startLocal.toISO()}_${endLocal.toISO()}`;
        if (targetKeys.has(key)) {
            // keep
        } else {
            if (!data.isBooked) {
                canRemove.push(docSnap.id);
            }
        }
        existing.push(key);
    });

    // For additions, add those target keys not present in existing
    const existingSet = new Set(existing);
    for (const t of targets) {
        if (!existingSet.has(t.key)) {
            needAdd.push(t);
        }
    }

    // Apply removals (safe for unbooked only)
    for (const id of canRemove) {
        try { await deleteDoc(doc(db, 'availability', id)); } catch (_) {}
    }

    // Apply additions using existing addAvailabilitySlot schema – we need subject/level. For now, we cannot infer subject/level; default to generic placeholders.
    // If your app requires specific subject/level per tutor, extend rules to include them.
    const defaultSubject = SUBJECTS[0];
    const defaultLevel = 'GCSE';
    for (const t of needAdd) {
        const slotData = {
            subject: defaultSubject,
            level: defaultLevel,
            examBoards,
            start: t.startUtc.toJSDate(),
            end: t.endUtc.toJSDate(),
            tutorTimezone,
        };
        try { await addAvailabilitySlot(slotData); } catch (_) {}
    }
}

/**
 * Render availability list
 */
function renderAvailabilityList(slots) {
    const listContainer = document.getElementById('availability-list');
    if (!listContainer) return;
    
    if (slots.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <p>No availability slots created yet.</p>
            </div>
        `;
        return;
    }
    
    const defaultTz = window.__tutorTimezoneCache || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
    const slotsHTML = slots.map(slot => {
        // Convert from UTC to tutor timezone
        const tz = slot.tutorTimezone || defaultTz;
        const startTime = DateTime.fromJSDate(slot.start.toDate(), { zone: 'utc' }).setZone(tz);
        const endTime = DateTime.fromJSDate(slot.end.toDate(), { zone: 'utc' }).setZone(tz);
        const isBooked = slot.isBooked;
        
        return `
            <div class="slot-item">
                <div class="slot-info">
                    <div class="slot-title">${slot.subject} • ${slot.level}</div>
                    <div class="slot-details">
                        <span>${startTime.toFormat('ccc dd LLL yyyy')}</span>
                        <span>•</span>
                        <span>${startTime.toFormat('HH:mm')}–${endTime.toFormat('HH:mm')} (${tz})</span>
                    </div>
                    <div class="chips">
                        ${slot.examBoards.map(b => `<span class="chip">${b}</span>`).join('')}
                    </div>
                </div>
                <div class="slot-actions">
                    <span class="slot-status ${isBooked ? 'status-booked' : 'status-available'}">
                        ${isBooked ? 'Booked' : 'Available'}
                    </span>
                    ${!isBooked ? `<button class="btn-small btn-danger" onclick="removeSlot('${slot.id}')">Remove</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    listContainer.innerHTML = slotsHTML;
}

/**
 * Global function to remove slot (called from onclick)
 */
window.removeSlot = async function(slotId) {
    if (confirm('Are you sure you want to remove this availability slot?')) {
        try {
            await removeAvailabilitySlot(slotId);
            
        } catch (error) {
            console.error('Failed to remove slot:', error);
            alert('Failed to remove slot. Please try again.');
        }
    }
};
