const admin = require('firebase-admin');
const functions = require('firebase-functions');

const db = admin.firestore();

/**
 * Queue booking confirmation email
 */
async function queueBookingConfirmationEmail(bookingId) {
    try {
        // Get booking details
        const bookingSnap = await db.collection('bookings').doc(bookingId).get();
        if (!bookingSnap.exists) {
            throw new Error('Booking not found');
        }
        
        const booking = bookingSnap.data();
        
        // Get user details
        const userSnap = await db.collection('users').doc(booking.userId).get();
        const user = userSnap.data() || {};
        
        const studentEmail = user.email;
        const studentName = user.displayName || 'Student';
        const tutorEmail = functions.config().tutor.email;
        
        // Format session details
        const sessionDate = booking.start.toDate().toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const sessionTime = booking.start.toDate().toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const endTime = booking.end.toDate().toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Create email HTML
        const emailHtml = createBookingConfirmationHtml({
            studentName,
            subject: booking.subject,
            level: booking.level,
            examBoard: booking.examBoard,
            sessionDate,
            sessionTime,
            endTime,
            price: booking.price,
            bookingId
        });
        
        const emailText = createBookingConfirmationText({
            studentName,
            subject: booking.subject,
            level: booking.level,
            examBoard: booking.examBoard,
            sessionDate,
            sessionTime,
            endTime,
            price: booking.price,
            bookingId
        });
        
        // Queue email using Firebase Extension
        await db.collection('mail').add({
            to: studentEmail,
            cc: tutorEmail,
            message: {
                subject: `Session Confirmed: ${booking.subject} ${booking.level} - ${sessionDate}`,
                html: emailHtml,
                text: emailText
            }
        });
        
        console.log(`Booking confirmation email queued for ${studentEmail}`);
        
    } catch (error) {
        console.error('Failed to queue booking confirmation email:', error);
        throw error;
    }
}

/**
 * Queue cancellation email
 */
async function queueCancellationEmail(bookingId) {
    try {
        // Get booking details
        const bookingSnap = await db.collection('bookings').doc(bookingId).get();
        if (!bookingSnap.exists) {
            throw new Error('Booking not found');
        }
        
        const booking = bookingSnap.data();
        
        // Get user details
        const userSnap = await db.collection('users').doc(booking.userId).get();
        const user = userSnap.data() || {};
        
        const studentEmail = user.email;
        const studentName = user.displayName || 'Student';
        const tutorEmail = functions.config().tutor.email;
        
        // Format session details
        const sessionDate = booking.start.toDate().toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const sessionTime = booking.start.toDate().toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Create email HTML
        const emailHtml = createCancellationHtml({
            studentName,
            subject: booking.subject,
            level: booking.level,
            sessionDate,
            sessionTime,
            price: booking.price,
            bookingId
        });
        
        const emailText = createCancellationText({
            studentName,
            subject: booking.subject,
            level: booking.level,
            sessionDate,
            sessionTime,
            price: booking.price,
            bookingId
        });
        
        // Queue email using Firebase Extension
        await db.collection('mail').add({
            to: studentEmail,
            cc: tutorEmail,
            message: {
                subject: `Session Cancelled: ${booking.subject} ${booking.level} - ${sessionDate}`,
                html: emailHtml,
                text: emailText
            }
        });
        
        console.log(`Cancellation email queued for ${studentEmail}`);
        
    } catch (error) {
        console.error('Failed to queue cancellation email:', error);
        throw error;
    }
}

/**
 * Create booking confirmation HTML
 */
