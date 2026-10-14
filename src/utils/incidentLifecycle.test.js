import {
  ALLOWED_TRANSITIONS,
  canTransition,
  isIncidentAssignable,
  isResponderAssignable,
  getResolvedDate,
  isResolvedToday,
  friendlyFirestoreError,
} from './incidentLifecycle';

// Minimal stand-in for a Firestore Timestamp
const ts = (date) => ({ toDate: () => date });

describe('incident status transitions', () => {
  test('only the next forward step is permitted', () => {
    expect(canTransition('Reported', 'Assigned')).toBe(true);
    expect(canTransition('Assigned', 'En Route')).toBe(true);
    expect(canTransition('En Route', 'On Scene')).toBe(true);
    expect(canTransition('On Scene', 'Resolved')).toBe(true);
  });

  test('skipping, repeating, reversing or leaving Resolved is rejected', () => {
    expect(canTransition('Assigned', 'On Scene')).toBe(false);
    expect(canTransition('Assigned', 'Resolved')).toBe(false);
    expect(canTransition('Reported', 'Resolved')).toBe(false);
    expect(canTransition('On Scene', 'Assigned')).toBe(false);
    expect(canTransition('Assigned', 'Assigned')).toBe(false);
    expect(canTransition('Resolved', 'Assigned')).toBe(false);
    expect(canTransition('Bogus', 'Assigned')).toBe(false);
    expect(ALLOWED_TRANSITIONS.Resolved).toEqual([]);
  });
});

describe('assignment eligibility', () => {
  test('only Reported incidents are assignable', () => {
    expect(isIncidentAssignable({ status: 'Reported' })).toBe(true);
    expect(isIncidentAssignable({ status: 'Assigned' })).toBe(false);
    expect(isIncidentAssignable(undefined)).toBe(false);
  });

  test('only idle, available responders are assignable', () => {
    expect(isResponderAssignable({ isAvailable: true, activeIncidentId: '' })).toBe(true);
    expect(isResponderAssignable({ isAvailable: true })).toBe(true);
    expect(isResponderAssignable({ isAvailable: false, activeIncidentId: '' })).toBe(false);
    expect(isResponderAssignable({ isAvailable: true, activeIncidentId: 'abc' })).toBe(false);
    expect(isResponderAssignable(undefined)).toBe(false);
  });
});

describe('Resolved Today metric', () => {
  const now = new Date(2026, 5, 15, 14, 0, 0); // 15 June 2026, 14:00
  const today = new Date(2026, 5, 15, 9, 30, 0);
  const yesterday = new Date(2026, 5, 14, 9, 30, 0);
  const lastWeek = new Date(2026, 5, 8, 9, 30, 0);

  test('uses the resolution date, NOT the creation date', () => {
    // Created last week, resolved today -> counts
    expect(isResolvedToday({ status: 'Resolved', createdAt: ts(lastWeek), resolvedAt: ts(today) }, now)).toBe(true);
    // Created today, resolved yesterday is impossible in practice, but the metric must follow resolvedAt
    expect(isResolvedToday({ status: 'Resolved', createdAt: ts(today), resolvedAt: ts(yesterday) }, now)).toBe(false);
  });

  test('legacy resolved incidents without resolvedAt fall back to updatedAt, never createdAt', () => {
    expect(isResolvedToday({ status: 'Resolved', createdAt: ts(lastWeek), updatedAt: ts(today) }, now)).toBe(true);
    expect(isResolvedToday({ status: 'Resolved', createdAt: ts(today), updatedAt: ts(yesterday) }, now)).toBe(false);
    expect(getResolvedDate({ status: 'Resolved', createdAt: ts(today) })).toBeNull();
  });

  test('unresolved incidents never count', () => {
    expect(isResolvedToday({ status: 'On Scene', createdAt: ts(today), resolvedAt: ts(today), updatedAt: ts(today) }, now)).toBe(false);
    expect(isResolvedToday(null, now)).toBe(false);
  });
});

describe('friendlyFirestoreError', () => {
  test('does not leak raw error text', () => {
    const msg = friendlyFirestoreError({ code: 'permission-denied', message: 'Missing or insufficient permissions: projects/x' });
    expect(msg).not.toMatch(/projects\/x/);
    expect(friendlyFirestoreError({ code: 'unavailable' })).toMatch(/Network/);
    expect(friendlyFirestoreError(new Error('secret internal detail'), 'Fallback')).toBe('Fallback');
  });
});
