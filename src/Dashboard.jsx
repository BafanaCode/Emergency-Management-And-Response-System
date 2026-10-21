import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { db, storage } from './firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { uploadIncidentImage, validateImageFile, ImageProcessingError } from './utils/imageUtils';
import ViewIncidentModal from './components/reporter/ViewIncidentModal';
import NotificationCenter from './components/notifications/NotificationCenter';
import useNotifications from './hooks/useNotifications';
import { queueReportedNotification } from './utils/notifications';
import ReportEmergencyTab from './components/reporter/ReportEmergencyTab';
import { friendlyFirestoreError } from './utils/incidentLifecycle';
import { requestCurrentPosition } from './utils/geo';
import './Dashboard.css';
import backgroundImage from './images/image4.webp';

// Leaflet map is lazy-loaded: only downloaded when the map tab is opened
const IncidentMap = lazy(() => import('./components/map/IncidentMap'));

const Dashboard = ({ onLogout, user, userData, theme, onThemeChange }) => {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Dashboard state
  const [incidents, setIncidents] = useState([]);
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
  } = useNotifications(user, 'reporter');
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, resolved: 0 });
  const [activeIncident, setActiveIncident] = useState(null);

  // Report form state
  const [reportType, setReportType] = useState('');
  const [reportSeverity, setReportSeverity] = useState('');
  const [reportAddress, setReportAddress] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportPhoto, setReportPhoto] = useState(null);
  const photoInputRef = useRef(null);
  const [reportFormError, setReportFormError] = useState('');
  const [reportFormSuccess, setReportFormSuccess] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Optional GPS location (only set after the reporter explicitly asks for it)
  const [reportCoords, setReportCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  // Modal state
  const [viewIncident, setViewIncident] = useState(null);
  const [statusLogs, setStatusLogs] = useState([]);

  // Ref holding the active statusLogs onSnapshot unsubscribe function
  const statusLogsUnsubRef = useRef(null);

  // My Reports filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

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

    const q = query(
      collection(db, 'incidents'),
      where('reporterId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({
        incidentId: doc.id,
        ...doc.data()
      }));

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
      if (!user) return;
      console.error('Error fetching incidents:', err);
    });

    return () => unsubscribe();
  }, [user]);


  // Mark notification as read (used by the overview panel)
  const markNotificationRead = (notificationId) => {
    const n = notifications.find((x) => x.notificationId === notificationId);
    if (n) markRead(n);
  };

  // Open the incident a notification refers to. Reporters can only read their own
  // incidents (enforced by firestore.rules), so this resolves against their own list.
  const openNotification = (n) => {
    markRead(n);
    const incident = incidents.find((i) => i.incidentId === n.incidentId);
    if (!incident) return false;
    handleViewIncident(incident);
    return true;
  };

  // Capture the reporter's current location. Triggered only by a button click so the
  // browser shows its own permission prompt; failure never blocks manual address entry.
  const handleCaptureLocation = async () => {
    if (locating) return;
    setLocating(true);
    setLocationMessage('');
    try {
      const pos = await requestCurrentPosition();
      setReportCoords(pos);
    } catch (err) {
      setReportCoords(null);
      setLocationMessage(err?.message || 'Could not get your location. Please type the address manually.');
    } finally {
      setLocating(false);
    }
  };

  const handleClearLocation = () => {
    setReportCoords(null);
    setLocationMessage('');
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
    if (reportDescription.length > 2000) {
      setReportFormError('Description must be at most 2000 characters');
      return;
    }
    if (reportAddress.length > 300) {
      setReportFormError('Address must be at most 300 characters');
      return;
    }
    const photoCheck = validateImageFile(reportPhoto);
    if (!photoCheck.ok) {
      setReportFormError(photoCheck.error);
      return;
    }

    // Guard against double-clicks / repeated submissions while a request is in flight
    if (reportSubmitting) return;
    setReportSubmitting(true);

    try {
      let photoUrl = '';

      // Upload / compress the photo. This throws (never silently drops the photo)
      // when the photo cannot be saved, so no report is created without it.
      if (reportPhoto) {
        photoUrl = await uploadIncidentImage(storage, reportPhoto);
      }

      // Create the incident and its initial status-history entry atomically.
      // The Firestore document ID is the incident's identity (no extra incidentId write).
      // The log ID is deterministic so firestore.rules can require it at creation time.
      const incidentRef = doc(collection(db, 'incidents'));
      const batch = writeBatch(db);
      batch.set(incidentRef, {
        reporterId: user.uid,
        reporterName: userData?.name || 'Unknown',
        type: reportType,
        severity: reportSeverity,
        description: reportDescription,
        address: reportAddress,
        photoUrl: photoUrl,
        status: 'Reported',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Only present when the reporter chose to share their GPS location
        ...(reportCoords
          ? { latitude: reportCoords.latitude, longitude: reportCoords.longitude }
          : {})
      });
      batch.set(doc(db, 'statusLogs', `${incidentRef.id}_reported`), {
        incidentId: incidentRef.id,
        status: 'Reported',
        updatedBy: user.uid,
        notes: 'Incident reported',
        timestamp: serverTimestamp()
      });
      // Alert the dispatcher channel in the same atomic write
      queueReportedNotification(batch, db, {
        incidentId: incidentRef.id,
        type: reportType,
        severity: reportSeverity
      });
      await batch.commit();

      // Only reached when the incident AND its history entry were persisted
      setReportType('');
      setReportSeverity('');
      setReportAddress('');
      setReportDescription('');
      setReportPhoto(null);
      setReportCoords(null);
      setLocationMessage('');
      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }
      setReportFormSuccess('Emergency reported successfully. Dispatchers can see your report on their live dashboard.');
    } catch (err) {
      console.error('Error submitting report:', err);
      setReportFormSuccess('');
      setReportFormError(
        'Your report was NOT submitted. ' +
          (err instanceof ImageProcessingError
            ? err.message
            : friendlyFirestoreError(err, 'Please check your connection and try again.'))
      );
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

  // ── SVG icon components (18x18 to match dd/rd sidebar icons) ──

  const IconShield = ({ size = 26, className = '' }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L3 7V12C3 16.5 6.84 20.74 12 22C17.16 20.74 21 16.5 21 12V7L12 2Z" fill="#dc2626" />
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

  const IconMap = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );

  const IconSettings = () => (
    <svg className="link-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );



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

        {/* ── SIDEBAR — structure matches dd/rd sidebar exactly ──── */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
              title="Dashboard"
            >
              <span className="link-icon"><IconHome /></span>
              <span><span className="label-full">Dashboard</span><span className="label-short">Home</span></span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'report' ? 'active' : ''}`}
              onClick={() => setActiveTab('report')}
              title="Report Emergency"
            >
              <span className="link-icon"><IconAlert /></span>
              <span><span className="label-full">Report Emergency</span><span className="label-short">Report</span></span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'myReports' ? 'active' : ''}`}
              onClick={() => setActiveTab('myReports')}
              title="My Reports"
            >
              <span className="link-icon"><IconFile /></span>
              <span><span className="label-full">My Reports</span><span className="label-short">Reports</span></span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'incident-map' ? 'active' : ''}`}
              onClick={() => setActiveTab('incident-map')}
              title="Incident Map"
            >
              <span className="link-icon"><IconMap /></span>
              <span><span className="label-full">Incident Map</span><span className="label-short">Map</span></span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
              title="Notifications"
            >
              <span className="link-icon"><IconBell /></span>
              <span><span className="label-full">Notifications</span><span className="label-short">Alerts</span></span>
              {unreadCount > 0 && (
                <span className="a24-nav-badge" aria-label={`${unreadCount} unread notifications`}>{unreadCount}</span>
              )}
            </button>
            <button
              className={`sidebar-link ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
              title="My Profile"
            >
              <span className="link-icon"><IconUser /></span>
              <span><span className="label-full">My Profile</span><span className="label-short">Profile</span></span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              title="Settings"
            >
              <span className="link-icon"><IconSettings /></span>
              <span><span className="label-full">Settings</span><span className="label-short">Settings</span></span>
            </button>
          </nav>
          <div className="sidebar-footer">
            Alert24 Citizen Portal
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
                  Monitor emergency reports, track dispatch stages, and manage incident responses in real time.
                </p>
              </div>

              {/* Status Banner */}
              <div className={`status-banner ${activeIncident ? 'status-active' : 'status-idle'}`}>
                <div className="banner-left">
                  {activeIncident ? (
                    <>
                      <div className="pulsing-dot" aria-hidden="true"></div>
                      <div className="banner-info-group">
                        <div className="banner-badge-row">
                          <span className="banner-active-pill">Active Incident</span>
                          <span className={`status-badge status-${activeIncident.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {activeIncident.status}
                          </span>
                        </div>
                        <div className="banner-incident-name">{activeIncident.type}</div>
                        {activeIncident.address && (
                          <div className="banner-incident-loc" title={activeIncident.address}>
                            {activeIncident.address}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="static-dot" aria-hidden="true"></div>
                      <div className="banner-info-group">
                        <div className="banner-idle-title">All Systems Normal</div>
                        <div className="banner-idle-desc">No active emergency incidents currently reported by your account.</div>
                      </div>
                    </>
                  )}
                </div>
                {activeIncident ? (
                  <button className="banner-btn" onClick={() => handleViewIncident(activeIncident)}>
                    View Incident
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
                  <div className="table-wrap">
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
                              <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{incident.type}</td>
                              <td>
                                <span className={`badge badge-${incident.severity.toLowerCase()}`}>
                                  {incident.severity}
                                </span>
                              </td>
                              <td
                                title={incident.address}
                                style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                              >
                                {incident.address}
                              </td>
                              <td>
                                <span className={`status-badge status-${incident.status.toLowerCase().replace(' ', '-')}`}>
                                  {incident.status}
                                </span>
                              </td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
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
                  </div>

                  {/* Reports by Status Chart */}
                  {incidents.length > 0 && (
                    <div className="chart-section">
                      <div className="chart-header-row">
                        <h2 className="card-title" style={{ margin: 0 }}>Reports by Status</h2>
                        <span className="card-title-count">{stats.total} total</span>
                      </div>
                      <div className="chart-content-layout">
                        <div className="chart-visual-wrap">
                          <ResponsiveContainer width="100%" height={210}>
                            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={52}
                                outerRadius={76}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {pieData.map((entry) => (
                                  <Cell
                                    key={`cell-${entry.name}`}
                                    fill={PIE_COLORS[entry.name] || '#64748b'}
                                    stroke="var(--bg-surface)"
                                    strokeWidth={2}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value, name) => [
                                  `${value} report${value !== 1 ? 's' : ''} (${stats.total > 0 ? Math.round((value / stats.total) * 100) : 0}%)`,
                                  name
                                ]}
                                contentStyle={{
                                  backgroundColor: theme === 'light' ? '#ffffff' : '#0f1a2e',
                                  border: theme === 'light' ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.12)',
                                  borderRadius: '8px',
                                  color: theme === 'light' ? '#0f172a' : '#e2e8f0',
                                  fontSize: '12.5px',
                                  boxShadow: theme === 'light' ? '0 4px 14px rgba(15,23,42,0.10)' : '0 8px 24px rgba(0,0,0,0.4)'
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="chart-center-badge">
                            <span className="chart-center-num">{stats.total}</span>
                            <span className="chart-center-lbl">TOTAL</span>
                          </div>
                        </div>

                        {/* Structured Legend */}
                        <div className="chart-legend-list">
                          {pieData.map((entry) => {
                            const pct = stats.total > 0 ? Math.round((entry.value / stats.total) * 100) : 0;
                            return (
                              <div key={entry.name} className="chart-legend-row">
                                <div className="chart-legend-left">
                                  <span
                                    className="chart-legend-dot"
                                    style={{ backgroundColor: PIE_COLORS[entry.name] || '#64748b' }}
                                  />
                                  <span className="chart-legend-name">{entry.name}</span>
                                </div>
                                <div className="chart-legend-right">
                                  <span className="chart-legend-count">{entry.value}</span>
                                  <span className="chart-legend-pct">{pct}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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
                      notifications.slice(0, 5).map(notif => (
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
            <ReportEmergencyTab
              reportFormError={reportFormError}
              reportFormSuccess={reportFormSuccess}
              handleSubmitReport={handleSubmitReport}
              reportType={reportType}
              setReportType={setReportType}
              reportSeverity={reportSeverity}
              setReportSeverity={setReportSeverity}
              reportAddress={reportAddress}
              setReportAddress={setReportAddress}
              reportDescription={reportDescription}
              setReportDescription={setReportDescription}
              photoInputRef={photoInputRef}
              setReportPhoto={setReportPhoto}
              setReportFormError={setReportFormError}
              setReportFormSuccess={setReportFormSuccess}
              reportSubmitting={reportSubmitting}
              reportCoords={reportCoords}
              locating={locating}
              locationMessage={locationMessage}
              onCaptureLocation={handleCaptureLocation}
              onClearLocation={handleClearLocation}
            />
          )}

          {/* ═══════════════════════════════════════════════
              NOTIFICATIONS TAB
              ═══════════════════════════════════════════════ */}
          {activeTab === 'notifications' && (
            <>
              <div className="page-header">
                <h1 className="page-title">Notifications</h1>
                <p className="page-subtitle">In-app updates about your emergency reports.</p>
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
                emptyHint="You'll be notified when responders update your incidents."
              />
            </>
          )}

          {/* ═══════════════════════════════════════════════
              INCIDENT MAP TAB
              ═══════════════════════════════════════════════ */}
          {activeTab === 'incident-map' && (
            <>
              <div className="page-header">
                <h1 className="page-title">Incident Map</h1>
                <p className="page-subtitle">
                  Locations of your emergency reports. Select a marker to inspect details and live status.
                </p>
              </div>
              <Suspense fallback={<div className="table-card" role="status" style={{ padding: 24 }}>Loading map…</div>}>
                <IncidentMap
                  incidents={incidents}
                  formatDate={formatDate}
                  onViewIncident={handleViewIncident}
                />
              </Suspense>
            </>
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

              {/* Filters & Search */}
              <div className="filter-bar">
                <div className="search-input-wrap">
                  <svg className="search-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21L16.65 16.65" />
                  </svg>
                  <input
                    type="text"
                    className="form-input search-input"
                    placeholder="Search by address, type, or notes…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search reports"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
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
                {(searchQuery || statusFilter !== 'All' || severityFilter !== 'All') && (
                  <button
                    type="button"
                    className="view-btn clear-filters-btn"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('All');
                      setSeverityFilter('All');
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Table */}
              <div className="table-wrap">
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
                      const q = searchQuery.trim().toLowerCase();
                      const filtered = incidents.filter(incident => {
                        const matchesStatus = statusFilter === 'All' || incident.status === statusFilter;
                        const matchesSeverity = severityFilter === 'All' || incident.severity === severityFilter;
                        const matchesSearch = !q || (
                          (incident.type && incident.type.toLowerCase().includes(q)) ||
                          (incident.address && incident.address.toLowerCase().includes(q)) ||
                          (incident.description && incident.description.toLowerCase().includes(q)) ||
                          (incident.incidentId && incident.incidentId.toLowerCase().includes(q))
                        );
                        return matchesStatus && matchesSeverity && matchesSearch;
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
                                <p className="table-empty-sub">
                                  {searchQuery || statusFilter !== 'All' || severityFilter !== 'All'
                                    ? 'Try adjusting your search terms or clearing your filters.'
                                    : 'You haven\'t submitted any emergency reports yet.'}
                                </p>
                                {(searchQuery || statusFilter !== 'All' || severityFilter !== 'All') && (
                                  <button
                                    type="button"
                                    className="view-btn"
                                    style={{ marginTop: 10 }}
                                    onClick={() => {
                                      setSearchQuery('');
                                      setStatusFilter('All');
                                      setSeverityFilter('All');
                                    }}
                                  >
                                    Clear all filters
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return filtered.map((incident) => (
                        <tr key={incident.incidentId}>
                          <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{incident.type}</td>
                          <td>
                            <span className={`badge badge-${incident.severity.toLowerCase()}`}>
                              {incident.severity}
                            </span>
                          </td>
                          <td
                            title={incident.address}
                            style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                          >
                            {incident.address}
                          </td>
                          <td>
                            <span className={`status-badge status-${incident.status.toLowerCase().replace(' ', '-')}`}>
                              {incident.status}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
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
                      <span className="field-value">{userData?.name || 'Not provided'}</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Email</span>
                      <span className="field-value">{user?.email}</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Phone</span>
                      <span className="field-value">{userData?.phone || 'Not provided'}</span>
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

          {/* ═══════════════════════════════════════════════
              SETTINGS TAB
              ═══════════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <>
              <div className="page-header">
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Manage your Alert24 account preferences.</p>
              </div>

              <div className="settings-page">
                {/* Appearance */}
                <div className="settings-section">
                  <div className="settings-section-title">Appearance</div>
                  <div className="settings-section-subtitle">
                    Choose how Alert24 looks for you. Your preference is saved to your account and synced across devices.
                  </div>
                  <div className="theme-picker" role="group" aria-label="Theme selection">
                    <button
                      id="theme-light-btn"
                      className={`theme-picker-btn ${theme === 'light' ? 'active' : ''}`}
                      onClick={() => onThemeChange('light')}
                      aria-pressed={theme === 'light'}
                    >
                      <span className="theme-picker-icon">☀</span>
                      Light
                    </button>
                    <button
                      id="theme-dark-btn"
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

                {/* Account info */}
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
                    <span className="settings-row-value">Reporter</span>
                  </div>
                </div>
              </div>
            </>
          )}

        </main>
      </div>

      {/* ═══════════════════════════════════════════════════
          INCIDENT DETAIL MODAL
          ═══════════════════════════════════════════════════ */}
      {/* ── View Incident Modal ── */}
      <ViewIncidentModal
        incident={viewIncident}
        statusLogs={statusLogs}
        formatDate={formatDate}
        onClose={() => setViewIncident(null)}
      />
    </div>
  );
};

export default Dashboard;
