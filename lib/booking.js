import { auth } from "./firebaseClient.js";
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
    addDoc,
    updateDoc,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js";
import { replace } from "./nav.js";
import { DateTime } from "https://cdn.jsdelivr.net/npm/luxon@3/build/es6/luxon.js";

const db = getFirestore();
const functions = getFunctions();

// State
let currentUser = null;
let userProfile = null;
let selectedSlot = null;
let availableSlots = [];
let selectedDate = null;
let studentZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Pricing constants
const PRICING = {
    GCSE: { standard: 20, discounted: 12 },
    "A-Level": { standard: 35, discounted: 18 }
};

// Subject catalog mapping levels to subjects
const SUBJECT_CATALOG = {
    "GCSE": [
        { slug: "mathematics", label: "Mathematics" },
        { slug: "further-maths", label: "Further Maths" },
        { slug: "biology", label: "Biology" },
        { slug: "chemistry", label: "Chemistry" },
        { slug: "physics", label: "Physics" },
        { slug: "english-literature", label: "English Literature" },
        { slug: "english-language", label: "English Language" },
        { slug: "history", label: "History" }
    ],
    "A-Level": [
        { slug: "mathematics", label: "Mathematics" },
        { slug: "biology", label: "Biology" },
        { slug: "chemistry", label: "Chemistry" }
    ]
};

// UK exam boards
const EXAM_BOARDS = ["AQA", "Edexcel", "OCR", "WJEC", "CIE"];

// DOM elements
const subjectFilter = document.getElementById('subject-filter');
const levelFilter = document.getElementById('level-filter');
const examBoardFilter = document.getElementById('examboard-filter');
const calendarContainer = document.getElementById('calendar-container');
const slotsContainer = document.getElementById('slots-container');
const summaryContent = document.getElementById('summary-content');
const bookButton = document.getElementById('book-button');
const logoutBtn = document.getElementById('logout-btn');

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        replace("/signin");
        return;
    }

    currentUser = user;
    await loadUserProfile();
    // If the user returned from Stripe with a canceled checkout, release their hold
    await maybeReleaseHoldFromCancel();
    initializeFromURL();
    setupEventListeners();
    generateCalendar();
    setupAvailabilityListener();
    // Set timezone note in UI if present
    const tzNote = document.getElementById('timezone-note');
    if (tzNote) {
        tzNote.textContent = `Times shown in your local timezone: ${studentZone}`;
    }
});

// Load user profile with discount status
async function loadUserProfile() {
    try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            userProfile = userSnap.data();
        } else {
            userProfile = {};
        }
    } catch (error) {
        console.error("Failed to load user profile:", error);
        userProfile = {};
    }
}

// If Stripe redirect included canceled=1&bookingId=..., release the hold for that booking
async function maybeReleaseHoldFromCancel() {
    try {
        const url = new URL(window.location.href);
        const canceled = url.searchParams.get('canceled');
        const bookingId = url.searchParams.get('bookingId');
        if (canceled === '1' && bookingId && currentUser) {
            const releaseSlotHold = httpsCallable(functions, 'releaseSlotHold');
            await releaseSlotHold({ bookingId });
            // Clean query params so we don't call again on refresh
            url.searchParams.delete('canceled');
            url.searchParams.delete('bookingId');
            history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
        }
    } catch (e) {
        console.warn('maybeReleaseHoldFromCancel failed', e);
    }
}

