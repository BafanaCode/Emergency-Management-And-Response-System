import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from './firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from 'firebase/storage';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import './Dashboard.css';
import backgroundImage from './images/image4.webp';

const Dashboard = ({ onLogout, user, userData }) => {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Dashboard state
  const [incidents, setIncidents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, resolved: 0 });
  const [activeIncident, setActiveIncident] = useState(null);

  // Report form state
  const [reportType, setReportType] = useState('');
  const [reportSeverity, setReportSeverity] = useState('');
  const [reportAddress, setReportAddress] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportPhoto, setReportPhoto] = useState(null);
  const [reportFormError, setReportFormError] = useState('');
  const [reportFormSuccess, setReportFormSuccess] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Modal state
  const [viewIncident, setViewIncident] = useState(null);
  const [statusLogs, setStatusLogs] = useState([]);

  // Ref holding the active statusLogs onSnapshot unsubscribe function
  const statusLogsUnsubRef = useRef(null);

  // My Reports filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');

  // Profile state
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Format date helper
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const day = String(date.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${minutes}`;
  };

  // Fetch incidents, calculate stats, and derive active incident — single listener
  useEffect(() => {
    if (!user) return;

    console.log('Fetching incidents for user:', user.uid);

    const q = query(
      collection(db, 'incidents'),
      where('reporterId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('Incidents snapshot received:', snapshot.docs.length, 'docs');
      let data = snapshot.docs.map(doc => {
        const docData = doc.data();
        console.log('Incident doc:', doc.id, docData);
        return {
          incidentId: doc.id,
          ...docData
        };
      });

      // Sort manually since we removed orderBy (to avoid index issue temporarily)
      data.sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });

      setIncidents(data);

      // Calculate stats
      let total = 0, pending = 0, inProgress = 0, resolved = 0;
      data.forEach(incident => {
        total++;
        if (incident.status === 'Reported' || incident.status === 'Assigned') pending++;
        else if (incident.status === 'En Route' || incident.status === 'On Scene') inProgress++;
        else if (incident.status === 'Resolved') resolved++;
      });
      setStats({ total, pending, inProgress, resolved });

      // Derive active incident (first non-resolved, already sorted newest-first)
      const active = data.find(i => i.status !== 'Resolved') || null;
      setActiveIncident(active);
    }, (err) => {
      console.error('Error fetching incidents:', err);
      alert('Error fetching incidents: ' + err.message);
    });

    return () => unsubscribe();
  }, [user]);


  // Fetch notifications
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({
          notificationId: doc.id,
          ...doc.data()
        }))
        .sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        })
        .slice(0, 10);
      setNotifications(data);
    }, (err) => {
      console.error('Error fetching notifications:', err);
    });

    return () => unsubscribe();
  }, [user]);

  // Mark notification as read
  const markNotificationRead = async (notificationId) => {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, { isRead: true });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Handle report submission
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    setReportFormError('');
    setReportFormSuccess('');

    // Validate form
    if (!reportType || !reportSeverity || !reportAddress || !reportDescription) {
      setReportFormError('Please fill in all required fields');
      return;
    }
    if (reportDescription.length < 20) {
      setReportFormError('Description must be at least 20 characters');
      return;
    }

    setReportSubmitting(true);

    try {
      let photoUrl = '';

      // Upload photo if selected (with better error handling)
      if (reportPhoto) {
        try {
          console.log('Uploading photo...');
          const photoRef = ref(storage, `incidents/${Date.now()}/photo.jpg`);
          const uploadTask = uploadBytesResumable(photoRef, reportPhoto);

          await new Promise((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              null,
              (error) => {
                console.error('Photo upload failed:', error);
                reject(error);
              },
              async () => {
                photoUrl = await getDownloadURL(uploadTask.snapshot.ref);
                console.log('Photo uploaded successfully!');
                resolve();
              }
            );
          });
        } catch (uploadErr) {
          console.warn('Photo upload failed, continuing without photo:', uploadErr);
          // Continue even if photo fails to upload
        }
      }

      console.log('Creating incident document...');
      // Create incident document
      const incidentRef = await addDoc(collection(db, 'incidents'), {
        reporterId: user.uid,
        reporterName: userData?.name || 'Unknown',
        type: reportType,
        severity: reportSeverity,
        description: reportDescription,
        address: reportAddress,
        photoUrl: photoUrl,
        status: 'Reported',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Do these in the background without waiting to make the UI faster
      (async () => {
        try {
          // Update the incident with its own ID for easier querying later
          await updateDoc(incidentRef, { incidentId: incidentRef.id });

          console.log('Adding status log...');
          // Add status log
          await addDoc(collection(db, 'statusLogs'), {
            incidentId: incidentRef.id,
            status: 'Reported',
            updatedBy: user.uid,
            notes: 'Incident reported',
            timestamp: serverTimestamp()
          });
        } catch (bgErr) {
          console.error('Background update failed:', bgErr);
        }
      })();

      // Clear form and show success immediately
      setReportType('');
      setReportSeverity('');
      setReportAddress('');
      setReportDescription('');
      setReportPhoto(null);
      setReportFormSuccess('Emergency reported successfully. Responders have been notified.');
      console.log('Report submitted successfully!');
    } catch (err) {
      console.error('Error submitting report:', err);
      setReportFormError('Failed to submit report: ' + err.message);
    } finally {
      setReportSubmitting(false);
    }
  };

  // Unsubscribe the statusLogs listener when the component unmounts
  useEffect(() => {
    return () => {
      if (statusLogsUnsubRef.current) {
        statusLogsUnsubRef.current();
        statusLogsUnsubRef.current = null;
      }
    };
  }, []);

  // Handle viewing incident details
  const handleViewIncident = (incident) => {
    // Unsubscribe the previous statusLogs listener before attaching a new one
    if (statusLogsUnsubRef.current) {
      statusLogsUnsubRef.current();
      statusLogsUnsubRef.current = null;
    }

    setViewIncident(incident);
    setStatusLogs([]);

    // Fetch status logs for the selected incident
    const q = query(
      collection(db, 'statusLogs'),
      where('incidentId', '==', incident.incidentId),
      orderBy('timestamp', 'desc')
    );

    statusLogsUnsubRef.current = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        logId: doc.id,
        ...doc.data()
      }));
      setStatusLogs(data);
    }, (err) => {
      console.error('Error fetching status logs:', err);
    });
  };

  // Handle profile update
  const handleSaveProfile = async () => {
    setProfileError('');
    setProfileSuccess('');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: editName,
        phone: editPhone
      });
      setEditingProfile(false);
      setProfileSuccess('Profile updated successfully');
    } catch (err) {
      console.error('Error updating profile:', err);
      setProfileError('Failed to update profile');
    }
  };

  // Pie chart colour map — matches status badge system
  const PIE_COLORS = {
    'Reported': '#64748b',
    'Assigned': '#3b82f6',
    'En Route': '#8b5cf6',
    'On Scene': '#f59e0b',
    'Resolved': '#22c55e'
  };

  // Compute pie data
  const pieData = (() => {
    const statusCounts = {};
    incidents.forEach(incident => {
      statusCounts[incident.status] = (statusCounts[incident.status] || 0) + 1;
    });
    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  })();

  // Initials for avatar
  const initials = (userData?.name || user?.email || 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // ── SVG icon components ──────────────────────────────────

  const IconShield = ({ size = 28, className = '' }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L3 7V12C3 16.5 6.84 20.74 12 22C17.16 20.74 21 16.5 21 12V7L12 2Z" fill="#c0392b" />
      <path d="M12 8V14" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16V17" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const IconHome = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const IconAlert = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 9V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18C1.64 18.3 1.57 18.63 1.61 18.95C1.65 19.27 1.79 19.58 2 19.83C2.21 20.08 2.48 20.27 2.79 20.38C3.09 20.49 3.42 20.51 3.73 20.43L20.27 16.14C20.59 16.06 20.88 15.89 21.1 15.65C21.33 15.41 21.47 15.11 21.51 14.79C21.55 14.47 21.49 14.14 21.33 13.86L14.71 2.86C14.55 2.57 14.31 2.34 14.01 2.19C13.72 2.04 13.39 1.98 13.06 2.02C12.73 2.06 12.42 2.19 12.17 2.41C11.92 2.62 11.74 2.9 11.65 3.22L10.29 3.86Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const IconFile = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const IconUser = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const IconBell = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // ── JSX ─────────────────────────────────────────────────

  return (
    <div className="dashboard-container" style={{ backgroundImage: `url(${backgroundImage})` }}>

      {/* ── TOP NAVIGATION ────────────────────────────────── */}
      <nav className="top-nav">
        <div className="nav-left">
          <IconShield size={26} className="nav-icon" />
          <span className="nav-title">Alert24</span>
        </div>

        <div className="nav-center">
          <span className="blinking-dot"></span>
          <span className="system-status">System Active</span>
        </div>

        <div className="nav-right">
          <div className="user-info">
            <span className="user-name">{userData?.name || 'User'}</span>
            <span className="user-email">{user?.email}</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>Sign out</button>
        </div>
      </nav>

      <div className="dashboard-main">

        {/* ── SIDEBAR ───────────────────────────────────────── */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
              title="Dashboard"
            >
              <span className="link-icon"><IconHome /></span>
              <span>Dashboard</span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'report' ? 'active' : ''}`}
              onClick={() => setActiveTab('report')}
              title="Report Emergency"
            >
              <span className="link-icon"><IconAlert /></span>
              <span>Report Emergency</span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'myReports' ? 'active' : ''}`}
              onClick={() => setActiveTab('myReports')}
              title="My Reports"
            >
              <span className="link-icon"><IconFile /></span>
              <span>My Reports</span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
              title="My Profile"
            >
              <span className="link-icon"><IconUser /></span>
              <span>My Profile</span>
            </button>
          </nav>
          <div className="sidebar-footer">
            Alert24 v1.0
          </div>
        </aside>

        {/* ── MAIN CONTENT ──────────────────────────────────── */}
        <main className="content-area">

          {/* ═══════════════════════════════════════════════
              DASHBOARD TAB
              ═══════════════════════════════════════════════ */}
          {activeTab === 'dashboard' && (
            <>
              {/* Page heading */}
              <div className="page-header">
                <h1 className="page-title">Overview</h1>
                <p className="page-subtitle">
                  Welcome back, {userData?.name?.split(' ')[0] || 'there'}. Here's your incident summary.
                </p>
              </div>

              {/* Status Banner */}
              <div className={`status-banner ${activeIncident ? 'status-active' : 'status-idle'}`}>
                <div className="banner-left">
                  {activeIncident ? (
                    <>
                      <div className="pulsing-dot"></div>
                      <span className="banner-text">
                        Active — {activeIncident.type} &mdash; {activeIncident.status}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="static-dot"></div>
                      <span className="banner-text-muted">No active emergencies</span>
                    </>
                  )}
                </div>
                {activeIncident ? (
                  <button className="banner-btn" onClick={() => handleViewIncident(activeIncident)}>
                    View Status
                  </button>
                ) : (
                  <button className="banner-btn" onClick={() => setActiveTab('report')}>
                    Report Emergency
                  </button>
                )}
              </div>

              {/* Stats Cards */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-icon blue">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="stat-number">{stats.total}</div>
                  <div className="stat-label">Total Reports</div>
                  <div className="stat-accent blue"></div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon yellow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="2" />
                      <path d="M12 8V12" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                      <path d="M12 16H12.01" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="stat-number">{stats.pending}</div>
                  <div className="stat-label">Pending</div>
                  <div className="stat-accent yellow"></div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon orange">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="stat-number">{stats.inProgress}</div>
                  <div className="stat-label">In Progress</div>
                  <div className="stat-accent orange"></div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon green">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22 11.08V12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22 4L12 14.01L9 11.01" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="stat-number">{stats.resolved}</div>
                  <div className="stat-label">Resolved</div>
                  <div className="stat-accent green"></div>
                </div>
              </div>

              {/* Two-column content */}
              <div className="two-col-row">
                {/* Recent Reports + Chart */}
                <div className="table-card">
                  <h2 className="card-title">
                    Recent Reports
                    {incidents.length > 0 && (
                      <span className="card-title-count">{Math.min(incidents.length, 5)} of {incidents.length}</span>
                    )}
                  </h2>
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.length > 0 ? (
                        incidents.slice(0, 5).map((incident) => (
                          <tr key={incident.incidentId}>
                            <td>{incident.type}</td>
                            <td>
                              <span className={`badge badge-${incident.severity.toLowerCase()}`}>
                                {incident.severity}
                              </span>
                            </td>
                            <td style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {incident.address}
                            </td>
                            <td>
                              <span className={`status-badge status-${incident.status.toLowerCase().replace(' ', '-')}`}>
                                {incident.status}
                              </span>
                            </td>
                            <td style={{ color: 'var(--d-gray-500)', fontSize: '12.5px' }}>
                              {formatDate(incident.createdAt)}
                            </td>
                            <td>
                              <button className="view-btn" onClick={() => handleViewIncident(incident)}>
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6">
                            <div className="table-empty">
                              <svg className="table-empty-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <p className="table-empty-text">No reports submitted yet</p>
                              <p className="table-empty-sub">Use "Report Emergency" to submit your first incident.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Pie Chart */}
                  {incidents.length > 0 && (
                    <div className="chart-section">
                      <h2 className="card-title">Reports by Status</h2>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) =>
                              `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={90}
                            dataKey="value"
                          >
                            {pieData.map((entry) => (
                              <Cell
                                key={`cell-${entry.name}`}
                                fill={PIE_COLORS[entry.name] || '#64748b'}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: '#0f1a2e',
                              border: '1px solid rgba(255,255,255,0.10)',
                              borderRadius: '8px',
                              color: '#e2e8f0',
                              fontSize: '13px'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Notifications Panel */}
                <div className="activity-card">
                  <h2 className="card-title">
                    <span className="link-icon"><IconBell /></span>
                    Notifications
                    {unreadCount > 0 && (
                      <span className="card-title-count">{unreadCount} new</span>
                    )}
                  </h2>
                  <div className="activity-list">
                    {notifications.length > 0 ? (
                      notifications.map(notif => (
                        <div
                          key={notif.notificationId}
                          className={`activity-item ${!notif.isRead ? 'unread' : ''}`}
                          onClick={() => markNotificationRead(notif.notificationId)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === 'Enter' && markNotificationRead(notif.notificationId)}
                          aria-label={`Notification: ${notif.message}`}
                        >
                          <div
                            className="activity-dot"
                            style={{ backgroundColor: notif.isRead ? '#475569' : '#c0392b' }}
                          ></div>
                          <div className="activity-content">
                            <div className="activity-text">{notif.message}</div>
                            <div className="activity-time">{formatDate(notif.createdAt)}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="no-notifications">
                        <svg className="no-notif-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p className="no-notif-text">No notifications yet</p>
                        <p className="no-notif-sub">You'll be notified when responders update your incidents.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════
              REPORT EMERGENCY TAB
              ═══════════════════════════════════════════════ */}
          {activeTab === 'report' && (
            <div className="form-card full-width">
              {/* Form header */}
              <div className="report-form-header">
                <div className="report-form-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 9V13" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                    <path d="M12 17H12.01" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10.29 3.86L1.82 18C1.64 18.3 1.57 18.63 1.61 18.95C1.65 19.27 1.79 19.58 2 19.83C2.21 20.08 2.48 20.27 2.79 20.38C3.09 20.49 3.42 20.51 3.73 20.43L20.27 16.14C20.59 16.06 20.88 15.89 21.1 15.65C21.33 15.41 21.47 15.11 21.51 14.79C21.55 14.47 21.49 14.14 21.33 13.86L14.71 2.86C14.55 2.57 14.31 2.34 14.01 2.19C13.72 2.04 13.39 1.98 13.06 2.02C12.73 2.06 12.42 2.19 12.17 2.41C11.92 2.62 11.74 2.9 11.65 3.22L10.29 3.86Z" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h1 className="report-form-title">Report Emergency</h1>
                  <p className="report-form-subtitle">
                    Provide accurate details to ensure the fastest possible response.
                  </p>
                </div>
              </div>

              {reportFormError && <div className="error-banner">{reportFormError}</div>}
              {reportFormSuccess && <div className="success-banner">{reportFormSuccess}</div>}

              <form className="quick-form" onSubmit={handleSubmitReport} noValidate>
                {/* Row 1: Type + Severity */}
                <div className="form-row">
                  <div className="form-field">
                    <label className="form-label" htmlFor="report-type">Emergency Type <span style={{color:'#f87171'}}>*</span></label>
                    <select
                      id="report-type"
                      className="form-input"
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                    >
                      <option value="">Select type…</option>
                      <option value="Road Accident">Road Accident</option>
                      <option value="Fire">Fire</option>
                      <option value="Medical Emergency">Medical Emergency</option>
                      <option value="Flood">Flood</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="report-severity">Severity Level <span style={{color:'#f87171'}}>*</span></label>
                    <select
                      id="report-severity"
                      className="form-input"
                      value={reportSeverity}
                      onChange={(e) => setReportSeverity(e.target.value)}
                    >
                      <option value="">Select severity…</option>
                      <option value="Minor">Minor</option>
                      <option value="Serious">Serious</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>

                {/* Address */}
                <div className="form-field">
                  <label className="form-label" htmlFor="report-address">Incident Address <span style={{color:'#f87171'}}>*</span></label>
                  <input
                    id="report-address"
                    type="text"
                    className="form-input"
                    placeholder="Street address or landmark"
                    value={reportAddress}
                    onChange={(e) => setReportAddress(e.target.value)}
                  />
                </div>

                {/* Description */}
                <div className="form-field">
                  <label className="form-label" htmlFor="report-description">
                    Description <span style={{color:'#f87171'}}>*</span>
                  </label>
                  <textarea
                    id="report-description"
                    className="form-input textarea"
                    placeholder="Describe what is happening. Include number of casualties, immediate hazards, and any other critical details…"
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    rows={5}
                  />
                  <div className={`char-count ${reportDescription.length >= 20 ? 'char-warn' : ''}`}>
                    {reportDescription.length} / 20 minimum characters
                  </div>
                </div>

                {/* Photo */}
                <div className="form-field">
                  <label className="form-label" htmlFor="report-photo">Photo (optional)</label>
                  <input
                    id="report-photo"
                    type="file"
                    className="form-input file-input"
                    accept="image/*"
                    onChange={(e) => setReportPhoto(e.target.files[0])}
                  />
                </div>

                <button
                  type="submit"
                  className="submit-btn"
                  disabled={reportSubmitting}
                  aria-busy={reportSubmitting}
                >
                  {reportSubmitting ? 'Submitting report…' : 'Submit Emergency Report'}
                </button>
              </form>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              MY REPORTS TAB
              ═══════════════════════════════════════════════ */}
          {activeTab === 'myReports' && (
            <div className="table-card">
              <div className="page-header" style={{ marginBottom: '20px' }}>
                <h1 className="page-title">My Reports</h1>
                <p className="page-subtitle">All emergency incidents you have submitted.</p>
              </div>

              {/* Filters */}
              <div className="filter-bar">
                <span className="filter-label">Filter:</span>
                <select
                  className="form-input filter-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
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
                  className="form-input filter-input"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  aria-label="Filter by severity"
                >
                  <option value="All">All Severities</option>
                  <option value="Minor">Minor</option>
                  <option value="Serious">Serious</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              {/* Table */}
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = incidents.filter(incident => {
                      const matchesStatus = statusFilter === 'All' || incident.status === statusFilter;
                      const matchesSeverity = severityFilter === 'All' || incident.severity === severityFilter;
                      return matchesStatus && matchesSeverity;
                    });
                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan="6">
                            <div className="table-empty">
                              <svg className="table-empty-icon" viewBox="0 0 24 24" fill="none">
                                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                                <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                              <p className="table-empty-text">No reports match your filters</p>
                              <p className="table-empty-sub">Try adjusting the status or severity filters.</p>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return filtered.map((incident) => (
                      <tr key={incident.incidentId}>
                        <td>{incident.type}</td>
                        <td>
                          <span className={`badge badge-${incident.severity.toLowerCase()}`}>
                            {incident.severity}
                          </span>
                        </td>
                        <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {incident.address}
                        </td>
                        <td>
                          <span className={`status-badge status-${incident.status.toLowerCase().replace(' ', '-')}`}>
                            {incident.status}
                          </span>
                        </td>
                        <td style={{ color: 'var(--d-gray-500)', fontSize: '12.5px' }}>
                          {formatDate(incident.createdAt)}
                        </td>
                        <td>
                          <button className="view-btn" onClick={() => handleViewIncident(incident)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              PROFILE TAB
              ═══════════════════════════════════════════════ */}
          {activeTab === 'profile' && (
            <div className="form-card full-width">
              {profileError && <div className="error-banner">{profileError}</div>}
              {profileSuccess && <div className="success-banner">{profileSuccess}</div>}

              {/* Avatar header */}
              <div className="profile-header">
                <div className="profile-avatar" aria-hidden="true">{initials}</div>
                <div className="profile-header-info">
                  <div className="profile-display-name">{userData?.name || 'User'}</div>
                  <div className="profile-role-badge">Reporter</div>
                </div>
              </div>

              {/* Profile fields */}
              <div className="profile-content">
                {!editingProfile ? (
                  <>
                    <div className="profile-field">
                      <span className="field-label">Full Name</span>
                      <span className="field-value">{userData?.name || '—'}</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Email</span>
                      <span className="field-value">{user?.email}</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Phone</span>
                      <span className="field-value">{userData?.phone || '—'}</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Role</span>
                      <span className="field-value">Reporter</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Member Since</span>
                      <span className="field-value">{formatDate(userData?.createdAt)}</span>
                    </div>
                    <div className="profile-actions">
                      <button className="edit-btn" onClick={() => {
                        setEditName(userData?.name || '');
                        setEditPhone(userData?.phone || '');
                        setEditingProfile(true);
                      }}>
                        Edit Profile
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="profile-edit-form">
                    <div className="profile-edit-row">
                      <span className="field-label">Full Name</span>
                      <input
                        type="text"
                        className="form-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Your full name"
                        aria-label="Full name"
                      />
                    </div>
                    <div className="profile-edit-row">
                      <span className="field-label">Phone</span>
                      <input
                        type="tel"
                        className="form-input"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Your phone number"
                        aria-label="Phone number"
                      />
                    </div>
                    <div className="profile-actions">
                      <button className="submit-btn" style={{ width: 'auto', padding: '9px 20px' }} onClick={handleSaveProfile}>
                        Save Changes
                      </button>
                      <button className="cancel-btn" onClick={() => setEditingProfile(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ═══════════════════════════════════════════════════
          INCIDENT DETAIL MODAL
          ═══════════════════════════════════════════════════ */}
      {viewIncident && (
        <div
          className="modal-overlay"
          onClick={() => setViewIncident(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Incident Details"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="modal-header">
              <h2 className="modal-title">Incident Details</h2>
              <button
                className="modal-close"
                onClick={() => setViewIncident(null)}
                aria-label="Close incident details"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="modal-body">
              <div className="incident-details">
                <div className="detail-row">
                  <span className="detail-label">Type</span>
                  <span className="detail-value">{viewIncident.type}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Severity</span>
                  <span className={`badge badge-${viewIncident.severity.toLowerCase()}`}>
                    {viewIncident.severity}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className={`status-badge status-${viewIncident.status.toLowerCase().replace(' ', '-')}`}>
                    {viewIncident.status}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Address</span>
                  <span className="detail-value">{viewIncident.address}</span>
                </div>
                <div className="detail-row" style={{ flexDirection: 'column', gap: '8px' }}>
                  <span className="detail-label">Description</span>
                  <span className="detail-value detail-description">{viewIncident.description}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Reported</span>
                  <span className="detail-value">{formatDate(viewIncident.createdAt)}</span>
                </div>
                {viewIncident.photoUrl && (
                  <div className="detail-row" style={{ flexDirection: 'column', gap: '8px' }}>
                    <span className="detail-label">Photo</span>
                    <img src={viewIncident.photoUrl} alt="Incident" className="incident-photo" />
                  </div>
                )}
              </div>

              {/* Status History */}
              <h3 className="status-logs-title">Status History</h3>
              <div className="status-logs">
                {statusLogs.length > 0 ? (
                  statusLogs.map(log => (
                    <div key={log.logId} className="status-log-item">
                      <span className={`badge badge-${log.status.toLowerCase().replace(' ', '-')}`}>
                        {log.status}
                      </span>
                      <span className="log-notes">{log.notes}</span>
                      <span className="log-time">{formatDate(log.timestamp)}</span>
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--d-gray-600)', fontSize: '13.5px', padding: '8px 0' }}>
                    No status updates yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
