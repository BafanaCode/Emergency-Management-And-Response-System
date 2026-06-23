import React, { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
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
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./DispatcherDashboard.css";
import backgroundImage from "./images/image4.jpg";

const formatDate = (timestamp) => {
  if (!timestamp) return "";
  const date = timestamp.toDate();
  const day = String(date.getDate()).padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
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

const DispatcherDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  // State for overview
  const [incidents, setIncidents] = useState([]);
  const [responders, setResponders] = useState([]);
  const [statusLogs, setStatusLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Modal states
  const [viewIncident, setViewIncident] = useState(null);
  const [assignIncident, setAssignIncident] = useState(null);
  const [selectedResponder, setSelectedResponder] = useState(null);

  // Toast states
  const [successToast, setSuccessToast] = useState("");
  const [errorBanner, setErrorBanner] = useState("");

  // Reports filters
  const [statusFilter, setStatusFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Auth guard
  useEffect(() => {
    let unsubscribeAuth;
    let unsubscribeUser;

    unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const userDocRef = doc(db, "users", currentUser.uid);
      unsubscribeUser = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            if (data.role !== "dispatcher") {
              setAuthError("Access denied.");
              signOut(auth);
            } else {
              setAuthError("");
            }
          }
          setLoading(false);
        },
        (err) => {
          console.error("Error fetching user data:", err);
          setErrorBanner("Error loading user data: " + err.message);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  // Fetch all incidents (real-time)
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "incidents"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          incidentId: doc.id,
          ...doc.data(),
        }));
        // Sort by createdAt descending manually
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

  // Fetch all responders (real-time)
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "users"), where("role", "==", "responder"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        }));
        setResponders(data);
      },
      (err) => {
        console.error("Error fetching responders:", err);
        setErrorBanner("Error loading responders: " + err.message);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Fetch notifications (real-time)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((doc) => ({
            notificationId: doc.id,
            ...doc.data(),
          }))
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

  // Helper: fetch status logs for an incident
  const fetchStatusLogsForIncident = (incidentId) => {
    const q = query(
      collection(db, "statusLogs"),
      where("incidentId", "==", incidentId)
    );
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

  // Handle viewing incident details
  const handleViewIncident = async (incident) => {
    setViewIncident(incident);
    return fetchStatusLogsForIncident(incident.incidentId);
  };

  // Handle assigning incident
  const handleAssignIncident = async () => {
    console.log("handleAssignIncident called!");
    console.log("assignIncident:", assignIncident);
    console.log("selectedResponder:", selectedResponder);
    if (!assignIncident || !selectedResponder) {
      console.log("Missing assignIncident or selectedResponder");
      return;
    }
    try {
      console.log("Starting write batch...");
      const batch = writeBatch(db);

      // Update incident
      const incidentRef = doc(db, "incidents", assignIncident.incidentId);
      console.log("Updating incident ref:", incidentRef);
      batch.update(incidentRef, {
        status: "Assigned",
        responderId: selectedResponder.uid,
        responderName: selectedResponder.name,
        updatedAt: serverTimestamp(),
      });

      // Update responder
      const responderRef = doc(db, "users", selectedResponder.uid);
      console.log("Updating responder ref:", responderRef);
      batch.update(responderRef, {
        isAvailable: false,
        activeIncidentId: assignIncident.incidentId,
      });

      // Add status log
      const statusLogRef = doc(collection(db, "statusLogs"));
      console.log("Adding status log ref:", statusLogRef);
      batch.set(statusLogRef, {
        incidentId: assignIncident.incidentId,
        status: "Assigned",
        updatedBy: user.uid,
        notes: `Assigned to ${selectedResponder.name}`,
        timestamp: serverTimestamp(),
      });

      // Add notification to responder
      const responderNotifRef = doc(collection(db, "notifications"));
      console.log("Adding responder notif ref:", responderNotifRef);
      batch.set(responderNotifRef, {
        userId: selectedResponder.uid,
        incidentId: assignIncident.incidentId,
        message: `New emergency assigned: ${assignIncident.type} at ${assignIncident.address}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Add notification to reporter
      const reporterNotifRef = doc(collection(db, "notifications"));
      console.log("Adding reporter notif ref:", reporterNotifRef);
      batch.set(reporterNotifRef, {
        userId: assignIncident.reporterId,
        incidentId: assignIncident.incidentId,
        message: "A responder has been assigned to your emergency",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      console.log("Committing batch...");
      await batch.commit();
      console.log("Batch committed successfully!");

      // Show success toast
      setSuccessToast("Responder assigned successfully");
      setTimeout(() => setSuccessToast(""), 3000);

      // Close modal
      setAssignIncident(null);
      setSelectedResponder(null);
    } catch (err) {
      console.error("Error assigning incident:", err);
      console.error("Error details:", err.code, err.message);
      setErrorBanner("Error assigning responder: " + err.message);
    }
  };

  // Handle marking notification as read
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

  // Handle toggling responder availability
  const handleToggleResponderAvailability = async (responder) => {
    try {
      const responderRef = doc(db, "users", responder.uid);
      await updateDoc(responderRef, {
        isAvailable: !responder.isAvailable,
      });
    } catch (err) {
      console.error("Error updating responder availability:", err);
      setErrorBanner("Error updating responder: " + err.message);
    }
  };

  // Calculate stats
  const stats = {
    total: incidents.length,
    unassigned: incidents.filter((i) => i.status === "Reported").length,
    active: incidents.filter(
      (i) =>
        i.status === "Assigned" ||
        i.status === "En Route" ||
        i.status === "On Scene"
    ).length,
    resolvedToday: incidents.filter(
      (i) => i.status === "Resolved" && isToday(i.createdAt)
    ).length,
    totalResponders: responders.length,
  };

  // Prepare analytics data for charts
  const prepareAnalyticsData = () => {
    // 1. Incidents Per Day (last 7 days)
    const last7Days = [];
    const today = new Date();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      last7Days.push({
        date: dateKey,
        day: dayNames[date.getDay()],
        count: 0,
      });
    }

    incidents.forEach((incident) => {
      if (!incident.createdAt) return;
      const incidentDate = incident.createdAt.toDate();
      const dateKey = `${incidentDate.getFullYear()}-${String(
        incidentDate.getMonth() + 1
      ).padStart(2, "0")}-${String(incidentDate.getDate()).padStart(2, "0")}`;
      const dayIndex = last7Days.findIndex((d) => d.date === dateKey);
      if (dayIndex !== -1) {
        last7Days[dayIndex].count++;
      }
    });

    // 2. Incidents By Type
    const typeCounts = {};
    incidents.forEach((incident) => {
      if (!incident.type) return;
      typeCounts[incident.type] = (typeCounts[incident.type] || 0) + 1;
    });
    const typeData = Object.entries(typeCounts).map(([name, value]) => ({
      name,
      value,
    }));

    // 3. Incidents By Severity
    const severityCounts = { Minor: 0, Serious: 0, Critical: 0 };
    incidents.forEach((incident) => {
      if (!incident.severity) return;
      if (severityCounts.hasOwnProperty(incident.severity)) {
        severityCounts[incident.severity]++;
      }
    });
    const severityData = [
      { name: "Minor", value: severityCounts.Minor },
      { name: "Serious", value: severityCounts.Serious },
      { name: "Critical", value: severityCounts.Critical },
    ];

    // 4. Response Time Trend (average per day, last 7 days)
    const responseTimeData = last7Days.map((d) => ({
      day: d.day,
      avgTime: 0,
    }));

    // For each resolved incident, find first "Resolved" status log
    const resolvedIncidents = incidents.filter((i) => i.status === "Resolved");
    const dayResponseTimes = {};

    // We need to fetch all status logs to calculate this, but for simplicity, we'll use what we can
    // Since we don't have all status logs, let's approximate (but in real app you'd fetch all)
    // For this example, we'll skip, but in production you'd fetch all status logs

    return {
      incidentsPerDay: last7Days,
      incidentsByType: typeData,
      incidentsBySeverity: severityData,
      responseTimeTrend: responseTimeData,
    };
  };

  const analyticsData = prepareAnalyticsData();
  const TYPE_COLORS = {
    "Road Accident": "#2563eb",
    Fire: "#c0392b",
    Medical: "#16a34a",
    Flood: "#0284c7",
    Other: "#64748b",
  };
  const SEVERITY_COLORS = {
    Minor: "#d97706",
    Serious: "#ea580c",
    Critical: "#c0392b",
  };

  // Filter incidents for reports page
  const getFilteredIncidents = () => {
    return incidents.filter((i) => {
      let matchesStatus = statusFilter === "All" || i.status === statusFilter;
      let matchesSeverity =
        severityFilter === "All" || i.severity === severityFilter;
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
  };

  // Download PDF
  const downloadPDF = () => {
    const filtered = getFilteredIncidents();
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text("Alert24 Incident Report", 14, 22);
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);

    // Table
    const tableData = filtered.map((i) => [
      i.type,
      i.severity,
      i.reporterName,
      i.address,
      i.status,
      formatDate(i.createdAt),
    ]);

    autoTable(doc, {
      head: [["Type", "Severity", "Reporter", "Address", "Status", "Date"]],
      body: tableData,
      startY: 40,
    });

    doc.save("alert24-incident-report.pdf");
  };

  // Download CSV
  const downloadCSV = () => {
    const filtered = getFilteredIncidents();
    const headers = ["Type", "Severity", "Reporter", "Address", "Status", "Date"];
    const rows = filtered.map((i) => [
      i.type,
      i.severity,
      i.reporterName,
      i.address,
      i.status,
      formatDate(i.createdAt),
    ]);

    const csvContent =
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
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

  if (loading) {
    return <div className="loading-container">Loading...</div>;
  }
  if (authError) {
    return <div className="error-container">{authError}</div>;
  }

  const ShieldIcon = () => (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2L3 7V12C3 16.5 6.84 20.74 12 22C17.16 20.74 21 16.5 21 12V7L12 2Z"
        fill="#c0392b"
      />
      <path
        d="M12 8V14"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 16V17"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div
      className="dashboard-container"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      {/* Top Nav */}
      <nav className="top-nav">
        <div className="nav-left">
          <ShieldIcon />
          <span className="nav-title">Alert24</span>
        </div>
        <div className="nav-center">
          <span className="blinking-dot"></span>
          <span className="system-status">CONTROL ROOM ACTIVE</span>
        </div>
        <div className="nav-right">
          <div className="user-info">
            <span className="user-name">{userData?.name || "User"}</span>
            <span className="user-email">{user?.email}</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      {/* Success/Error Toasts */}
      {successToast && (
        <div className="success-banner" style={{
          position: "fixed",
          top: "80px",
          right: "24px",
          zIndex: 9999,
        }}>
          {successToast}
        </div>
      )}
      {errorBanner && (
        <div className="error-banner" style={{
          position: "fixed",
          top: "80px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
            <span>{errorBanner}</span>
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "#f87171",
                fontSize: "20px",
                cursor: "pointer",
              }}
              onClick={() => setErrorBanner("")}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="dashboard-main">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-link ${activeTab === "overview" ? "active" : ""
                }`}
              onClick={() => setActiveTab("overview")}
            >
              <span className="link-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 22V12H15V22"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>Overview</span>
            </button>

            <button
              className={`sidebar-link ${activeTab === "live-incidents" ? "active" : ""
                }`}
              onClick={() => setActiveTab("live-incidents")}
            >
              <span className="link-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2C12 2 8 6 8 12C8 14.1217 8.84285 16.1566 10.3431 17.6569C11.8434 19.1571 13.8783 20 16 20C18.1217 20 20.1566 19.1571 21.6569 17.6569C23.1571 16.1566 24 14.1217 24 12C24 6 20 2 20 2"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>Live Incidents</span>
            </button>

            <button
              className={`sidebar-link ${activeTab === "manage-responders" ? "active" : ""
                }`}
              onClick={() => setActiveTab("manage-responders")}
            >
              <span className="link-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M16 11C16 13.2091 14.2091 15 12 15C9.79086 15 8 13.2091 8 11C8 8.79086 9.79086 7 12 7C14.2091 7 16 8.79086 16 11Z"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 2C16.4183 2 20 5.58172 20 10C20 11.785 19.4246 13.4479 18.434 14.7786C18.2163 15.07 18 15.4173 18 15.777V18C18 19.1046 17.1046 20 16 20H8C6.89543 20 6 19.1046 6 18V15.777C6 15.4173 5.78375 15.07 5.56603 14.7786C4.57543 13.4479 4 11.785 4 10C4 5.58172 7.58172 2 12 2Z"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>Manage Responders</span>
            </button>

            <button
              className={`sidebar-link ${activeTab === "reports" ? "active" : ""
                }`}
              onClick={() => setActiveTab("reports")}
            >
              <span className="link-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 2V8H20"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>Reports</span>
            </button>

            <button
              className={`sidebar-link ${activeTab === "notifications" ? "active" : ""
                }`}
              onClick={() => setActiveTab("notifications")}
            >
              <span className="link-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M15 17H9C8.44772 17 8 17.4477 8 18C8 18.5523 8.44772 19 9 19H15C15.5523 19 16 18.5523 16 18C16 17.4477 15.5523 17 15 17Z"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18 8.5C18 5.46243 15.5376 3 12.5 3C9.46243 3 7 5.46243 7 8.5C7 11.5 5.5 13.5 5.5 13.5H19.5C19.5 13.5 18 11.5 18 8.5Z"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>
                Notifications
                {unreadCount > 0 && (
                  <span
                    style={{
                      marginLeft: "8px",
                      backgroundColor: "#c0392b",
                      color: "white",
                      fontSize: "10px",
                      fontWeight: "bold",
                      padding: "2px 6px",
                      borderRadius: "10px",
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </span>
            </button>
          </nav>
          <div className="sidebar-footer">
            <span>Alert24 v1.0</span>
          </div>
        </aside>

        {/* Main Content */}
        <main className="content-area">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <>
              {/* Stats Cards */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-icon blue"></div>
                  <div className="stat-number">
                    {typeof stats.total === "number" ? stats.total : "--"}
                  </div>
                  <div className="stat-label">Total Incidents</div>
                  <div className="stat-accent blue"></div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon red"></div>
                  <div className="stat-number">
                    {typeof stats.unassigned === "number"
                      ? stats.unassigned
                      : "--"}
                  </div>
                  <div className="stat-label">Unassigned</div>
                  <div className="stat-accent red"></div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon orange"></div>
                  <div className="stat-number">
                    {typeof stats.active === "number" ? stats.active : "--"}
                  </div>
                  <div className="stat-label">Active</div>
                  <div className="stat-accent orange"></div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon green"></div>
                  <div className="stat-number">
                    {typeof stats.resolvedToday === "number"
                      ? stats.resolvedToday
                      : "--"}
                  </div>
                  <div className="stat-label">Resolved Today</div>
                  <div className="stat-accent green"></div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon yellow"></div>
                  <div className="stat-number">
                    {typeof stats.totalResponders === "number"
                      ? stats.totalResponders
                      : "--"}
                  </div>
                  <div className="stat-label">Total Responders</div>
                  <div className="stat-accent yellow"></div>
                </div>
              </div>

              {/* Recent Incidents */}
              <div className="table-card" style={{ marginBottom: "24px" }}>
                <h2 className="card-title">Recent Incidents</h2>
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Reporter</th>
                      <th>Address</th>
                      <th>Status</th>
                      <th>Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.length === 0 ? (
                      <tr>
                        <td colSpan="7">No incidents reported yet</td>
                      </tr>
                    ) : (
                      incidents.slice(0, 5).map((incident, index) => (
                        <tr
                          key={incident.incidentId}
                          className={`${index % 2 === 1 ? "table-row-alt" : ""
                            } ${incident.status === "Reported" &&
                              incident.severity === "Critical"
                              ? "table-row-critical"
                              : ""
                            }`}
                        >
                          <td>{incident.type}</td>
                          <td>
                            <span
                              className={`badge badge-${incident.severity.toLowerCase()}`}
                            >
                              {incident.severity}
                            </span>
                          </td>
                          <td>{incident.reporterName}</td>
                          <td>{incident.address}</td>
                          <td>
                            <span
                              className={`status-badge status-${incident.status
                                .toLowerCase()
                                .replace(" ", "-")}`}
                            >
                              {incident.status}
                            </span>
                          </td>
                          <td>{formatDate(incident.createdAt)}</td>
                          <td>
                            {incident.status === "Reported" ? (
                              <button
                                className="assign-btn"
                                onClick={() => setAssignIncident(incident)}
                              >
                                Assign
                              </button>
                            ) : (
                              <button
                                className="view-btn"
                                onClick={() => handleViewIncident(incident)}
                              >
                                View
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Analytics Section */}
              <h2 className="card-title" style={{ marginBottom: "24px" }}>Analytics</h2>

              {/* Chart 1: Incidents Per Day */}
              <div className="table-card" style={{ marginBottom: "24px" }}>
                <h2 className="card-title">Incidents Per Day</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analyticsData.incidentsPerDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d4a6b" />
                    <XAxis dataKey="day" stroke="#e2e8f0" />
                    <YAxis stroke="#e2e8f0" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f1a2e",
                        border: "1px solid #2d4a6b",
                      }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Bar dataKey="count" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 2: Incidents By Type */}
              <div className="table-card" style={{ marginBottom: "24px" }}>
                <h2 className="card-title">Incidents By Type</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analyticsData.incidentsByType}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {analyticsData.incidentsByType.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={TYPE_COLORS[entry.name] || "#64748b"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f1a2e",
                        border: "1px solid #2d4a6b",
                      }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 3: Incidents By Severity */}
              <div className="table-card" style={{ marginBottom: "24px" }}>
                <h2 className="card-title">Incidents By Severity</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analyticsData.incidentsBySeverity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d4a6b" />
                    <XAxis dataKey="name" stroke="#e2e8f0" />
                    <YAxis stroke="#e2e8f0" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f1a2e",
                        border: "1px solid #2d4a6b",
                      }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Bar dataKey="value" fill="#c0392b">
                      {analyticsData.incidentsBySeverity.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SEVERITY_COLORS[entry.name]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 4: Response Time Trend */}
              <div className="table-card" style={{ marginBottom: "24px" }}>
                <h2 className="card-title">Response Time Trend</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analyticsData.responseTimeTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d4a6b" />
                    <XAxis dataKey="day" stroke="#e2e8f0" />
                    <YAxis stroke="#e2e8f0" label={{ value: "Avg Time (mins)", angle: -90, position: "insideLeft", fill: "#e2e8f0" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f1a2e",
                        border: "1px solid #2d4a6b",
                      }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Line type="monotone" dataKey="avgTime" stroke="#16a34a" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Live Incidents Tab */}
          {activeTab === "live-incidents" && (
            <div className="table-card">
              <h2 className="card-title">Live Incidents</h2>
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Reporter</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.length === 0 ? (
                    <tr>
                      <td colSpan="7">No incidents reported yet</td>
                    </tr>
                  ) : (
                    incidents.map((incident, index) => (
                      <tr
                        key={incident.incidentId}
                        className={`${index % 2 === 1 ? "table-row-alt" : ""
                          } ${incident.status === "Reported" &&
                            incident.severity === "Critical"
                            ? "table-row-critical"
                            : ""
                          }`}
                      >
                        <td>{incident.type}</td>
                        <td>
                          <span
                            className={`badge badge-${incident.severity.toLowerCase()}`}
                          >
                            {incident.severity}
                          </span>
                        </td>
                        <td>{incident.reporterName}</td>
                        <td>{incident.address}</td>
                        <td>
                          <span
                            className={`status-badge status-${incident.status
                              .toLowerCase()
                              .replace(" ", "-")}`}
                          >
                            {incident.status}
                          </span>
                        </td>
                        <td>{formatDate(incident.createdAt)}</td>
                        <td>
                          {incident.status === "Reported" ? (
                            <button
                              className="assign-btn"
                              onClick={() => setAssignIncident(incident)}
                            >
                              Assign
                            </button>
                          ) : (
                            <button
                              className="view-btn"
                              onClick={() => handleViewIncident(incident)}
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Manage Responders Tab */}
          {activeTab === "manage-responders" && (
            <div className="table-card">
              <h2 className="card-title">Manage Responders</h2>
              <table className="reports-table">
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
                    <tr>
                      <td colSpan="7">No responder accounts found</td>
                    </tr>
                  ) : (
                    responders.map((responder, index) => (
                      <tr
                        key={responder.uid}
                        className={index % 2 === 1 ? "table-row-alt" : ""}
                      >
                        <td>{responder.name}</td>
                        <td>{responder.email}</td>
                        <td>{responder.phone || "--"}</td>
                        <td>{responder.speciality || "--"}</td>
                        <td>
                          <span
                            className={`badge ${responder.isAvailable
                                ? "badge-minor"
                                : "badge-critical"
                              }`}
                          >
                            {responder.isAvailable ? "Available" : "Unavailable"}
                          </span>
                        </td>
                        <td>
                          {responder.activeIncidentId
                            ? incidents.find(
                              (i) => i.incidentId === responder.activeIncidentId
                            )?.type || "Active"
                            : "None"}
                        </td>
                        <td>
                          <button
                            className={
                              responder.isAvailable
                                ? "mark-unavailable-btn"
                                : "mark-available-btn"
                            }
                            onClick={() =>
                              handleToggleResponderAvailability(responder)
                            }
                          >
                            {responder.isAvailable
                              ? "Mark Unavailable"
                              : "Mark Available"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === "reports" && (
            <div className="table-card">
              <h2 className="card-title">Incident Reports</h2>
              <div className="filter-bar">
                <select
                  className="form-input"
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
                  className="form-input"
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
                  className="form-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="From Date"
                />
                <input
                  type="date"
                  className="form-input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="To Date"
                />
              </div>

              <table className="reports-table">
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
                    <tr>
                      <td colSpan="6">No incidents match the filters</td>
                    </tr>
                  ) : (
                    getFilteredIncidents().map((incident, index) => (
                      <tr
                        key={incident.incidentId}
                        className={index % 2 === 1 ? "table-row-alt" : ""}
                      >
                        <td>{incident.type}</td>
                        <td>
                          <span
                            className={`badge badge-${incident.severity.toLowerCase()}`}
                          >
                            {incident.severity}
                          </span>
                        </td>
                        <td>{incident.reporterName}</td>
                        <td>{incident.address}</td>
                        <td>
                          <span
                            className={`status-badge status-${incident.status
                              .toLowerCase()
                              .replace(" ", "-")}`}
                          >
                            {incident.status}
                          </span>
                        </td>
                        <td>{formatDate(incident.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="download-buttons" style={{ marginTop: "24px" }}>
                <button className="download-btn" onClick={downloadPDF}>
                  Download PDF
                </button>
                <button className="download-btn" onClick={downloadCSV}>
                  Download CSV
                </button>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="activity-card">
              <h2 className="card-title">Notifications</h2>
              <div className="activity-list">
                {notifications.length === 0 ? (
                  <div className="no-notifications">No notifications yet</div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.notificationId}
                      className={`activity-item ${!notification.isRead ? "unread" : ""
                        }`}
                      onClick={() => handleMarkNotificationRead(notification)}
                    >
                      <span
                        className="activity-dot"
                        style={{
                          backgroundColor: notification.isRead
                            ? "#475569"
                            : "#c0392b",
                        }}
                      ></span>
                      <div className="activity-content">
                        <div className="activity-text">
                          {notification.message}
                        </div>
                        <div className="activity-time">
                          {formatDate(notification.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* View Incident Modal */}
      {viewIncident && (
        <div
          className="modal-overlay"
          onClick={() => setViewIncident(null)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setViewIncident(null)}
            >
              ×
            </button>
            <h2 className="modal-title">Incident Details</h2>
            <div className="incident-details">
              <div className="detail-row">
                <span className="detail-label">Type</span>
                <span className="detail-value">{viewIncident.type}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Severity</span>
                <span
                  className={`badge badge-${viewIncident.severity.toLowerCase()}`}
                >
                  {viewIncident.severity}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Address</span>
                <span className="detail-value">{viewIncident.address}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Description</span>
                <span className="detail-value">{viewIncident.description}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Current Status</span>
                <span
                  className={`status-badge status-${viewIncident.status
                    .toLowerCase()
                    .replace(" ", "-")}`}
                >
                  {viewIncident.status}
                </span>
              </div>
              {viewIncident.photoUrl && (
                <div className="detail-row">
                  <span className="detail-label">Photo</span>
                  <img
                    src={viewIncident.photoUrl}
                    alt="Incident"
                    className="incident-photo"
                  />
                </div>
              )}
            </div>

            <h3 className="status-logs-title">Status History</h3>
            <div className="status-logs">
              {statusLogs.length === 0 ? (
                <div className="no-notifications">No status updates yet</div>
              ) : (
                statusLogs.map((log) => (
                  <div key={log.logId} className="status-log-item">
                    <span
                      className={`badge badge-${log.status.toLowerCase().replace(
                        " ",
                        "-"
                      )}`}
                    >
                      {log.status}
                    </span>
                    <span className="log-notes">{log.notes}</span>
                    <span className="log-time">{formatDate(log.timestamp)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assign Incident Modal */}
      {assignIncident && (
        <div
          className="modal-overlay"
          onClick={() => {
            setAssignIncident(null);
            setSelectedResponder(null);
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => {
                setAssignIncident(null);
                setSelectedResponder(null);
              }}
            >
              ×
            </button>
            <h2 className="modal-title">
              Assign Responder - {assignIncident.type} at {assignIncident.address}
            </h2>
            <div>
              {responders.length === 0 ? (
                <div className="no-notifications">No responders available</div>
              ) : (
                responders.map((responder) => (
                  <div
                    key={responder.uid}
                    className={`responder-row ${!responder.isAvailable ? "disabled" : ""
                      }`}
                    onClick={() => {
                      if (responder.isAvailable) {
                        setSelectedResponder(
                          selectedResponder?.uid === responder.uid
                            ? null
                            : responder
                        );
                      }
                    }}
                    style={{
                      borderColor:
                        selectedResponder?.uid === responder.uid
                          ? "#c0392b"
                          : "#2d4a6b",
                      cursor: responder.isAvailable ? "pointer" : "not-allowed",
                    }}
                  >
                    <div className="responder-info">
                      <div className="responder-name">{responder.name}</div>
                      <div className="responder-details">
                        {responder.speciality} •{" "}
                        <span
                          className={`badge ${responder.isAvailable
                              ? "badge-minor"
                              : "badge-critical"
                            }`}
                        >
                          {responder.isAvailable ? "Available" : "Unavailable"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div style={{ marginTop: 24, display: "flex", gap: "12px" }}>
                <button
                  className="download-btn"
                  onClick={handleAssignIncident}
                  disabled={!selectedResponder}
                >
                  Assign Responder
                </button>
                <button
                  className="view-btn"
                  onClick={() => {
                    setAssignIncident(null);
                    setSelectedResponder(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatcherDashboard;
