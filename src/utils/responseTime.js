/**
 * Alert24 Response Time Trend Analytics Utility
 *
 * Implements robust, lifecycle-consistent response time calculations
 * from real recorded incident and statusLog timestamps.
 */

/**
 * Safely parse any date value (Firestore Timestamp, Date, number, ISO string)
 * into a valid JavaScript Date, or null if missing/invalid.
 */
export function parseDateSafe(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value.toMillis === 'function') {
    try {
      const d = new Date(value.toMillis());
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Get the initial reported timestamp for an incident.
 * Uses incident.createdAt, or falls back to the earliest 'Reported' statusLog.
 */
export function getIncidentReportedDate(incident = {}, statusLogs = []) {
  const fromIncident = parseDateSafe(incident.createdAt);
  if (fromIncident) return fromIncident;

  const reportedLogs = (statusLogs || [])
    .filter((l) => l?.status?.toLowerCase() === 'reported')
    .map((l) => parseDateSafe(l?.timestamp))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  return reportedLogs[0] || null;
}

/**
 * Find the earliest valid timestamp for a specific lifecycle event status.
 * Prevents duplicate status logs from inflating or distorting results.
 */
export function getIncidentEventDate(incident = {}, statusLogs = [], targetStatus = 'On Scene') {
  const normalizedTarget = targetStatus.toLowerCase();

  // Find all status logs matching the target status
  const matchingLogs = (statusLogs || [])
    .filter((l) => l?.status && l.status.toLowerCase() === normalizedTarget)
    .map((l) => parseDateSafe(l?.timestamp))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  if (matchingLogs.length > 0) {
    return matchingLogs[0]; // Earliest valid matching log
  }

  // Fallback to incident direct field if present
  if (normalizedTarget === 'on scene') {
    return parseDateSafe(incident.onSceneAt);
  }
  if (normalizedTarget === 'assigned') {
    return parseDateSafe(incident.assignedAt);
  }
  if (normalizedTarget === 'en route') {
    return parseDateSafe(incident.enRouteAt);
  }
  if (normalizedTarget === 'resolved') {
    return parseDateSafe(incident.resolvedAt);
  }

  return null;
}

/**
 * Calculate response time for a single incident in minutes.
 *
 * Supported metrics:
 * - 'reportToOnScene' (Default): Incident reported to first recorded On Scene transition.
 * - 'reportToAssignment': Incident reported to first recorded assignment.
 * - 'assignmentToEnRoute': First assignment to recorded En Route transition.
 *
 * Returns duration in minutes (float), or null if timestamps are missing, malformed,
 * or negative (clock skew).
 */
export function calculateIncidentResponseTime(incident = {}, statusLogs = [], metric = 'reportToOnScene') {
  if (!incident) return null;

  const reportedDate = getIncidentReportedDate(incident, statusLogs);

  let targetDate = null;
  let startDate = reportedDate;

  if (metric === 'reportToOnScene') {
    targetDate = getIncidentEventDate(incident, statusLogs, 'On Scene');
    // If On Scene is absent but incident is marked Resolved with a valid resolved timestamp,
    // we do not fabricate On Scene, but we only calculate when On Scene actually exists.
  } else if (metric === 'reportToAssignment') {
    targetDate = getIncidentEventDate(incident, statusLogs, 'Assigned');
  } else if (metric === 'assignmentToEnRoute') {
    startDate = getIncidentEventDate(incident, statusLogs, 'Assigned');
    targetDate = getIncidentEventDate(incident, statusLogs, 'En Route');
  } else {
    targetDate = getIncidentEventDate(incident, statusLogs, metric);
  }

  if (!startDate || !targetDate) {
    return null; // Incomplete measurement - do NOT treat as zero!
  }

  const diffMs = targetDate.getTime() - startDate.getTime();
  if (diffMs < 0) {
    return null; // Negative duration (clock skew / invalid timestamp) - excluded!
  }

  return diffMs / (1000 * 60); // minutes
}

/**
 * Generate 7-day chronological response-time trend dataset for the Recharts line chart.
 *
 * @param {Array} incidents - List of incident documents
 * @param {Array} statusLogs - All status log audit entries (or grouped)
 * @param {Object} options
 * @param {number} options.days - Number of days to include (default: 7)
 * @param {string} options.metric - 'reportToOnScene' | 'reportToAssignment'
 * @param {Date} options.endDate - Target end date (default: today)
 * @returns {Object} { trendData, hasData, totalMeasurements, averageOverall }
 */
export function calculateResponseTimeTrend(
  incidents = [],
  statusLogs = [],
  { days = 7, metric = 'reportToOnScene', endDate = new Date() } = {}
) {
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const safeLogs = Array.isArray(statusLogs) ? statusLogs : [];

  // Group status logs by incidentId for fast lookup
  const logsByIncident = new Map();
  safeLogs.forEach((log) => {
    const incId = log?.incidentId;
    if (!incId) return;
    if (!logsByIncident.has(incId)) {
      logsByIncident.set(incId, []);
    }
    logsByIncident.get(incId).push(log);
  });

  // Build the chronological day buckets (earliest to latest)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayBuckets = [];
  const baseEnd = parseDateSafe(endDate) || new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(baseEnd);
    d.setDate(baseEnd.getDate() - i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = dayNames[d.getDay()];
    const fullDate = `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`;

    dayBuckets.push({
      date: dateKey,
      day: dayLabel,
      fullDate,
      measurements: [],
    });
  }

  // Calculate response time for each incident and place in appropriate day bucket
  safeIncidents.forEach((incident) => {
    const reportedDate = getIncidentReportedDate(incident);
    if (!reportedDate) return;

    const dateKey = `${reportedDate.getFullYear()}-${String(reportedDate.getMonth() + 1).padStart(2, '0')}-${String(reportedDate.getDate()).padStart(2, '0')}`;
    const bucket = dayBuckets.find((b) => b.date === dateKey);
    if (!bucket) return; // Incident is outside the target date window

    const incidentLogs = logsByIncident.get(incident.incidentId || incident.id) || [];
    const responseTimeMinutes = calculateIncidentResponseTime(incident, incidentLogs, metric);

    if (responseTimeMinutes !== null && typeof responseTimeMinutes === 'number' && !isNaN(responseTimeMinutes)) {
      bucket.measurements.push(responseTimeMinutes);
    }
  });

  // Calculate daily averages and overall stats
  let totalMinutesSum = 0;
  let totalMeasurementsCount = 0;

  const trendData = dayBuckets.map((bucket) => {
    const count = bucket.measurements.length;
    let avgTime = null;

    if (count > 0) {
      const sum = bucket.measurements.reduce((acc, v) => acc + v, 0);
      // Round to 1 decimal place (or integer if exact)
      avgTime = Math.round((sum / count) * 10) / 10;
      totalMinutesSum += sum;
      totalMeasurementsCount += count;
    }

    return {
      date: bucket.date,
      day: bucket.day,
      fullDate: bucket.fullDate,
      avgTime, // null when no valid response times exist for this day (NOT zero!)
      count,
    };
  });

  const hasData = totalMeasurementsCount > 0;
  const averageOverall = hasData ? Math.round((totalMinutesSum / totalMeasurementsCount) * 10) / 10 : null;

  return {
    trendData,
    hasData,
    totalMeasurements: totalMeasurementsCount,
    averageOverall,
  };
}
