import React, { useState, useEffect, Suspense, lazy } from 'react';
import { db } from './firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import './ResponderDashboard.css';
import backgroundImage from './images/image4.webp';
import IncidentImage from './components/IncidentImage';
import ResolveIncidentModal from './components/responder/ResolveIncidentModal';
import { getIncidentImageUrl } from './utils/imageUtils';
import { canTransition, friendlyFirestoreError } from './utils/incidentLifecycle';
import NotificationCenter from './components/notifications/NotificationCenter';
import useNotifications from './hooks/useNotifications';
import { queueProgressNotifications } from './utils/notifications';
import { generateIncidentReportPDF } from './utils/pdfExport';

// Leaflet map is lazy-loaded: only downloaded when the map tab is opened
const IncidentMap = lazy(() => import('./components/map/IncidentMap'));

/* ── Helpers ── */
const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  const day = String(date.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}`;
};

/* ── Reusable SVG icon components (matching Dispatcher style) ── */
const IconShield = ({ size = 24, className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2L3 7V12C3 16.5 6.84 20.74 12 22C17.16 20.74 21 16.5 21 12V7L12 2Z" fill="currentColor" />
    <path d="M12 8V14M12 16V17" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconHome = () => (
  <svg className="rd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9L12 2L21 9V20C21 20.5 20.79 21.04 20.41 21.41C20.04 21.79 19.5 22 19 22H5C4.47 22 3.96 21.79 3.59 21.41C3.21 21.04 3 20.5 3 20V9Z"/>
    <path d="M9 22V12H15V22"/>
  </svg>
);

const IconFlame = () => (
  <svg className="rd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>
  </svg>
);

const IconMap = () => (
  <svg className="rd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconClock = () => (
  <svg className="rd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8V12L15 15"/>
  </svg>
);

const IconUser = () => (
  <svg className="rd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconBell = () => (
  <svg className="rd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8.5C18 5.46 15.54 3 12.5 3S7 5.46 7 8.5c0 3-1.5 5-1.5 5h13s-1.5-2-1.5-5zM15 17a3 3 0 11-6 0"/>
  </svg>
);

const IconMapPin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);

const IconCheck = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconSettingsGear = () => (
  <svg className="rd-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

/* ── Severity badge ── */
const SeverityBadge = ({ severity }) => {
  const cls = {
    Critical: 'rd-badge rd-badge-critical',
    Serious:  'rd-badge rd-badge-serious',
    Minor:    'rd-badge rd-badge-minor',
  }[severity] || 'rd-badge rd-badge-minor';
  return <span className={cls}>{severity}</span>;
};

/* ── Status badge ── */
const StatusBadge = ({ status }) => {
  const key = status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`rd-badge rd-badge-${key}`}>{status}</span>;
};

/* ── Status progression bar ── */
const STATUS_STEPS = ['Assigned', 'En Route', 'On Scene', 'Resolved'];

const StatusProgression = ({ currentStatus }) => {
  const currentIndex = STATUS_STEPS.indexOf(currentStatus);
  return (
    <div className="rd-status-progression">
      <div className="rd-progression-label">Response Progress</div>
      <div className="rd-progression-steps">
        {STATUS_STEPS.map((step, index) => {
          const isDone    = index < currentIndex;
          const isCurrent = index === currentIndex;
          const stepClass = isDone ? 'done' : isCurrent ? 'current' : '';
          const connClass = index < currentIndex ? 'done' : '';
          return (
            <React.Fragment key={step}>
              <div className={`rd-prog-step ${stepClass}`}>
                <div className="rd-prog-dot">
                  {isDone && <IconCheck />}
                </div>
                <span className="rd-prog-step-name">{step}</span>
              </div>
              {index < STATUS_STEPS.length - 1 && (
                <div className={`rd-prog-connector ${connClass}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   RESPONDER DASHBOARD COMPONENT
   ════════════════════════════════════════════════════════════ */
