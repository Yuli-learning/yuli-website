// Utility functions and action handlers for Enhanced Tutor Dashboard

// Utility functions
function updateStatsDisplay() {
  if (!window.tutorStats) return;
  
  const earningsAmount = document.getElementById('earningsAmount');
  const earningsSubtitle = document.getElementById('earningsSubtitle');
  const lastPayout = document.getElementById('lastPayout');
  
  if (earningsAmount) {
    const mtd = window.tutorStats.earningsMTD;
    if (typeof mtd === 'number') {
      earningsAmount.textContent = `£${mtd.toFixed(2)}`;
    } else {
      earningsAmount.textContent = '—';
    }
  }
  
  if (lastPayout && window.tutorStats.lastPayout) {
    lastPayout.textContent = `Last payout £${window.tutorStats.lastPayout.amount} on ${formatDate(window.tutorStats.lastPayout.paidAt)}`;
    lastPayout.style.display = 'block';
  } else if (lastPayout) {
    lastPayout.style.display = 'none';
  }
  
  updateNotificationBadge(window.tutorStats.notifUnread || 0);
}

function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count.toString();
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }
}

function canJoinSession(session) {
  const now = Date.now();
  const start = session.startAt.toDate().getTime();
  const end = session.endAt.toDate().getTime();
  return now >= (start - 5 * 60 * 1000) && now <= (end + 15 * 60 * 1000);
}

function getJoinButtonTitle(session) {
  const now = Date.now();
  const start = session.startAt.toDate().getTime();
  const end = session.endAt.toDate().getTime();
  
  if (now < start - 5 * 60 * 1000) {
    return 'Available 5 minutes before session starts';
  } else if (now > end + 15 * 60 * 1000) {
    return 'Session has ended';
  } else {
    return 'Join video call';
  }
}

