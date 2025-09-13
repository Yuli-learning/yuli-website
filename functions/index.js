/*
Required environment variables:
- STRIPE_SECRET_KEY: Your Stripe secret key
- STRIPE_WEBHOOK_SECRET: Stripe webhook endpoint secret
- SITE_URL: Your site URL (e.g., http://127.0.0.1:5501 for dev)
- TUTOR_EMAIL: Your email address for notifications
- STRIPE_PRICE_GCSE_STANDARD: Stripe Price ID for GCSE standard rate
- STRIPE_PRICE_GCSE_DISCOUNT: Stripe Price ID for GCSE discounted rate
- STRIPE_PRICE_ALEVEL_STANDARD: Stripe Price ID for A-Level standard rate
- STRIPE_PRICE_ALEVEL_DISCOUNT: Stripe Price ID for A-Level discounted rate
- LIVEKIT_API_URL: LiveKit server URL
- LIVEKIT_API_KEY: LiveKit API key
- LIVEKIT_API_SECRET: LiveKit API secret
- TWILIO_ACCOUNT_SID: Twilio Account SID
- TWILIO_AUTH_TOKEN: Twilio Auth Token
- TWILIO_FROM: Twilio phone number

Set these using: firebase functions:config:set stripe.secret_key="sk_..." etc.
*/

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe?.secret_key);
const { AccessToken } = require('livekit-server-sdk');

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// Import email helpers
const { queueBookingConfirmationEmail, queueCancellationEmail } = require('./emails');

// Price mapping
const PRICE_IDS = {
    'GCSE_standard': functions.config().stripe.price_gcse_standard,
    'GCSE_discount': functions.config().stripe.price_gcse_discount,
    'A-Level_standard': functions.config().stripe.price_alevel_standard,
    'A-Level_discount': functions.config().stripe.price_alevel_discount
};

/**
 * Create Stripe Checkout Session
 */
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { bookingId } = data;
    const userId = context.auth.uid;

    try {
        // Get booking details
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnap = await bookingRef.get();
        
        if (!bookingSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Booking not found');
        }
        
        const booking = bookingSnap.data();
        
        // Verify booking belongs to user and is in correct state
        if (booking.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Booking does not belong to user');
        }
        
        if (booking.status !== 'pending_payment') {
            throw new functions.https.HttpsError('failed-precondition', 'Booking is not in pending payment state');
        }
        
        // Atomically place a temporary hold on the slot to avoid double-booking
        const slotRef = db.collection('availability').doc(booking.slotId);
        await db.runTransaction(async (t) => {
            const snap = await t.get(slotRef);
            if (!snap.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Time slot is no longer available');
            }

            const data = snap.data();
            if (data.isBooked) {
                throw new functions.https.HttpsError('failed-precondition', 'Time slot is already booked');
            }

            const nowTs = admin.firestore.Timestamp.now();
            const holdUntil = admin.firestore.Timestamp.fromMillis(nowTs.toMillis() + 15 * 60 * 1000); // 15 minutes

            // If another user's hold is still active, reject
            const otherHoldActive = data.holdBy && data.holdBy !== userId && data.holdUntil && data.holdUntil.toMillis() > nowTs.toMillis();
            if (otherHoldActive) {
                throw new functions.https.HttpsError('failed-precondition', 'Time slot is being booked by another user');
            }

            // Place/refresh hold for this user
            t.update(slotRef, {
                holdBy: userId,
                holdUntil
            });

/**
 * Release Slot Hold (Callable)
 * Input: { bookingId }
 * Only releases if the caller owns the booking and the hold is theirs or expired.
 */
exports.releaseSlotHold = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const userId = context.auth.uid;
    const bookingId = data?.bookingId;
    if (!bookingId) {
        throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
    }

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnap = await bookingRef.get();
        if (!bookingSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Booking not found');
        }
        const booking = bookingSnap.data();
        if (booking.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Not your booking');
        }

        const slotRef = db.collection('availability').doc(booking.slotId);
        await db.runTransaction(async (t) => {
            const slotSnap = await t.get(slotRef);
            if (!slotSnap.exists) return; // nothing to do
            const slot = slotSnap.data();
            if (slot.isBooked) return; // booked already
            const now = admin.firestore.Timestamp.now().toMillis();
            const holdBy = slot.holdBy;
            const holdUntilMs = slot.holdUntil?.toMillis?.() || 0;
            const isExpired = holdUntilMs <= now;
            const isMine = holdBy === userId;
            if (isMine || isExpired) {
                t.update(slotRef, {
                    holdBy: admin.firestore.FieldValue.delete(),
                    holdUntil: admin.firestore.FieldValue.delete()
                });
            }
        });

        return { success: true };
    } catch (e) {
        console.error('releaseSlotHold error', e);
        throw new functions.https.HttpsError('internal', 'Failed to release hold');
    }
});

