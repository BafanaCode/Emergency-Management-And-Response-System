/**
 * Incident lifecycle rules shared by the UI.
 *
 * NOTE: These helpers give fast, friendly feedback only. The authoritative
 * enforcement of the same rules lives in firestore.rules, because client code
 * can be bypassed by a malicious request.
 */

export const INCIDENT_STATUSES = ['Reported', 'Assigned', 'En Route', 'On Scene', 'Resolved'];

/** Permitted forward-only transitions. Mirrors firestore.rules. */
export const ALLOWED_TRANSITIONS = {
  Reported: ['Assigned'],
  Assigned: ['En Route'],
  'En Route': ['On Scene'],
  'On Scene': ['Resolved'],
  Resolved: []
};

export function canTransition(from, to) {
  return Array.isArray(ALLOWED_TRANSITIONS[from]) && ALLOWED_TRANSITIONS[from].includes(to);
}

/** True when the incident can still be assigned to a responder. */
export function isIncidentAssignable(incident) {
  return !!incident && incident.status === 'Reported';
}

/** True when the responder is free to take a new incident. */
export function isResponderAssignable(responder) {
  return !!responder && responder.isAvailable === true && !responder.activeIncidentId;
}

/** Convert a Firestore Timestamp / Date / millis value to a Date, or null. */
export function toDateSafe(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  return null;
}

/**
 * The date an incident was resolved. Uses the dedicated `resolvedAt` field.
 * Legacy resolved incidents (before `resolvedAt` existed) fall back to
 * `updatedAt`, which is the time of the final (Resolved) update. It never
 * falls back to the creation date.
 */
export function getResolvedDate(incident) {
  if (!incident || incident.status !== 'Resolved') return null;
  return toDateSafe(incident.resolvedAt) || toDateSafe(incident.updatedAt);
}

export function isResolvedToday(incident, now = new Date()) {
  const date = getResolvedDate(incident);
  if (!date) return false;
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

/** Translate low-level Firestore errors into messages that are safe to show. */
export function friendlyFirestoreError(err, fallback = 'Something went wrong. Please try again.') {
  const code = err && err.code;
  if (code === 'permission-denied') {
    return 'This action is no longer permitted. The incident or responder may have changed. Please refresh and try again.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'Network problem. Please check your connection and try again.';
  }
  return fallback;
}