const ResponderDashboard = ({ onLogout, user, userData, theme, onThemeChange }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [errorBanner, setErrorBanner] = useState('');

  // Incidents and statuses
  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);
  const [statusLogs, setStatusLogs] = useState([]);
  const [fieldNotes, setFieldNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportPDFError, setExportPDFError] = useState('');

  // Notifications (shared real-time hook)
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
  } = useNotifications(user, 'responder');

  // Profile state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: userData?.name || '',
    phone: userData?.phone || '',
    speciality: userData?.speciality || ''
  });
  const [profileSuccess, setProfileSuccess] = useState('');

  // History search and filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historySeverityFilter, setHistorySeverityFilter] = useState('all');

  // Resolution confirmation modal state
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');

  /* ── Fetch assigned incidents ── */
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'incidents'), where('responderId', '==', user.uid));
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
        const active = data.find(
          (i) => i.status === 'Assigned' || i.status === 'En Route' || i.status === 'On Scene'
        );
        setActiveIncident(active || null);
      },
      (err) => {
        console.error('Error fetching incidents:', err);
        setErrorBanner('Error loading incidents');
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [user]);

  /* ── Fetch status logs for active incident ── */
  useEffect(() => {
    if (!activeIncident) { setStatusLogs([]); return; }
    const q = query(collection(db, 'statusLogs'), where('incidentId', '==', activeIncident.incidentId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((doc) => ({ logId: doc.id, ...doc.data() }))
          .sort((a, b) => {
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return a.timestamp.toMillis() - b.timestamp.toMillis();
          });
        setStatusLogs(data);
      },
      (err) => { console.error('Error fetching status logs:', err); }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [activeIncident]);

  /* ── Handlers ── */
  const markNotificationRead = (notificationId) => {
    const n = notifications.find((x) => x.notificationId === notificationId);
    if (n) markRead(n);
  };

  // Open the incident a notification refers to (responders only see their own assignments)
  const openNotification = (n) => {
    markRead(n);
    const incident = incidents.find((i) => i.incidentId === n.incidentId);
    if (!incident) return false;
    if (activeIncident && activeIncident.incidentId === incident.incidentId) {
      setActiveTab('assigned-job');
    } else {
      setHistoryStatusFilter('all');
      setHistorySeverityFilter('all');
      setHistorySearch(incident.incidentId);
      setActiveTab('job-history');
    }
    return true;
  };

  const handleUpdateStatus = async (newStatus, customNotes = '') => {
    if (!activeIncident) return;
    if (!canTransition(activeIncident.status, newStatus)) {
      setErrorBanner(`Invalid status change: ${activeIncident.status} → ${newStatus}`);
      return;
    }
    if (updatingStatus) return; // ignore repeated taps while a change is in flight
    setUpdatingStatus(true);
    try {
      const batch = writeBatch(db);
      const incidentRef = doc(db, 'incidents', activeIncident.incidentId);
      const incidentUpdate = { status: newStatus, updatedAt: serverTimestamp() };
      // Reliable resolution timestamp (used by the dispatcher "Resolved Today" metric)
      if (newStatus === 'Resolved') incidentUpdate.resolvedAt = serverTimestamp();
      batch.update(incidentRef, incidentUpdate);

      const notesToSave = (customNotes || fieldNotes || '').slice(0, 1000);
      const statusLogRef = doc(collection(db, 'statusLogs'));
      batch.set(statusLogRef, {
        incidentId: activeIncident.incidentId,
        status: newStatus,
        updatedBy: user.uid,
        notes: notesToSave,
        timestamp: serverTimestamp()
      });

      if (newStatus === 'Resolved') {
        const responderRef = doc(db, 'users', user.uid);
        batch.update(responderRef, { isAvailable: true, activeIncidentId: '' });
      }

      // In-app notices for the reporter and dispatchers, in the same atomic write
      queueProgressNotifications(batch, db, activeIncident, newStatus);

      await batch.commit();

      setFieldNotes('');
      setResolveNotes('');
      setShowResolveModal(false);
    } catch (err) {
      console.error('Error updating status:', err);
      setErrorBanner('Error updating status: ' + friendlyFirestoreError(err));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!activeIncident || !fieldNotes.trim()) return;
    setSavingNotes(true);
    try {
      await addDoc(collection(db, 'statusLogs'), {
        incidentId: activeIncident.incidentId,
        status: activeIncident.status,
        updatedBy: user.uid,
        notes: fieldNotes.slice(0, 1000),
        timestamp: serverTimestamp()
      });
      setFieldNotes('');
    } catch (err) {
      console.error('Error saving notes:', err);
      setErrorBanner('Error saving notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleExportIncidentPDF = async (inc = activeIncident, logs = statusLogs) => {
    if (!inc || isExportingPDF) return;
    setIsExportingPDF(true);
    setExportPDFError('');
    try {
      generateIncidentReportPDF({
        incident: inc,
        statusLogs: logs,
        userRole: 'responder',
        download: true,
      });
    } catch (err) {
      console.error('Failed to export incident PDF report:', err);
      setExportPDFError('Failed to generate PDF report. Please try again.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleToggleAvailability = async () => {
    if (!userData) return;
    // A responder with an active assignment cannot mark themselves available
    if (activeIncident || userData.activeIncidentId) {
      setErrorBanner('You have an active assignment. Resolve it before changing your availability.');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', user.uid), { isAvailable: !userData.isAvailable });
    } catch (err) {
      console.error('Error updating availability:', err);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'users', user.uid), profileForm);
      setEditingProfile(false);
      setProfileSuccess('Profile updated successfully');
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
    }
  };

  /* ── Stats ── */
  const stats = {
    total:     incidents.length,
    completed: incidents.filter((i) => i.status === 'Resolved').length,
    active:    incidents.filter(
      (i) => i.status === 'Assigned' || i.status === 'En Route' || i.status === 'On Scene'
    ).length
  };



  /* ── Filtered job history ── */
  const filteredHistory = incidents.filter((incident) => {
    const term = historySearch.trim().toLowerCase();
    const matchesSearch = !term ||
      (incident.type || '').toLowerCase().includes(term) ||
      (incident.address || '').toLowerCase().includes(term) ||
      (incident.incidentId || '').toLowerCase().includes(term) ||
      (incident.description || '').toLowerCase().includes(term);
    const matchesStatus = historyStatusFilter === 'all' || incident.status === historyStatusFilter;
    const matchesSeverity = historySeverityFilter === 'all' || incident.severity === historySeverityFilter;
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  const isHistoryFiltered = historySearch.trim() !== '' || historyStatusFilter !== 'all' || historySeverityFilter !== 'all';
  const resetHistoryFilters = () => {
    setHistorySearch('');
    setHistoryStatusFilter('all');
    setHistorySeverityFilter('all');
  };

  /* ── Sidebar nav items ── */
  const navItems = [
    { id: 'dashboard',     label: 'My Dashboard',   shortLabel: 'Home',     Icon: IconHome },
    { id: 'assigned-job',  label: 'Active Job',      shortLabel: 'Job',      Icon: IconFlame },
    { id: 'incident-map',  label: 'Incident Map',    shortLabel: 'Map',      Icon: IconMap },
    { id: 'job-history',   label: 'Job History',     shortLabel: 'History',  Icon: IconClock },
    { id: 'profile',       label: 'My Profile',      shortLabel: 'Profile',  Icon: IconUser },
    { id: 'notifications', label: 'Notifications',   shortLabel: 'Alerts',   Icon: IconBell },
    { id: 'settings',      label: 'Settings',        shortLabel: 'Settings', Icon: IconSettingsGear },
  ];

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */
  return (
    <div className="rd-shell" style={{ backgroundImage: `url(${backgroundImage})` }}>

      {/* ── Top Navigation ── */}
      <nav className="rd-topnav">
        <div className="rd-nav-brand">
          <IconShield size={24} className="rd-nav-icon" style={{ color: '#dc2626' }} />
          <span className="rd-nav-title">Alert24</span>
        </div>

        <div className="rd-nav-status">
          <span className="rd-status-dot"></span>
          <span className="rd-status-label">Field Unit Active</span>
        </div>

        <div className="rd-nav-right">
          <div className="rd-nav-user">
            <span className="rd-nav-username">{userData?.name || 'Responder'}</span>
            <button
              className={`rd-avail-toggle ${userData?.isAvailable ? 'available' : 'unavailable'}`}
              onClick={handleToggleAvailability}
              title="Toggle availability"
            >
              <span className="rd-avail-dot"></span>
              {userData?.isAvailable ? 'Available' : 'Unavailable'}
            </button>
          </div>
          <button className="rd-logout-btn" onClick={onLogout}>Sign Out</button>
        </div>
      </nav>

      {/* ── Error Banner ── */}
      {errorBanner && (
        <div className="rd-error-banner">
          <span>{errorBanner}</span>
          <button className="rd-banner-close" onClick={() => setErrorBanner('')}>×</button>
        </div>
      )}

      <div className="rd-layout">
        {/* ── Sidebar ── */}
        <aside className="rd-sidebar">
          <nav className="rd-sidebar-nav">
            {navItems.map(({ id, label, shortLabel, Icon }) => (
              <button
                key={id}
                className={`rd-sidebar-btn ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon />
                <span className="rd-sidebar-label">
                  <span className="rd-label-full">{label}</span>
                  <span className="rd-label-short">{shortLabel}</span>
                </span>
                {id === 'notifications' && unreadCount > 0 && (
                  <span className="rd-notif-badge">{unreadCount}</span>
                )}
                {id === 'assigned-job' && activeIncident && (
                  <span className="rd-notif-badge" style={{ background: '#dc2626' }}>1</span>
                )}
              </button>
            ))}
          </nav>
          <div className="rd-sidebar-footer">Alert24 Field Ops</div>
        </aside>

        {/* ── Main Content ── */}
        <main className="rd-content">

          {/* ══════════════════════════════
              DASHBOARD TAB
              ══════════════════════════════ */}
          {activeTab === 'dashboard' && (
            <>
              <div className="rd-page-header">
                <h1 className="rd-page-title">My Dashboard</h1>
                <p className="rd-page-subtitle">
                  Overview of your assignments and performance
                </p>
              </div>

              {/* Active Assignment Hero */}
              <div className="rd-assignment-hero">
                <div className="rd-hero-left">
                  {activeIncident ? (
                    <>
                      <div className="rd-hero-pulse"></div>
                      <div className="rd-hero-text">
                        <div className="rd-hero-label">Active Assignment</div>
                        <div className="rd-hero-title">{activeIncident.type}</div>
                        <div className="rd-hero-sub">
                          <IconMapPin /> {activeIncident.address}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rd-hero-idle-dot"></div>
                      <div className="rd-hero-text">
                        <span className="rd-hero-idle-label">No Active Assignment</span>
                      </div>
                    </>
                  )}
                </div>
                {activeIncident && (
                  <div className="rd-hero-action">
                    <button
                      className="rd-btn rd-btn-action"
                      onClick={() => setActiveTab('assigned-job')}
                    >
                      View Job <IconArrowRight />
                    </button>
                  </div>
                )}
              </div>

              {/* Stat Cards */}
              <div className="rd-stats-row">
                <div className="rd-stat-card blue">
                  <div className="rd-stat-icon-wrap blue">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                    </svg>
                  </div>
                  <div className="rd-stat-num">{stats.total}</div>
                  <div className="rd-stat-lbl">Total Jobs Handled</div>
                </div>

                <div className="rd-stat-card green">
                  <div className="rd-stat-icon-wrap green">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <div className="rd-stat-num">{stats.completed}</div>
                  <div className="rd-stat-lbl">Completed</div>
                </div>

                <div className="rd-stat-card amber">
                  <div className="rd-stat-icon-wrap amber">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  </div>
                  <div className="rd-stat-num">{stats.active}</div>
                  <div className="rd-stat-lbl">Active Now</div>
                </div>
              </div>

              {/* Two-column dashboard grid */}
              <div className="rd-dashboard-grid">
                {/* Recent Job History */}
                <div className="rd-card">
                  <div className="rd-card-header">
                    <h2 className="rd-card-title">Recent Job History</h2>
                    <span className="rd-card-meta">Last {Math.min(incidents.length, 5)} of {incidents.length}</span>
                  </div>
                  <div className="rd-table-wrap">
                    <table className="rd-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Severity</th>
                          <th>Location</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.length > 0 ? (
                          incidents.slice(0, 5).map((incident) => (
                            <tr key={incident.incidentId}>
                              <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{incident.type}</td>
                              <td><SeverityBadge severity={incident.severity} /></td>
                              <td title={incident.address} style={{ color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{incident.address}</td>
                              <td><StatusBadge status={incident.status} /></td>
                              <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(incident.createdAt)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr className="rd-table-empty">
                            <td colSpan="5">No jobs assigned yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Notifications Panel */}
                <div className="rd-card">
                  <div className="rd-card-header">
                    <h2 className="rd-card-title">Notifications</h2>
                    {unreadCount > 0 && (
                      <span className="rd-card-meta" style={{ color: '#ef4444' }}>{unreadCount} unread</span>
                    )}
                  </div>
                  <div className="rd-notif-list">
                    {notifications.length > 0 ? (
                      notifications.slice(0, 6).map((notif) => (
                        <div
                          key={notif.notificationId}
                          className={`rd-notif-item ${!notif.isRead ? 'unread' : ''}`}
                          onClick={() => markNotificationRead(notif.notificationId)}
                        >
                          <span className={`rd-notif-dot ${!notif.isRead ? 'unread' : 'read'}`}></span>
                          <div className="rd-notif-body">
                            <div className="rd-notif-msg">{notif.message}</div>
                            <div className="rd-notif-time">{formatDate(notif.createdAt)}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rd-notif-empty">No notifications yet</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════
              ACTIVE JOB TAB
              ══════════════════════════════ */}
          {activeTab === 'assigned-job' && (
            <>
              <div className="rd-page-header">
                <h1 className="rd-page-title">Active Job</h1>
                <p className="rd-page-subtitle">
                  {activeIncident
                    ? 'Your current emergency assignment'
                    : 'No active assignment at this time'}
                </p>
              </div>

              {activeIncident ? (
                <div className="rd-card">
                  {/* Assignment header */}
                  <div className="rd-assignment-header">
                    <div className="rd-assignment-title-block">
                      <div className="rd-assignment-eyebrow">Active Assignment</div>
                      <div className="rd-assignment-title">{activeIncident.type}</div>
                      <div className="rd-assignment-location">
                        <IconMapPin /> {activeIncident.address}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <SeverityBadge severity={activeIncident.severity} />
                      <StatusBadge status={activeIncident.status} />
                      <button
                        type="button"
                        className="rd-btn rd-btn-ghost rd-btn-sm"
                        onClick={() => handleExportIncidentPDF(activeIncident, statusLogs)}
                        disabled={isExportingPDF}
                        aria-busy={isExportingPDF}
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        title="Download official PDF report for this incident"
                      >
                        {isExportingPDF ? 'Generating…' : '📄 PDF Report'}
                      </button>
                    </div>
                  </div>

                  {exportPDFError && (
                    <div className="rd-alert rd-alert-error" style={{ margin: '10px 0' }}>
                      {exportPDFError}
                    </div>
                  )}

                  {/* Status progression */}
                  <StatusProgression currentStatus={activeIncident.status} />

                  {/* Details grid */}
                  <div className="rd-detail-grid">
                    <div className="rd-detail-item">
                      <span className="rd-detail-label">Incident Type</span>
                      <span className="rd-detail-value" style={{ fontWeight: 600 }}>{activeIncident.type}</span>
                    </div>
                    <div className="rd-detail-item">
                      <span className="rd-detail-label">Severity</span>
                      <div style={{ marginTop: 3 }}><SeverityBadge severity={activeIncident.severity} /></div>
                    </div>
                    <div className="rd-detail-item">
                      <span className="rd-detail-label">Current Status</span>
                      <div style={{ marginTop: 3 }}><StatusBadge status={activeIncident.status} /></div>
                    </div>
                    <div className="rd-detail-item">
                      <span className="rd-detail-label">Reported By</span>
                      <span className="rd-detail-value">{activeIncident.reporterName}</span>
                    </div>
                    <div className="rd-detail-item full-width">
                      <span className="rd-detail-label">Location</span>
                      <span className="rd-detail-value">{activeIncident.address}</span>
                    </div>
                    <div className="rd-detail-item full-width">
                      <span className="rd-detail-label">Description</span>
                      <span className="rd-detail-value" style={{ lineHeight: 1.6 }}>{activeIncident.description}</span>
                    </div>
                    {getIncidentImageUrl(activeIncident) && (
                      <div className="rd-detail-item full-width">
                        <span className="rd-detail-label">Photo</span>
                        <IncidentImage
                          incident={activeIncident}
                          className="rd-incident-photo"
                          alt="Incident photo"
                        />
                      </div>
                    )}
                  </div>

                  <div className="rd-divider"></div>

                  {/* Status Update Panel */}
                  <div className="rd-status-panel">
                    <div className="rd-status-panel-label">Update Status</div>
                    <div className="rd-status-current">
                      Currently: <StatusBadge status={activeIncident.status} />
                    </div>
                    <div className="rd-status-actions">
                      {activeIncident.status === 'Assigned' && (
                        <button
                          className="rd-btn rd-btn-primary"
                          onClick={() => handleUpdateStatus('En Route')}
                          disabled={updatingStatus}
                        >
                          {updatingStatus ? 'Updating…' : 'I Am En Route'}
                        </button>
                      )}
                      {activeIncident.status === 'En Route' && (
                        <button
                          className="rd-btn rd-btn-primary"
                          onClick={() => handleUpdateStatus('On Scene')}
                          disabled={updatingStatus}
                        >
                          {updatingStatus ? 'Updating…' : 'I Am On Scene'}
                        </button>
                      )}
                      {activeIncident.status === 'On Scene' && (
                        <button
                          className="rd-btn rd-btn-action"
                          onClick={() => setShowResolveModal(true)}
                          disabled={updatingStatus}
                        >
                          Mark As Resolved
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Field Notes */}
                  <div className="rd-notes-section">
                    <label className="rd-notes-label">Field Notes</label>
                    <textarea
                      className="rd-textarea"
                      value={fieldNotes}
                      onChange={(e) => setFieldNotes(e.target.value)}
                      placeholder="Enter observations, updates, or field notes here…"
                      rows={4}
                    />
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="rd-btn rd-btn-ghost"
                        onClick={handleSaveNotes}
                        disabled={!fieldNotes.trim() || savingNotes}
                      >
                        {savingNotes ? 'Saving…' : 'Save Notes'}
                      </button>
                    </div>
                  </div>

                  <div className="rd-divider"></div>

                  {/* Status History Timeline */}
                  <div className="rd-section-label">Status History</div>
                  <div className="rd-timeline">
                    {statusLogs.length === 0 ? (
                      <div className="rd-timeline-empty">No status updates recorded yet</div>
                    ) : (
                      statusLogs.map((log) => (
                        <div key={log.logId} className="rd-timeline-item">
                          <div className="rd-timeline-spine">
                            <div className="rd-timeline-dot"></div>
                            <div className="rd-timeline-line"></div>
                          </div>
                          <div className="rd-timeline-body">
                            <div className="rd-timeline-status">
                              <StatusBadge status={log.status} />
                            </div>
                            {log.notes && (
                              <div className="rd-timeline-notes">{log.notes}</div>
                            )}
                            <div className="rd-timeline-time">{formatDate(log.timestamp)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="rd-card">
                  <div className="rd-empty-state">
                    <div className="rd-empty-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16v.01"/>
                      </svg>
                    </div>
                    <div className="rd-empty-title">No Active Assignment</div>
                    <div className="rd-empty-sub">
                      You don't have any active assignments right now. The dispatcher will assign you to an incident when needed.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════
              INCIDENT MAP TAB
              ══════════════════════════════ */}
          {activeTab === 'incident-map' && (
            <>
              <div className="rd-page-header">
                <h1 className="rd-page-title">Incident Map</h1>
                <p className="rd-page-subtitle">
                  Locations of your assigned emergency incidents. Select a marker to inspect details or navigate to your job.
                </p>
              </div>
              <Suspense fallback={<div className="rd-card" role="status" style={{ padding: 24 }}>Loading map…</div>}>
                <IncidentMap
                  incidents={incidents}
                  formatDate={formatDate}
                  onViewIncident={(incident) => {
                    if (activeIncident && incident.incidentId === activeIncident.incidentId) {
                      setActiveTab('assigned-job');
                    } else {
                      setHistorySearch(incident.type || incident.address || '');
                      setActiveTab('job-history');
                    }
                  }}
                />
              </Suspense>
            </>
          )}

          {/* ══════════════════════════════
              JOB HISTORY TAB
              ══════════════════════════════ */}
          {activeTab === 'job-history' && (
            <>
              <div className="rd-page-header">
                <h1 className="rd-page-title">Job History</h1>
                <p className="rd-page-subtitle">
                  {incidents.length} total assignment{incidents.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
                  <span style={{ color: theme === 'light' ? '#15803d' : '#4ade80', fontWeight: 600 }}>{stats.completed} resolved</span>
                </p>
              </div>

              {/* Filter & Search Bar */}
              <div className="rd-filter-bar">
                <div className="rd-search-wrap">
                  <svg className="rd-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="rd-search-input"
                    placeholder="Search by type, location, ID, or keywords…"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    aria-label="Search job history"
                  />
                  {historySearch && (
                    <button
                      className="rd-search-clear"
                      onClick={() => setHistorySearch('')}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="rd-filter-group">
                  <select
                    className="rd-select"
                    value={historyStatusFilter}
                    onChange={(e) => setHistoryStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Resolved">Resolved</option>
                    <option value="On Scene">On Scene</option>
                    <option value="En Route">En Route</option>
                    <option value="Assigned">Assigned</option>
                  </select>

                  <select
                    className="rd-select"
                    value={historySeverityFilter}
                    onChange={(e) => setHistorySeverityFilter(e.target.value)}
                    aria-label="Filter by severity"
                  >
                    <option value="all">All Severities</option>
                    <option value="Critical">Critical</option>
                    <option value="Serious">Serious</option>
                    <option value="Minor">Minor</option>
                  </select>

                  {isHistoryFiltered && (
                    <button
                      className="rd-btn rd-btn-ghost rd-filter-reset-btn"
                      onClick={resetHistoryFilters}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="rd-card">
                <div className="rd-table-wrap">
                  <table className="rd-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.length > 0 ? (
                        filteredHistory.map((incident) => (
                          <tr key={incident.incidentId}>
                            <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{incident.type}</td>
                            <td><SeverityBadge severity={incident.severity} /></td>
                            <td title={incident.address} style={{ color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{incident.address}</td>
                            <td><StatusBadge status={incident.status} /></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(incident.createdAt)}</td>
                          </tr>
                        ))
                      ) : incidents.length > 0 ? (
                        <tr className="rd-table-empty">
                          <td colSpan="5">
                            <div className="rd-empty-filtered">
                              <p>No assignments match your search or filter criteria.</p>
                              <button
                                className="rd-btn rd-btn-secondary"
                                onClick={resetHistoryFilters}
                                style={{ marginTop: 8 }}
                              >
                                Clear Filters
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr className="rd-table-empty">
                          <td colSpan="5">No jobs assigned yet</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════
              PROFILE TAB
              ══════════════════════════════ */}
          {activeTab === 'profile' && (
            <>
              <div className="rd-page-header">
                <h1 className="rd-page-title">My Profile</h1>
                <p className="rd-page-subtitle">View and update your responder information</p>
              </div>
              <div className="rd-card">
                {profileSuccess && (
                  <div className="rd-success-banner">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {profileSuccess}
                  </div>
                )}

                {!editingProfile ? (
                  <>
                    <div className="rd-profile-grid">
                      <div className="rd-profile-field">
                        <span className="rd-profile-label">Full Name</span>
                        <span className="rd-profile-value">{userData?.name || 'Not provided'}</span>
                      </div>
                      <div className="rd-profile-field">
                        <span className="rd-profile-label">Email</span>
                        <span className="rd-profile-value">{user?.email}</span>
                      </div>
                      <div className="rd-profile-field">
                        <span className="rd-profile-label">Phone</span>
                        <span className="rd-profile-value">{userData?.phone || 'Not set'}</span>
                      </div>
                      <div className="rd-profile-field">
                        <span className="rd-profile-label">Speciality</span>
                        <span className="rd-profile-value">{userData?.speciality || 'Not set'}</span>
                      </div>
                      <div className="rd-profile-field">
                        <span className="rd-profile-label">Role</span>
                        <span className="rd-profile-value">Responder</span>
                      </div>
                      <div className="rd-profile-field">
                        <span className="rd-profile-label">Availability</span>
                        <div style={{ marginTop: 3 }}>
                          <span className={`rd-badge ${userData?.isAvailable ? 'rd-badge-resolved' : 'rd-badge-reported'}`}>
                            {userData?.isAvailable ? 'Available' : 'Unavailable'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="rd-btn rd-btn-primary"
                      onClick={() => {
                        setProfileForm({
                          name: userData?.name || '',
                          phone: userData?.phone || '',
                          speciality: userData?.speciality || ''
                        });
                        setEditingProfile(true);
                      }}
                    >
                      Edit Profile
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleSaveProfile}>
                    <div className="rd-form-field">
                      <label className="rd-form-label">Full Name</label>
                      <input
                        type="text"
                        className="rd-input"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        placeholder="Your full name"
                      />
                    </div>
                    <div className="rd-form-field">
                      <label className="rd-form-label">Phone</label>
                      <input
                        type="tel"
                        className="rd-input"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="+27 00 000 0000"
                      />
                    </div>
                    <div className="rd-form-field">
                      <label className="rd-form-label">Speciality</label>
                      <input
                        type="text"
                        className="rd-input"
                        value={profileForm.speciality}
                        onChange={(e) => setProfileForm({ ...profileForm, speciality: e.target.value })}
                        placeholder="e.g. Paramedic, Firefighter, Police"
                      />
                    </div>
                    <div className="rd-form-actions">
                      <button type="submit" className="rd-btn rd-btn-primary">Save Changes</button>
                      <button
                        type="button"
                        className="rd-btn rd-btn-secondary"
                        onClick={() => setEditingProfile(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════
              NOTIFICATIONS TAB
              ══════════════════════════════ */}
          {activeTab === 'notifications' && (
            <>
              <div className="rd-page-header">
                <h1 className="rd-page-title">Notifications</h1>
                <p className="rd-page-subtitle">In-app updates about your assignments.</p>
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
                emptyHint="You will be notified here when a dispatcher assigns you an incident."
              />
            </>
          )}

          {/* ══════════════════════════════
              SETTINGS TAB
              ══════════════════════════════ */}
          {activeTab === 'settings' && (
            <>
              <div className="rd-page-header">
                <h1 className="rd-page-title">Settings</h1>
                <p className="rd-page-subtitle">Manage your Alert24 account preferences.</p>
              </div>

              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-title">Appearance</div>
                  <div className="settings-section-subtitle">
                    Choose how Alert24 looks for you. Your preference is saved to your account and synced across devices.
                  </div>
                  <div className="theme-picker" role="group" aria-label="Theme selection">
                    <button
                      id="rd-theme-light-btn"
                      className={`theme-picker-btn ${theme === 'light' ? 'active' : ''}`}
                      onClick={() => onThemeChange('light')}
                      aria-pressed={theme === 'light'}
                    >
                      <span className="theme-picker-icon">☀</span>
                      Light
                    </button>
                    <button
                      id="rd-theme-dark-btn"
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
                    <span className="settings-row-value">Responder</span>
                  </div>
                </div>
              </div>
            </>
          )}

        </main>
      </div>

      {/* ── Resolve Confirmation Modal ── */}
      <ResolveIncidentModal
        isOpen={showResolveModal && !!activeIncident}
        activeIncident={activeIncident}
        resolveNotes={resolveNotes}
        setResolveNotes={setResolveNotes}
        onClose={() => setShowResolveModal(false)}
        onConfirm={(notes) => handleUpdateStatus('Resolved', notes)}
        updatingStatus={updatingStatus}
      />
    </div>
  );
};

export default ResponderDashboard;
