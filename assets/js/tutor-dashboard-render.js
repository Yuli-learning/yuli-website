// Rendering functions for Enhanced Tutor Dashboard

// Rendering functions
function renderTodaySessions(sessions) {
  const content = document.getElementById('todayContent');
  const viewAllLink = document.getElementById('viewAllToday');
  
  if (!content) return;
  
  if (!sessions.length) {
    const activeFilter = window.activeSubjectFilter;
    const isFiltered = activeFilter && activeFilter !== 'all';
    const subjectName = isFiltered ? getSubjectNameFromFilter(activeFilter) : '';
    
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">${isFiltered ? `No ${subjectName} sessions today` : 'No sessions today'}</div>
        <a href="/schedule.html" class="empty-state-cta">
          <i class="fas fa-calendar-plus"></i> Schedule session
        </a>
      </div>
    `;
    if (viewAllLink) viewAllLink.style.display = 'none';
    return;
  }
  
  if (viewAllLink) {
    viewAllLink.style.display = sessions.length > 3 ? 'inline' : 'none';
  }
  
  content.innerHTML = sessions.slice(0, 3).map(session => {
    const hasConflict = checkTimeConflict(session, sessions);
    return `
      <div class="session-item expandable" data-session-id="${session.id}">
        <div class="session-info">
          <h4 class="session-title">
            ${session.subject || 'Session'}
            ${hasConflict ? '<i class="fas fa-exclamation-triangle" style="color: var(--danger); margin-left: 8px;" title="Time conflict detected"></i>' : ''}
          </h4>
          <p class="session-meta">${formatTime(session.startAt)} - ${formatTime(session.endAt)}</p>
          <p class="session-meta">with ${session.studentName}</p>
        </div>
        <div class="session-actions">
          <button class="btn btn-primary btn-sm" onclick="startVideoCall('${session.id}')" 
                  ${!canJoinSession(session) ? 'disabled' : ''} 
                  title="${getJoinButtonTitle(session)}">
            <i class="fas fa-video"></i> Join
          </button>
        </div>
        <i class="fas fa-chevron-down expand-chevron"></i>
        <div class="session-drawer">
          <div class="session-drawer-actions">
            <button class="btn btn-sm btn-secondary" onclick="openSessionNotes('${session.id}')">
              <i class="fas fa-sticky-note"></i> Notes
            </button>
            <button class="btn btn-sm btn-secondary" onclick="rescheduleSession('${session.id}')">
              <i class="fas fa-calendar-alt"></i> Reschedule
            </button>
            <button class="btn btn-sm btn-secondary" onclick="cancelSession('${session.id}')">
              <i class="fas fa-times"></i> Cancel
            </button>
            <button class="btn btn-sm btn-secondary" onclick="attachResource('${session.id}')">
              <i class="fas fa-paperclip"></i> Attach resource
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add expand/collapse functionality
  content.querySelectorAll('.session-item.expandable').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.session-actions') || e.target.closest('.session-drawer')) return;
      toggleSessionDrawer(item);
    });
  });
}

function checkTimeConflict(session, allSessions) {
  const sessionStart = session.startAt.toDate().getTime();
  const sessionEnd = session.endAt.toDate().getTime();
  
  return allSessions.some(other => {
    if (other.id === session.id) return false;
    const otherStart = other.startAt.toDate().getTime();
    const otherEnd = other.endAt.toDate().getTime();
    return (sessionStart < otherEnd && sessionEnd > otherStart);
  });
}

function toggleSessionDrawer(sessionItem) {
  const drawer = sessionItem.querySelector('.session-drawer');
  const isExpanded = sessionItem.classList.contains('expanded');
  
  // Close all other drawers
  document.querySelectorAll('.session-item.expanded').forEach(item => {
    if (item !== sessionItem) {
      item.classList.remove('expanded');
      item.querySelector('.session-drawer').classList.remove('expanded');
    }
  });
  
  if (isExpanded) {
    sessionItem.classList.remove('expanded');
    drawer.classList.remove('expanded');
  } else {
    sessionItem.classList.add('expanded');
    drawer.classList.add('expanded');
  }
}

