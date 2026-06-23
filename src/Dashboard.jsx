import React, { useState, useEffect } from 'react';
import { auth, db, storage } from './firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  setDoc
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from 'firebase/storage';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import './Dashboard.css';
import backgroundImage from './images/image4.jpg';

const Dashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

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

  // Authentication guard
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

      // Get user data from Firestore
      const userDocRef = doc(db, 'users', currentUser.uid);

      unsubscribeUser = onSnapshot(userDocRef, async (docSnap) => {
        try {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);

            // Check role
            if (data.role !== 'reporter' && data.role !== 'responder' && data.role !== 'dispatcher') {
              setAuthError('Access denied. Invalid role.');
              signOut(auth);
            } else {
              setAuthError('');
            }
          } else {
            // User document doesn't exist yet - try to create it
            console.log('User document not found, creating it...');
            await setDoc(userDocRef, {
              uid: currentUser.uid,
              name: currentUser.displayName || 'User',
              email: currentUser.email,
              phone: '',
              role: 'reporter',
              createdAt: serverTimestamp()
            });
            // The onSnapshot will trigger again once the doc is created
            return;
          }
        } catch (err) {
          console.error('Error handling user data:', err);
          // Fallback to temporary data so app still works
          setUserData({
            uid: currentUser.uid,
            name: currentUser.displayName || 'User',
            email: currentUser.email,
            phone: '',
            role: 'reporter',
            createdAt: null
          });
        }
        setLoading(false);
      }, (err) => {
        console.error('Error fetching user data:', err);
        // Fallback to temporary data so app still works
        setUserData({
          uid: currentUser.uid,
          name: currentUser.displayName || 'User',
          email: currentUser.email,
          phone: '',
          role: 'reporter',
          createdAt: null
        });
        setLoading(false);
      });
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  // Fetch incidents and calculate stats
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
    }, (err) => {
      console.error('Error fetching incidents:', err);
      alert('Error fetching incidents: ' + err.message);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch active incident
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'incidents'),
      where('reporterId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Get all non-resolved incidents and sort by createdAt (newest first)
      const activeIncidents = snapshot.docs
        .map(doc => ({ incidentId: doc.id, ...doc.data() }))
        .filter(incident => incident.status !== 'Resolved')
        .sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });

      if (activeIncidents.length > 0) {
        setActiveIncident(activeIncidents[0]);
      } else {
        setActiveIncident(null);
      }
    }, (err) => {
      console.error('Error fetching active incident:', err);
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

  // Handle viewing incident details
  const handleViewIncident = async (incident) => {
    setViewIncident(incident);

    // Fetch status logs
    const q = query(
      collection(db, 'statusLogs'),
      where('incidentId', '==', incident.incidentId),
      orderBy('timestamp', 'desc')
    );

    onSnapshot(q, (snapshot) => {
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

  if (loading) {
    return <div className="loading-container">Loading...</div>;
  }

  if (authError) {
    return <div className="error-container">{authError}</div>;
  }

  return (
    <div className="dashboard-container" style={{ backgroundImage: `url(${backgroundImage})` }}>
      {/* Top Navigation Bar */}
      <nav className="top-nav">
        <div className="nav-left">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L3 7V12C3 16.5 6.84 20.74 12 22C17.16 20.74 21 16.5 21 12V7L12 2Z" fill="#c0392b" />
            <path d="M12 8V14" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 16V17" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="nav-title">Alert24</span>
        </div>

        <div className="nav-center">
          <span className="blinking-dot"></span>
          <span className="system-status">SYSTEM ACTIVE</span>
        </div>

        <div className="nav-right">
          <div className="user-info">
            <span className="user-name">{userData?.name || 'User'}</span>
            <span className="user-email">{user?.email}</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div className="dashboard-main">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span className="link-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 22V12H15V22" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Dashboard</span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'report' ? 'active' : ''}`}
              onClick={() => setActiveTab('report')}
            >
              <span className="link-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C12 2 8 6 8 12C8 14.1217 8.84285 16.1566 10.3431 17.6569C11.8434 19.1571 13.8783 20 16 20C18.1217 20 20.1566 19.1571 21.6569 17.6569C23.1571 16.1566 24 14.1217 24 12C24 6 20 2 20 2" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 16C16 14.9391 16.4214 13.9217 17.1716 13.1716C17.9217 12.4214 18.9391 12 20 12" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Report Emergency</span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'myReports' ? 'active' : ''}`}
              onClick={() => setActiveTab('myReports')}
            >
              <span className="link-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 2V8H20" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 13H8" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                  <path d="M16 17H8" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span>My Reports</span>
            </button>
            <button
              className={`sidebar-link ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <span className="link-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>My Profile</span>
            </button>
          </nav>
          <div className="sidebar-footer">
            <span>Alert24 v1.0</span>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="content-area">
          {activeTab === 'dashboard' && (
            <>
              {/* Status Banner */}
              <div className="status-banner">
                <div className="banner-left">
                  {activeIncident ? (
                    <>
                      <div className="pulsing-dot"></div>
                      <span className="banner-text">Active Emergency — {activeIncident.type} — {activeIncident.status}</span>
                    </>
                  ) : (
                    <>
                      <div className="static-dot"></div>
                      <span className="banner-text-muted">No Active Emergency</span>
                    </>
                  )}
                </div>
                {activeIncident ? (
                  <button className="banner-btn" onClick={() => handleViewIncident(activeIncident)}>View Status</button>
                ) : (
                  <button className="banner-btn" onClick={() => setActiveTab('report')}>Report Emergency</button>
                )}
              </div>

              {/* Stats Cards */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-icon blue">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="stat-number">{stats.total}</div>
                  <div className="stat-label">Total Reports</div>
                  <div className="stat-accent blue"></div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon yellow">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 9V13" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
                      <path d="M12 17H12.01" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
                      <path d="M10.29 3.86L1.82 18C1.6583 18.2782 1.56832 18.6029 1.57189 18.9348C1.57546 19.2668 1.67229 19.5903 1.85 19.86C2.02602 20.1356 2.27553 20.3484 2.57 20.47C2.86571 20.5934 3.19559 20.6228 3.51 20.555L20.49 16.95C20.8078 16.8822 21.0961 16.7183 21.31 16.48C21.524 16.2417 21.6533 15.9417 21.68 15.62C21.7066 15.2982 21.6293 14.9766 21.46 14.7L15.71 3.86C15.5382 3.5513 15.2764 3.29518 14.96 3.12C14.6523 2.95438 14.3042 2.8824 13.95 2.915C13.5958 2.9476 13.2582 3.0832 12.98 3.31C12.6946 3.54704 12.485 3.86167 12.38 4.21C12.3236 4.3673 12.29 4.5342 12.28 4.7035C12.27 4.8728 12.2839 5.0421 12.321 5.2041C12.3581 5.3661 12.4177 5.5175 12.496 5.6511C12.5743 5.7847 12.6696 5.8981 12.776 5.9864C12.8824 6.0747 12.9976 6.1363 13.116 6.1671C13.2344 6.1979 13.3542 6.1973 13.4725 6.1653C13.5908 6.1333 13.7047 6.0707 13.8064 5.9819C13.9081 5.8931 13.9946 5.7803 14.06 5.6511C14.1254 5.5219 14.1672 5.3793 14.182 5.2329C14.1968 5.0865 14.1844 4.939 14.1454 4.7985C14.1064 4.658 14.0417 4.5269 13.955 4.4128C13.8683 4.2987 13.7613 4.2042 13.64 4.135C13.5187 4.0658 13.3859 4.0235 13.25 4.01C13.1141 3.9965 12.9795 4.0128 12.851 4.0578C12.7225 4.1028 12.6031 4.1753 12.5 4.27C12.42 4.13 12.35 3.98 12.29 3.86Z" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="stat-number">{stats.pending}</div>
                  <div className="stat-label">Pending</div>
                  <div className="stat-accent yellow"></div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon orange">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="stat-number">{stats.inProgress}</div>
                  <div className="stat-label">In Progress</div>
                  <div className="stat-accent orange"></div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon green">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22 11.08V12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2C12.56 2 13.09 2.04 13.6 2.13" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22 4L12 14.01L9 11.01" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="stat-number">{stats.resolved}</div>
                  <div className="stat-label">Resolved</div>
                  <div className="stat-accent green"></div>
                </div>
              </div>

              <div className="two-col-row">
                {/* Recent Reports Table */}
                <div className="table-card">
                  <h2 className="card-title">Recent Reports</h2>
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
                        incidents.slice(0, 5).map((incident, index) => (
                          <tr key={incident.incidentId} className={index % 2 === 1 ? 'table-row-alt' : ''}>
                            <td>{incident.type}</td>
                            <td>
                              <span className={`badge badge-${incident.severity.toLowerCase()}`}>{incident.severity}</span>
                            </td>
                            <td>{incident.address}</td>
                            <td>
                              <span className={`status-badge status-${incident.status.toLowerCase().replace(' ', '-')}`}>{incident.status}</span>
                            </td>
                            <td>{formatDate(incident.createdAt)}</td>
                            <td>
                              <button className="view-btn" onClick={() => handleViewIncident(incident)}>View</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6">No reports submitted yet</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* My Reports by Status Pie Chart */}
                  <h2 className="card-title" style={{ marginTop: '24px' }}>
                    My Reports by Status
                  </h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={(() => {
                          const statusCounts = {};
                          incidents.forEach(incident => {
                            statusCounts[incident.status] = (statusCounts[incident.status] || 0) + 1;
                          });
                          return Object.entries(statusCounts).map(([name, value]) => ({
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
                          const statusCounts = {};
                          incidents.forEach(incident => {
                            statusCounts[incident.status] = (statusCounts[incident.status] || 0) + 1;
                          });
                          const colors = {
                            'Reported': '#475569',
                            'Assigned': '#2563eb',
                            'En Route': '#7c3aed',
                            'On Scene': '#d97706',
                            'Resolved': '#16a34a'
                          };
                          return Object.entries(statusCounts).map(([status]) => (
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
                      notifications.map(notif => (
                        <div
                          key={notif.notificationId}
                          className={`activity-item ${!notif.isRead ? 'unread' : ''}`}
                          onClick={() => markNotificationRead(notif.notificationId)}
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
                      <div className="no-notifications">No notifications yet</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'report' && (
            <div className="form-card full-width">
              <h2 className="card-title">Report Emergency</h2>
              {reportFormError && <div className="error-banner">{reportFormError}</div>}
              {reportFormSuccess && <div className="success-banner">{reportFormSuccess}</div>}
              <form className="quick-form" onSubmit={handleSubmitReport}>
                <select
                  className="form-input"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option value="">Emergency Type</option>
                  <option value="Road Accident">Road Accident</option>
                  <option value="Fire">Fire</option>
                  <option value="Medical Emergency">Medical Emergency</option>
                  <option value="Flood">Flood</option>
                  <option value="Other">Other</option>
                </select>
                <select
                  className="form-input"
                  value={reportSeverity}
                  onChange={(e) => setReportSeverity(e.target.value)}
                >
                  <option value="">Severity</option>
                  <option value="Minor">Minor</option>
                  <option value="Serious">Serious</option>
                  <option value="Critical">Critical</option>
                </select>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Address"
                  value={reportAddress}
                  onChange={(e) => setReportAddress(e.target.value)}
                />
                <textarea
                  className="form-input textarea"
                  placeholder="Description"
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={4}
                />
                <div className="char-count">{reportDescription.length}/20 characters</div>
                <input
                  type="file"
                  className="form-input file-input"
                  accept="image/*"
                  onChange={(e) => setReportPhoto(e.target.files[0])}
                />
                <button type="submit" className="submit-btn" disabled={reportSubmitting}>
                  {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'myReports' && (
            <div className="table-card">
              <h2 className="card-title">My Reports</h2>

              <div className="filter-bar">
                <select
                  className="form-input filter-input"
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
                  className="form-input filter-input"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                >
                  <option value="All">All Severities</option>
                  <option value="Minor">Minor</option>
                  <option value="Serious">Serious</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

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
                  {incidents.filter(incident => {
                    const matchesStatus = statusFilter === 'All' || incident.status === statusFilter;
                    const matchesSeverity = severityFilter === 'All' || incident.severity === severityFilter;
                    return matchesStatus && matchesSeverity;
                  }).map((incident, index) => (
                    <tr key={incident.incidentId} className={index % 2 === 1 ? 'table-row-alt' : ''}>
                      <td>{incident.type}</td>
                      <td>
                        <span className={`badge badge-${incident.severity.toLowerCase()}`}>{incident.severity}</span>
                      </td>
                      <td>{incident.address}</td>
                      <td>
                        <span className={`status-badge status-${incident.status.toLowerCase().replace(' ', '-')}`}>{incident.status}</span>
                      </td>
                      <td>{formatDate(incident.createdAt)}</td>
                      <td>
                        <button className="view-btn" onClick={() => handleViewIncident(incident)}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="form-card full-width">
              <h2 className="card-title">My Profile</h2>
              {profileError && <div className="error-banner">{profileError}</div>}
              {profileSuccess && <div className="success-banner">{profileSuccess}</div>}
              <div className="profile-content">
                {!editingProfile ? (
                  <>
                    <div className="profile-field">
                      <span className="field-label">Name</span>
                      <span className="field-value">{userData?.name || 'Not set'}</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Email</span>
                      <span className="field-value">{user?.email}</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Phone</span>
                      <span className="field-value">{userData?.phone || 'Not set'}</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Role</span>
                      <span className="field-value">Reporter</span>
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Account Created</span>
                      <span className="field-value">{formatDate(userData?.createdAt)}</span>
                    </div>
                    <button className="edit-btn" onClick={() => {
                      setEditName(userData?.name || '');
                      setEditPhone(userData?.phone || '');
                      setEditingProfile(true);
                    }}>Edit Profile</button>
                  </>
                ) : (
                  <>
                    <div className="profile-field">
                      <span className="field-label">Name</span>
                      <input
                        type="text"
                        className="form-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div className="profile-field">
                      <span className="field-label">Phone</span>
                      <input
                        type="text"
                        className="form-input"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button className="submit-btn" onClick={handleSaveProfile}>Save Changes</button>
                      <button className="cancel-btn" onClick={() => setEditingProfile(false)}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Incident Details Modal */}
      {viewIncident && (
        <div className="modal-overlay" onClick={() => setViewIncident(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setViewIncident(null)}>×</button>
            <h2 className="modal-title">Incident Details</h2>
            <div className="incident-details">
              <div className="detail-row">
                <span className="detail-label">Type</span>
                <span className="detail-value">{viewIncident.type}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Severity</span>
                <span className={`badge badge-${viewIncident.severity.toLowerCase()}`}>{viewIncident.severity}</span>
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
                <span className="detail-label">Status</span>
                <span className={`status-badge status-${viewIncident.status.toLowerCase().replace(' ', '-')}`}>{viewIncident.status}</span>
              </div>
              {viewIncident.photoUrl && (
                <div className="detail-row">
                  <span className="detail-label">Photo</span>
                  <img src={viewIncident.photoUrl} alt="Incident" className="incident-photo" />
                </div>
              )}
            </div>

            <h3 className="status-logs-title">Status History</h3>
            <div className="status-logs">
              {statusLogs.map(log => (
                <div key={log.logId} className="status-log-item">
                  <span className={`badge badge-${log.status.toLowerCase().replace(' ', '-')}`}>{log.status}</span>
                  <span className="log-notes">{log.notes}</span>
                  <span className="log-time">{formatDate(log.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