function createBookingConfirmationHtml(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .logo { font-size: 32px; font-weight: 700; color: #6366f1; }
                .logo-dot { color: #ff69b4; }
                .card { background: #f8fafc; border-radius: 12px; padding: 24px; margin: 20px 0; }
                .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
                .label { font-weight: 600; color: #64748b; }
                .value { font-weight: 500; }
                .price { font-size: 24px; font-weight: 700; color: #10b981; text-align: center; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">Yuli<span class="logo-dot">.</span></div>
                    <h1>Session Confirmed! 🎉</h1>
                </div>
                
                <p>Hi ${data.studentName},</p>
                
                <p>Great news! Your tutoring session has been confirmed and payment processed successfully.</p>
                
                <div class="card">
                    <h3>Session Details</h3>
                    <div class="detail-row">
                        <span class="label">Subject:</span>
                        <span class="value">${data.subject} ${data.level}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Exam Board:</span>
                        <span class="value">${data.examBoard}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Date:</span>
                        <span class="value">${data.sessionDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Time:</span>
                        <span class="value">${data.sessionTime} - ${data.endTime}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Duration:</span>
                        <span class="value">1 hour</span>
                    </div>
                </div>
                
                <div class="price">Total Paid: £${data.price}</div>
                
                <p><strong>What's Next?</strong></p>
                <ul>
                    <li>You'll receive a calendar invite shortly</li>
                    <li>Join details will be sent 30 minutes before the session</li>
                    <li>You can cancel up to 24 hours in advance for a full refund</li>
                </ul>
                
                <p>If you have any questions, feel free to reply to this email.</p>
                
                <p>Looking forward to our session!</p>
                
                <div class="footer">
                    <p>Booking Reference: ${data.bookingId}</p>
                    <p>Yuli. | Expert Tutoring</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Create booking confirmation plain text
 */
function createBookingConfirmationText(data) {
    return `
Hi ${data.studentName},

Great news! Your tutoring session has been confirmed and payment processed successfully.

SESSION DETAILS
Subject: ${data.subject} ${data.level}
Exam Board: ${data.examBoard}
Date: ${data.sessionDate}
Time: ${data.sessionTime} - ${data.endTime}
Duration: 1 hour

Total Paid: £${data.price}

WHAT'S NEXT?
- You'll receive a calendar invite shortly
- Join details will be sent 30 minutes before the session
- You can cancel up to 24 hours in advance for a full refund

If you have any questions, feel free to reply to this email.

Looking forward to our session!

Booking Reference: ${data.bookingId}
Yuli. | Expert Tutoring
    `;
}

/**
 * Create cancellation HTML
 */
function createCancellationHtml(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .logo { font-size: 32px; font-weight: 700; color: #6366f1; }
                .logo-dot { color: #ff69b4; }
                .card { background: #f8fafc; border-radius: 12px; padding: 24px; margin: 20px 0; }
                .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
                .label { font-weight: 600; color: #64748b; }
                .value { font-weight: 500; }
                .refund { font-size: 24px; font-weight: 700; color: #10b981; text-align: center; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">Yuli<span class="logo-dot">.</span></div>
                    <h1>Session Cancelled</h1>
                </div>
                
                <p>Hi ${data.studentName},</p>
                
                <p>Your tutoring session has been successfully cancelled as requested.</p>
                
                <div class="card">
                    <h3>Cancelled Session</h3>
                    <div class="detail-row">
                        <span class="label">Subject:</span>
                        <span class="value">${data.subject} ${data.level}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Date:</span>
                        <span class="value">${data.sessionDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Time:</span>
                        <span class="value">${data.sessionTime}</span>
                    </div>
                </div>
                
                <div class="refund">Full Refund: £${data.price}</div>
                
                <p><strong>Refund Details:</strong></p>
                <ul>
                    <li>Your refund has been processed automatically</li>
                    <li>It will appear on your statement within 5-10 business days</li>
                    <li>The time slot is now available for other students</li>
                </ul>
                
                <p>Feel free to book another session anytime. We're here to help with your learning journey!</p>
                
                <div class="footer">
                    <p>Booking Reference: ${data.bookingId}</p>
                    <p>Yuli. | Expert Tutoring</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Create cancellation plain text
 */
function createCancellationText(data) {
    return `
Hi ${data.studentName},

Your tutoring session has been successfully cancelled as requested.

CANCELLED SESSION
Subject: ${data.subject} ${data.level}
Date: ${data.sessionDate}
Time: ${data.sessionTime}

Full Refund: £${data.price}

REFUND DETAILS
- Your refund has been processed automatically
- It will appear on your statement within 5-10 business days
- The time slot is now available for other students

Feel free to book another session anytime. We're here to help with your learning journey!

Booking Reference: ${data.bookingId}
Yuli. | Expert Tutoring
    `;
}

module.exports = {
    queueBookingConfirmationEmail,
    queueCancellationEmail
};