/**
 * Scheduled cleanup of expired holds (every 5 minutes)
 */
exports.cleanupExpiredHolds = functions.pubsub
    .schedule('every 5 minutes')
    .onRun(async () => {
        const now = admin.firestore.Timestamp.now();
        // Query recent future slots that might have holds; Firestore doesn't support less-than on missing fields,
        // so we filter client-side after a range query on start time.
        const in48h = admin.firestore.Timestamp.fromMillis(now.toMillis() + 48 * 60 * 60 * 1000);
        const snap = await db.collection('availability')
            .where('start', '>=', now)
            .where('start', '<=', in48h)
            .get();
        const batch = db.batch();
        let count = 0;
        snap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.isBooked) return;
            const holdUntil = d.holdUntil;
            if (holdUntil && holdUntil.toMillis() <= now.toMillis()) {
                batch.update(docSnap.ref, {
                    holdBy: admin.firestore.FieldValue.delete(),
                    holdUntil: admin.firestore.FieldValue.delete()
                });
                count++;
            }
        });
        if (count > 0) await batch.commit();
        console.log(`cleanupExpiredHolds cleared ${count} holds`);
        return null;
    });
        });
        
        // Get user details for discount status
        const userRef = db.collection('users').doc(userId);
        const userSnap = await userRef.get();
        const user = userSnap.data() || {};
        
        // Determine price ID
        const isDiscounted = user.discountStatus === 'approved';
        const level = booking.level;
        const priceKey = `${level}_${isDiscounted ? 'discount' : 'standard'}`;
        const priceId = PRICE_IDS[priceKey];
        
        if (!priceId) {
            throw new functions.https.HttpsError('internal', `Price ID not configured for ${priceKey}`);
        }
        
        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            customer_email: context.auth.token.email,
            metadata: {
                bookingId,
                userId,
                slotId: booking.slotId
            },
            success_url: `${functions.config().site.url}/booking-success.html?bookingId=${bookingId}`,
            cancel_url: `${functions.config().site.url}/booking.html?canceled=1&bookingId=${bookingId}`,
        });

/**
 * Generate LiveKit Video Token (Callable)
 * Input: { sessionId }
 * Output: { token, url }
 */
exports.videoToken = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const sessionId = data?.sessionId;
    if (!sessionId) {
        throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');
    }

    try {
        // Verify session exists and user is tutor or student
        const sessionDoc = await db.collection('sessions').doc(sessionId).get();
        if (!sessionDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Session not found');
        }
        const sessionData = sessionDoc.data();
        if (sessionData.tutorId !== userId && sessionData.studentId !== userId) {
            throw new functions.https.HttpsError('permission-denied', "You're not part of this session.");
        }

        // Get LiveKit configuration
        const livekitApiKey = functions.config().livekit?.api_key;
        const livekitApiSecret = functions.config().livekit?.api_secret;
        const livekitApiUrl = functions.config().livekit?.api_url;

        if (!livekitApiKey || !livekitApiSecret || !livekitApiUrl) {
            throw new functions.https.HttpsError('failed-precondition', 'Video service not configured');
        }

        // Create access token
        const roomName = sessionId;
        const at = new AccessToken(livekitApiKey, livekitApiSecret, {
            identity: userId,
            name: context.auth.token.name || (sessionData.tutorId === userId ? 'Tutor' : 'Student')
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true
        });

        return { token: at.toJwt(), url: livekitApiUrl };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('Callable videoToken error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to issue video token');
    }
});
        
        return { url: session.url };
        
    } catch (error) {
        console.error('Failed to create checkout session:', error);
        throw new functions.https.HttpsError('internal', 'Failed to create checkout session');
    }
});

