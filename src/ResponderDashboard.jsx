import React, { useState, useEffect } from 'react';
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
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import './ResponderDashboard.css';
import backgroundImage from './images/image4.webp';

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  const day = String(date.getDate()).padStart(2, '0');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}`;
};

const ResponderDashboard = ({ onLogout, user, userData }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [errorBanner, setErrorBanner] = useState('');

  // Incidents and statuses
  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);
  const [statusLogs, setStatusLogs] = useState([]);
  const [fieldNotes, setFieldNotes] = useState('');

  // Notifications
  const [notifications, setNotifications] = useState([]);

  // Profile state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: userData?.name || '',
    phone: userData?.phone || '',
    speciality: userData?.speciality || ''
  });
  const [profileSuccess, setProfileSuccess] = useState('');

  // Fetch assigned incidents
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'incidents'),
      where('responderId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          incidentId: doc.id,
          ...doc.data()
        }));
        data.sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
        setIncidents(data);

        // Find active incident
        const active = data.find(
          (i) =>
            i.status === 'Assigned' ||
            i.status === 'En Route' ||
            i.status === 'On Scene'
        );
        setActiveIncident(active || null);
      },
      (err) => {
        console.error('Error fetching incidents:', err);
        setErrorBanner('Error loading incidents');
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Fetch status logs for active incident
  useEffect(() => {
    if (!activeIncident) {
      setStatusLogs([]);
      return;
    }

    const q = query(
      collection(db, 'statusLogs'),
      where('incidentId', '==', activeIncident.incidentId)
    );

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
      (err) => {
        console.error('Error fetching status logs:', err);
      }
    );

    return () => unsubscribe();
  }, [activeIncident]);

  // Fetch notifications
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );

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
        console.error('Error fetching notifications:', err);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Handle marking notification as read
  const markNotificationRead = async (notificationId) => {
    try {
      const notifRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifRef, { isRead: true });
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  // Handle updating status
  const handleUpdateStatus = async (newStatus) => {
    if (!activeIncident) return;

    try {
      const batch = writeBatch(db);

      // Update incident
      const incidentRef = doc(db, 'incidents', activeIncident.incidentId);
      batch.update(incidentRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      // Add status log
      const statusLogRef = doc(collection(db, 'statusLogs'));
      batch.set(statusLogRef, {
        incidentId: activeIncident.incidentId,
        status: newStatus,
        updatedBy: user.uid,
        notes: fieldNotes || '',
        timestamp: serverTimestamp()
      });

      // If resolved, update responder availability and clear active incident
      if (newStatus === 'Resolved') {
        const responderRef = doc(db, 'users', user.uid);
        batch.update(responderRef, {
          isAvailable: true,
          activeIncidentId: ''
        });

        // Notify reporter
        const reporterNotifRef = doc(collection(db, 'notifications'));
        batch.set(reporterNotifRef, {
          userId: activeIncident.reporterId,
          incidentId: activeIncident.incidentId,
          message: 'Your emergency report has been resolved',
          isRead: false,
          createdAt: serverTimestamp()
        });

        // Notify dispatcher
        // Optional: find dispatcher to notify, but let's skip for now
      }

      await batch.commit();
      setFieldNotes('');
    } catch (err) {
      console.error('Error updating status:', err);
      setErrorBanner('Error updating status: ' + err.message);
    }
  };

  // Handle saving field notes
  const handleSaveNotes = async () => {
    if (!activeIncident || !fieldNotes) return;
    try {
      await addDoc(collection(db, 'statusLogs'), {
        incidentId: activeIncident.incidentId,
        status: activeIncident.status,
        updatedBy: user.uid,
        notes: fieldNotes,
        timestamp: serverTimestamp()
      });
      setFieldNotes('');
    } catch (err) {
      console.error('Error saving notes:', err);
      setErrorBanner('Error saving notes');
    }
  };

  // Handle toggling availability
  const handleToggleAvailability = async () => {
    if (!userData) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        isAvailable: !userData.isAvailable
      });
    } catch (err) {
      console.error('Error updating availability:', err);
    }
  };

  // Handle updating profile
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

  // Calculate analytics data
  const stats = {
    total: incidents.length,
    completed: incidents.filter((i) => i.status === 'Resolved').length,
    active: incidents.filter(
      (i) =>
        i.status === 'Assigned' ||
        i.status === 'En Route' ||
        i.status === 'On Scene'
    ).length
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;


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

  return (
    <div
      className="dashboard-container"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      <nav className="top-nav">
        <div className="nav-left">
          <ShieldIcon />
          <span className="nav-title">Alert24</span>
        </div>
        <div className="nav-center">
          <span className="blinking-dot"></span>
          <span className="system-status">FIELD UNIT ACTIVE</span>
        </div>
        <div className="nav-right">
          <div className="user-info">
            <span className="user-name">{userData?.name}</span>
            <button
              className={`availability-toggle ${
                userData?.isAvailable ? 'available' : 'unavailable'
              }`}
              onClick={handleToggleAvailability}
            >
              {userData?.isAvailable ? 'Available' : 'Unavailable'}
            </button>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      {errorBanner && (
        <div
          className="error-banner"
          style={{
            position: 'fixed',
            top: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <span>{errorBanner}</span>
            <button
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f87171',
                fontSize: '20px',
                cursor: 'pointer'
              }}
              onClick={() => setErrorBanner('')}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="dashboard-main">
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-link ${
                activeTab === 'dashboard' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('dashboard')}
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
              <span>My Dashboard</span>
            </button>

            <button
              className={`sidebar-link ${
                activeTab === 'assigned-job' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('assigned-job')}
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
              <span>My Assigned Job</span>
            </button>

            <button
              className={`sidebar-link ${
                activeTab === 'job-history' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('job-history')}
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
                    d="M12 8V12L15 15"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>Job History</span>
            </button>

            <button
              className={`sidebar-link ${
                activeTab === 'profile' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('profile')}
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
              <span>My Profile</span>
            </button>

            <button
              className={`sidebar-link ${
                activeTab === 'notifications' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('notifications')}
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
                      marginLeft: '8px',
                      backgroundColor: '#c0392b',
                      color: 'white',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      borderRadius: '10px'
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

        <main className="content-area">
          {/* My Dashboard */}
          {activeTab === 'dashboard' && (
            <>
              <div className="status-banner">
                <div className="banner-left">
                  {activeIncident ? (
                    <>
                      <div className="pulsing-dot"></div>
                      <div>
                        <div className="banner-text">Active Assignment</div>
                        <div style={{ color: '#e2e8f0', marginTop: '4px' }}>
                          {activeIncident.type} at {activeIncident.address}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="static-dot"></div>
                      <div className="banner-text-muted">No Active Assignment</div>
                    </>
                  )}
                </div>
                {activeIncident && (
                  <button
                    className="banner-btn"
                    onClick={() => setActiveTab('assigned-job')}
                  >
                    Go to Job
                  </button>
                )}
              </div>

              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-icon blue"></div>
                  <div className="stat-number">
                    {typeof stats.total === 'number' ? stats.total : '--'}
                  </div>
                  <div className="stat-label">Total Jobs Handled</div>
                  <div className="stat-accent blue"></div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon green"></div>
                  <div className="stat-number">
                    {typeof stats.completed === 'number' ? stats.completed : '--'}
                  </div>
                  <div className="stat-label">Completed</div>
                  <div className="stat-accent green"></div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon yellow"></div>
                  <div className="stat-number">
                    {typeof stats.active === 'number' ? stats.active : '--'}
                  </div>
                  <div className="stat-label">Active Now</div>
                  <div className="stat-accent yellow"></div>
                </div>
              </div>

              <div className="two-col-row">
                <div className="table-card">
                  <h2 className="card-title">Recent Job History</h2>
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.length > 0 ? (
                        incidents.slice(0, 5).map((incident, index) => (
                          <tr
                            key={incident.incidentId}
                            className={index % 2 === 1 ? 'table-row-alt' : ''}
                          >
                            <td>{incident.type}</td>
                            <td>
                              <span
                                className={`badge badge-${incident.severity.toLowerCase()}`}
                              >
                                {incident.severity}
                              </span>
                            </td>
                            <td>{incident.address}</td>
                            <td>
                              <span
                                className={`status-badge status-${incident.status
                                  .toLowerCase()
                                  .replace(' ', '-')}`}
                              >
                                {incident.status}
                              </span>
                            </td>
                            <td>{formatDate(incident.createdAt)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No jobs assigned yet</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* My Jobs by Status Pie Chart */}
                  <h2 className="card-title" style={{ marginTop: '24px' }}>
                    My Jobs by Status
                  </h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={(() => {
                          const counts = {};
                          incidents.forEach((i) => {
                            counts[i.status] = (counts[i.status] || 0) + 1;
                          });
                          return Object.entries(counts).map(([name, value]) => ({
                            name,
                            value
                          }));
                        })()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {(() => {
                          const colors = {
                            Reported: '#475569',
                            Assigned: '#2563eb',
                            'En Route': '#7c3aed',
                            'On Scene': '#d97706',
                            Resolved: '#16a34a'
                          };
                          const counts = {};
                          incidents.forEach((i) => {
                            counts[i.status] = (counts[i.status] || 0) + 1;
                          });
                          return Object.entries(counts).map(([status]) => (
                            <Cell
                              key={`cell-${status}`}
                              fill={colors[status] || '#64748b'}
                            />
                          ));
                        })()}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Notifications Panel */}
                <div className="activity-card">
                  <h2 className="card-title">Notifications</h2>
                  <div className="activity-list">
                    {notifications.length > 0 ? (
                      notifications.map((notif) => (
                        <div
                          key={notif.notificationId}
                          className={`activity-item ${
                            !notif.isRead ? 'unread' : ''
                          }`}
                          onClick={() => markNotificationRead(notif.notificationId)}
                        >
                          <div
                            className="activity-dot"
                            style={{
                              backgroundColor: notif.isRead ? '#475569' : '#c0392b'
                            }}
                          ></div>
                          <div className="activity-content">
                            <div className="activity-text">{notif.message}</div>
                            <div className="activity-time">
                              {formatDate(notif.createdAt)}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="no-notifications">No notifications yet</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* My Assigned Job */}
          {activeTab === 'assigned-job' && (
            <>
              {activeIncident ? (
                <div className="form-card full-width">
                  <h2 className="card-title">Active Assignment Details</h2>
                  <div className="incident-details">
                    <div className="detail-row">
                      <span className="detail-label">Type</span>
                      <span className="detail-value">{activeIncident.type}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Severity</span>
                      <span
                        className={`badge badge-${activeIncident.severity.toLowerCase()}`}
                      >
                        {activeIncident.severity}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Address</span>
                      <span className="detail-value">{activeIncident.address}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Reporter Name</span>
                      <span className="detail-value">
                        {activeIncident.reporterName}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Description</span>
                      <span className="detail-value">
                        {activeIncident.description}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Current Status</span>
                      <span
                        className={`status-badge status-${activeIncident.status
                          .toLowerCase()
                          .replace(' ', '-')}`}
                      >
                        {activeIncident.status}
                      </span>
                    </div>
                    {activeIncident.photoUrl && (
                      <div className="detail-row">
                        <span className="detail-label">Photo</span>
                        <img
                          src={activeIncident.photoUrl}
                          alt="Incident"
                          className="incident-photo"
                        />
                      </div>
                    )}
                  </div>

                  {/* Status Update Panel */}
                  <div className="status-update-panel">
                    <h3 className="status-logs-title">Update Status</h3>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                      {activeIncident.status === 'Assigned' && (
                        <button
                          className="submit-btn"
                          onClick={() => handleUpdateStatus('En Route')}
                        >
                          I Am En Route
                        </button>
                      )}
                      {activeIncident.status === 'En Route' && (
                        <button
                          className="submit-btn"
                          onClick={() => handleUpdateStatus('On Scene')}
                        >
                          I Am On Scene
                        </button>
                      )}
                      {activeIncident.status === 'On Scene' && (
                        <button
                          className="submit-btn"
                          onClick={() => handleUpdateStatus('Resolved')}
                        >
                          Mark As Resolved
                        </button>
                      )}
                    </div>

                    <div className="profile-field">
                      <span className="field-label">Field Notes</span>
                      <textarea
                        className="form-input textarea"
                        value={fieldNotes}
                        onChange={(e) => setFieldNotes(e.target.value)}
                        placeholder="Enter notes here..."
                      ></textarea>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                      <button className="submit-btn" onClick={handleSaveNotes}>
                        Save Notes
                      </button>
                    </div>
                  </div>

                  {/* Status History */}
                  <h3 className="status-logs-title">Status History</h3>
                  <div className="status-logs">
                    {statusLogs.length > 0 ? (
                      statusLogs.map((log) => (
                        <div key={log.logId} className="status-log-item">
                          <span
                            className={`badge badge-${log.status.toLowerCase().replace(
                              ' ',
                              '-'
                            )}`}
                          >
                            {log.status}
                          </span>
                          <span className="log-notes">{log.notes}</span>
                          <span className="log-time">{formatDate(log.timestamp)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="no-notifications">No status updates yet</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="table-card">
                  <h2 className="card-title">No Active Assignment</h2>
                  <div className="no-notifications">
                    You don't have any active assignments right now.
                  </div>
                </div>
              )}
            </>
          )}

          {/* Job History */}
          {activeTab === 'job-history' && (
            <div className="table-card">
              <h2 className="card-title">Job History</h2>
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.length > 0 ? (
                    incidents.map((incident, index) => (
                      <tr
                        key={incident.incidentId}
                        className={index % 2 === 1 ? 'table-row-alt' : ''}
                      >
                        <td>{incident.type}</td>
                        <td>
                          <span
                            className={`badge badge-${incident.severity.toLowerCase()}`}
                          >
                            {incident.severity}
                          </span>
                        </td>
                        <td>{incident.address}</td>
                        <td>
                          <span
                            className={`status-badge status-${incident.status
                              .toLowerCase()
                              .replace(' ', '-')}`}
                          >
                            {incident.status}
                          </span>
                        </td>
                        <td>{formatDate(incident.createdAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">No jobs assigned yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* My Profile */}
          {activeTab === 'profile' && (
            <div className="form-card full-width">
              <h2 className="card-title">My Profile</h2>
              {profileSuccess && (
                <div className="success-banner">{profileSuccess}</div>
              )}
              {!editingProfile ? (
                <div className="profile-content">
                  <div className="profile-field">
                    <span className="field-label">Name</span>
                    <span className="field-value">{userData?.name}</span>
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Email</span>
                    <span className="field-value">{user?.email}</span>
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Phone</span>
                    <span className="field-value">
                      {userData?.phone || 'Not set'}
                    </span>
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Speciality</span>
                    <span className="field-value">
                      {userData?.speciality || 'Not set'}
                    </span>
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Role</span>
                    <span className="field-value">Responder</span>
                  </div>
                  <button
                    className="edit-btn"
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
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} className="profile-content">
                  <div className="profile-field">
                    <span className="field-label">Name</span>
                    <input
                      type="text"
                      className="form-input"
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Phone</span>
                    <input
                      type="text"
                      className="form-input"
                      value={profileForm.phone}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="profile-field">
                    <span className="field-label">Speciality</span>
                    <input
                      type="text"
                      className="form-input"
                      value={profileForm.speciality}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, speciality: e.target.value })
                      }
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                    <button type="submit" className="submit-btn">
                      Save Changes
                    </button>
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => setEditingProfile(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="activity-card">
              <h2 className="card-title">Notifications</h2>
              <div className="activity-list">
                {notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <div
                      key={notif.notificationId}
                      className={`activity-item ${!notif.isRead ? 'unread' : ''}`}
                      onClick={() => markNotificationRead(notif.notificationId)}
                    >
                      <div
                        className="activity-dot"
                        style={{
                          backgroundColor: notif.isRead ? '#475569' : '#c0392b'
                        }}
                      ></div>
                      <div className="activity-content">
                        <div className="activity-text">{notif.message}</div>
                        <div className="activity-time">{formatDate(notif.createdAt)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-notifications">No notifications yet</div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ResponderDashboard;
