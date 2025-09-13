// Simple Tutor Dashboard - No ES6 modules, uses CDN Firebase
(function() {
    // Mock data for testing
    const mockTeachingSubjects = [
        { level: 'GCSE', subject: 'Maths' },
        { level: 'GCSE', subject: 'Physics' },
        { level: 'A-Level', subject: 'Maths' },
        { level: 'A-Level', subject: 'Further Maths' }
    ];

    const mockSessions = [];

    const mockStudents = [];

    const mockHomework = [];

    // Global state
    let activeSubjectFilter = localStorage.getItem('yuli_selected_subject_chip') || 'all';

    // Initialize dashboard
    function initializeDashboard() {
        console.log('[Chips] subjects loaded: 4 — GCSE Maths, GCSE Physics, A-Level Maths, A-Level Further Maths');
        
        renderSubjectChips();
        renderContent();
        
        console.log(`[Chips] active: ${getActiveChipLabel()}`);
    }

    function renderSubjectChips() {
        const subjectChips = document.getElementById('subjectChips');
        const noSubjectsBanner = document.getElementById('noSubjectsBanner');
        
        if (!subjectChips) return;
        
        if (!mockTeachingSubjects.length) {
            if (noSubjectsBanner) noSubjectsBanner.style.display = 'flex';
            subjectChips.innerHTML = '';
            console.log('[Chips] active: setup banner shown');
            return;
        }
        
        if (noSubjectsBanner) noSubjectsBanner.style.display = 'none';
        
        // Create All chip
        let chipsHtml = `
            <button class="subject-chip ${activeSubjectFilter === 'all' ? 'active' : ''}" 
                    data-subject="all" 
                    role="tab" 
                    aria-selected="${activeSubjectFilter === 'all'}"
                    onclick="window.selectChip('all')">
                All
            </button>
        `;
        
        // Create subject chips
        mockTeachingSubjects.forEach(subjectObj => {
            const chipKey = `${subjectObj.level}_${subjectObj.subject}`;
            const chipLabel = `${subjectObj.level} ${subjectObj.subject}`;
            const isActive = activeSubjectFilter === chipKey;
            const count = getSubjectCount(subjectObj);
            
            chipsHtml += `
                <button class="subject-chip ${isActive ? 'active' : ''}" 
                        data-subject="${chipKey}"
                        role="tab" 
                        aria-selected="${isActive}"
                        onclick="window.selectChip('${chipKey}')">
                    ${chipLabel}
                    ${count > 0 ? `<span class="chip-count">${count}</span>` : ''}
                </button>
            `;
        });
        
        subjectChips.innerHTML = chipsHtml;
        
        // Auto-scroll active chip into view on mobile
        const activeChip = subjectChips.querySelector('.active');
        if (activeChip && window.innerWidth <= 768) {
            activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    function selectChip(subjectKey) {
        activeSubjectFilter = subjectKey;
        localStorage.setItem('yuli_selected_subject_chip', subjectKey);
        
        console.log(`[Chips] active: ${getActiveChipLabel()}`);
        
        renderSubjectChips();
        renderContent();
    }

    function getActiveChipLabel() {
        if (activeSubjectFilter === 'all') return 'All';
        const subject = mockTeachingSubjects.find(s => `${s.level}_${s.subject}` === activeSubjectFilter);
        return subject ? `${subject.level} ${subject.subject}` : 'All';
    }

    function getSubjectCount(subjectObj) {
        const chipKey = `${subjectObj.level}_${subjectObj.subject}`;
        return mockSessions.filter(session => {
            if (session.level && session.subject) {
                return session.level === subjectObj.level && session.subject === subjectObj.subject;
            }
            return session.subject === subjectObj.subject;
        }).length;
    }

    function filterByActiveSubject(items) {
        if (activeSubjectFilter === 'all') return items;
        
        const [level, subject] = activeSubjectFilter.split('_');
        return items.filter(item => {
            if (item.level && item.subject) {
                return item.level === level && item.subject === subject;
            }
            return item.subject === subject;
        });
    }

    function getEmptyStateMessage(type) {
        if (activeSubjectFilter === 'all') {
            return {
                sessions: 'No sessions today',
                students: 'No students assigned yet',
                homework: 'No homework to grade'
            }[type];
        }
        
        const subjectName = getActiveChipLabel();
        return {
            sessions: `No ${subjectName} sessions today`,
            students: `No ${subjectName} students assigned`,
            homework: `No ${subjectName} homework to grade`
        }[type];
    }

    function renderContent() {
        renderSessions();
        renderStudents();
        renderHomework();
    }

    function renderSessions() {
        const content = document.getElementById('todayContent');
        if (!content) return;
        
        const filteredSessions = filterByActiveSubject(mockSessions);
        
        if (!filteredSessions.length) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-message">${getEmptyStateMessage('sessions')}</div>
                </div>
            `;
            return;
        }
        
        content.innerHTML = filteredSessions.map(session => `
            <div class="session-item">
                <div class="session-info">
                    <h4 class="session-title">${session.level} ${session.subject}</h4>
                    <p class="session-meta">${session.time}</p>
                    <p class="session-meta">with ${session.studentName}</p>
                </div>
                <div class="session-actions">
                    <button class="btn btn-primary btn-sm">
                        <i class="fas fa-video"></i> Join
                    </button>
                </div>
            </div>
        `).join('');
    }

    function renderStudents() {
        const content = document.getElementById('studentsContent');
        if (!content) return;
        
        const filteredStudents = filterByActiveSubject(mockStudents);
        
        if (!filteredStudents.length) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-message">${getEmptyStateMessage('students')}</div>
                </div>
            `;
            return;
        }
        
        content.innerHTML = filteredStudents.slice(0, 3).map(student => `
            <div class="student-item">
                <div class="student-avatar">${student.name.charAt(0)}</div>
                <div class="student-info">
                    <h4 class="student-name">${student.name}</h4>
                    <p class="student-subject">${student.level} ${student.subject}</p>
                </div>
                <div class="student-actions">
                    <button class="btn btn-secondary btn-sm">
                        <i class="fas fa-comment"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    function renderHomework() {
        const content = document.getElementById('homeworkContent');
        if (!content) return;
        
        const filteredHomework = filterByActiveSubject(mockHomework);
        
        if (!filteredHomework.length) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-message">${getEmptyStateMessage('homework')}</div>
                </div>
            `;
            return;
        }
        
        content.innerHTML = filteredHomework.slice(0, 3).map(hw => `
            <div class="homework-item">
                <div class="homework-info">
                    <h4 class="homework-title">${hw.title}</h4>
                    <p class="homework-due">${hw.due}</p>
                </div>
                <button class="btn btn-primary btn-sm">
                    <i class="fas fa-check"></i> Grade
                </button>
            </div>
        `).join('');
    }

    // Keyboard navigation for chips
    function setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('subject-chip')) {
                const chips = Array.from(document.querySelectorAll('.subject-chip'));
                const currentIndex = chips.indexOf(e.target);
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
                        e.target.click();
                        return;
                }
                
                if (newIndex !== currentIndex) {
                    chips[newIndex].focus();
                    chips[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        });
    }

    // Export functions to global scope
    window.selectChip = selectChip;
    window.renderSubjectChips = renderSubjectChips;
    window.renderContent = renderContent;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeDashboard();
            setupKeyboardNavigation();
        });
    } else {
        initializeDashboard();
        setupKeyboardNavigation();
    }
})();
