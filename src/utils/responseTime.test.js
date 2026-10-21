import {
  parseDateSafe,
  getIncidentReportedDate,
  getIncidentEventDate,
  calculateIncidentResponseTime,
  calculateResponseTimeTrend,
} from './responseTime';

describe('Response Time Analytics Utility', () => {
  const baseEpoch = new Date('2026-10-15T12:00:00Z').getTime();

  describe('Timestamp conversion and parsing', () => {
    it('parses Firestore Timestamp objects with toDate()', () => {
      const mockTs = { toDate: () => new Date('2026-10-15T10:00:00Z') };
      const d = parseDateSafe(mockTs);
      expect(d).toBeInstanceOf(Date);
      expect(d.toISOString()).toBe('2026-10-15T10:00:00.000Z');
    });

    it('parses Firestore Timestamp objects with toMillis()', () => {
      const mockTs = { toMillis: () => baseEpoch };
      const d = parseDateSafe(mockTs);
      expect(d.getTime()).toBe(baseEpoch);
    });

    it('parses native JavaScript Date instances', () => {
      const date = new Date('2026-10-14T08:30:00Z');
      expect(parseDateSafe(date)).toBe(date);
    });

    it('parses numeric epoch timestamps', () => {
      expect(parseDateSafe(baseEpoch).getTime()).toBe(baseEpoch);
    });

    it('parses ISO date strings', () => {
      const str = '2026-10-15T14:45:00Z';
      expect(parseDateSafe(str).toISOString()).toBe('2026-10-15T14:45:00.000Z');
    });

    it('returns null safely for invalid or missing values', () => {
      expect(parseDateSafe(null)).toBeNull();
      expect(parseDateSafe(undefined)).toBeNull();
      expect(parseDateSafe('not-a-valid-date')).toBeNull();
      expect(parseDateSafe({})).toBeNull();
    });
  });

  describe('calculateIncidentResponseTime', () => {
    it('calculates Report to On Scene accurately', () => {
      const incident = {
        incidentId: 'inc-1',
        createdAt: new Date('2026-10-15T10:00:00Z'),
      };
      const statusLogs = [
        { status: 'Reported', timestamp: new Date('2026-10-15T10:00:00Z') },
        { status: 'Assigned', timestamp: new Date('2026-10-15T10:04:00Z') },
        { status: 'En Route', timestamp: new Date('2026-10-15T10:08:00Z') },
        { status: 'On Scene', timestamp: new Date('2026-10-15T10:22:00Z') }, // 22 minutes
      ];

      const time = calculateIncidentResponseTime(incident, statusLogs, 'reportToOnScene');
      expect(time).toBe(22);
    });

    it('calculates Report to Assignment accurately when requested', () => {
      const incident = {
        incidentId: 'inc-1',
        createdAt: new Date('2026-10-15T10:00:00Z'),
      };
      const statusLogs = [
        { status: 'Assigned', timestamp: new Date('2026-10-15T10:06:00Z') }, // 6 minutes
      ];

      const time = calculateIncidentResponseTime(incident, statusLogs, 'reportToAssignment');
      expect(time).toBe(6);
    });

    it('prevents duplicate status logs from inflating or distorting the result', () => {
      const incident = {
        incidentId: 'inc-dup',
        createdAt: new Date('2026-10-15T10:00:00Z'),
      };
      const statusLogs = [
        { status: 'On Scene', timestamp: new Date('2026-10-15T10:15:00Z'), notes: 'Arrival' }, // First arrival = 15 min
        { status: 'On Scene', timestamp: new Date('2026-10-15T10:30:00Z'), notes: 'Second note' }, // Later update
      ];

      const time = calculateIncidentResponseTime(incident, statusLogs, 'reportToOnScene');
      expect(time).toBe(15);
    });

    it('does NOT treat missing response timestamp as zero (returns null)', () => {
      const incident = {
        incidentId: 'inc-pending',
        createdAt: new Date('2026-10-15T10:00:00Z'),
        status: 'Assigned',
      };
      const statusLogs = [
        { status: 'Reported', timestamp: new Date('2026-10-15T10:00:00Z') },
        { status: 'Assigned', timestamp: new Date('2026-10-15T10:05:00Z') },
      ];

      // Missing On Scene log
      const time = calculateIncidentResponseTime(incident, statusLogs, 'reportToOnScene');
      expect(time).toBeNull();
    });

    it('does NOT treat missing assignment timestamp as zero (returns null)', () => {
      const incident = {
        incidentId: 'inc-no-assign',
        createdAt: new Date('2026-10-15T10:00:00Z'),
      };
      const statusLogs = [
        { status: 'Reported', timestamp: new Date('2026-10-15T10:00:00Z') },
      ];

      const time = calculateIncidentResponseTime(incident, statusLogs, 'reportToAssignment');
      expect(time).toBeNull();
    });

    it('handles negative durations (clock skew) safely by returning null', () => {
      const incident = {
        incidentId: 'inc-skew',
        createdAt: new Date('2026-10-15T10:05:00Z'),
      };
      const statusLogs = [
        { status: 'On Scene', timestamp: new Date('2026-10-15T10:00:00Z') }, // 5 min earlier due to clock skew
      ];

      const time = calculateIncidentResponseTime(incident, statusLogs, 'reportToOnScene');
      expect(time).toBeNull();
    });
  });

  describe('calculateResponseTimeTrend', () => {
    const fixedEndDate = new Date('2026-10-15T12:00:00Z');

    it('calculates daily averages across multiple valid incidents and groups chronologically', () => {
      // 2 incidents on 2026-10-15 (Today)
      // 1 incident on 2026-10-14 (Yesterday)
      // Other days empty
      const incidents = [
        { incidentId: 'inc-a', createdAt: new Date('2026-10-15T08:00:00Z') },
        { incidentId: 'inc-b', createdAt: new Date('2026-10-15T10:00:00Z') },
        { incidentId: 'inc-c', createdAt: new Date('2026-10-14T09:00:00Z') },
      ];

      const statusLogs = [
        // inc-a: 10 mins
        { incidentId: 'inc-a', status: 'On Scene', timestamp: new Date('2026-10-15T08:10:00Z') },
        // inc-b: 20 mins
        { incidentId: 'inc-b', status: 'On Scene', timestamp: new Date('2026-10-15T10:20:00Z') },
        // inc-c: 12 mins
        { incidentId: 'inc-c', status: 'On Scene', timestamp: new Date('2026-10-14T09:12:00Z') },
      ];

      const { trendData, hasData, totalMeasurements, averageOverall } = calculateResponseTimeTrend(
        incidents,
        statusLogs,
        { days: 7, endDate: fixedEndDate }
      );

      expect(hasData).toBe(true);
      expect(totalMeasurements).toBe(3);
      expect(trendData).toHaveLength(7);

      // Check chronological order (earliest day first, latest day last)
      expect(trendData[6].date).toBe('2026-10-15');
      expect(trendData[5].date).toBe('2026-10-14');
      expect(trendData[0].date).toBe('2026-10-09');

      // 2026-10-15 average: (10 + 20) / 2 = 15.0 mins
      expect(trendData[6].avgTime).toBe(15);
      expect(trendData[6].count).toBe(2);

      // 2026-10-14 average: 12 mins
      expect(trendData[5].avgTime).toBe(12);
      expect(trendData[5].count).toBe(1);

      // Empty days must have avgTime: null (NOT 0!)
      expect(trendData[4].avgTime).toBeNull();
      expect(trendData[4].count).toBe(0);

      // Overall average: (10 + 20 + 12) / 3 = 14.0 mins
      expect(averageOverall).toBe(14);
    });

    it('returns hasData: false when dataset is completely empty', () => {
      const { trendData, hasData, totalMeasurements, averageOverall } = calculateResponseTimeTrend(
        [],
        [],
        { days: 7, endDate: fixedEndDate }
      );

      expect(hasData).toBe(false);
      expect(totalMeasurements).toBe(0);
      expect(averageOverall).toBeNull();
      expect(trendData).toHaveLength(7);
      trendData.forEach((point) => {
        expect(point.avgTime).toBeNull();
        expect(point.count).toBe(0);
      });
    });

    it('excludes incomplete incidents without corrupting valid ones', () => {
      const incidents = [
        { incidentId: 'inc-complete', createdAt: new Date('2026-10-15T08:00:00Z') },
        { incidentId: 'inc-unresponded', createdAt: new Date('2026-10-15T09:00:00Z') }, // Still waiting
        { incidentId: 'inc-corrupt-date', createdAt: null },
      ];

      const statusLogs = [
        { incidentId: 'inc-complete', status: 'On Scene', timestamp: new Date('2026-10-15T08:18:00Z') },
      ];

      const { trendData, totalMeasurements } = calculateResponseTimeTrend(
        incidents,
        statusLogs,
        { days: 7, endDate: fixedEndDate }
      );

      expect(totalMeasurements).toBe(1);
      const todayPoint = trendData.find((p) => p.date === '2026-10-15');
      expect(todayPoint.avgTime).toBe(18);
      expect(todayPoint.count).toBe(1);
    });
  });
});
