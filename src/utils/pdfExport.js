import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Alert24 Professional PDF Incident Report Generator
 * Phase 7: Professional PDF Incident Reports
 */

// Alert24 Brand Color Palette (HSL & RGB tailored for print & screen)
export const PDF_COLORS = {
  primary: [15, 23, 42],       // #0f172a - Slate 900 (Alert24 Dark Blue/Black)
  secondary: [30, 41, 59],     // #1e293b - Slate 800
  accent: [220, 38, 38],       // #dc2626 - Alert Crimson Red
  accentBlue: [37, 99, 235],   // #2563eb - Blue 600
  textDark: [15, 23, 42],      // Primary text
  textMuted: [100, 116, 139],  // #64748b - Slate 500
  textLight: [255, 255, 255],  // White
  bgLight: [248, 250, 252],    // #f8fafc - Slate 50
  bgAlt: [241, 245, 249],      // #f1f5f9 - Slate 100
  border: [203, 213, 225],     // #cbd5e1 - Slate 300
  borderLight: [226, 232, 240],// #e2e8f0 - Slate 200

  // Severity Colors
  critical: [220, 38, 38],     // Red
  serious: [217, 119, 6],      // Amber
  minor: [37, 99, 235],        // Blue

  // Status Colors
  resolved: [22, 163, 74],     // Green
  onScene: [13, 148, 136],     // Teal
  enRoute: [202, 138, 4],      // Yellow/Amber
  assigned: [37, 99, 235],     // Blue
  reported: [100, 116, 139],   // Slate
};

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
 * Consistent date and time formatter: "15 Oct 2026 14:30"
 */