function startCountdown(session) {
  if (window.countdownInterval) clearInterval(window.countdownInterval);
  
  const start = session.startAt.toDate().getTime();
  
  window.countdownInterval = setInterval(() => {
    const now = Date.now();
    const timeLeft = start - now;
    
    if (timeLeft <= 0) {
      clearInterval(window.countdownInterval);
      // Refresh the up next display
      window.updateUpNext();
      return;
    }
    
    // Update countdown display
    const countdownChip = document.querySelector('.countdown-chip');
    if (countdownChip && timeLeft < 60 * 60 * 1000) { // Within 1 hour
      const minutes = Math.floor(timeLeft / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
      
      if (minutes < 60) {
        countdownChip.textContent = `${minutes}m ${seconds}s`;
        countdownChip.className = `countdown-chip ${minutes <= 5 ? 'soon' : ''}`;
      }
    }
  }, 1000);
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(timestamp);
}

// Action handlers
async function handleSignOut() {
  try {
    await window.signOut(window.auth);
    window.location.href = '/';
  } catch (error) {
    console.error('Error signing out:', error);
    showError('Failed to sign out');
  }
}

async function startVideoCall(sessionId) {
  try {
    const videoToken = window.httpsCallable(window.functions, 'videoToken');
    const result = await videoToken({ sessionId });
    
    const { token, url } = result.data;
    
    if (!token || !url) {
      throw new Error('Invalid video token response');
    }
    
    const videoWindow = window.open(
      `/pages/video.html?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`,
      '_blank',
      'width=1200,height=800'
    );
    
    if (!videoWindow) {
      showError('Please allow popups to join the video call');
    }
  } catch (error) {
    console.error('Error starting video call:', error);
    showError(error.message || 'Failed to start video call');
  }
}

async function sendQuickReply(threadId, buttonElement) {
  const input = buttonElement.parentElement.querySelector('input');
  const message = input.value.trim();
  
  if (!message) return;
  
  try {
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    // Add message to thread
    await window.addDoc(window.collection(window.db, 'message_threads', threadId, 'messages'), {
      senderId: window.currentUser.uid,
      kind: 'text',
      body: message,
      createdAt: window.serverTimestamp(),
      readBy: [window.currentUser.uid]
    });
    
    // Update thread metadata
    await window.updateDoc(window.doc(window.db, 'message_threads', threadId), {
      lastMessageAt: window.serverTimestamp(),
      lastMessage: message
    });
    
    input.value = '';
    showSuccess('Reply sent');
    
    // Reload messages
    window.loadNewMessages();
    
  } catch (error) {
    console.error('Error sending quick reply:', error);
    showError('Failed to send reply');
  } finally {
    buttonElement.disabled = false;
    buttonElement.innerHTML = '<i class="fas fa-paper-plane"></i>';
  }
}

async function markAllNotificationsRead() {
  try {
    const q = window.query(
      window.collection(window.db, 'notifications'),
      window.where('tutorId', '==', window.currentUser.uid),
      window.where('readAt', '==', null)
    );
    
    const snapshot = await window.getDocs(q);
    const promises = snapshot.docs.map(doc => 
      window.updateDoc(doc.ref, { readAt: window.serverTimestamp() })
    );
    
    await Promise.all(promises);
    showSuccess('All notifications marked as read');
    
    // Reload notifications
    window.loadNotifications();
    
  } catch (error) {
    console.error('Error marking notifications read:', error);
    showError('Failed to mark notifications as read');
  }
}

async function handleScheduleSubmit(e) {
  e.preventDefault();
  
  const sessionData = {
    tutorId: window.currentUser.uid,
    studentId: document.getElementById('schedStudent').value,
    subject: document.getElementById('schedSubject').value,
    startAt: window.Timestamp.fromDate(new Date(document.getElementById('schedStart').value)),
    endAt: window.Timestamp.fromDate(new Date(document.getElementById('schedEnd').value)),
    status: 'scheduled',
    createdAt: window.serverTimestamp()
  };
  
  try {
    await window.addDoc(window.collection(window.db, 'sessions'), sessionData);
    document.getElementById('modalSchedule').close();
    showSuccess('Session scheduled successfully');
    await window.loadTodaySessions();
  } catch (error) {
    console.error('Error scheduling session:', error);
    showError('Failed to schedule session');
  }
}

// Action functions for onclick handlers
function messageStudent(studentId) {
  window.location.href = `/messages.html?student=${studentId}`;
}

function scheduleWithStudent(studentId) {
  const modal = document.getElementById('modalSchedule');
  const studentSelect = document.getElementById('schedStudent');
  if (studentSelect) {
    studentSelect.value = studentId;
  }
  if (modal) modal.showModal();
}

function assignHomework(studentId) {
  window.location.href = `/homework.html?assign=${studentId}`;
}

function gradeHomework(homeworkId) {
  window.location.href = `/homework.html?grade=${homeworkId}`;
}

function openSessionNotes(sessionId) {
  window.location.href = `/session.html?id=${sessionId}#notes`;
}

function rescheduleSession(sessionId) {
  window.location.href = `/session.html?id=${sessionId}#reschedule`;
}

function cancelSession(sessionId) {
  if (confirm('Are you sure you want to cancel this session?')) {
    window.updateDoc(window.doc(window.db, 'sessions', sessionId), {
      status: 'cancelled',
      cancelledAt: window.serverTimestamp()
    }).then(() => {
      showSuccess('Session cancelled');
      window.loadTodaySessions();
    }).catch(error => {
      console.error('Error cancelling session:', error);
      showError('Failed to cancel session');
    });
  }
}

function attachResource(sessionId) {
  window.location.href = `/resources.html?attach=${sessionId}`;
}

function attachToUpNext(resourceId) {
  if (!window.nextSession) return;
  
  // Add resource to session
  const sessionRef = window.doc(window.db, 'sessions', window.tutorStats.nextSessionId);
  window.updateDoc(sessionRef, {
    attachedResources: window.arrayUnion(resourceId)
  }).then(() => {
    showSuccess('Resource attached to next session');
  }).catch(error => {
    console.error('Error attaching resource:', error);
    showError('Failed to attach resource');
  });
}

function showSuccess(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: var(--success);
    color: white; padding: 12px 20px; border-radius: 8px; z-index: 1000;
    box-shadow: var(--shadow-md); font-size: 14px; font-weight: 500;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showError(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: var(--danger);
    color: white; padding: 12px 20px; border-radius: 8px; z-index: 1000;
    box-shadow: var(--shadow-md); font-size: 14px; font-weight: 500;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Export functions for global access
window.updateStatsDisplay = updateStatsDisplay;
window.updateNotificationBadge = updateNotificationBadge;
window.canJoinSession = canJoinSession;
window.getJoinButtonTitle = getJoinButtonTitle;
window.startCountdown = startCountdown;
window.formatTime = formatTime;
window.formatDate = formatDate;
window.formatRelativeTime = formatRelativeTime;
window.handleSignOut = handleSignOut;
window.startVideoCall = startVideoCall;
window.sendQuickReply = sendQuickReply;
window.markAllNotificationsRead = markAllNotificationsRead;
window.handleScheduleSubmit = handleScheduleSubmit;
window.messageStudent = messageStudent;
window.scheduleWithStudent = scheduleWithStudent;
window.assignHomework = assignHomework;
window.gradeHomework = gradeHomework;
window.openSessionNotes = openSessionNotes;
window.rescheduleSession = rescheduleSession;
window.cancelSession = cancelSession;
window.attachResource = attachResource;
window.attachToUpNext = attachToUpNext;
window.showSuccess = showSuccess;
window.showError = showError;
