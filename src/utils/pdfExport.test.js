import {
  parseDateSafe,
  formatDateTime,
  formatDuration,
  sortStatusLogsChronological,
  calculateResponseMetrics,
  extractAssignmentHistory,
  generateIncidentReportPDF,
  generateBulkIncidentReportPDF,
} from './pdfExport';

describe('pdfExport utility', () => {
  describe('parseDateSafe', () => {
    it('parses Firestore timestamp with toDate()', () => {
      const mockTs = { toDate: () => new Date('2026-10-15T10:00:00Z') };
      const parsed = parseDateSafe(mockTs);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.toISOString()).toBe('2026-10-15T10:00:00.000Z');
    });

    it('parses Firestore timestamp with toMillis()', () => {
      const epoch = 1760522400000;
      const mockTs = { toMillis: () => epoch };
      const parsed = parseDateSafe(mockTs);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getTime()).toBe(epoch);
    });

    it('parses Date instances', () => {
      const d = new Date('2026-05-01T12:00:00Z');
      expect(parseDateSafe(d)).toBe(d);
    });

    it('parses numeric epoch timestamps', () => {
      const d = new Date('2026-01-01T00:00:00Z');
      expect(parseDateSafe(d.getTime()).getTime()).toBe(d.getTime());
    });

    it('parses ISO date strings', () => {
      const str = '2026-08-10T08:30:00Z';
      const parsed = parseDateSafe(str);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.toISOString()).toBe('2026-08-10T08:30:00.000Z');
    });

    it('returns null for invalid or missing values', () => {
      expect(parseDateSafe(null)).toBeNull();
      expect(parseDateSafe(undefined)).toBeNull();
      expect(parseDateSafe('not-a-date')).toBeNull();
      expect(parseDateSafe(new Date('invalid'))).toBeNull();
    });
  });

  describe('formatDateTime', () => {
    it('formats a date consistently', () => {
      const d = new Date(2026, 9, 15, 14, 30); // 15 Oct 2026 14:30
      expect(formatDateTime(d)).toBe('15 Oct 2026 14:30');
    });

    it('returns fallback for missing or unparseable dates', () => {
      expect(formatDateTime(null)).toBe('Not available');
      expect(formatDateTime(undefined, 'Custom fallback')).toBe('Custom fallback');
      expect(formatDateTime('invalid')).toBe('Not available');
    });
  });

  describe('formatDuration', () => {
    it('handles durations less than one minute', () => {
      expect(formatDuration(30000)).toBe('< 1 minute');
      expect(formatDuration(500)).toBe('< 1 minute');
      expect(formatDuration(0)).toBe('< 1 minute');
    });

    it('handles minute durations', () => {
      expect(formatDuration(60000)).toBe('1 minute');
      expect(formatDuration(18 * 60 * 1000)).toBe('18 minutes');
      expect(formatDuration(45 * 60 * 1000)).toBe('45 minutes');
    });

    it('handles hours and minutes', () => {
      expect(formatDuration(60 * 60 * 1000)).toBe('1 hour');
      expect(formatDuration((2 * 60 + 15) * 60 * 1000)).toBe('2 hours 15 minutes');
      expect(formatDuration((1 * 60 + 1) * 60 * 1000)).toBe('1 hour 1 minute');
    });

    it('handles multi-day durations', () => {
      expect(formatDuration(24 * 60 * 60 * 1000)).toBe('1 day');
      expect(formatDuration(28 * 60 * 60 * 1000)).toBe('1 day 4 hours');
      expect(formatDuration(50 * 60 * 60 * 1000)).toBe('2 days 2 hours');
    });

    it('handles invalid or negative durations safely', () => {
      expect(formatDuration(-1000)).toBe('Not available');
      expect(formatDuration(null)).toBe('Not available');
      expect(formatDuration(undefined)).toBe('Not available');
      expect(formatDuration(NaN)).toBe('Not available');
    });
  });

  describe('sortStatusLogsChronological', () => {
    it('sorts status logs by timestamp ascending', () => {
      const t1 = new Date(2026, 9, 15, 10, 0);
      const t2 = new Date(2026, 9, 15, 10, 15);
      const t3 = new Date(2026, 9, 15, 10, 45);

      const unordered = [
        { id: '3', status: 'On Scene', timestamp: t3 },
        { id: '1', status: 'Reported', timestamp: t1 },
        { id: '2', status: 'En Route', timestamp: t2 },
      ];

      const sorted = sortStatusLogsChronological(unordered);
      expect(sorted.map((l) => l.id)).toEqual(['1', '2', '3']);
    });

    it('preserves items with missing timestamps at the end without failing', () => {
      const t1 = new Date(2026, 9, 15, 10, 0);
      const list = [
        { id: 'no-time', status: 'Unknown', timestamp: null },
        { id: 'with-time', status: 'Reported', timestamp: t1 },
      ];
      const sorted = sortStatusLogsChronological(list);
      expect(sorted[0].id).toBe('with-time');
      expect(sorted[1].id).toBe('no-time');
    });

    it('returns empty array when passed non-array', () => {
      expect(sortStatusLogsChronological(null)).toEqual([]);
      expect(sortStatusLogsChronological(undefined)).toEqual([]);
    });
  });

  describe('calculateResponseMetrics', () => {
    it('calculates full lifecycle response metrics accurately', () => {
      const base = new Date('2026-10-15T10:00:00Z').getTime();
      const reportedTime = new Date(base);
      const assignedTime = new Date(base + 8 * 60 * 1000);    // +8 min
      const enRouteTime = new Date(base + 12 * 60 * 1000);    // +4 min travel start
      const onSceneTime = new Date(base + 30 * 60 * 1000);    // +18 min transit
      const resolvedTime = new Date(base + 90 * 60 * 1000);   // +60 min on-scene, +90 min total

      const incident = {
        incidentId: 'inc-complete',
        status: 'Resolved',
        createdAt: reportedTime,
      };

      const statusLogs = [
        { status: 'Reported', timestamp: reportedTime },
        { status: 'Assigned', timestamp: assignedTime },
        { status: 'En Route', timestamp: enRouteTime },
        { status: 'On Scene', timestamp: onSceneTime },
        { status: 'Resolved', timestamp: resolvedTime },
      ];

      const { metrics } = calculateResponseMetrics(incident, statusLogs);

      const dispatchMetric = metrics.find((m) => m.id === 'dispatch');
      expect(dispatchMetric.duration).toBe('8 minutes');

      const travelMetric = metrics.find((m) => m.id === 'travel');
      expect(travelMetric.name).toBe('Travel / Transit Time');
      expect(travelMetric.duration).toBe('18 minutes');

      const onSceneMetric = metrics.find((m) => m.id === 'onSceneResolution');
      expect(onSceneMetric.duration).toBe('1 hour');

      const totalMetric = metrics.find((m) => m.id === 'totalResolution');
      expect(totalMetric.duration).toBe('1 hour 30 minutes');
    });

    it('handles direct dispatch to on-scene without en route marker', () => {
      const base = new Date('2026-10-15T10:00:00Z').getTime();
      const reportedTime = new Date(base);
      const assignedTime = new Date(base + 5 * 60 * 1000);
      const onSceneTime = new Date(base + 25 * 60 * 1000);
      const resolvedTime = new Date(base + 60 * 60 * 1000);

      const incident = {
        incidentId: 'inc-no-enroute',
        status: 'Resolved',
        createdAt: reportedTime,
      };

      const statusLogs = [
        { status: 'Reported', timestamp: reportedTime },
        { status: 'Assigned', timestamp: assignedTime },
        { status: 'On Scene', timestamp: onSceneTime },
        { status: 'Resolved', timestamp: resolvedTime },
      ];

      const { metrics } = calculateResponseMetrics(incident, statusLogs);

      const travelMetric = metrics.find((m) => m.id === 'travel');
      expect(travelMetric.name).toBe('Dispatch to Arrival Time');
      expect(travelMetric.duration).toBe('20 minutes');
    });

    it('handles incomplete or pending lifecycle stages gracefully', () => {
      const base = new Date('2026-10-15T10:00:00Z').getTime();
      const reportedTime = new Date(base);

      const incident = {
        incidentId: 'inc-pending',
        status: 'Reported',
        createdAt: reportedTime,
      };

      const statusLogs = [{ status: 'Reported', timestamp: reportedTime }];

      const { metrics } = calculateResponseMetrics(incident, statusLogs);

      expect(metrics.find((m) => m.id === 'dispatch').duration).toBe('Not available');
      expect(metrics.find((m) => m.id === 'travel').duration).toBe('Not available');
      expect(metrics.find((m) => m.id === 'onSceneResolution').duration).toBe('Not available');
      expect(metrics.find((m) => m.id === 'totalResolution').duration).toBe('Not available');
    });

    it('handles clock drift / negative diff safely without throwing', () => {
      const base = new Date('2026-10-15T10:00:00Z').getTime();
      const reportedTime = new Date(base);
      const assignedTime = new Date(base - 10000); // 10s earlier due to clock skew

      const incident = {
        incidentId: 'inc-clock-skew',
        status: 'Assigned',
        createdAt: reportedTime,
      };

      const statusLogs = [
        { status: 'Reported', timestamp: reportedTime },
        { status: 'Assigned', timestamp: assignedTime },
      ];

      const { metrics } = calculateResponseMetrics(incident, statusLogs);
      const dispatchMetric = metrics.find((m) => m.id === 'dispatch');
      expect(dispatchMetric.duration).toBe('Not available');
      expect(dispatchMetric.note).toContain('clock drift');
    });
  });

  describe('extractAssignmentHistory', () => {
    it('extracts single assignment details', () => {
      const incident = {
        responderName: 'Officer Sipho',
        responderId: 'resp101',
      };
      const statusLogs = [
        {
          status: 'Assigned',
          timestamp: new Date('2026-10-15T11:00:00Z'),
          notes: 'Assigned to Officer Sipho (Paramedic)',
        },
      ];

      const history = extractAssignmentHistory(incident, statusLogs);
      expect(history.assignedResponder).toBe('Officer Sipho');
      expect(history.hasAssignments).toBe(true);
      expect(history.assignmentChanges).toHaveLength(1);
    });

    it('extracts multiple reassignments', () => {
      const incident = {
        responderName: 'Captain Jane',
      };
      const statusLogs = [
        {
          status: 'Assigned',
          timestamp: new Date('2026-10-15T11:00:00Z'),
          notes: 'Assigned to Unit A',
        },
        {
          status: 'Assigned',
          timestamp: new Date('2026-10-15T11:30:00Z'),
          notes: 'Reassigned to Captain Jane',
        },
      ];

      const history = extractAssignmentHistory(incident, statusLogs);
      expect(history.assignmentChanges).toHaveLength(2);
    });

    it('handles unassigned incident', () => {
      const incident = { status: 'Reported' };
      const history = extractAssignmentHistory(incident, []);
      expect(history.assignedResponder).toBe('Unassigned');
      expect(history.hasAssignments).toBe(false);
      expect(history.assignmentChanges).toHaveLength(0);
    });
  });

  describe('generateIncidentReportPDF', () => {
    it('creates a complete PDF instance without errors (download = false)', () => {
      const incident = {
        incidentId: 'inc-999',
        type: 'Road Accident',
        severity: 'Critical',
        status: 'Resolved',
        createdAt: new Date('2026-10-15T09:00:00Z'),
        updatedAt: new Date('2026-10-15T10:30:00Z'),
        resolvedAt: new Date('2026-10-15T10:30:00Z'),
        address: '124 Long Street, Cape Town',
        latitude: -33.9249,
        longitude: 18.4241,
        description: 'Multi-vehicle collision involving two passenger sedans and a delivery motorcycle. Emergency response active.',
        reporterName: 'John Doe',
        responderName: 'Unit 4 (Paramedic)',
        resolutionNotes: 'Casualties triaged and transported to hospital. Roadway cleared.',
      };

      const statusLogs = [
        { status: 'Reported', timestamp: new Date('2026-10-15T09:00:00Z'), notes: 'Emergency reported via mobile app' },
        { status: 'Assigned', timestamp: new Date('2026-10-15T09:05:00Z'), notes: 'Assigned to Unit 4' },
        { status: 'En Route', timestamp: new Date('2026-10-15T09:07:00Z'), notes: 'Unit 4 en route with sirens' },
        { status: 'On Scene', timestamp: new Date('2026-10-15T09:20:00Z'), notes: 'Unit 4 arrived on scene' },
        { status: 'Resolved', timestamp: new Date('2026-10-15T10:30:00Z'), notes: 'Incident closed and cleared' },
      ];

      const doc = generateIncidentReportPDF({
        incident,
        statusLogs,
        userRole: 'dispatcher',
        download: false,
      });

      expect(doc).toBeDefined();
      expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });

    it('handles minimal or missing data fields gracefully', () => {
      const minimalIncident = {
        incidentId: 'min-1',
      };

      const doc = generateIncidentReportPDF({
        incident: minimalIncident,
        statusLogs: [],
        userRole: 'reporter',
        download: false,
      });

      expect(doc).toBeDefined();
      expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });

    it('handles very long descriptions and status notes without failing', () => {
      const longText = 'Emergency observation report: '.repeat(50);
      const incident = {
        incidentId: 'inc-long',
        type: 'Fire',
        severity: 'Critical',
        status: 'Resolved',
        description: longText,
        address: 'Very long street name, District 6, City Centre, Western Cape, South Africa',
        reporterName: 'Supervisor Alice',
      };

      const statusLogs = [
        { status: 'Reported', timestamp: new Date(), notes: longText },
        { status: 'Resolved', timestamp: new Date(), notes: longText },
      ];

      const doc = generateIncidentReportPDF({
        incident,
        statusLogs,
        userRole: 'responder',
        download: false,
      });

      expect(doc).toBeDefined();
    });

    it('throws when incident is null or undefined', () => {
      expect(() => {
        generateIncidentReportPDF({ incident: null, download: false });
      }).toThrow('Cannot generate report: Incident data is missing.');
    });
  });

  describe('generateBulkIncidentReportPDF', () => {
    it('generates a multi-page PDF document for multiple incident records', () => {
      const mockIncidents = Array.from({ length: 75 }, (_, idx) => ({
        incidentId: `inc-${idx + 1}`,
        type: idx % 3 === 0 ? 'Road Accident' : idx % 3 === 1 ? 'Fire' : 'Medical Emergency',
        severity: idx % 3 === 0 ? 'Critical' : idx % 3 === 1 ? 'Serious' : 'Minor',
        status: idx % 4 === 0 ? 'Resolved' : idx % 4 === 1 ? 'On Scene' : idx % 4 === 2 ? 'En Route' : 'Assigned',
        reporterName: `Citizen ${idx + 1}`,
        address: `${idx * 10 + 10} Main Road, Kimberley`,
        createdAt: new Date(2026, 9, 15, 10, idx),
      }));

      const doc = generateBulkIncidentReportPDF({
        incidents: mockIncidents,
        filterSummary: {
          status: 'All',
          severity: 'All',
          dateFrom: '2026-10-01',
          dateTo: '2026-10-15',
          searchQuery: '',
        },
        generatedBy: 'Lead Dispatcher John',
        download: false,
      });

      expect(doc).toBeDefined();
      expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1);
    });

    it('handles an empty dataset gracefully without error', () => {
      const doc = generateBulkIncidentReportPDF({
        incidents: [],
        filterSummary: {
          status: 'Resolved',
          severity: 'Critical',
          dateFrom: '',
          dateTo: '',
          searchQuery: 'Kimberley',
        },
        generatedBy: 'Dispatcher Mary',
        download: false,
      });

      expect(doc).toBeDefined();
      expect(doc.internal.getNumberOfPages()).toBe(1);
    });

    it('handles null/undefined incidents argument safely', () => {
      const doc = generateBulkIncidentReportPDF({
        incidents: null,
        download: false,
      });

      expect(doc).toBeDefined();
      expect(doc.internal.getNumberOfPages()).toBe(1);
    });
  });
});