export function formatDateTime(value, fallback = 'Not available') {
  const d = parseDateSafe(value);
  if (!d) return fallback;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

/**
 * Format millisecond durations clearly:
 * - "< 1 minute"
 * - "18 minutes"
 * - "2 hours 15 minutes"
 * - "1 day 4 hours"
 * Returns "Not available" for null/negative/invalid values.
 */
export function formatDuration(ms) {
  if (ms === null || ms === undefined || typeof ms !== 'number' || isNaN(ms) || ms < 0) {
    return 'Not available';
  }

  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) {
    return '< 1 minute';
  }

  const totalMinutes = Math.floor(totalSec / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    const dayStr = `${days} day${days === 1 ? '' : 's'}`;
    if (hours > 0) {
      return `${dayStr} ${hours} hour${hours === 1 ? '' : 's'}`;
    }
    return dayStr;
  }

  if (hours > 0) {
    const hrStr = `${hours} hour${hours === 1 ? '' : 's'}`;
    if (minutes > 0) {
      return `${hrStr} ${minutes} minute${minutes === 1 ? '' : 's'}`;
    }
    return hrStr;
  }

  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Sorts statusLogs in strict chronological order (earliest to latest).
 * Logs with unparseable timestamps are preserved at the end.
 */
export function sortStatusLogsChronological(statusLogs = []) {
  if (!Array.isArray(statusLogs)) return [];
  return [...statusLogs].sort((a, b) => {
    const da = parseDateSafe(a?.timestamp);
    const db = parseDateSafe(b?.timestamp);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });
}

/**
 * Calculate response-time metrics from actual recorded timestamps:
 * 1. Dispatch Processing Time: Reported -> Assigned
 * 2. Travel / Transit Time: En Route -> On Scene (or Assigned -> On Scene fallback)
 * 3. On-Scene Resolution Time: On Scene -> Resolved
 * 4. Total Resolution Time: Reported -> Resolved
 */
export function calculateResponseMetrics(incident = {}, statusLogs = []) {
  const sortedLogs = sortStatusLogsChronological(statusLogs);

  // Helper to find earliest log matching a specific status
  const findEarliestLog = (status) =>
    sortedLogs.find((l) => l?.status?.toLowerCase() === status.toLowerCase());

  // Reported time: incident.createdAt or first 'Reported' log
  const reportedLog = findEarliestLog('Reported');
  const reportedDate = parseDateSafe(incident.createdAt) || parseDateSafe(reportedLog?.timestamp);

  // Assigned time: first 'Assigned' log or incident.assignedAt
  const assignedLog = findEarliestLog('Assigned');
  const assignedDate = parseDateSafe(assignedLog?.timestamp) || parseDateSafe(incident.assignedAt);

  // En Route time: first 'En Route' log or incident.enRouteAt
  const enRouteLog = findEarliestLog('En Route');
  const enRouteDate = parseDateSafe(enRouteLog?.timestamp) || parseDateSafe(incident.enRouteAt);

  // On Scene time: first 'On Scene' log or incident.onSceneAt
  const onSceneLog = findEarliestLog('On Scene');
  const onSceneDate = parseDateSafe(onSceneLog?.timestamp) || parseDateSafe(incident.onSceneAt);

  // Resolved time: 'Resolved' log or incident.resolvedAt or incident.updatedAt if status is Resolved
  const resolvedLog = findEarliestLog('Resolved');
  let resolvedDate = parseDateSafe(resolvedLog?.timestamp) || parseDateSafe(incident.resolvedAt);
  if (!resolvedDate && incident.status === 'Resolved') {
    resolvedDate = parseDateSafe(incident.updatedAt);
  }

  // 1. Dispatch Processing Time (Reported -> Assigned)
  let dispatchDiff = null;
  let dispatchNote = 'Initial emergency report received to responder dispatch';
  if (reportedDate && assignedDate) {
    dispatchDiff = assignedDate.getTime() - reportedDate.getTime();
    if (dispatchDiff < 0) {
      dispatchDiff = null;
      dispatchNote = 'Timestamps contain inconsistencies (clock drift)';
    }
  } else if (!assignedDate && incident.status === 'Reported') {
    dispatchNote = 'Pending responder assignment';
  } else {
    dispatchNote = 'Timestamp data incomplete';
  }

  // 2. Travel / Transit Time
  let travelDiff = null;
  let travelLabel = 'Travel / Transit Time';
  let travelNote = 'Responder en route departure to arrival on scene';
  if (enRouteDate && onSceneDate) {
    travelDiff = onSceneDate.getTime() - enRouteDate.getTime();
    if (travelDiff < 0) {
      travelDiff = null;
      travelNote = 'Timestamps contain inconsistencies (clock drift)';
    }
  } else if (!enRouteDate && assignedDate && onSceneDate) {
    // Direct dispatch to on scene without an en route marker
    travelDiff = onSceneDate.getTime() - assignedDate.getTime();
    travelLabel = 'Dispatch to Arrival Time';
    travelNote = 'Assignment to on-scene arrival (en route stage not recorded)';
    if (travelDiff < 0) {
      travelDiff = null;
      travelNote = 'Timestamps contain inconsistencies (clock drift)';
    }
  } else if (!onSceneDate) {
    travelNote = 'Responder has not yet arrived on scene';
  } else {
    travelNote = 'Departure timestamp not recorded';
  }

  // 3. On-Scene Resolution Time (On Scene -> Resolved)
  let onSceneDiff = null;
  let onSceneNote = 'Active on-scene response until final resolution';
  if (onSceneDate && resolvedDate) {
    onSceneDiff = resolvedDate.getTime() - onSceneDate.getTime();
    if (onSceneDiff < 0) {
      onSceneDiff = null;
      onSceneNote = 'Timestamps contain inconsistencies (clock drift)';
    }
  } else if (!resolvedDate) {
    onSceneNote = 'Incident remains active on scene';
  } else {
    onSceneNote = 'On-scene arrival timestamp not recorded';
  }

  // 4. Total Incident Resolution Time (Reported -> Resolved)
  let totalDiff = null;
  let totalNote = 'Initial emergency report to full incident resolution';
  if (reportedDate && resolvedDate) {
    totalDiff = resolvedDate.getTime() - reportedDate.getTime();
    if (totalDiff < 0) {
      totalDiff = null;
      totalNote = 'Timestamps contain inconsistencies (clock drift)';
    }
  } else if (incident.status !== 'Resolved') {
    totalNote = 'Incident still in progress (pending resolution)';
  } else {
    totalNote = 'Resolution timestamp not recorded';
  }

  return {
    timestamps: {
      reported: reportedDate,
      assigned: assignedDate,
      enRoute: enRouteDate,
      onScene: onSceneDate,
      resolved: resolvedDate,
    },
    metrics: [
      {
        id: 'dispatch',
        name: 'Dispatch Processing Time',
        interval: 'Reported → Assigned',
        duration: formatDuration(dispatchDiff),
        rawMs: dispatchDiff,
        note: dispatchNote,
      },
      {
        id: 'travel',
        name: travelLabel,
        interval: enRouteDate ? 'En Route → On Scene' : 'Assigned → On Scene',
        duration: formatDuration(travelDiff),
        rawMs: travelDiff,
        note: travelNote,
      },
      {
        id: 'onSceneResolution',
        name: 'On-Scene Resolution Time',
        interval: 'On Scene → Resolved',
        duration: formatDuration(onSceneDiff),
        rawMs: onSceneDiff,
        note: onSceneNote,
      },
      {
        id: 'totalResolution',
        name: 'Total Incident Resolution Time',
        interval: 'Reported → Resolved',
        duration: formatDuration(totalDiff),
        rawMs: totalDiff,
        note: totalNote,
      },
    ],
  };
}

/**
 * Extract assignment history from statusLogs and incident document.
 */
export function extractAssignmentHistory(incident = {}, statusLogs = []) {
  const sortedLogs = sortStatusLogsChronological(statusLogs);
  const assignmentLogs = sortedLogs.filter(
    (l) => l?.status?.toLowerCase() === 'assigned' || (l?.notes && l.notes.toLowerCase().includes('assigned'))
  );

  const initialResponder = incident.responderName || null;
  const initialResponderId = incident.responderId || null;

  return {
    assignedResponder: initialResponder || (initialResponderId ? `Responder (${initialResponderId})` : 'Unassigned'),
    assignedAt: formatDateTime(assignmentLogs[0]?.timestamp || incident.assignedAt),
    hasAssignments: assignmentLogs.length > 0 || !!initialResponder || !!initialResponderId,
    assignmentChanges: assignmentLogs.map((log, idx) => ({
      sequence: idx + 1,
      timestamp: formatDateTime(log.timestamp),
      notes: log.notes || 'Assignment updated',
      updatedBy: log.updatedBy || 'Dispatcher',
    })),
  };
}

/**
 * Generate a complete, polished, official PDF Incident Report.
 * Returns the jsPDF instance. If download = true, triggers file download.
 *
 * @param {Object} options
 * @param {Object} options.incident - Incident document data
 * @param {Array} options.statusLogs - Status log audit records
 * @param {string} options.userRole - Role of requesting user ('dispatcher', 'responder', 'reporter', 'admin')
 * @param {boolean} options.download - Whether to trigger browser download
 * @returns {jsPDF}
 */
export function generateIncidentReportPDF({
  incident = {},
  statusLogs = [],
  userRole = 'dispatcher',
  download = true,
}) {
  if (!incident) {
    throw new Error('Cannot generate report: Incident data is missing.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const incidentRef = incident.incidentId || incident.id || 'INC-UNKNOWN';
  const genDateStr = formatDateTime(new Date());

  /* ─────────────────────────────────────────────────────────────
   * Section A: Report Header & Official Banner
   * ───────────────────────────────────────────────────────────── */
  // Top brand bar
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(0, 0, pageWidth, 60, 'F');

  // Red accent line under banner
  doc.setFillColor(...PDF_COLORS.accent);
  doc.rect(0, 60, pageWidth, 3, 'F');

  // Brand Name
  doc.setTextColor(...PDF_COLORS.textLight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ALERT24 EMERGENCY MANAGEMENT & RESPONSE SYSTEM', margin, 28);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text('Official Incident Audit & Operational Summary Report', margin, 44);

  // Right-aligned header metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.textLight);
  doc.text(`REF: ${incidentRef}`, pageWidth - margin, 28, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${genDateStr}`, pageWidth - margin, 44, { align: 'right' });

  let cursorY = 80;

  // Status & Severity Summary Badges
  const severity = incident.severity || 'Minor';
  const status = incident.status || 'Reported';

  // Badges container
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.roundedRect(margin, cursorY, contentWidth, 38, 4, 4, 'FD');

  // Left: Incident Type
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`${incident.type || 'Incident'} Emergency`, margin + 12, cursorY + 23);

  // Right badges: Severity badge & Status badge
  let badgeX = pageWidth - margin - 12;

  // Status Badge
  const statusColors = {
    Resolved: PDF_COLORS.resolved,
    'On Scene': PDF_COLORS.onScene,
    'En Route': PDF_COLORS.enRoute,
    Assigned: PDF_COLORS.assigned,
    Reported: PDF_COLORS.reported,
  };
  const sColor = statusColors[status] || PDF_COLORS.reported;
  const statusText = `STATUS: ${status.toUpperCase()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const statusWidth = doc.getTextWidth(statusText) + 16;
  badgeX -= statusWidth;
  doc.setFillColor(...sColor);
  doc.roundedRect(badgeX, cursorY + 10, statusWidth, 18, 3, 3, 'F');
  doc.setTextColor(...PDF_COLORS.textLight);
  doc.text(statusText, badgeX + statusWidth / 2, cursorY + 22, { align: 'center' });

  // Severity Badge
  const sevColors = {
    Critical: PDF_COLORS.critical,
    Serious: PDF_COLORS.serious,
    Minor: PDF_COLORS.minor,
  };
  const sevColor = sevColors[severity] || PDF_COLORS.minor;
  const sevText = `SEVERITY: ${severity.toUpperCase()}`;
  const sevWidth = doc.getTextWidth(sevText) + 16;
  badgeX -= (sevWidth + 8);
  doc.setFillColor(...sevColor);
  doc.roundedRect(badgeX, cursorY + 10, sevWidth, 18, 3, 3, 'F');
  doc.setTextColor(...PDF_COLORS.textLight);
  doc.text(sevText, badgeX + sevWidth / 2, cursorY + 22, { align: 'center' });

  cursorY += 50;

  /* ─────────────────────────────────────────────────────────────
   * Section B: Incident Overview
   * ───────────────────────────────────────────────────────────── */
  const sectionHeader = (title) => {
    doc.setFillColor(...PDF_COLORS.bgAlt);
    doc.roundedRect(margin, cursorY, contentWidth, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text(title.toUpperCase(), margin + 8, cursorY + 14);
    cursorY += 26;
  };

  sectionHeader('1. Incident Overview & Location');

  const coordsFormatted =
    incident.latitude != null && incident.longitude != null
      ? `${Number(incident.latitude).toFixed(6)}°, ${Number(incident.longitude).toFixed(6)}°`
      : 'Not provided (Address-only incident)';

  const overviewRows = [
    [
      { content: 'Incident Reference:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      incidentRef,
      { content: 'Emergency Type:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      incident.type || 'N/A',
    ],
    [
      { content: 'Current Status:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      status,
      { content: 'Assessed Severity:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      severity,
    ],
    [
      { content: 'Reported Timestamp:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      formatDateTime(incident.createdAt),
      { content: 'Last Updated:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      formatDateTime(incident.updatedAt),
    ],
    [
      { content: 'Address / Location:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      { content: incident.address || 'Address not recorded', colSpan: 3 },
    ],
    [
      { content: 'GPS Coordinates:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      { content: coordsFormatted, colSpan: 3 },
    ],
    [
      { content: 'Incident Description:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      { content: incident.description || 'No description provided.', colSpan: 3, styles: { cellPadding: 5 } },
    ],
  ];

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      textColor: PDF_COLORS.textDark,
      cellPadding: 4,
      lineColor: PDF_COLORS.borderLight,
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 110, fillColor: PDF_COLORS.bgLight },
      1: { cellWidth: 140 },
      2: { cellWidth: 100, fillColor: PDF_COLORS.bgLight },
      3: { cellWidth: 'auto' },
    },
    body: overviewRows,
  });

  cursorY = doc.lastAutoTable.finalY + 14;

  /* ─────────────────────────────────────────────────────────────
   * Section C & D: Reporter Information & Assignment Details
   * ───────────────────────────────────────────────────────────── */
  sectionHeader('2. Reporter & Assignment Records');

  const assignmentInfo = extractAssignmentHistory(incident, statusLogs);

  // Permission-aware reporter display
  let reporterDisplayName = 'Anonymous / Not provided';
  if (incident.reporterName) {
    reporterDisplayName = incident.reporterName;
  }
  const scopeLabel =
    userRole === 'dispatcher'
      ? 'Authorized Dispatcher Record'
      : userRole === 'responder'
      ? 'Authorized Field Responder Record'
      : 'Authorized Citizen Reporter Record';

  const personnelRows = [
    [
      { content: 'Reporter Name:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      reporterDisplayName,
      { content: 'Assigned Responder:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      assignmentInfo.assignedResponder,
    ],
    [
      { content: 'Access Authorization:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      scopeLabel,
      { content: 'Assignment Time:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      assignmentInfo.assignedAt,
    ],
    [
      { content: 'Assignment History:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      {
        content:
          assignmentInfo.assignmentChanges.length > 1
            ? `${assignmentInfo.assignmentChanges.length} assignment changes logged in audit trail.`
            : assignmentInfo.hasAssignments
            ? 'Initial assignment confirmed; no subsequent reassignment recorded.'
            : 'No responder assigned (incident pending dispatch).',
        colSpan: 3,
      },
    ],
  ];

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      textColor: PDF_COLORS.textDark,
      cellPadding: 4,
      lineColor: PDF_COLORS.borderLight,
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 110, fillColor: PDF_COLORS.bgLight },
      1: { cellWidth: 140 },
      2: { cellWidth: 110, fillColor: PDF_COLORS.bgLight },
      3: { cellWidth: 'auto' },
    },
    body: personnelRows,
  });

  cursorY = doc.lastAutoTable.finalY + 14;

  /* ─────────────────────────────────────────────────────────────
   * Section E: Incident Timeline & Audit History
   * ───────────────────────────────────────────────────────────── */
  sectionHeader('3. Incident Timeline & Audit Trail');

  const sortedLogs = sortStatusLogsChronological(statusLogs);

  let timelineRows = [];
  if (sortedLogs.length > 0) {
    timelineRows = sortedLogs.map((log, index) => [
      String(index + 1),
      log.status || 'Update',
      formatDateTime(log.timestamp),
      log.notes || 'Status updated',
    ]);
  } else {
    // If statusLogs collection is empty, gracefully show known incident timestamps
    timelineRows = [
      ['1', 'Reported', formatDateTime(incident.createdAt), 'Initial incident recorded'],
    ];
    if (incident.status === 'Resolved') {
      timelineRows.push([
        '2',
        'Resolved',
        formatDateTime(incident.resolvedAt || incident.updatedAt),
        'Incident marked as resolved',
      ]);
    }
  }

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'striped',
    showHead: 'everyPage',
    head: [['#', 'Stage', 'Timestamp', 'Operational Notes & Audit Trail']],
    headStyles: {
      fillColor: PDF_COLORS.secondary,
      textColor: PDF_COLORS.textLight,
      fontSize: 8.5,
      fontStyle: 'bold',
      cellPadding: 4,
    },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      lineColor: PDF_COLORS.borderLight,
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 70, fontStyle: 'bold' },
      2: { cellWidth: 110 },
      3: { cellWidth: 'auto' },
    },
    body: timelineRows,
  });

  cursorY = doc.lastAutoTable.finalY + 14;

  /* ─────────────────────────────────────────────────────────────
   * Section F: Response-Time Metrics
   * ───────────────────────────────────────────────────────────── */
  // Check if we have enough room on the current page for metrics; if not, autoTable will handle break
  sectionHeader('4. Response-Time Performance Metrics');

  const { metrics } = calculateResponseMetrics(incident, statusLogs);

  const metricsRows = metrics.map((m) => [
    m.name,
    m.interval,
    { content: m.duration, styles: { fontStyle: 'bold', textColor: m.rawMs != null ? PDF_COLORS.primary : PDF_COLORS.textMuted } },
    m.note,
  ]);

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    showHead: 'everyPage',
    head: [['Performance Metric', 'Lifecycle Interval', 'Duration', 'Calculation Basis / Operational Context']],
    headStyles: {
      fillColor: PDF_COLORS.secondary,
      textColor: PDF_COLORS.textLight,
      fontSize: 8.5,
      fontStyle: 'bold',
      cellPadding: 4,
    },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      lineColor: PDF_COLORS.borderLight,
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 125, fontStyle: 'bold' },
      1: { cellWidth: 95 },
      2: { cellWidth: 80, halign: 'center' },
      3: { cellWidth: 'auto' },
    },
    body: metricsRows,
  });

  cursorY = doc.lastAutoTable.finalY + 14;

  /* ─────────────────────────────────────────────────────────────
   * Section G: Resolution Summary
   * ───────────────────────────────────────────────────────────── */
  // Ensure we don't start resolution summary too close to bottom
  if (cursorY > pageHeight - 120) {
    doc.addPage();
    cursorY = 40;
  }

  sectionHeader('5. Resolution Summary & Final Disposition');

  const resolvedLog = sortedLogs.find((l) => l.status === 'Resolved');
  const resolutionDateFormatted = formatDateTime(
    resolvedLog?.timestamp || incident.resolvedAt || (incident.status === 'Resolved' ? incident.updatedAt : null)
  );

  const resolutionNotes =
    resolvedLog?.notes ||
    incident.resolutionNotes ||
    (incident.status === 'Resolved' ? 'Incident resolved successfully.' : 'Incident has not reached resolution.');

  const resolutionRows = [
    [
      { content: 'Final Disposition:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      status === 'Resolved' ? 'Resolved & Closed' : `Active / Ongoing (${status})`,
      { content: 'Resolution Timestamp:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      status === 'Resolved' ? resolutionDateFormatted : 'Pending Resolution',
    ],
    [
      { content: 'Closing Responder:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      incident.responderName || (incident.responderId ? `Responder (${incident.responderId})` : 'Unassigned'),
      { content: 'Audit Status:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      sortedLogs.length > 0 ? `${sortedLogs.length} audit entries verified` : 'Base system record',
    ],
    [
      { content: 'Resolution Notes:', styles: { fontStyle: 'bold', textColor: PDF_COLORS.textDark } },
      { content: resolutionNotes, colSpan: 3, styles: { cellPadding: 5 } },
    ],
  ];

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      textColor: PDF_COLORS.textDark,
      cellPadding: 4,
      lineColor: PDF_COLORS.borderLight,
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 110, fillColor: PDF_COLORS.bgLight },
      1: { cellWidth: 140 },
      2: { cellWidth: 110, fillColor: PDF_COLORS.bgLight },
      3: { cellWidth: 'auto' },
    },
    body: resolutionRows,
  });

  /* ─────────────────────────────────────────────────────────────
   * Section H: Page Footers on All Pages
   * ───────────────────────────────────────────────────────────── */
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Footer divider line
    doc.setDrawColor(...PDF_COLORS.borderLight);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 32, pageWidth - margin, pageHeight - 32);

    // Left: Reference ID & Confidentiality Notice
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(
      `Alert24 Emergency Management System • Ref: ${incidentRef} • Confidential Incident Report`,
      margin,
      pageHeight - 20
    );
    doc.text(
      'Contains operational emergency data. Handle according to organizational privacy requirements.',
      margin,
      pageHeight - 11
    );

    // Right: Page number
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
  }

  // Trigger download if requested
  const sanitizedId = String(incidentRef).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Alert24-Incident-${sanitizedId}-Report.pdf`;

  if (download && typeof doc.save === 'function') {
    doc.save(filename);
  }

  return doc;
}

/**
 * Alert24 Professional Bulk Incident Queue Report Generator
 * Generates an executive master PDF summarizing multiple filtered incidents
 * with Command Center Slate branding, summary stats, repeated headers,
 * and page numbers.
 */
export function generateBulkIncidentReportPDF({
  incidents = [],
  filterSummary = {},
  generatedBy = 'Authorized Dispatcher',
  download = true,
} = {}) {
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  // Header Banner
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(0, 0, pageWidth, 64, 'F');

  // Accent Line
  doc.setFillColor(...PDF_COLORS.accent);
  doc.rect(0, 64, pageWidth, 3, 'F');

  // Brand Header Text
  doc.setTextColor(...PDF_COLORS.textLight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ALERT24 EMERGENCY MANAGEMENT & RESPONSE SYSTEM', margin, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Master Incident Queue & Operations Audit Report', margin, 42);

  // Right-aligned header metadata
  const now = new Date();
  const genDateStr = formatDateTime(now);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_COLORS.textLight);
  doc.text(`Total Records: ${safeIncidents.length}`, pageWidth - margin, 26, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${genDateStr}`, pageWidth - margin, 42, { align: 'right' });

  let cursorY = 78;

  // Filter & Status Summary Strip
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.roundedRect(margin, cursorY, contentWidth, 38, 3, 3, 'FD');

  // Compute status counts
  const counts = { Reported: 0, Assigned: 0, 'En Route': 0, 'On Scene': 0, Resolved: 0 };
  safeIncidents.forEach((inc) => {
    if (counts[inc?.status] !== undefined) counts[inc.status]++;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text('REPORT FILTER CONTEXT:', margin + 8, cursorY + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textMuted);
  const statusFilterText = filterSummary.status && filterSummary.status !== 'All' ? filterSummary.status : 'All Statuses';
  const severityFilterText = filterSummary.severity && filterSummary.severity !== 'All' ? filterSummary.severity : 'All Severities';
  const dateFilterText = filterSummary.dateFrom || filterSummary.dateTo
    ? `${filterSummary.dateFrom || 'Start'} to ${filterSummary.dateTo || 'Present'}`
    : 'All Dates';
  const searchFilterText = filterSummary.searchQuery ? `"${filterSummary.searchQuery}"` : 'None';

  doc.text(`Status: ${statusFilterText}  |  Severity: ${severityFilterText}  |  Date: ${dateFilterText}  |  Search: ${searchFilterText}`, margin + 8, cursorY + 28);

  // Right-aligned stats breakdown
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(
    `Reported: ${counts.Reported}   Assigned: ${counts.Assigned}   En Route: ${counts['En Route']}   On Scene: ${counts['On Scene']}   Resolved: ${counts.Resolved}`,
    pageWidth - margin - 8,
    cursorY + 21,
    { align: 'right' }
  );

  cursorY += 48;

  // Empty state handling
  if (safeIncidents.length === 0) {
    doc.setFillColor(...PDF_COLORS.bgLight);
    doc.setDrawColor(...PDF_COLORS.borderLight);
    doc.roundedRect(margin, cursorY, contentWidth, 80, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text('No Incident Records Found', margin + contentWidth / 2, cursorY + 34, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text('There are no incident records matching the selected filter criteria.', margin + contentWidth / 2, cursorY + 52, { align: 'center' });
  } else {
    // Build table rows
    const tableData = safeIncidents.map((i) => {
      const id = i.incidentId || i.id || 'N/A';
      const ref = id.length > 10 ? `${id.substring(0, 8)}…` : id;
      const type = i.type || 'Other';
      const severity = i.severity || 'Minor';
      const status = i.status || 'Reported';
      const reporter = i.reporterName || 'Anonymous';
      const address = i.address || 'Location not specified';
      const date = formatDateTime(i.createdAt, 'Not recorded');

      return [ref, type, severity, status, reporter, address, date];
    });

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin, bottom: 40 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Ref ID', 'Type', 'Severity', 'Status', 'Reporter', 'Location / Address', 'Date']],
      body: tableData,
      headStyles: {
        fillColor: PDF_COLORS.secondary,
        textColor: PDF_COLORS.textLight,
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 4,
      },
      alternateRowStyles: {
        fillColor: PDF_COLORS.bgAlt,
      },
      styles: {
        fontSize: 7.5,
        textColor: PDF_COLORS.textDark,
        cellPadding: 3.5,
        lineColor: PDF_COLORS.borderLight,
        lineWidth: 0.5,
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: 'bold' },
        1: { cellWidth: 70 },
        2: { cellWidth: 50 },
        3: { cellWidth: 55 },
        4: { cellWidth: 75 },
        5: { cellWidth: 'auto' },
        6: { cellWidth: 75, fontSize: 7 },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          // Severity coloring
          if (data.column.index === 2) {
            const val = String(data.cell.raw).toLowerCase();
            if (val === 'critical') data.cell.styles.textColor = PDF_COLORS.critical;
            else if (val === 'serious') data.cell.styles.textColor = PDF_COLORS.serious;
            else if (val === 'minor') data.cell.styles.textColor = PDF_COLORS.minor;
            data.cell.styles.fontStyle = 'bold';
          }
          // Status coloring
          if (data.column.index === 3) {
            const val = String(data.cell.raw).toLowerCase();
            if (val === 'resolved') data.cell.styles.textColor = PDF_COLORS.resolved;
            else if (val === 'on scene') data.cell.styles.textColor = PDF_COLORS.onScene;
            else if (val === 'en route') data.cell.styles.textColor = PDF_COLORS.enRoute;
            else if (val === 'assigned') data.cell.styles.textColor = PDF_COLORS.assigned;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
  }

  // Page Footers on All Pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Footer divider line
    doc.setDrawColor(...PDF_COLORS.borderLight);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);

    // Left: Reference & Notice
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(
      `Alert24 Emergency Management System • Operations Report • Prepared by: ${generatedBy}`,
      margin,
      pageHeight - 16
    );

    // Right: Page number
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 16, { align: 'right' });
  }

  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = `Alert24-Incident-Queue-Report-${dateTag}.pdf`;

  if (download && typeof doc.save === 'function') {
    doc.save(filename);
  }

  return doc;
}