function renderAssignedStudents(students) {
  const content = document.getElementById('studentsContent');
  const viewAllLink = document.getElementById('viewAllStudents');
  
  if (!content) return;
  
  if (!students.length) {
    const activeFilter = window.activeSubjectFilter;
    const isFiltered = activeFilter && activeFilter !== 'all';
    const subjectName = isFiltered ? getSubjectNameFromFilter(activeFilter) : '';
    
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">${isFiltered ? `No ${subjectName} students assigned` : 'No students assigned yet'}</div>
        <a href="/students.html" class="empty-state-cta">
          <i class="fas fa-user-plus"></i> View students
        </a>
      </div>
    `;
    if (viewAllLink) viewAllLink.style.display = 'none';
    return;
  }
  
  if (viewAllLink) {
    viewAllLink.style.display = students.length >= 3 ? 'inline' : 'none';
  }
  
  content.innerHTML = students.map(student => `
    <div class="student-item">
      <div class="student-avatar">${student.name.charAt(0).toUpperCase()}</div>
      <div class="student-info">
        <h4 class="student-name">${student.name}</h4>
        <p class="student-subject">${student.subject} - ${student.level}</p>
        <p class="student-activity">${student.nextActivity?.text || 'No recent activity'}</p>
      </div>
      <div class="student-actions">
        <button class="btn btn-sm btn-secondary" onclick="messageStudent('${student.id}')" aria-label="Message ${student.name}">
          <i class="fas fa-comment"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="scheduleWithStudent('${student.id}')" aria-label="Schedule session with ${student.name}">
          <i class="fas fa-calendar-plus"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="assignHomework('${student.id}')" aria-label="Assign homework to ${student.name}">
          <i class="fas fa-tasks"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function renderHomeworkToGrade(homework) {
  const content = document.getElementById('homeworkContent');
  const viewAllLink = document.getElementById('viewAllHomework');
  
  if (!content) return;
  
  if (!homework.length) {
    const activeFilter = window.activeSubjectFilter;
    const isFiltered = activeFilter && activeFilter !== 'all';
    const subjectName = isFiltered ? getSubjectNameFromFilter(activeFilter) : '';
    
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">${isFiltered ? `No ${subjectName} homework to grade` : 'No homework to grade'}</div>
        <a href="/homework.html" class="empty-state-cta">
          <i class="fas fa-tasks"></i> View all homework
        </a>
      </div>
    `;
    if (viewAllLink) viewAllLink.style.display = 'none';
    return;
  }
  
  if (viewAllLink) {
    viewAllLink.style.display = homework.length >= 3 ? 'inline' : 'none';
  }
  
  content.innerHTML = homework.map(hw => {
    const isOverdue = hw.dueAt.toDate() < new Date();
    const daysOverdue = isOverdue ? Math.floor((new Date() - hw.dueAt.toDate()) / (1000 * 60 * 60 * 24)) : 0;
    
    return `
      <div class="homework-item">
        <div class="homework-info">
          <h4 class="homework-title">${hw.title}</h4>
          <div class="homework-due-line">
            <span class="homework-due ${isOverdue ? 'homework-overdue' : ''}">
              Due ${formatDate(hw.dueAt)}
            </span>
            ${isOverdue ? `<span class="homework-badge overdue">${daysOverdue}d overdue</span>` : ''}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="gradeHomework('${hw.id}')" aria-label="Grade ${hw.title}">
          <i class="fas fa-check"></i> Grade
        </button>
      </div>
    `;
  }).join('');
}

function renderNewMessages(threads) {
  const content = document.getElementById('messagesContent');
  const viewAllLink = document.getElementById('viewAllMessages');
  
  if (!content) return;
  
  if (!threads.length) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">No new messages</div>
        <a href="/messages.html" class="empty-state-cta">
          <i class="fas fa-comment"></i> View messages
        </a>
      </div>
    `;
    if (viewAllLink) viewAllLink.style.display = 'none';
    return;
  }
  
  if (viewAllLink) {
    viewAllLink.style.display = threads.length >= 3 ? 'inline' : 'none';
  }
  
  content.innerHTML = threads.map(thread => `
    <div class="message-item">
      <div class="message-header">
        <span class="message-sender">${thread.studentName}</span>
        <div>
          <span class="message-time">${formatRelativeTime(thread.lastMessageAt)}</span>
          ${thread.unreadCount ? `<span class="message-unread-count">${thread.unreadCount}</span>` : ''}
        </div>
      </div>
      <div class="message-preview">${thread.lastMessage || 'No preview available'}</div>
      <div class="message-reply">
        <input type="text" placeholder="Quick reply..." data-thread="${thread.id}" maxlength="500">
        <button class="btn btn-primary btn-sm" onclick="sendQuickReply('${thread.id}', this)" aria-label="Send quick reply">
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function renderNotifications(notifications) {
  const content = document.getElementById('notificationsContent');
  const unreadDot = document.getElementById('unreadDot');
  const markAllBtn = document.getElementById('markAllReadBtn');
  
  if (!content) return;
  
  const unreadCount = notifications.filter(n => !n.readAt).length;
  
  if (unreadDot) {
    unreadDot.style.display = unreadCount > 0 ? 'block' : 'none';
  }
  
  if (markAllBtn) {
    markAllBtn.style.display = unreadCount > 0 ? 'block' : 'none';
  }
  
  if (!notifications.length) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">No notifications</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 4px;">You're all caught up</div>
      </div>
    `;
    return;
  }
  
  content.innerHTML = notifications.map(notif => `
    <div class="notification-item ${!notif.readAt ? 'unread' : ''}">
      <div class="notification-icon">
        <i class="fas fa-bell"></i>
      </div>
      <div class="notification-content">
        <p class="notification-message">${notif.message}</p>
        <p class="notification-time">${formatRelativeTime(notif.createdAt)}</p>
      </div>
    </div>
  `).join('');
}

function renderAlerts(alerts) {
  const alertsCard = document.getElementById('alertsCard');
  const content = document.getElementById('alertsContent');
  
  if (!alertsCard || !content) return;
  
  if (!alerts.length) {
    alertsCard.style.display = 'none';
    return;
  }
  
  alertsCard.style.display = 'block';
  content.innerHTML = alerts.map(alert => `
    <div class="notification-item">
      <div class="notification-icon critical">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <div class="notification-content">
        <p class="notification-message">${alert.message}</p>
        <p class="notification-time">${formatRelativeTime(alert.createdAt)}</p>
      </div>
    </div>
  `).join('');
}

function renderResources(resources) {
  const content = document.getElementById('resourcesContent');
  
  if (!content) return;
  
  if (!resources.length) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">No resources yet</div>
        <a href="/resources.html" class="empty-state-cta">
          <i class="fas fa-upload"></i> Upload resources
        </a>
      </div>
    `;
    return;
  }
  
  content.innerHTML = resources.map(resource => `
    <div class="resource-item">
      <div class="resource-icon">
        <i class="fas fa-file"></i>
      </div>
      <div class="resource-info">
        <h4 class="resource-name">${resource.name}</h4>
        <p class="resource-date">${formatDate(resource.createdAt)}</p>
      </div>
      ${window.nextSession ? `<button class="btn btn-sm btn-secondary" onclick="attachToUpNext('${resource.id}')" aria-label="Attach to next session">Attach</button>` : ''}
    </div>
  `).join('');
}

function renderPinnedStudents(students) {
  const content = document.getElementById('pinnedStudentsContent');
  
  if (!content) return;
  
  if (!students.length) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">No pinned students</div>
        <a href="/students.html?pinMode=true" class="empty-state-cta">
          <i class="fas fa-thumbtack"></i> Manage pins
        </a>
      </div>
    `;
    return;
  }
  
  content.innerHTML = students.map(student => `
    <div class="student-item">
      <div class="student-avatar">${student.name.charAt(0).toUpperCase()}</div>
      <div class="student-info">
        <h4 class="student-name">${student.name}</h4>
        <p class="student-subject">${student.subject}</p>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="messageStudent('${student.id}')" aria-label="Message ${student.name}">
        <i class="fas fa-comment"></i>
      </button>
    </div>
  `).join('');
}

function updateUpNext() {
  const upNextContent = document.getElementById('upNextContent');
  const upNextCard = document.getElementById('upNextCard');
  
  if (!window.tutorStats?.nextSessionId) {
    if (upNextContent) {
      upNextContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-message">No upcoming sessions</div>
          <a href="/schedule.html" class="empty-state-cta">
            <i class="fas fa-calendar-plus"></i> Schedule session
          </a>
        </div>
      `;
    }
    if (upNextCard) upNextCard.classList.remove('sticky-up-next');
    return;
  }
  
  // Load the next session details
  window.getDoc(window.doc(window.db, 'sessions', window.tutorStats.nextSessionId))
    .then(sessionDoc => {
      if (sessionDoc.exists()) {
        const session = sessionDoc.data();
        window.nextSession = session;
        renderUpNextSession(session);
      }
    })
    .catch(error => console.error('Error loading next session:', error));
}

function renderUpNextSession(session) {
  const upNextContent = document.getElementById('upNextContent');
  const upNextCard = document.getElementById('upNextCard');
  
  const now = Date.now();
  const start = session.startAt.toDate().getTime();
  const end = session.endAt.toDate().getTime();
  const canJoin = now >= (start - 5 * 60 * 1000) && now <= (end + 15 * 60 * 1000);
  const isWithinJoinWindow = now >= (start - 5 * 60 * 1000) && now <= start;
  
  // Make card sticky if within join window
  if (isWithinJoinWindow && upNextCard) {
    upNextCard.classList.add('sticky-up-next');
  } else if (upNextCard) {
    upNextCard.classList.remove('sticky-up-next');
  }
  
  const timeUntilStart = start - now;
  let countdownText = '';
  
  if (timeUntilStart > 0) {
    const minutes = Math.floor(timeUntilStart / (1000 * 60));
    const seconds = Math.floor((timeUntilStart % (1000 * 60)) / 1000);
    
    if (minutes < 60) {
      countdownText = `<span class="countdown-chip ${minutes <= 5 ? 'soon' : ''}">${minutes}m ${seconds}s</span>`;
    } else {
      const hours = Math.floor(minutes / 60);
      countdownText = `<span class="countdown-chip">${hours}h ${minutes % 60}m</span>`;
    }
  } else if (now <= end) {
    countdownText = '<span class="countdown-chip live">Live</span>';
  }
  
  if (upNextContent) {
    upNextContent.innerHTML = `
      <div class="session-info">
        <h4 class="session-title">
          ${session.subject || 'Session'} ${countdownText}
        </h4>
        <p class="session-meta">${formatTime(session.startAt)} - ${formatTime(session.endAt)}</p>
        <p class="session-meta">with ${session.studentName}</p>
      </div>
      
      <div class="up-next-micro-actions">
        <button class="btn btn-sm btn-secondary" onclick="openSessionNotes('${session.id}')" aria-label="View session notes">
          <i class="fas fa-sticky-note"></i> Notes
        </button>
        <button class="btn btn-sm btn-secondary" onclick="messageStudent('${session.studentId}')" aria-label="Message student">
          <i class="fas fa-comment"></i> Message
        </button>
        <button class="btn btn-sm btn-secondary" onclick="attachResource('${session.id}')" aria-label="Attach resource">
          <i class="fas fa-paperclip"></i> Resource
        </button>
      </div>
      
      <div class="up-next-main-action">
        <button class="btn btn-primary" id="btnStartCall" ${!canJoin ? 'disabled' : ''} 
                onclick="startVideoCall('${session.id}')" 
                aria-label="${canJoin ? 'Start video call' : 'Video call available 5 minutes before session'}"
                title="${canJoin ? 'Start video call' : 'Available 5 minutes before session starts'}">
          <i class="fas fa-video"></i> Start Call
        </button>
        ${!canJoin && timeUntilStart > 0 ? `<span style="font-size: 12px; color: var(--text-light);">Available in ${Math.ceil(timeUntilStart / (1000 * 60)) - 5} minutes</span>` : ''}
      </div>
    `;
  }
  
  // Start countdown if needed
  if (timeUntilStart > 0 && timeUntilStart < 60 * 60 * 1000) { // Within 1 hour
    startCountdown(session);
  }
}

function renderError(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-message">Error loading data</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 4px;">${message}</div>
      </div>
    `;
  }
}

function getSubjectNameFromFilter(filterKey) {
  if (!filterKey || filterKey === 'all') return '';
  const [level, subject] = filterKey.split('_');
  return `${level} ${subject}`;
}

// Export functions for global access
window.renderTodaySessions = renderTodaySessions;
window.renderAssignedStudents = renderAssignedStudents;
window.renderHomeworkToGrade = renderHomeworkToGrade;
window.renderNewMessages = renderNewMessages;
window.renderNotifications = renderNotifications;
window.renderAlerts = renderAlerts;
window.renderResources = renderResources;
window.renderPinnedStudents = renderPinnedStudents;
window.renderUpNextSession = renderUpNextSession;
window.renderError = renderError;
window.toggleSessionDrawer = toggleSessionDrawer;
window.getSubjectNameFromFilter = getSubjectNameFromFilter;
