import { doc, serverTimestamp } from 'firebase/firestore';

/**
 * In-app notification helpers.
 *
 * Data model (collection `notifications`):
 *   { userId, incidentId, message, isRead, createdAt, type? }
 *
 * - Personal notifications use the recipient's uid as `userId`.
 * - Dispatchers are not individually addressable by reporters/responders (client code
 *   cannot list staff accounts), so events for dispatch staff use the shared channel
 *   `userId: 'dispatchers'`. Each dispatcher's read-state for those is stored per user
 *   in `notificationReads/{uid}_{notificationId}`.
 * - Notifications for workflow events use deterministic document IDs, so a retry or a
 *   repeated render can never create a duplicate.
 * - These are IN-APP notifications only. No SMS or email is ever sent.
 */
export const DISPATCHER_CHANNEL = 'dispatchers';

export const NOTIFICATION_TYPES = {
  REPORTED: 'incident_reported',
  ASSIGNED: 'incident_assigned',
  STATUS: 'status_update',
  RESOLVED: 'incident_resolved',
};

export const TYPE_LABELS = {
  [NOTIFICATION_TYPES.REPORTED]: 'New report',
  [NOTIFICATION_TYPES.ASSIGNED]: 'Assigned',
  [NOTIFICATION_TYPES.STATUS]: 'Status update',
  [NOTIFICATION_TYPES.RESOLVED]: 'Resolved',
  general: 'Update',
};

/** Use the stored type, or infer one for older notifications created before `type` existed. */
export const getNotificationType = (n) => {
  if (n && n.type && TYPE_LABELS[n.type]) return n.type;
  const msg = (n && n.message) || '';
  if (/resolved/i.test(msg)) return NOTIFICATION_TYPES.RESOLVED;
  if (/assigned/i.test(msg)) return NOTIFICATION_TYPES.ASSIGNED;
  if (/en route|on scene/i.test(msg)) return NOTIFICATION_TYPES.STATUS;
  if (/reported/i.test(msg)) return NOTIFICATION_TYPES.REPORTED;
  return 'general';
};

export const sortNewestFirst = (list) =>
  [...list].sort((a, b) => {
    // Pending server timestamps are null locally: treat them as newest
    const am = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Infinity;
    const bm = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Infinity;
    return bm - am;
  });

/** Deterministic notification IDs: `${incidentId}_${event}_${audience}` */
export const notificationId = (incidentId, event, audience) =>
  `${incidentId}_${event}_${audience}`;

const statusEvent = (status) => (status === 'En Route' ? 'enroute' : status === 'On Scene' ? 'onscene' : 'resolved');
const statusPhrase = (status) => (status === 'En Route' ? 'en route' : 'on scene');

// ── Fixed message formats. firestore.rules requires these exact formats, which
//    stops clients from injecting arbitrary text or private data. ──
export const messages = {
  reportedForDispatchers: ({ type, severity }) => `New ${type} incident reported (${severity})`,
  progressForReporter: (status) => `Your responder is ${statusPhrase(status)}`,
  progressForDispatchers: ({ type }, status) => `${type}: responder is ${statusPhrase(status)}`,
  resolvedForReporter: 'Your emergency report has been resolved',
  resolvedForDispatchers: ({ type }) => `${type} incident resolved`,
};

/** Queue "new incident" notice for dispatch staff in the incident-creation batch. */
export const queueReportedNotification = (batch, db, { incidentId, type, severity }) => {
  batch.set(doc(db, 'notifications', notificationId(incidentId, 'reported', DISPATCHER_CHANNEL)), {
    userId: DISPATCHER_CHANNEL,
    incidentId,
    type: NOTIFICATION_TYPES.REPORTED,
    message: messages.reportedForDispatchers({ type, severity }),
    isRead: false,
    createdAt: serverTimestamp(),
  });
};

/**
 * Queue notices for a responder status change, in the SAME batch as the incident
 * update. `incident` must be the live incident (reporterId, type).
 */
export const queueProgressNotifications = (batch, db, incident, newStatus) => {
  const incidentId = incident.incidentId;
  const event = statusEvent(newStatus);
  const resolved = newStatus === 'Resolved';

  batch.set(doc(db, 'notifications', notificationId(incidentId, event, 'reporter')), {
    userId: incident.reporterId,
    incidentId,
    type: resolved ? NOTIFICATION_TYPES.RESOLVED : NOTIFICATION_TYPES.STATUS,
    message: resolved ? messages.resolvedForReporter : messages.progressForReporter(newStatus),
    isRead: false,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'notifications', notificationId(incidentId, event, DISPATCHER_CHANNEL)), {
    userId: DISPATCHER_CHANNEL,
    incidentId,
    type: resolved ? NOTIFICATION_TYPES.RESOLVED : NOTIFICATION_TYPES.STATUS,
    message: resolved
      ? messages.resolvedForDispatchers(incident)
      : messages.progressForDispatchers(incident, newStatus),
    isRead: false,
    createdAt: serverTimestamp(),
  });
};