// Initialize dropdowns and filters from URL parameters
function initializeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject');
    const levelParam = urlParams.get('level');
    const boardParam = urlParams.get('board');
    
    // Set level first
    if (levelParam && (levelParam === 'GCSE' || levelParam === 'A-Level')) {
        levelFilter.value = levelParam;
    } else {
        levelFilter.value = 'GCSE'; // Default to GCSE
    }
    
    // Initialize subject options for the selected level
    populateSubjectOptions(levelFilter.value);
    
    // Set subject based on URL parameter
    if (subjectParam) {
        const selectedLevel = levelFilter.value;
        const subjects = SUBJECT_CATALOG[selectedLevel];
        
        // Try to find subject by label first, then by slug
        let foundSubject = subjects.find(s => s.label === subjectParam);
        if (!foundSubject) {
            foundSubject = subjects.find(s => s.slug === subjectParam);
        }
        
        if (foundSubject) {
            subjectFilter.value = foundSubject.label;
        } else {
            // Fallback to first subject if not found
            subjectFilter.value = subjects[0]?.label || '';
        }
    }
    
    // Update URL to match current selection
    updateURL();

    // Apply exam board if provided
    if (boardParam) {
        // Only set if the option exists; otherwise, leave as default
        const options = Array.from(examBoardFilter.options).map(o => o.value);
        if (options.includes(boardParam)) {
            examBoardFilter.value = boardParam;
        }
    }
}

// Populate subject dropdown options based on selected level
function populateSubjectOptions(level) {
    const currentValue = subjectFilter.value;
    const subjects = SUBJECT_CATALOG[level] || [];
    
    // Clear existing options except the first placeholder
    subjectFilter.innerHTML = '<option value="">Select subject...</option>';
    
    // Add subject options
    subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.label;
        option.textContent = subject.label;
        subjectFilter.appendChild(option);
    });
    
    // Try to preserve current selection if it exists in new level
    const availableSubject = subjects.find(s => s.label === currentValue);
    if (availableSubject) {
        subjectFilter.value = currentValue;
    } else if (subjects.length > 0) {
        // Default to first subject if current selection doesn't exist
        subjectFilter.value = subjects[0].label;
    }
}

// Update URL with current filter values
function updateURL() {
    const urlParams = new URLSearchParams();
    const selectedLevel = levelFilter.value;
    const selectedSubject = subjectFilter.value;
    const selectedBoard = examBoardFilter?.value;
    
    if (selectedLevel) {
        urlParams.set('level', selectedLevel);
    }
    
    if (selectedSubject) {
        // Find the subject slug for URL
        const subjects = SUBJECT_CATALOG[selectedLevel] || [];
        const subject = subjects.find(s => s.label === selectedSubject);
        if (subject) {
            urlParams.set('subject', subject.slug);
        }
    }
    if (selectedBoard) {
        urlParams.set('board', selectedBoard);
    }
    
    // Update URL without page reload
    const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
    history.replaceState(null, '', newUrl);
}

// Setup event listeners
function setupEventListeners() {
    // Level filter change
    levelFilter.addEventListener('change', () => {
        populateSubjectOptions(levelFilter.value);
        updateURL();
        updateAvailableSlots();
        updateSummary();
    });
    
    // Subject and exam board filter changes
    [subjectFilter, examBoardFilter].forEach(filter => {
        filter.addEventListener('change', () => {
            updateURL();
            updateAvailableSlots();
            updateSummary();
        });
    });
    
    // Book button
    bookButton.addEventListener('click', handleBookingSubmit);
}

// Generate calendar for next 28 days
function generateCalendar() {
    const calendarGrid = calendarContainer.querySelector('.calendar-grid');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Clear existing days (keep headers)
    const headers = calendarGrid.querySelectorAll('.calendar-header');
    calendarGrid.innerHTML = '';
    headers.forEach(header => calendarGrid.appendChild(header));
    
    // Generate next 28 days
    for (let i = 0; i < 28; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = date.getDate();
        dayElement.dataset.date = date.toISOString().split('T')[0];
        
        // Disable past dates
        if (date < today) {
            dayElement.classList.add('disabled');
        } else {
            dayElement.addEventListener('click', () => selectDate(date));
        }
        
        calendarGrid.appendChild(dayElement);
    }
}

