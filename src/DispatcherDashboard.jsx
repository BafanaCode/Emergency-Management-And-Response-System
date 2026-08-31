import React, { useState, useEffect } from "react";
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
} from "firebase/firestore";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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

const isToday = (timestamp) => {
  if (!timestamp) return false;
  const today = new Date();
  const date = timestamp.toDate();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
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
const DispatcherDashboard = ({ onLogout, user, userData }) => {
  const [activeTab, setActiveTab] = useState("overview");

  const [incidents, setIncidents] = useState([]);
  const [responders, setResponders] = useState([]);
  const [statusLogs, setStatusLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const [viewIncident, setViewIncident] = useState(null);
  const [assignIncident, setAssignIncident] = useState(null);
  const [selectedResponder, setSelectedResponder] = useState(null);

  const [successToast, setSuccessToast] = useState("");
  const [errorBanner, setErrorBanner] = useState("");

  const [statusFilter, setStatusFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  /* ── Firestore listeners ── */
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "incidents"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ incidentId: doc.id, ...doc.data() }));
        data.sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
        setIncidents(data);
      },
      (err) => {
        console.error("Error fetching incidents:", err);
        setErrorBanner("Error loading incidents: " + err.message);
      }
    );
    return () => unsubscribe();
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
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "notifications"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((doc) => ({ notificationId: doc.id, ...doc.data() }))
          .sort((a, b) => {
            if (!a.createdAt) return 1;
            if (!b.createdAt) return -1;
            return b.createdAt.toMillis() - a.createdAt.toMillis();
          });
        setNotifications(data);
      },
      (err) => {
        console.error("Error fetching notifications:", err);
        setErrorBanner("Error loading notifications: " + err.message);
      }
    );
    return () => unsubscribe();
  }, [user]);

  /* ── Helpers ── */
  const fetchStatusLogsForIncident = (incidentId) => {
    const q = query(collection(db, "statusLogs"), where("incidentId", "==", incidentId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs
          .map((doc) => ({ logId: doc.id, ...doc.data() }))
          .sort((a, b) => {
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return a.timestamp.toMillis() - b.timestamp.toMillis();
          });
        setStatusLogs(logs);
      },
      (err) => {
        console.error("Error fetching status logs:", err);
        setErrorBanner("Error loading status logs: " + err.message);
      }
    );
    return unsubscribe;
  };

  const handleViewIncident = async (incident) => {
    setViewIncident(incident);
    return fetchStatusLogsForIncident(incident.incidentId);
  };

  const handleAssignIncident = async () => {
    if (!assignIncident || !selectedResponder) return;
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
        message: `New emergency assigned: ${assignIncident.type} at ${assignIncident.address}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      const reporterNotifRef = doc(collection(db, "notifications"));
      batch.set(reporterNotifRef, {
        userId: assignIncident.reporterId,
        incidentId: assignIncident.incidentId,
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
      setErrorBanner("Error assigning responder: " + err.message);
    }
  };

  const handleMarkNotificationRead = async (notification) => {
    if (notification.isRead) return;
    try {
      const ref = doc(db, "notifications", notification.notificationId);
      await updateDoc(ref, { isRead: true });
    } catch (err) {
      console.error("Error marking notification as read:", err);
      setErrorBanner("Error updating notification: " + err.message);
    }
  };

  const handleToggleResponderAvailability = async (responder) => {
    try {
      const responderRef = doc(db, "users", responder.uid);
      await updateDoc(responderRef, { isAvailable: !responder.isAvailable });
    } catch (err) {
      console.error("Error updating responder availability:", err);
      setErrorBanner("Error updating responder: " + err.message);
    }
  };

  /* ── Stats ── */
  const stats = {
    total: incidents.length,
    unassigned: incidents.filter((i) => i.status === "Reported").length,
    active: incidents.filter(
      (i) => i.status === "Assigned" || i.status === "En Route" || i.status === "On Scene"
    ).length,
    resolvedToday: incidents.filter((i) => i.status === "Resolved" && isToday(i.createdAt)).length,
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
      if (!incident.createdAt) return;
      const incidentDate = incident.createdAt.toDate();
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

    const responseTimeData = last7Days.map((d) => ({ day: d.day, avgTime: 0 }));

    return { incidentsPerDay: last7Days, incidentsByType: typeData, incidentsBySeverity: severityData, responseTimeTrend: responseTimeData };
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
        const incidentDate = i.createdAt?.toDate();
        if (incidentDate && incidentDate < fromDate) matchesDate = false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        const incidentDate = i.createdAt?.toDate();
        if (incidentDate && incidentDate > toDate) matchesDate = false;
      }
      return matchesStatus && matchesSeverity && matchesDate;
    });

  /* ── Exports ── */
  const downloadPDF = () => {
    const filtered = getFilteredIncidents();
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Alert24 Incident Report", 14, 22);
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);
    const tableData = filtered.map((i) => [
      i.type, i.severity, i.reporterName, i.address, i.status, formatDate(i.createdAt),
    ]);
    autoTable(doc, {
      head: [["Type", "Severity", "Reporter", "Address", "Status", "Date"]],
      body: tableData,
      startY: 40,
    });
    doc.save("alert24-incident-report.pdf");
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

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  /* ── Shared chart tooltip style ── */
  const chartTooltipStyle = {
    contentStyle: { backgroundColor: "#0f1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" },
    labelStyle: { color: "#e2e8f0", fontWeight: 600, fontSize: 12 },
    itemStyle: { color: "#94a3b8", fontSize: 12 },
  };

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
          <td style={{ fontWeight: 500, color: "#e2e8f0" }}>{incident.type}</td>
          <td><SeverityBadge severity={incident.severity} /></td>
          <td style={{ color: "#94a3b8" }}>{incident.reporterName}</td>
          <td style={{ color: "#94a3b8", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {incident.address}
          </td>
          <td><StatusBadge status={incident.status} /></td>
          <td style={{ color: "#64748b", fontSize: 12 }}>{formatDate(incident.createdAt)}</td>
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
              { id: "overview",          label: "Overview",          Icon: IconHome },
              { id: "live-incidents",    label: "Live Incidents",    Icon: IconFlame },
              { id: "manage-responders", label: "Manage Responders", Icon: IconUsers },
              { id: "reports",           label: "Reports",           Icon: IconFile },
              { id: "notifications",     label: "Notifications",     Icon: IconBell },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`dd-sidebar-btn ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon />
                <span className="dd-sidebar-label">{label}</span>
                {id === "notifications" && unreadCount > 0 && (
                  <span className="dd-notif-badge">{unreadCount}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="dd-sidebar-footer">Alert24 v1.0</div>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Incidents By Type */}
                <div className="dd-card" style={{ marginBottom: 0 }}>
                  <div className="dd-card-header">
                    <h3 className="dd-card-title">Incidents By Type</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={analyticsData.incidentsByType}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={88}
                        dataKey="value"
                      >
                        {analyticsData.incidentsByType.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={TYPE_COLORS[entry.name] || "#64748b"} />
                        ))}
                      </Pie>
                      <Tooltip {...chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Incidents By Severity */}
                <div className="dd-card" style={{ marginBottom: 0 }}>
                  <div className="dd-card-header">
                    <h3 className="dd-card-title">Incidents By Severity</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analyticsData.incidentsBySeverity} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
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
                    <span className="dd-card-meta">Avg minutes</span>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={analyticsData.responseTimeTrend} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                      <Tooltip {...chartTooltipStyle} />
                      <Line type="monotone" dataKey="avgTime" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
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
                  {incidents.length} total &nbsp;·&nbsp;
                  <span style={{ color: "#ef4444" }}>{stats.unassigned} unassigned</span> &nbsp;·&nbsp;
                  <span style={{ color: "#f97316" }}>{stats.active} active</span>
                </p>
              </div>
              <div className="dd-card">
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
                      {renderIncidentRows(incidents)}
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
                  {responders.length} total &nbsp;·&nbsp;
                  <span style={{ color: "#4ade80" }}>{responders.filter(r => r.isAvailable).length} available</span>
                </p>
              </div>
              <div className="dd-card">
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
                      {responders.length === 0 ? (
                        <tr className="dd-empty-row">
                          <td colSpan="7">No responder accounts found</td>
                        </tr>
                      ) : (
                        responders.map((responder) => (
                          <tr key={responder.uid}>
                            <td style={{ fontWeight: 600, color: "#e2e8f0" }}>{responder.name}</td>
                            <td style={{ color: "#94a3b8", fontSize: 13 }}>{responder.email}</td>
                            <td style={{ color: "#94a3b8" }}>{responder.phone || "—"}</td>
                            <td style={{ color: "#94a3b8" }}>{responder.speciality || "—"}</td>
                            <td>
                              <span className={`dd-badge ${responder.isAvailable ? "dd-badge-available" : "dd-badge-unavailable"}`}>
                                {responder.isAvailable ? "Available" : "Unavailable"}
                              </span>
                            </td>
                            <td style={{ color: "#94a3b8", fontSize: 13 }}>
                              {responder.activeIncidentId
                                ? incidents.find((i) => i.incidentId === responder.activeIncidentId)?.type || "Active"
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════
              REPORTS TAB
              ══════════════════════════════ */}
          {activeTab === "reports" && (
            <>
              <div className="dd-page-header">
                <h1 className="dd-page-title">Incident Reports</h1>
                <p className="dd-page-subtitle">Filter, review and export incident data</p>
              </div>
              <div className="dd-card">
                <div className="dd-filter-bar">
                  <select
                    className="dd-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
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
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                  >
                    <option value="All">All Severities</option>
                    <option value="Minor">Minor</option>
                    <option value="Serious">Serious</option>
                    <option value="Critical">Critical</option>
                  </select>
                  <input
                    type="date"
                    className="dd-input"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    placeholder="From Date"
                  />
                  <input
                    type="date"
                    className="dd-input"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    placeholder="To Date"
                  />
                </div>

                <div className="dd-table-wrap">
                  <table className="dd-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Reporter</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredIncidents().length === 0 ? (
                        <tr className="dd-empty-row">
                          <td colSpan="6">No incidents match the selected filters</td>
                        </tr>
                      ) : (
                        getFilteredIncidents().map((incident) => (
                          <tr key={incident.incidentId}>
                            <td style={{ fontWeight: 500, color: "#e2e8f0" }}>{incident.type}</td>
                            <td><SeverityBadge severity={incident.severity} /></td>
                            <td style={{ color: "#94a3b8" }}>{incident.reporterName}</td>
                            <td style={{ color: "#94a3b8" }}>{incident.address}</td>
                            <td><StatusBadge status={incident.status} /></td>
                            <td style={{ color: "#64748b", fontSize: 12 }}>{formatDate(incident.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="dd-download-row">
                  <button className="dd-btn dd-btn-download" onClick={downloadPDF}>
                    ↓ Download PDF
                  </button>
                  <button className="dd-btn dd-btn-download" onClick={downloadCSV}>
                    ↓ Download CSV
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════
              NOTIFICATIONS TAB
              ══════════════════════════════ */}
          {activeTab === "notifications" && (
            <>
              <div className="dd-page-header">
                <h1 className="dd-page-title">Notifications</h1>
                <p className="dd-page-subtitle">
                  {unreadCount > 0
                    ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""} — click to mark as read`
                    : "All notifications read"}
                </p>
              </div>
              <div className="dd-card">
                <div className="dd-notif-list">
                  {notifications.length === 0 ? (
                    <div className="dd-notif-empty">No notifications yet</div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.notificationId}
                        className={`dd-notif-item ${!notification.isRead ? "unread" : ""}`}
                        onClick={() => handleMarkNotificationRead(notification)}
                      >
                        <span className={`dd-notif-dot ${!notification.isRead ? "unread" : "read"}`}></span>
                        <div className="dd-notif-body">
                          <div className="dd-notif-msg">{notification.message}</div>
                          <div className="dd-notif-time">{formatDate(notification.createdAt)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

        </main>
      </div>

      {/* ══════════════════════════════
          VIEW INCIDENT MODAL
          ══════════════════════════════ */}
      {viewIncident && (
        <div className="dd-overlay" onClick={() => setViewIncident(null)}>
          <div className="dd-modal" onClick={(e) => e.stopPropagation()}>
            <button className="dd-modal-close" onClick={() => setViewIncident(null)}>×</button>
            <h2 className="dd-modal-title">Incident Details</h2>

            <div className="dd-detail-grid">
              <div className="dd-detail-item">
                <span className="dd-detail-label">Type</span>
                <span className="dd-detail-value" style={{ fontWeight: 600 }}>{viewIncident.type}</span>
              </div>
              <div className="dd-detail-item">
                <span className="dd-detail-label">Severity</span>
                <div style={{ marginTop: 3 }}><SeverityBadge severity={viewIncident.severity} /></div>
              </div>
              <div className="dd-detail-item">
                <span className="dd-detail-label">Current Status</span>
                <div style={{ marginTop: 3 }}><StatusBadge status={viewIncident.status} /></div>
              </div>
              <div className="dd-detail-item">
                <span className="dd-detail-label">Reported</span>
                <span className="dd-detail-value">{formatDate(viewIncident.createdAt)}</span>
              </div>
              <div className="dd-detail-item full-width">
                <span className="dd-detail-label">Location</span>
                <span className="dd-detail-value">{viewIncident.address}</span>
              </div>
              <div className="dd-detail-item full-width">
                <span className="dd-detail-label">Description</span>
                <span className="dd-detail-value" style={{ lineHeight: 1.6 }}>{viewIncident.description}</span>
              </div>
              {viewIncident.photoUrl && (
                <div className="dd-detail-item full-width">
                  <span className="dd-detail-label">Photo</span>
                  <img src={viewIncident.photoUrl} alt="Incident" className="dd-incident-photo" />
                </div>
              )}
            </div>

            <div className="dd-modal-divider"></div>

            <div className="dd-modal-subtitle">Status History</div>
            <div className="dd-timeline">
              {statusLogs.length === 0 ? (
                <div className="dd-timeline-empty">No status updates recorded yet</div>
              ) : (
                statusLogs.map((log) => (
                  <div key={log.logId} className="dd-timeline-item">
                    <div className="dd-timeline-line-wrap">
                      <div className="dd-timeline-dot"></div>
                      <div className="dd-timeline-connector"></div>
                    </div>
                    <div className="dd-timeline-body">
                      <div className="dd-timeline-status">
                        <StatusBadge status={log.status} />
                      </div>
                      <div className="dd-timeline-notes">{log.notes}</div>
                      <div className="dd-timeline-time">{formatDate(log.timestamp)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          ASSIGN RESPONDER MODAL
          ══════════════════════════════ */}
      {assignIncident && (
        <div
          className="dd-overlay"
          onClick={() => { setAssignIncident(null); setSelectedResponder(null); }}
        >
          <div className="dd-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="dd-modal-close"
              onClick={() => { setAssignIncident(null); setSelectedResponder(null); }}
            >×</button>
            <h2 className="dd-modal-title">Assign Responder</h2>

            {/* Incident summary strip */}
            <div className="dd-incident-summary">
              <div className="dd-incident-summary-field">
                <span className="dd-incident-summary-label">Type</span>
                <span className="dd-incident-summary-value">{assignIncident.type}</span>
              </div>
              <div className="dd-incident-summary-field">
                <span className="dd-incident-summary-label">Severity</span>
                <SeverityBadge severity={assignIncident.severity} />
              </div>
              <div className="dd-incident-summary-field">
                <span className="dd-incident-summary-label">Location</span>
                <span className="dd-incident-summary-value">{assignIncident.address}</span>
              </div>
            </div>

            <div className="dd-modal-subtitle">Select Responder</div>

            <div className="dd-responder-list">
              {responders.length === 0 ? (
                <div className="dd-notif-empty">No responders registered</div>
              ) : (
                responders.map((responder) => (
                  <div
                    key={responder.uid}
                    className={`dd-responder-row ${
                      !responder.isAvailable
                        ? "unavailable"
                        : selectedResponder?.uid === responder.uid
                        ? "selected"
                        : "selectable"
                    }`}
                    onClick={() => {
                      if (responder.isAvailable) {
                        setSelectedResponder(
                          selectedResponder?.uid === responder.uid ? null : responder
                        );
                      }
                    }}
                  >
                    <div>
                      <div className="dd-responder-name">{responder.name}</div>
                      <div className="dd-responder-meta">
                        <span>{responder.speciality || "General"}</span>
                        <span>·</span>
                        <span className={`dd-badge ${responder.isAvailable ? "dd-badge-available" : "dd-badge-unavailable"}`}>
                          {responder.isAvailable ? "Available" : "Unavailable"}
                        </span>
                      </div>
                    </div>
                    <div className="dd-responder-check">
                      {selectedResponder?.uid === responder.uid && (
                        <span className="dd-responder-check-icon"><IconCheck /></span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="dd-modal-actions">
              <button
                className="dd-btn dd-btn-primary"
                onClick={handleAssignIncident}
                disabled={!selectedResponder}
              >
                Assign Responder
              </button>
              <button
                className="dd-btn dd-btn-secondary"
                onClick={() => { setAssignIncident(null); setSelectedResponder(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatcherDashboard;