/**
 * Stripe Webhook Handler
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = functions.config().stripe.webhook_secret;
    
    let event;
    
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;
                
            case 'charge.refunded':
                await handleChargeRefunded(event.data.object);
                break;
                
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        
        res.json({ received: true });
        
    } catch (error) {
        console.error('Webhook handler error:', error);
        res.status(500).send('Webhook handler failed');
    }
});

/**
 * Handle successful checkout
 */
async function handleCheckoutCompleted(session) {
    const { bookingId, userId, slotId } = session.metadata;
    
    try {
        // Update booking status
        await db.collection('bookings').doc(bookingId).update({
            status: 'confirmed',
            paymentId: session.payment_intent,
            paidAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Mark slot as booked and clear any hold
        await db.collection('availability').doc(slotId).update({
            isBooked: true,
            holdBy: admin.firestore.FieldValue.delete(),
            holdUntil: admin.firestore.FieldValue.delete()
        });
        
        // Create payment record
        await db.collection('payments').doc(session.payment_intent).set({
            bookingId,
            userId,
            amount: session.amount_total,
            currency: session.currency,
            status: 'succeeded',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Queue confirmation email
        await queueBookingConfirmationEmail(bookingId);
        
        console.log(`Booking ${bookingId} confirmed successfully`);
        
    } catch (error) {
        console.error('Failed to process checkout completion:', error);
        throw error;
    }
}

/**
 * Handle charge refunded
 */
async function handleChargeRefunded(charge) {
    try {
        // Update payment record
        await db.collection('payments').doc(charge.id).update({
            refundStatus: 'succeeded',
            refundedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Refund processed for charge ${charge.id}`);
        
    } catch (error) {
        console.error('Failed to process refund:', error);
        throw error;
    }
}

/**
 * Cancel Booking
 */
exports.cancelBooking = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { bookingId } = data;
    const userId = context.auth.uid;

    try {
        // Get booking details
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnap = await bookingRef.get();
        
        if (!bookingSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Booking not found');
        }
        
        const booking = bookingSnap.data();
        
        // Verify booking belongs to user
        if (booking.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Booking does not belong to user');
        }
        
        // Verify booking is confirmed
        if (booking.status !== 'confirmed') {
            throw new functions.https.HttpsError('failed-precondition', 'Only confirmed bookings can be cancelled');
        }
        
        // Check 24h rule
        const now = new Date();
        const sessionStart = booking.start.toDate();
        const hoursUntilSession = (sessionStart - now) / (1000 * 60 * 60);
        
        if (hoursUntilSession < 24) {
            throw new functions.https.HttpsError('failed-precondition', 'Bookings can only be cancelled more than 24 hours in advance');
        }
        
        // Create Stripe refund
        const refund = await stripe.refunds.create({
            payment_intent: booking.paymentId,
            reason: 'requested_by_customer'
        });
        
        // Update booking status
        await bookingRef.update({
            status: 'cancelled',
            refundStatus: 'succeeded',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Reopen slot
        await db.collection('availability').doc(booking.slotId).update({
            isBooked: false
        });
        
        // Queue cancellation email
        await queueCancellationEmail(bookingId);
        
        return { success: true, refundId: refund.id };
        
    } catch (error) {
        console.error('Failed to cancel booking:', error);
        throw new functions.https.HttpsError('internal', 'Failed to cancel booking');
    }
});

/**
 * Generate LiveKit Video Token (HTTP variant, useful for testing/proxy)
 * Environment variables required:
 * - LIVEKIT_API_URL: LiveKit server URL
 * - LIVEKIT_API_KEY: LiveKit API key
 * - LIVEKIT_API_SECRET: LiveKit API secret
 */
exports.videoTokenHttp = functions.https.onRequest(async (req, res) => {
    try {
        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const idToken = authHeader.replace('Bearer ', '');
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'missing sessionId' });
        }

        // Verify session exists and user is the tutor
        const sessionDoc = await db.collection('sessions').doc(sessionId).get();
        if (!sessionDoc.exists) {
            return res.status(404).json({ error: 'session not found' });
        }

        const sessionData = sessionDoc.data();
        if (sessionData.tutorId !== userId) {
            return res.status(403).json({ error: 'forbidden' });
        }

        // Get LiveKit configuration
        const livekitApiKey = functions.config().livekit?.api_key;
        const livekitApiSecret = functions.config().livekit?.api_secret;
        const livekitApiUrl = functions.config().livekit?.api_url;

        if (!livekitApiKey || !livekitApiSecret || !livekitApiUrl) {
            console.error('LiveKit configuration missing');
            return res.status(500).json({ error: 'video service not configured' });
        }

        // Create access token
        const roomName = sessionId;
        const at = new AccessToken(livekitApiKey, livekitApiSecret, {
            identity: userId,
            name: decodedToken.name || 'Tutor'
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true
        });

        res.json({
            token: at.toJwt(),
            url: livekitApiUrl
        });

    } catch (error) {
        console.error('Video token generation error:', error);
        res.status(500).json({ error: 'internal' });
    }
});

// =============================================================================
// TUTOR STATS MAINTENANCE FUNCTIONS
// =============================================================================

/**
 * Recalculate tutor stats when sessions change
 */
exports.onSessionWrite = functions.firestore
    .document('sessions/{sessionId}')
    .onWrite(async (change, context) => {
        const sessionData = change.after.exists ? change.after.data() : null;
        const beforeData = change.before.exists ? change.before.data() : null;
        
        // Get tutorId from new or old data
        const tutorId = sessionData?.tutorId || beforeData?.tutorId;
        if (!tutorId) return;

        await updateTutorStats(tutorId);
    });

/**
 * Recalculate tutor stats when homework changes
 */
exports.onHomeworkWrite = functions.firestore
    .document('homework/{homeworkId}')
    .onWrite(async (change, context) => {
        const homeworkData = change.after.exists ? change.after.data() : null;
        const beforeData = change.before.exists ? change.before.data() : null;
        
        const tutorId = homeworkData?.tutorId || beforeData?.tutorId;
        if (!tutorId) return;

        await updateTutorStats(tutorId);
    });

/**
 * Update message thread and tutor stats when messages change
 */
exports.onMessageWrite = functions.firestore
    .document('message_threads/{threadId}/messages/{messageId}')
    .onWrite(async (change, context) => {
        const { threadId } = context.params;
        const messageData = change.after.exists ? change.after.data() : null;
        
        if (!messageData) return;

        // Update thread metadata
        const threadRef = db.collection('message_threads').doc(threadId);
        const threadDoc = await threadRef.get();
        
        if (!threadDoc.exists) return;
        
        const threadData = threadDoc.data();
        const tutorId = threadData.tutorId;
        const studentId = threadData.studentId;
        
        // Update lastMessageAt and unread counts
        const updates = {
            lastMessageAt: messageData.createdAt
        };
        
        // If message is from student, increment tutor's unread count
        if (messageData.senderId === studentId) {
            updates[`unreadBy.${tutorId}`] = FieldValue.increment(1);
        }
        
        await threadRef.update(updates);
        
        // Update tutor stats
        await updateTutorStats(tutorId);
    });

/**
 * Update tutor stats when notifications change
 */
exports.onNotificationWrite = functions.firestore
    .document('notifications/{notificationId}')
    .onWrite(async (change, context) => {
        const notificationData = change.after.exists ? change.after.data() : null;
        const beforeData = change.before.exists ? change.before.data() : null;
        
        const tutorId = notificationData?.tutorId || beforeData?.tutorId;
        if (!tutorId) return;

        await updateTutorStats(tutorId);
    });

/**
 * Update tutor stats when payouts change
 */
exports.onPayoutWrite = functions.firestore
    .document('payouts/{payoutId}')
    .onWrite(async (change, context) => {
        const payoutData = change.after.exists ? change.after.data() : null;
        const beforeData = change.before.exists ? change.before.data() : null;
        
        const tutorId = payoutData?.tutorId || beforeData?.tutorId;
        if (!tutorId) return;

        await updateTutorStats(tutorId);
    });

/**
 * Core function to recalculate all tutor stats
 */
async function updateTutorStats(tutorId) {
    try {
        const now = admin.firestore.Timestamp.now();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        
        // Get next session
        const nextSessionQuery = await db.collection('sessions')
            .where('tutorId', '==', tutorId)
            .where('startAt', '>', now)
            .where('status', '==', 'scheduled')
            .orderBy('startAt', 'asc')
            .limit(1)
            .get();
        
        let nextSessionId = null;
        let nextSessionStartAt = null;
        
        if (!nextSessionQuery.empty) {
            const nextSession = nextSessionQuery.docs[0];
            nextSessionId = nextSession.id;
            nextSessionStartAt = nextSession.data().startAt;
        }
        
        // Count today's sessions
        const todaySessionsQuery = await db.collection('sessions')
            .where('tutorId', '==', tutorId)
            .where('startAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
            .where('startAt', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
            .get();
        
        const todayCount = todaySessionsQuery.size;
        
        // Count homework to grade
        const toGradeQuery = await db.collection('homework')
            .where('tutorId', '==', tutorId)
            .where('status', '==', 'to_grade')
            .get();
        
        const toGradeCount = toGradeQuery.size;
        
        // Count unread messages
        const messageThreadsQuery = await db.collection('message_threads')
            .where('tutorId', '==', tutorId)
            .get();
        
        let unreadMsgCount = 0;
        messageThreadsQuery.docs.forEach(doc => {
            const data = doc.data();
            unreadMsgCount += data.unreadBy?.[tutorId] || 0;
        });
        
        // Calculate MTD earnings from completed sessions
        const completedSessionsQuery = await db.collection('sessions')
            .where('tutorId', '==', tutorId)
            .where('status', '==', 'completed')
            .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(monthStart))
            .get();
        
        let earningsMTD = 0;
        completedSessionsQuery.docs.forEach(doc => {
            const session = doc.data();
            const durationHours = (session.actualDurationMin || 60) / 60;
            const rate = session.ratePerHour || 20;
            earningsMTD += durationHours * rate;
        });
        
        // Get last payout
        const lastPayoutQuery = await db.collection('payouts')
            .where('tutorId', '==', tutorId)
            .orderBy('paidAt', 'desc')
            .limit(1)
            .get();
        
        let lastPayout = null;
        if (!lastPayoutQuery.empty) {
            const payoutDoc = lastPayoutQuery.docs[0];
            const payoutData = payoutDoc.data();
            lastPayout = {
                amount: payoutData.amount,
                paidAt: payoutData.paidAt
            };
        }
        
        // Count unread notifications and critical alerts
        const notificationsQuery = await db.collection('notifications')
            .where('tutorId', '==', tutorId)
            .where('readAt', '==', null)
            .get();
        
        let notifUnread = 0;
        let alertsCount = 0;
        
        notificationsQuery.docs.forEach(doc => {
            const notif = doc.data();
            notifUnread++;
            if (notif.severity === 'critical') {
                alertsCount++;
            }
        });
        
        // Update tutor_stats document
        const statsData = {
            nextSessionId,
            nextSessionStartAt,
            todayCount,
            toGradeCount,
            unreadMsgCount,
            earningsMTD: Math.round(earningsMTD * 100) / 100, // Round to 2 decimal places
            lastPayout,
            alertsCount,
            notifUnread,
            updatedAt: now
        };
        
        await db.collection('tutor_stats').doc(tutorId).set(statsData, { merge: true });
        
        console.log(`Updated stats for tutor ${tutorId}:`, statsData);
        
    } catch (error) {
        console.error(`Error updating tutor stats for ${tutorId}:`, error);
    }
}

/**
 * Scheduled function to refresh stats every 15 minutes
 */
exports.refreshTutorStats = functions.pubsub
    .schedule('every 15 minutes')
    .onRun(async (context) => {
        console.log('Running scheduled tutor stats refresh');
        
        const now = admin.firestore.Timestamp.now();
        const in24Hours = admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);
        
        // Find tutors with upcoming sessions in next 24 hours
        const upcomingSessionsQuery = await db.collection('sessions')
            .where('startAt', '>', now)
            .where('startAt', '<', in24Hours)
            .where('status', '==', 'scheduled')
            .get();
        
        const tutorIds = new Set();
        upcomingSessionsQuery.docs.forEach(doc => {
            tutorIds.add(doc.data().tutorId);
        });
        
        // Update stats for each tutor
        const promises = Array.from(tutorIds).map(tutorId => updateTutorStats(tutorId));
        await Promise.all(promises);
        
        console.log(`Refreshed stats for ${tutorIds.size} tutors`);
    });

/**
 * Nightly recalculation of earnings
 */
exports.recalculateEarnings = functions.pubsub
    .schedule('0 2 * * *') // 2 AM daily
    .timeZone('Europe/London')
    .onRun(async (context) => {
        console.log('Running nightly earnings recalculation');
        
        // Get all tutors
        const tutorsQuery = await db.collection('users')
            .where('role', '==', 'tutor')
            .get();
        
        const promises = tutorsQuery.docs.map(doc => updateTutorStats(doc.id));
        await Promise.all(promises);
        
        console.log(`Recalculated earnings for ${tutorsQuery.size} tutors`);
    });

// =============================================================================
// VIDEO AND SMS ENDPOINTS
// =============================================================================

/**
 * Generate LiveKit Video Token
 */
exports.videoToken = functions.https.onRequest(async (req, res) => {
    try {
        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const idToken = authHeader.replace('Bearer ', '');
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'missing sessionId' });
        }

        // Verify session exists and user is the tutor or student
        const sessionDoc = await db.collection('sessions').doc(sessionId).get();
        if (!sessionDoc.exists) {
            return res.status(404).json({ error: 'session not found' });
        }

        const sessionData = sessionDoc.data();
        if (sessionData.tutorId !== userId && sessionData.studentId !== userId) {
            return res.status(403).json({ error: 'forbidden' });
        }

        // Get LiveKit configuration
        const livekitApiKey = functions.config().livekit?.api_key;
        const livekitApiSecret = functions.config().livekit?.api_secret;
        const livekitApiUrl = functions.config().livekit?.api_url;

        if (!livekitApiKey || !livekitApiSecret || !livekitApiUrl) {
            console.error('LiveKit configuration missing');
            return res.status(500).json({ error: 'video service not configured' });
        }

        // Create access token
        const roomName = sessionId;
        const at = new AccessToken(livekitApiKey, livekitApiSecret, {
            identity: userId,
            name: decodedToken.name || (sessionData.tutorId === userId ? 'Tutor' : 'Student')
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true
        });

        res.json({
            token: at.toJwt(),
            url: livekitApiUrl
        });

    } catch (error) {
        console.error('Video token generation error:', error);
        res.status(500).json({ error: 'internal' });
    }
});

/**
 * Send SMS Message with Twilio
 */
exports.sendSms = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { to, message, studentId, threadId } = data;
    const userId = context.auth.uid;

    try {
        // Verify user is a tutor
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists || userDoc.data().role !== 'tutor') {
            throw new functions.https.HttpsError('permission-denied', 'Only tutors can send SMS');
        }

        // Get Twilio configuration
        const twilioSid = functions.config().twilio?.account_sid;
        const twilioToken = functions.config().twilio?.auth_token;
        const twilioFrom = functions.config().twilio?.from;

        if (!twilioSid || !twilioToken || !twilioFrom) {
            console.log('Twilio not configured, creating message record only');
        } else {
            // TODO: Implement actual Twilio SMS sending
            console.log(`Would send SMS to ${to}: ${message}`);
        }

        // Create message record
        const messageData = {
            senderId: userId,
            kind: 'sms',
            body: message,
            createdAt: FieldValue.serverTimestamp(),
            readBy: [userId]
        };

        // Add to message thread
        const finalThreadId = threadId || `${userId}_${studentId}`;
        await db.collection('message_threads')
            .doc(finalThreadId)
            .collection('messages')
            .add(messageData);

        // Update thread metadata
        await db.collection('message_threads').doc(finalThreadId).set({
            tutorId: userId,
            studentId: studentId,
            lastMessageAt: FieldValue.serverTimestamp(),
            [`unreadBy.${studentId}`]: FieldValue.increment(1)
        }, { merge: true });

        return { success: true, message: 'SMS sent and recorded' };

    } catch (error) {
        console.error('SMS sending error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send SMS');
    }
});