// Setup real-time availability listener
function setupAvailabilityListener() {
    const availabilityRef = collection(db, "availability");
    const now = new Date();
    
    const availabilityQuery = query(
        availabilityRef,
        where("isBooked", "==", false),
        where("start", ">=", Timestamp.fromDate(now)),
        orderBy("start", "asc")
    );
    
    onSnapshot(availabilityQuery, (snapshot) => {
        availableSlots = [];
        snapshot.forEach(doc => {
            availableSlots.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        updateCalendarAvailability();
        updateAvailableSlots();
    });
}

// Update calendar to show days with available slots
function updateCalendarAvailability() {
    const calendarDays = calendarContainer.querySelectorAll('.calendar-day:not(.disabled)');
    
    calendarDays.forEach(day => {
        const dateStr = day.dataset.date;
        const hasSlots = availableSlots.some(slot => {
            const slotDate = slot.start.toDate().toISOString().split('T')[0];
            return slotDate === dateStr && matchesFilters(slot) && isSlotVisible(slot);
        });
        
        day.classList.toggle('has-slots', hasSlots);
    });
}

// Select a date
function selectDate(date) {
    selectedDate = date;
    selectedSlot = null;
    
    // Update calendar UI
    calendarContainer.querySelectorAll('.calendar-day').forEach(day => {
        day.classList.remove('selected');
    });
    
    const selectedDay = calendarContainer.querySelector(`[data-date="${date.toISOString().split('T')[0]}"]`);
    if (selectedDay) {
        selectedDay.classList.add('selected');
    }
    
    updateAvailableSlots();
    updateSummary();
}

// Check if slot matches current filters
function matchesFilters(slot) {
    const subject = subjectFilter.value;
    const level = levelFilter.value;
    const examBoard = examBoardFilter.value;
    
    if (subject && slot.subject !== subject) return false;
    if (level && slot.level !== level) return false;
    if (examBoard && slot.examBoards && !slot.examBoards.includes(examBoard)) return false;
    
    return true;
}

// Determine if a slot should be shown to the current user (not booked and not held by others)
function isSlotVisible(slot) {
    // isBooked is already filtered server-side, but double-check
    if (slot.isBooked) return false;
    // Active hold logic: hide if held by another user and hold hasn't expired
    const now = new Date();
    const holdBy = slot.holdBy;
    const holdUntil = slot.holdUntil?.toDate ? slot.holdUntil.toDate() : null;
    if (holdBy && holdBy !== currentUser?.uid && holdUntil && holdUntil > now) {
        return false;
    }
    return true;
}

// Update available slots for selected date
function updateAvailableSlots() {
    if (!selectedDate) {
        slotsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-alt"></i>
                <h3>Select a date to see available times</h3>
                <p>Choose a date from the calendar above to view available session slots</p>
            </div>
        `;
        return;
    }
    
    const dateStr = selectedDate.toISOString().split('T')[0];
    const daySlots = availableSlots.filter(slot => {
        const slotDate = slot.start.toDate().toISOString().split('T')[0];
        return slotDate === dateStr && matchesFilters(slot) && isSlotVisible(slot);
    });
    
    if (daySlots.length === 0) {
        slotsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clock"></i>
                <h3>No available times for this date</h3>
                <p>Please try another date or adjust your subject/level filters</p>
            </div>
        `;
        return;
    }
    
    const slotsHTML = daySlots.map(slot => {
        const startLocal = DateTime.fromJSDate(slot.start.toDate(), { zone: 'utc' }).setZone(studentZone);
        const endLocal = DateTime.fromJSDate(slot.end.toDate(), { zone: 'utc' }).setZone(studentZone);
        const timeLabel = `${startLocal.toFormat('ccc dd LLL')}, ${startLocal.toFormat('h:mma').toLowerCase()}–${endLocal.toFormat('h:mma').toLowerCase()}`;
        return `
            <div class="slot-card" data-slot-id="${slot.id}">
                <div class="slot-time">${timeLabel}</div>
                <div class="slot-duration">1 hour</div>
            </div>
        `;
    }).join('');
    
    slotsContainer.innerHTML = `<div class="slots-grid">${slotsHTML}</div>`;
    
    // Add click listeners to slots
    slotsContainer.querySelectorAll('.slot-card').forEach(card => {
        card.addEventListener('click', () => {
            const slotId = card.dataset.slotId;
            selectSlot(daySlots.find(s => s.id === slotId));
        });
    });
}

// Select a time slot
function selectSlot(slot) {
    selectedSlot = slot;
    
    // Update slots UI
    slotsContainer.querySelectorAll('.slot-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const selectedCard = slotsContainer.querySelector(`[data-slot-id="${slot.id}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    
    updateSummary();
}

// Update booking summary
function updateSummary() {
    if (!selectedSlot) {
        summaryContent.innerHTML = `
            <div class="empty-state" style="padding: 24px; text-align: center; color: #94a3b8;">
                <p style="margin: 0; font-size: 14px;">Select your preferences to see booking details</p>
            </div>
        `;
        bookButton.disabled = true;
        bookButton.textContent = "Select a session to continue";
        return;
    }
    
    const subject = selectedSlot.subject;
    const level = selectedSlot.level;
    const examBoard = examBoardFilter.value || "Any";
    const startLocal = DateTime.fromJSDate(selectedSlot.start.toDate(), { zone: 'utc' }).setZone(studentZone);
    const pricing = PRICING[level];
    
    let priceHTML = '';
    let finalPrice = pricing.standard;
    
    if (userProfile.discountStatus === 'approved') {
        finalPrice = pricing.discounted;
        priceHTML = `
            <div class="price-section">
                <div class="price-main">£${finalPrice}</div>
                <div class="price-original">£${pricing.standard}</div>
                <div class="discount-applied">✓ Discount applied</div>
            </div>
        `;
    } else if (userProfile.discountStatus === 'pending') {
        priceHTML = `
            <div class="price-section">
                <div class="price-main">£${pricing.standard}</div>
                <div class="discount-pending">Discounted rate £${pricing.discounted} (awaiting approval)</div>
            </div>
        `;
    } else {
        priceHTML = `
            <div class="price-section">
                <div class="price-main">£${pricing.standard}</div>
                <a href="/profile#discount" class="discount-link">
                    Upload proof to apply for discount →
                </a>
            </div>
        `;
    }
    
    summaryContent.innerHTML = `
        <div class="summary-item">
            <span class="summary-label">Subject</span>
            <span class="summary-value">${subject}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Level</span>
            <span class="summary-value">${level}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Exam Board</span>
            <span class="summary-value">${examBoard}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Date & Time</span>
            <span class="summary-value">${startLocal.toFormat('ccc dd LLL, h:mma').toLowerCase()}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Duration</span>
            <span class="summary-value">1 hour</span>
        </div>
        ${priceHTML}
    `;
    
    bookButton.disabled = false;
    bookButton.textContent = "Review & Pay";
    bookButton.dataset.price = finalPrice;
}

// Handle booking submission
async function handleBookingSubmit() {
    if (!selectedSlot || !currentUser) return;
    
    try {
        bookButton.disabled = true;
        bookButton.textContent = "Creating booking...";
        
        // Create draft booking
        const bookingData = {
            userId: currentUser.uid,
            tutorId: selectedSlot.tutorId,
            subject: selectedSlot.subject,
            level: selectedSlot.level,
            examBoard: examBoardFilter.value || "Any",
            start: selectedSlot.start,
            end: selectedSlot.end,
            slotId: selectedSlot.id,
            price: parseInt(bookButton.dataset.price),
            currency: "GBP",
            status: "pending_payment",
            createdAt: serverTimestamp()
        };
        
        const bookingRef = await addDoc(collection(db, "bookings"), bookingData);
        
        // Create Stripe checkout session
        const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
        const result = await createCheckoutSession({ bookingId: bookingRef.id });
        
        // Redirect to Stripe Checkout
        window.location.href = result.data.url;
        
    } catch (error) {
        console.error("Booking failed:", error);
        alert("Failed to create booking. Please try again.");
        bookButton.disabled = false;
        bookButton.textContent = "Review & Pay";
    }
}

// Utility functions
function formatTime(date) {
    return date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function formatDateTime(date) {
    return date.toLocaleDateString('en-GB', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
