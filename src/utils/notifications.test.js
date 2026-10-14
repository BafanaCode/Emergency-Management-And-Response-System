jest.mock('firebase/firestore', () => ({
  doc: jest.fn((db, col, id) => ({ id, path: `${col}/${id}` })),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
}));

import {
  DISPATCHER_CHANNEL,
  NOTIFICATION_TYPES,
  TYPE_LABELS,
  getNotificationType,
  sortNewestFirst,
  notificationId,
  messages,
  queueReportedNotification,
  queueProgressNotifications,
} from './notifications';

describe('notification utils', () => {
  test('constants and type mapping', () => {
    expect(DISPATCHER_CHANNEL).toBe('dispatchers');
    expect(TYPE_LABELS[NOTIFICATION_TYPES.REPORTED]).toBe('New report');
    expect(TYPE_LABELS[NOTIFICATION_TYPES.ASSIGNED]).toBe('Assigned');
    expect(TYPE_LABELS[NOTIFICATION_TYPES.STATUS]).toBe('Status update');
    expect(TYPE_LABELS[NOTIFICATION_TYPES.RESOLVED]).toBe('Resolved');
  });

  test('getNotificationType identifies type from attribute or infers from message', () => {
    expect(getNotificationType({ type: NOTIFICATION_TYPES.REPORTED })).toBe(NOTIFICATION_TYPES.REPORTED);
    expect(getNotificationType({ message: 'A responder has been assigned' })).toBe(NOTIFICATION_TYPES.ASSIGNED);
    expect(getNotificationType({ message: 'Your responder is en route' })).toBe(NOTIFICATION_TYPES.STATUS);
    expect(getNotificationType({ message: 'Your emergency report has been resolved' })).toBe(NOTIFICATION_TYPES.RESOLVED);
    expect(getNotificationType({ message: 'New Fire incident reported' })).toBe(NOTIFICATION_TYPES.REPORTED);
    expect(getNotificationType({ message: 'Random text' })).toBe('general');
  });

  test('sortNewestFirst puts newer timestamps first and pending timestamps on top', () => {
    const list = [
      { id: '1', createdAt: { toMillis: () => 1000 } },
      { id: '2', createdAt: { toMillis: () => 3000 } },
      { id: '3', createdAt: null }, // pending local write
      { id: '4', createdAt: { toMillis: () => 2000 } },
    ];
    const sorted = sortNewestFirst(list);
    expect(sorted[0].id).toBe('3');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('4');
    expect(sorted[3].id).toBe('1');
  });

  test('notificationId generates deterministic IDs', () => {
    expect(notificationId('inc1', 'reported', 'dispatchers')).toBe('inc1_reported_dispatchers');
    expect(notificationId('inc1', 'enroute', 'reporter')).toBe('inc1_enroute_reporter');
  });

  test('messages generates accurate notification strings', () => {
    expect(messages.reportedForDispatchers({ type: 'Fire', severity: 'Critical' })).toBe(
      'New Fire incident reported (Critical)'
    );
    expect(messages.progressForReporter('En Route')).toBe('Your responder is en route');
    expect(messages.progressForReporter('On Scene')).toBe('Your responder is on scene');
    expect(messages.progressForDispatchers({ type: 'Fire' }, 'En Route')).toBe(
      'Fire: responder is en route'
    );
    expect(messages.resolvedForReporter).toBe('Your emergency report has been resolved');
    expect(messages.resolvedForDispatchers({ type: 'Fire' })).toBe('Fire incident resolved');
  });

  test('queueReportedNotification and queueProgressNotifications set docs on batch', () => {
    const mockBatch = { set: jest.fn() };
    const mockDb = {};

    queueReportedNotification(mockBatch, mockDb, {
      incidentId: 'inc1',
      type: 'Fire',
      severity: 'Critical',
    });
    expect(mockBatch.set).toHaveBeenCalledTimes(1);

    mockBatch.set.mockClear();
    queueProgressNotifications(
      mockBatch,
      mockDb,
      { incidentId: 'inc1', reporterId: 'rep1', type: 'Fire' },
      'En Route'
    );
    expect(mockBatch.set).toHaveBeenCalledTimes(2);

    mockBatch.set.mockClear();
    queueProgressNotifications(
      mockBatch,
      mockDb,
      { incidentId: 'inc1', reporterId: 'rep1', type: 'Fire' },
      'Resolved'
    );
    expect(mockBatch.set).toHaveBeenCalledTimes(2);
  });
});
