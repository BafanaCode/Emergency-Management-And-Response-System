import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { generateIncidentReportPDF, generateBulkIncidentReportPDF } from "./utils/pdfExport";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "./DispatcherDashboard.css";
import backgroundImage from "./images/image4.webp";
import ViewIncidentModal from "./components/dispatcher/ViewIncidentModal";
import AssignIncidentModal from "./components/dispatcher/AssignIncidentModal";
import ReportsTab from "./components/dispatcher/ReportsTab";
import NotificationCenter from "./components/notifications/NotificationCenter";
import useNotifications from "./hooks/useNotifications";
import { NOTIFICATION_TYPES } from "./utils/notifications";
import {
  isResolvedToday,
  isIncidentAssignable,
  isResponderAssignable,
  friendlyFirestoreError,
} from "./utils/incidentLifecycle";
import { parseDateSafe, calculateResponseTimeTrend } from "./utils/responseTime";

// Leaflet is loaded on demand: only dispatchers who open the map tab download it.
const IncidentMap = lazy(() => import("./components/map/IncidentMap"));

const formatDate = (timestamp) => {
  if (!timestamp) return "";
  const date = timestamp.toDate();
  const day = String(date.getDate()).padStart(2, "0");
  const months = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hours}:${minutes}`;
};

/* ── Reusable SVG icon components ───────────────────────── */
const IconShield = ({ size = 20, className = "" }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2L3 7V12C3 16.5 6.84 20.74 12 22C17.16 20.74 21 16.5 21 12V7L12 2Z" fill="currentColor" />
    <path d="M12 8V14M12 16V17" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconHome = () => (
  <svg className="dd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9L12 2L21 9V20C21 20.5 20.79 21.04 20.41 21.41C20.04 21.79 19.5 22 19 22H5C4.47 22 3.96 21.79 3.59 21.41C3.21 21.04 3 20.5 3 20V9Z"/>
    <path d="M9 22V12H15V22"/>
  </svg>
);

const IconFlame = () => (
  <svg className="dd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>
  </svg>
);

const IconUsers = () => (
  <svg className="dd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
  </svg>
);

const IconFile = () => (
  <svg className="dd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6C5.47 2 4.96 2.21 4.59 2.59C4.21 2.96 4 3.47 4 4V20C4 20.53 4.21 21.04 4.59 21.41C4.96 21.79 5.47 22 6 22H18C18.53 22 19.04 21.79 19.41 21.41C19.79 21.04 20 20.53 20 20V8L14 2Z"/>
    <path d="M14 2V8H20M16 13H8M16 17H8M10 9H8"/>
  </svg>
);

const IconMap = () => (
  <svg className="dd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconBell = () => (
  <svg className="dd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8.5C18 5.46 15.54 3 12.5 3S7 5.46 7 8.5c0 3-1.5 5-1.5 5h13s-1.5-2-1.5-5zM15 17a3 3 0 11-6 0"/>
  </svg>
);

const IconCheck = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconSettingsGear = () => (
  <svg className="dd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

/* ── Severity badge ── */
const SeverityBadge = ({ severity }) => {
  const cls = {
    Critical: "dd-badge dd-badge-critical",
    Serious:  "dd-badge dd-badge-serious",
    Minor:    "dd-badge dd-badge-minor",
  }[severity] || "dd-badge dd-badge-minor";
  return <span className={cls}>{severity}</span>;
};

/* ── Status badge ── */
const StatusBadge = ({ status }) => {
  const key = status.toLowerCase().replace(/\s+/g, "-");
  return <span className={`dd-badge dd-badge-${key}`}>{status}</span>;
};

/* ═══════════════════════════════════════════════════════════
   DISPATCHER DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════ */
const DispatcherDashboard = ({ onLogout, user, userData, theme, onThemeChange }) => {
  const [activeTab, setActiveTab] = useState("overview");

  const [incidents, setIncidents] = useState([]);
  const [responders, setResponders] = useState([]);
  const [statusLogs, setStatusLogs] = useState([]);
  const {
    notifications,
    unreadCount,
    loading: notifLoading,
    error: notifError,
    actionError: notifActionError,
    online: notifOnline,
    fromCache: notifFromCache,
    markRead,
    markAllRead,
  } = useNotifications(user, "dispatcher");
  const [assigning, setAssigning] = useState(false);

  const [viewIncident, setViewIncident] = useState(null);
  const [assignIncident, setAssignIncident] = useState(null);
  const [selectedResponder, setSelectedResponder] = useState(null);

  const [successToast, setSuccessToast] = useState("");
  const [errorBanner, setErrorBanner] = useState("");

  const [statusFilter, setStatusFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  /* Live Incidents & Responders filters */
  const [liveSearchQuery, setLiveSearchQuery] = useState("");
  const [liveStatusFilter, setLiveStatusFilter] = useState("All");
  const [liveSeverityFilter, setLiveSeverityFilter] = useState("All");
  const [responderSearchQuery, setResponderSearchQuery] = useState("");
  const [responderAvailFilter, setResponderAvailFilter] = useState("All");
  const [reportsSearchQuery, setReportsSearchQuery] = useState("");

  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [allStatusLogs, setAllStatusLogs] = useState([]);
  const [statusLogsLoading, setStatusLogsLoading] = useState(true);

  /* ── Firestore listeners ── */
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "incidents"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ incidentId: doc.id, ...doc.data() }));
        data.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (parseDateSafe(a.createdAt)?.getTime() || 0);
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (parseDateSafe(b.createdAt)?.getTime() || 0);
          return timeB - timeA;
        });
        setIncidents(data);
        setIncidentsLoading(false);
      },
      (err) => {
        console.error("Error fetching incidents:", err);
        setErrorBanner("Error loading incidents: " + err.message);
        setIncidentsLoading(false);
      }
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, "statusLogs");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ logId: doc.id, ...doc.data() }));
        setAllStatusLogs(data);
        setStatusLogsLoading(false);
      },
      (err) => {
        console.error("Error fetching status logs for analytics:", err);
        setStatusLogsLoading(false);
      }
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "users"), where("role", "==", "responder"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
        setResponders(data);
      },
      (err) => {
        console.error("Error fetching responders:", err);
        setErrorBanner("Error loading responders: " + err.message);
      }
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user]);

  /* ── Helpers ── */
  const statusLogsUnsubRef = useRef(null);

  useEffect(() => {
    return () => {
      if (statusLogsUnsubRef.current) {
        statusLogsUnsubRef.current();
        statusLogsUnsubRef.current = null;
      }
    };
  }, []);

  const fetchStatusLogsForIncident = (incidentId) => {
    if (statusLogsUnsubRef.current) {
      statusLogsUnsubRef.current();
      statusLogsUnsubRef.current = null;
    }
    const q = query(collection(db, "statusLogs"), where("incidentId", "==", incidentId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs
          .map((doc) => ({ logId: doc.id, ...doc.data() }))
          .sort((a, b) => {
            const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (parseDateSafe(a.timestamp)?.getTime() || 0);
            const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (parseDateSafe(b.timestamp)?.getTime() || 0);
            return timeA - timeB;
          });
        setStatusLogs(logs);
      },
      (err) => {
        if (!user) return;
        console.error("Error fetching status logs:", err);
        setErrorBanner("Error loading status logs: " + err.message);
      }
    );
    statusLogsUnsubRef.current = unsubscribe;
    return unsubscribe;
  };

  const handleViewIncident = async (incident) => {
    setViewIncident(incident);
    return fetchStatusLogsForIncident(incident.incidentId);
  };

  const handleAssignIncident = async () => {
    if (!assignIncident || !selectedResponder) return;
    if (assigning) return; // ignore repeated taps while the assignment is in flight

    // Fast client-side eligibility check against the latest live data. The authoritative
    // check is enforced by firestore.rules, which also rejects a stale/duplicate assignment.
    const liveIncident = incidents.find((i) => i.incidentId === assignIncident.incidentId);
    const liveResponder = responders.find((r) => r.uid === selectedResponder.uid);
    if (!isIncidentAssignable(liveIncident)) {
      setErrorBanner("This incident is no longer awaiting assignment.");
      setAssignIncident(null);
      setSelectedResponder(null);
      return;
    }
    if (!isResponderAssignable(liveResponder)) {
      setErrorBanner("The selected responder is no longer available. Please choose another responder.");
      setSelectedResponder(null);
      return;
    }

    setAssigning(true);
    try {
      const batch = writeBatch(db);

      const incidentRef = doc(db, "incidents", assignIncident.incidentId);
      batch.update(incidentRef, {
        status: "Assigned",
        responderId: selectedResponder.uid,
        responderName: selectedResponder.name,
        updatedAt: serverTimestamp(),
      });

      const responderRef = doc(db, "users", selectedResponder.uid);
      batch.update(responderRef, {
        isAvailable: false,
        activeIncidentId: assignIncident.incidentId,
      });

      const statusLogRef = doc(collection(db, "statusLogs"));
      batch.set(statusLogRef, {
        incidentId: assignIncident.incidentId,
        status: "Assigned",
        updatedBy: user.uid,
        notes: `Assigned to ${selectedResponder.name}`,
        timestamp: serverTimestamp(),
      });

      const responderNotifRef = doc(collection(db, "notifications"));
      batch.set(responderNotifRef, {
        userId: selectedResponder.uid,
        incidentId: assignIncident.incidentId,
        type: NOTIFICATION_TYPES.ASSIGNED,
        message: `New emergency assigned: ${assignIncident.type} at ${assignIncident.address}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      const reporterNotifRef = doc(collection(db, "notifications"));
      batch.set(reporterNotifRef, {
        userId: assignIncident.reporterId,
        incidentId: assignIncident.incidentId,
        type: NOTIFICATION_TYPES.ASSIGNED,
        message: "A responder has been assigned to your emergency",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      setSuccessToast("Responder assigned successfully");
      setTimeout(() => setSuccessToast(""), 3000);
      setAssignIncident(null);
      setSelectedResponder(null);
    } catch (err) {
      console.error("Error assigning incident:", err);
      setErrorBanner("Error assigning responder: " + friendlyFirestoreError(err));
    } finally {
      setAssigning(false);
    }
  };

  // Open the incident a notification refers to. Dispatchers can read every incident.
  const openNotification = (notification) => {
    markRead(notification);
    const incident = incidents.find((i) => i.incidentId === notification.incidentId);
    if (!incident) return false;
    handleViewIncident(incident);
    return true;
  };

  const handleToggleResponderAvailability = async (responder) => {
    if (!responder.isAvailable && responder.activeIncidentId) {
      setErrorBanner("This responder has an active assignment and cannot be marked available yet.");
      return;
    }
    try {
      const responderRef = doc(db, "users", responder.uid);
      await updateDoc(responderRef, { isAvailable: !responder.isAvailable });
    } catch (err) {
      console.error("Error updating responder availability:", err);
      setErrorBanner("Error updating responder: " + friendlyFirestoreError(err));
    }
  };

  /* ── Stats ── */
  const stats = {
    total: incidents.length,
    unassigned: incidents.filter((i) => i.status === "Reported").length,
    active: incidents.filter(
      (i) => i.status === "Assigned" || i.status === "En Route" || i.status === "On Scene"
    ).length,
    resolvedToday: incidents.filter((i) => isResolvedToday(i)).length,
    totalResponders: responders.length,
  };

  /* ── Analytics ── */
  const prepareAnalyticsData = () => {
    const last7Days = [];
    const today = new Date();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      last7Days.push({ date: dateKey, day: dayNames[date.getDay()], count: 0 });
    }

    incidents.forEach((incident) => {
      const incidentDate = parseDateSafe(incident.createdAt);
      if (!incidentDate) return;
      const dateKey = `${incidentDate.getFullYear()}-${String(incidentDate.getMonth() + 1).padStart(2, "0")}-${String(incidentDate.getDate()).padStart(2, "0")}`;
      const dayIndex = last7Days.findIndex((d) => d.date === dateKey);
      if (dayIndex !== -1) last7Days[dayIndex].count++;
    });

    const typeCounts = {};
    incidents.forEach((incident) => {
      if (!incident.type) return;
      typeCounts[incident.type] = (typeCounts[incident.type] || 0) + 1;
    });
    const typeData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

    const severityCounts = { Minor: 0, Serious: 0, Critical: 0 };
    incidents.forEach((incident) => {
      if (!incident.severity) return;
      if (Object.prototype.hasOwnProperty.call(severityCounts, incident.severity)) {
        severityCounts[incident.severity]++;
      }
    });
    const severityData = [
      { name: "Minor", value: severityCounts.Minor },
      { name: "Serious", value: severityCounts.Serious },
      { name: "Critical", value: severityCounts.Critical },
    ];

    const { trendData, hasData, totalMeasurements, averageOverall } = calculateResponseTimeTrend(
      incidents,
      allStatusLogs,
      { days: 7, metric: "reportToOnScene", endDate: today }
    );

    return {
      incidentsPerDay: last7Days,
      incidentsByType: typeData,
      incidentsBySeverity: severityData,
      responseTimeTrend: trendData,
      hasResponseTimeData: hasData,
      totalResponseMeasurements: totalMeasurements,
      averageResponseTimeOverall: averageOverall,
    };
  };

  const analyticsData = prepareAnalyticsData();

  const TYPE_COLORS = {
    "Road Accident": "#2563eb",
    Fire: "#dc2626",
    Medical: "#16a34a",
    Flood: "#0284c7",
    Other: "#64748b",
  };
  const SEVERITY_COLORS = { Minor: "#d97706", Serious: "#ea580c", Critical: "#dc2626" };

  /* ── Reports filters ── */
  const getFilteredIncidents = () =>
    incidents.filter((i) => {
      let matchesStatus = statusFilter === "All" || i.status === statusFilter;
      let matchesSeverity = severityFilter === "All" || i.severity === severityFilter;
      let matchesDate = true;
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        const incidentDate = parseDateSafe(i.createdAt);
        if (incidentDate && incidentDate < fromDate) matchesDate = false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        const incidentDate = parseDateSafe(i.createdAt);
        if (incidentDate && incidentDate > toDate) matchesDate = false;
      }
      const q = reportsSearchQuery.trim().toLowerCase();
      const matchesSearch = !q || (
        (i.type && i.type.toLowerCase().includes(q)) ||
        (i.address && i.address.toLowerCase().includes(q)) ||
        (i.reporterName && i.reporterName.toLowerCase().includes(q)) ||
        (i.incidentId && i.incidentId.toLowerCase().includes(q))
      );
      return matchesStatus && matchesSeverity && matchesDate && matchesSearch;
    });

  /* ── Exports ── */
  const downloadPDF = () => {
    const filtered = getFilteredIncidents();
    generateBulkIncidentReportPDF({
      incidents: filtered,
      filterSummary: {
        status: statusFilter,
        severity: severityFilter,
        dateFrom,
        dateTo,
        searchQuery: reportsSearchQuery,
      },
      generatedBy: userData?.name || user?.email || "Authorized Dispatcher",
      download: true,
    });
  };

  const downloadCSV = () => {
    const filtered = getFilteredIncidents();
    const headers = ["Type", "Severity", "Reporter", "Address", "Status", "Date"];
    const rows = filtered.map((i) => [
      i.type, i.severity, i.reporterName, i.address, i.status, formatDate(i.createdAt),
    ]);
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "alert24-incident-report.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportIncidentPDF = async (incident) => {
    try {
      const logsQuery = query(collection(db, "statusLogs"), where("incidentId", "==", incident.incidentId));
      const snap = await getDocs(logsQuery);
      const logs = snap.docs.map((d) => ({ logId: d.id, ...d.data() }));
      generateIncidentReportPDF({
        incident,
        statusLogs: logs,
        userRole: "dispatcher",
        download: true,
      });
    } catch (err) {
      console.error("Failed to export incident PDF report:", err);
      throw err;
    }
  };

  /* ── Shared chart tooltip style ── */
  const chartTooltipStyle = {
    contentStyle: {
      backgroundColor: theme === "light" ? "#ffffff" : "#0f1a2e",
      border: theme === "light" ? "1px solid #e2e8f0" : "1px solid rgba(255,255,255,0.1)",
      borderRadius: "6px",
      boxShadow: theme === "light" ? "0 4px 14px rgba(15,23,42,0.10)" : "none"
    },
    labelStyle: { color: theme === "light" ? "#0f172a" : "#e2e8f0", fontWeight: 600, fontSize: 12 },
    itemStyle: { color: theme === "light" ? "#334155" : "#94a3b8", fontSize: 12 },
  };
  const gridStroke = theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.05)";
  const axisStroke = theme === "light" ? "#94a3b8" : "#64748b";

  /* ── Incident table rows (shared between Overview and Live Incidents) ── */
  const renderIncidentRows = (list) => {
    if (list.length === 0) {
      return (
        <tr className="dd-empty-row">
          <td colSpan="7">No incidents to display</td>
        </tr>
      );
    }
    return list.map((incident) => {
      const isCriticalUnassigned = incident.status === "Reported" && incident.severity === "Critical";
      return (
        <tr
          key={incident.incidentId}
          className={isCriticalUnassigned ? "dd-row-critical" : ""}
        >
          <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{incident.type}</td>
          <td><SeverityBadge severity={incident.severity} /></td>
          <td style={{ color: "var(--text-secondary)" }}>{incident.reporterName || "Anonymous"}</td>
          <td
            title={incident.address}
            style={{ color: "var(--text-secondary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {incident.address}
          </td>
          <td><StatusBadge status={incident.status} /></td>
          <td style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>{formatDate(incident.createdAt)}</td>
          <td>
            {incident.status === "Reported" ? (
              <button
                className="dd-btn dd-btn-ghost dd-btn-sm"
                onClick={() => setAssignIncident(incident)}
              >
                Assign
              </button>
            ) : (
              <button
                className="dd-btn dd-btn-secondary dd-btn-sm"
                onClick={() => handleViewIncident(incident)}
              >
                View
              </button>
            )}
          </td>
        </tr>
      );
    });
  };

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */
  return (
    <div
      className="dd-shell"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      {/* ── Top Navigation ── */}
      <nav className="dd-topnav">
        <div className="dd-nav-brand">
          <IconShield size={24} className="dd-nav-icon" style={{ color: "#dc2626" }} />
          <span className="dd-nav-title">Alert24</span>
        </div>

        <div className="dd-nav-status">
          <span className="dd-status-dot"></span>
          <span className="dd-status-label">Control Room Active</span>
        </div>

        <div className="dd-nav-right">
          <div className="dd-user-info">
            <span className="dd-user-name">{userData?.name || "Dispatcher"}</span>
            <span className="dd-user-email">{user?.email}</span>
          </div>
          <button className="dd-logout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* ── Toast / Error Banner ── */}
      {successToast && (
        <div className="dd-success-toast">
          ✓ {successToast}
        </div>
      )}
      {errorBanner && (
        <div className="dd-error-banner">
          <span>{errorBanner}</span>
          <button className="dd-banner-close" onClick={() => setErrorBanner("")}>×</button>
        </div>
      )}

      <div className="dd-layout">
        {/* ── Sidebar ── */}
        <aside className="dd-sidebar">
          <nav className="dd-sidebar-nav">
            {[
              { id: "overview",          label: "Overview",          shortLabel: "Overview",  Icon: IconHome },
              { id: "live-incidents",    label: "Live Incidents",    shortLabel: "Incidents", Icon: IconFlame },
              { id: "incident-map",      label: "Incident Map",      shortLabel: "Map",       Icon: IconMap },
              { id: "manage-responders", label: "Manage Responders", shortLabel: "Units",     Icon: IconUsers },
              { id: "reports",           label: "Reports",           shortLabel: "Reports",   Icon: IconFile },
              { id: "notifications",     label: "Notifications",     shortLabel: "Alerts",    Icon: IconBell },
              { id: "settings",          label: "Settings",          shortLabel: "Settings",  Icon: IconSettingsGear },
            ].map(({ id, label, shortLabel, Icon }) => (
              <button
                key={id}
                className={`dd-sidebar-btn ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon />
                <span className="dd-sidebar-label">
                  <span className="dd-label-full">{label}</span>
                  <span className="dd-label-short">{shortLabel}</span>
                </span>
                {id === "notifications" && unreadCount > 0 && (
                  <span className="dd-notif-badge">{unreadCount}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="dd-sidebar-footer">Alert24 Dispatch Ops</div>
        </aside>

        {/* ── Main Content ── */}
        <main className="dd-content">

          {/* ══════════════════════════════
              OVERVIEW TAB
              ══════════════════════════════ */}
          {activeTab === "overview" && (
            <>
              <div className="dd-page-header">
                <h1 className="dd-page-title">Operations Overview</h1>
                <p className="dd-page-subtitle">Real-time summary of all active incidents and responder status</p>
              </div>

              {/* Stat Cards */}
              <div className="dd-stats-row">
                <div className="dd-stat-card accent-blue">
                  <div className="dd-stat-icon-wrap blue">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                    </svg>
                  </div>
                  <div className="dd-stat-num">{stats.total}</div>
                  <div className="dd-stat-label">Total Incidents</div>
                </div>

                <div className="dd-stat-card accent-red">
                  <div className="dd-stat-icon-wrap red">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div className="dd-stat-num">{stats.unassigned}</div>
                  <div className="dd-stat-label">Unassigned</div>
                </div>

                <div className="dd-stat-card accent-orange">
                  <div className="dd-stat-icon-wrap orange">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  </div>
                  <div className="dd-stat-num">{stats.active}</div>
                  <div className="dd-stat-label">Active</div>
                </div>

                <div className="dd-stat-card accent-green">
                  <div className="dd-stat-icon-wrap green">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <div className="dd-stat-num">{stats.resolvedToday}</div>
                  <div className="dd-stat-label">Resolved Today</div>
                </div>

                <div className="dd-stat-card accent-amber">
                  <div className="dd-stat-icon-wrap amber">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                  </div>
                  <div className="dd-stat-num">{stats.totalResponders}</div>
                  <div className="dd-stat-label">Total Responders</div>
                </div>
              </div>

              {/* Recent Incidents Table */}
              <div className="dd-card">
                <div className="dd-card-header">
                  <h2 className="dd-card-title">Recent Incidents</h2>
                  <span className="dd-card-meta">Last {Math.min(incidents.length, 5)} of {incidents.length}</span>
                </div>
                <div className="dd-table-wrap">
                  <table className="dd-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Reporter</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Time</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderIncidentRows(incidents.slice(0, 5))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Analytics */}
              <div className="dd-card-header" style={{ marginBottom: 14, padding: "0 2px" }}>
                <h2 className="dd-page-title" style={{ fontSize: 17 }}>Analytics</h2>
              </div>

              <div className="dd-analytics-grid">
                {/* Incidents Per Day */}
                <div className="dd-card" style={{ marginBottom: 0 }}>
                  <div className="dd-card-header">
                    <h3 className="dd-card-title">Incidents Per Day</h3>
                    <span className="dd-card-meta">Last 7 days</span>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analyticsData.incidentsPerDay} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="day" stroke={axisStroke} tick={{ fontSize: 11 }} />
                      <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Incidents By Type */}
                <div className="dd-card dd-chart-card" style={{ marginBottom: 0 }}>
                  <div className="dd-card-header">
                    <h3 className="dd-card-title">Incidents By Type</h3>
                    <span className="dd-card-meta">{stats.total} total</span>
                  </div>
                  {analyticsData.incidentsByType.length > 0 ? (
                    <div className="dd-pie-chart-wrap">
                      <div className="dd-donut-container">
                        <ResponsiveContainer width="100%" height={170}>
                          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <Pie
                              data={analyticsData.incidentsByType}
                              cx="50%"
                              cy="50%"
                              innerRadius={46}
                              outerRadius={68}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {analyticsData.incidentsByType.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={TYPE_COLORS[entry.name] || "#64748b"}
                                  stroke="var(--bg-surface)"
                                  strokeWidth={2}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value, name) => [
                                `${value} incident${value !== 1 ? 's' : ''} (${stats.total > 0 ? Math.round((value / stats.total) * 100) : 0}%)`,
                                name
                              ]}
                              {...chartTooltipStyle}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="dd-donut-center">
                          <span className="dd-donut-num">{stats.total}</span>
                          <span className="dd-donut-lbl">TOTAL</span>
                        </div>
                      </div>
                      <div className="dd-chart-legend">
                        {analyticsData.incidentsByType.map((entry) => {
                          const pct = stats.total > 0 ? Math.round((entry.value / stats.total) * 100) : 0;
                          return (
                            <div key={entry.name} className="dd-chart-legend-item">
                              <span
                                className="dd-chart-legend-dot"
                                style={{ backgroundColor: TYPE_COLORS[entry.name] || "#64748b" }}
                              />
                              <span className="dd-chart-legend-name">{entry.name}</span>
                              <span className="dd-chart-legend-val">{entry.value}</span>
                              <span className="dd-chart-legend-pct">({pct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="dd-chart-empty">No incidents recorded yet</div>
                  )}
                </div>

                {/* Incidents By Severity */}
                <div className="dd-card" style={{ marginBottom: 0 }}>
                  <div className="dd-card-header">
                    <h3 className="dd-card-title">Incidents By Severity</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analyticsData.incidentsBySeverity} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="name" stroke={axisStroke} tick={{ fontSize: 11 }} />
                      <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {analyticsData.incidentsBySeverity.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Response Time Trend */}
                <div className="dd-card" style={{ marginBottom: 0 }}>
                  <div className="dd-card-header">
                    <h3 className="dd-card-title">Response Time Trend</h3>
                    <span className="dd-card-meta">
                      {analyticsData.averageResponseTimeOverall != null
                        ? `Avg ${analyticsData.averageResponseTimeOverall} mins`
                        : "Avg minutes"}
                    </span>
                  </div>
                  {incidentsLoading || statusLogsLoading ? (
                    <div className="dd-chart-empty" style={{ opacity: 0.7 }}>
                      Loading response time data…
                    </div>
                  ) : analyticsData.hasResponseTimeData ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={analyticsData.responseTimeTrend} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                        <XAxis dataKey="day" stroke={axisStroke} tick={{ fontSize: 11 }} />
                        <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} unit="m" domain={[0, "auto"]} />
                        <Tooltip
                          {...chartTooltipStyle}
                          formatter={(value) => [
                            value !== null && value !== undefined ? `${value} min${value === 1 ? "" : "s"}` : "No data",
                            "Avg Response Time",
                          ]}
                          labelFormatter={(label, payload) => {
                            const item = payload?.[0]?.payload;
                            return item?.fullDate ? `${label} (${item.fullDate})` : label;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="avgTime"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={{ fill: "#22c55e", r: 3 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="dd-chart-empty">No response time data recorded yet</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════
              LIVE INCIDENTS TAB
              ══════════════════════════════ */}
          {activeTab === "live-incidents" && (
            <>
              <div className="dd-page-header">
                <h1 className="dd-page-title">Live Incidents</h1>
                <p className="dd-page-subtitle">
                  {incidents.length} total incidents &nbsp;·&nbsp;
                  <span style={{ color: theme === "light" ? "#b91c1c" : "#ef4444", fontWeight: 600 }}>{stats.unassigned} unassigned</span> &nbsp;·&nbsp;
                  <span style={{ color: theme === "light" ? "#c2410c" : "#f97316", fontWeight: 600 }}>{stats.active} in progress</span>
                </p>
              </div>
              <div className="dd-card">
                {/* Search & Filter Bar */}
                <div className="dd-filter-bar">
                  <div className="dd-search-wrap">
                    <svg className="dd-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21L16.65 16.65" />
                    </svg>
                    <input
                      type="text"
                      className="dd-input dd-search-input"
                      placeholder="Search by location, type, reporter…"
                      value={liveSearchQuery}
                      onChange={(e) => setLiveSearchQuery(e.target.value)}
                      aria-label="Search live incidents"
                    />
                    {liveSearchQuery && (
                      <button
                        type="button"
                        className="dd-search-clear"
                        onClick={() => setLiveSearchQuery("")}
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <select
                    className="dd-select"
                    value={liveStatusFilter}
                    onChange={(e) => setLiveStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Reported">Reported</option>
                    <option value="Assigned">Assigned</option>
                    <option value="En Route">En Route</option>
                    <option value="On Scene">On Scene</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                  <select
                    className="dd-select"
                    value={liveSeverityFilter}
                    onChange={(e) => setLiveSeverityFilter(e.target.value)}
                    aria-label="Filter by severity"
                  >
                    <option value="All">All Severities</option>
                    <option value="Critical">Critical</option>
                    <option value="Serious">Serious</option>
                    <option value="Minor">Minor</option>
                  </select>
                  {(liveSearchQuery || liveStatusFilter !== "All" || liveSeverityFilter !== "All") && (
                    <button
                      type="button"
                      className="dd-btn dd-btn-secondary dd-btn-sm"
                      onClick={() => {
                        setLiveSearchQuery("");
                        setLiveStatusFilter("All");
                        setLiveSeverityFilter("All");
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="dd-table-wrap">
                  <table className="dd-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Reporter</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Time</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const q = liveSearchQuery.trim().toLowerCase();
                        const filtered = incidents.filter(i => {
                          const matchesStatus = liveStatusFilter === "All" || i.status === liveStatusFilter;
                          const matchesSeverity = liveSeverityFilter === "All" || i.severity === liveSeverityFilter;
                          const matchesSearch = !q || (
                            (i.type && i.type.toLowerCase().includes(q)) ||
                            (i.address && i.address.toLowerCase().includes(q)) ||
                            (i.reporterName && i.reporterName.toLowerCase().includes(q)) ||
                            (i.incidentId && i.incidentId.toLowerCase().includes(q))
                          );
                          return matchesStatus && matchesSeverity && matchesSearch;
                        });
                        return renderIncidentRows(filtered);
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════
              MANAGE RESPONDERS TAB
              ══════════════════════════════ */}
          {activeTab === "manage-responders" && (
            <>
              <div className="dd-page-header">
                <h1 className="dd-page-title">Manage Responders</h1>
                <p className="dd-page-subtitle">
                  {responders.length} registered responders &nbsp;·&nbsp;
                  <span style={{ color: theme === "light" ? "#15803d" : "#4ade80", fontWeight: 600 }}>
                    {responders.filter(r => r.isAvailable).length} currently available
                  </span>
                </p>
              </div>
              <div className="dd-card">
                {/* Search & Filter Bar */}
                <div className="dd-filter-bar">
                  <div className="dd-search-wrap">
                    <svg className="dd-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21L16.65 16.65" />
                    </svg>
                    <input
                      type="text"
                      className="dd-input dd-search-input"
                      placeholder="Search responder name or speciality…"
                      value={responderSearchQuery}
                      onChange={(e) => setResponderSearchQuery(e.target.value)}
                      aria-label="Search responders"
                    />
                    {responderSearchQuery && (
                      <button
                        type="button"
                        className="dd-search-clear"
                        onClick={() => setResponderSearchQuery("")}
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <select
                    className="dd-select"
                    value={responderAvailFilter}
                    onChange={(e) => setResponderAvailFilter(e.target.value)}
                    aria-label="Filter by availability"
                  >
                    <option value="All">All Availabilities</option>
                    <option value="Available">Available Only</option>
                    <option value="Unavailable">Unavailable Only</option>
                  </select>
                  {(responderSearchQuery || responderAvailFilter !== "All") && (
                    <button
                      type="button"
                      className="dd-btn dd-btn-secondary dd-btn-sm"
                      onClick={() => {
                        setResponderSearchQuery("");
                        setResponderAvailFilter("All");
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="dd-table-wrap">
                  <table className="dd-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Speciality</th>
                        <th>Availability</th>
                        <th>Active Incident</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const q = responderSearchQuery.trim().toLowerCase();
                        const filtered = responders.filter(r => {
                          const matchesAvail = responderAvailFilter === "All" ||
                            (responderAvailFilter === "Available" ? r.isAvailable : !r.isAvailable);
                          const matchesSearch = !q || (
                            (r.name && r.name.toLowerCase().includes(q)) ||
                            (r.speciality && r.speciality.toLowerCase().includes(q)) ||
                            (r.email && r.email.toLowerCase().includes(q))
                          );
                          return matchesAvail && matchesSearch;
                        });
                        if (filtered.length === 0) {
                          return (
                            <tr className="dd-empty-row">
                              <td colSpan="7">No responders match your criteria</td>
                            </tr>
                          );
                        }
                        return filtered.map((responder) => (
                          <tr key={responder.uid}>
                            <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{responder.name}</td>
                            <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{responder.email}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{responder.phone || "Not provided"}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{responder.speciality || "General"}</td>
                            <td>
                              <span className={`dd-badge ${responder.isAvailable ? "dd-badge-available" : "dd-badge-unavailable"}`}>
                                {responder.isAvailable ? "Available" : "Unavailable"}
                              </span>
                            </td>
                            <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                              {responder.activeIncidentId
                                ? incidents.find((i) => i.incidentId === responder.activeIncidentId)?.type || "Active Assignment"
                                : "None"}
                            </td>
                            <td>
                              <button
                                className={`dd-btn dd-btn-sm ${responder.isAvailable ? "dd-btn-ghost" : "dd-btn-outline-green"}`}
                                onClick={() => handleToggleResponderAvailability(responder)}
                              >
                                {responder.isAvailable ? "Mark Unavailable" : "Mark Available"}
                              </button>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════
              INCIDENT MAP TAB
              ══════════════════════════════ */}
          {activeTab === "incident-map" && (
            <>
              <div className="dd-page-header">
                <h1 className="dd-page-title">Incident Map</h1>
                <p className="dd-page-subtitle">
                  Locations shared by reporters. Select a marker to inspect or assign an incident.
                </p>
              </div>
              <Suspense fallback={<div className="dd-card" role="status" style={{ padding: 24 }}>Loading map…</div>}>
                <IncidentMap
                  incidents={incidents}
                  formatDate={formatDate}
                  onViewIncident={handleViewIncident}
                  onAssignIncident={setAssignIncident}
                />
              </Suspense>
            </>
          )}

          {/* ══════════════════════════════
              REPORTS TAB
              ══════════════════════════════ */}
          {activeTab === "reports" && (
            <ReportsTab
              reportsSearchQuery={reportsSearchQuery}
              setReportsSearchQuery={setReportsSearchQuery}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              severityFilter={severityFilter}
              setSeverityFilter={setSeverityFilter}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              filteredIncidents={getFilteredIncidents()}
              downloadPDF={downloadPDF}
              downloadCSV={downloadCSV}
              formatDate={formatDate}
              onExportIncidentPDF={handleExportIncidentPDF}
            />
          )}

          {/* ══════════════════════════════
              NOTIFICATIONS TAB
              ══════════════════════════════ */}
          {activeTab === "notifications" && (
            <>
              <div className="dd-page-header">
                <h1 className="dd-page-title">Notifications</h1>
                <p className="dd-page-subtitle">
                  In-app alerts for new reports, assignments and responder progress.
                </p>
              </div>
              <NotificationCenter
                notifications={notifications}
                unreadCount={unreadCount}
                loading={notifLoading}
                error={notifError}
                actionError={notifActionError}
                online={notifOnline}
                fromCache={notifFromCache}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
                onOpen={openNotification}
                formatDate={formatDate}
                emptyHint="New incident reports and responder updates will appear here."
              />
            </>
          )}
          {/* ══════════════════════════════
              SETTINGS TAB
              ══════════════════════════════ */}
          {activeTab === "settings" && (
            <>
              <div className="dd-page-header">
                <h1 className="dd-page-title">Settings</h1>
                <p className="dd-page-subtitle">Manage your Alert24 account preferences.</p>
              </div>

              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-title">Appearance</div>
                  <div className="settings-section-subtitle">
                    Choose how Alert24 looks for you. Your preference is saved to your account and synced across devices.
                  </div>
                  <div className="theme-picker" role="group" aria-label="Theme selection">
                    <button
                      id="dd-theme-light-btn"
                      className={`theme-picker-btn ${theme === 'light' ? 'active' : ''}`}
                      onClick={() => onThemeChange('light')}
                      aria-pressed={theme === 'light'}
                    >
                      <span className="theme-picker-icon">☀</span>
                      Light
                    </button>
                    <button
                      id="dd-theme-dark-btn"
                      className={`theme-picker-btn ${theme === 'dark' ? 'active' : ''}`}
                      onClick={() => onThemeChange('dark')}
                      aria-pressed={theme === 'dark'}
                    >
                      <span className="theme-picker-icon">🌙</span>
                      Dark
                    </button>
                  </div>
                  <div className="theme-current-label">
                    Currently using: <strong>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</strong>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title">Account</div>
                  <div className="settings-divider"></div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">Email address</div>
                      <div className="settings-row-desc">Your login email</div>
                    </div>
                    <span className="settings-row-value">{user?.email}</span>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">Role</div>
                      <div className="settings-row-desc">Your system access level</div>
                    </div>
                    <span className="settings-row-value">Dispatcher</span>
                  </div>
                </div>
              </div>
            </>
          )}

        </main>
      </div>

      <ViewIncidentModal
        viewIncident={viewIncident}
        onClose={() => setViewIncident(null)}
        statusLogs={statusLogs}
        formatDate={formatDate}
        SeverityBadge={SeverityBadge}
        StatusBadge={StatusBadge}
      />

      <AssignIncidentModal
        assignIncident={assignIncident}
        onClose={() => { setAssignIncident(null); setSelectedResponder(null); }}
        responders={responders}
        selectedResponder={selectedResponder}
        onSelectResponder={setSelectedResponder}
        onAssign={handleAssignIncident}
        assigning={assigning}
        SeverityBadge={SeverityBadge}
        IconCheck={IconCheck}
      />
    </div>
  );
};

export default DispatcherDashboard;
