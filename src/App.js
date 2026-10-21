// Import React hooks we need for state and side effects
import { useState, useEffect, useRef } from "react";

// Import components
import Dashboard from "./Dashboard";
import DispatcherDashboard from "./DispatcherDashboard";
import ResponderDashboard from "./ResponderDashboard";

// Import the auth and db objects we exported from firebase.js
import { auth, db } from "./firebase";

// Import the Firebase Auth functions we need (v9 modular syntax)
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, updateDoc, serverTimestamp, onSnapshot } from "firebase/firestore";

// Import our styles (theme.css must be imported before App.css)
import "./theme.css";
import "./App.css";

function App() {
  // ----- STATE -----
  // Track what the user types in the email field
  const [email, setEmail] = useState("");

  // Track what the user types in the password field
  const [password, setPassword] = useState("");

  // Track the currently signed-in user (null when nobody is signed in)
  const [user, setUser] = useState(null);

  // Track user data (role, etc.) from Firestore
  const [userData, setUserData] = useState(null);

  // Track an error message so we can show it nicely on screen
  const [error, setError] = useState("");

  // Track a loading state so we can disable buttons while a request is in flight
  const [loading, setLoading] = useState(false);

  // Track if we are loading the user's role after login
  const [loadingRole, setLoadingRole] = useState(true);

  // Track if we are in the middle of signing up
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Track success message for signup
  const [successMessage, setSuccessMessage] = useState('');

  // Track field-specific validation errors
  const [fieldErrors, setFieldErrors] = useState({});

  // New state variables for redesign
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ----- THEME STATE -----
  // Default to localStorage value if present, otherwise "dark".
  // This must agree with the no-flash inline script in public/index.html.
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('alert24_theme');
      return saved === 'light' || saved === 'dark' ? saved : 'dark';
    } catch { return 'dark'; }
  });

  // ----- SIDE EFFECT — apply theme to <html> element -----
  // Runs whenever theme changes; CSS variables cascade globally from here.
  // Also writes to localStorage so the no-flash script picks it up on next load.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('alert24_theme', theme); } catch {}
  }, [theme]);

  // Ref holding active user document onSnapshot unsubscribe function
  const userDocUnsubRef = useRef(null);
  const isLoggingOutRef = useRef(false);

  // ----- SIDE EFFECT — auth + user data listener -----
  // onAuthStateChanged listens for login/logout changes and keeps our `user` state in sync.
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      // Always unsubscribe previous user doc listener before attaching a new one or handling logout
      if (userDocUnsubRef.current) {
        try {
          userDocUnsubRef.current();
        } catch (e) {
          console.error("Error unsubscribing previous user doc listener:", e);
        }
        userDocUnsubRef.current = null;
      }

      if (!currentUser) {
        setUser(null);
        setUserData(null);
        setLoadingRole(false);
        setError("");
        // Reset to dark when user logs out
        setTheme("dark");
        return;
      }

      // If a logout is currently in progress, do not attempt to load user data
      if (isLoggingOutRef.current) {
        return;
      }

      const currentUid = currentUser.uid;
      setUser(currentUser);
      setUserData(null);
      setError("");
      setLoadingRole(true);

      // Fetch user document from Firestore to get role AND theme preference
      const userDocRef = doc(db, "users", currentUid);
      userDocUnsubRef.current = onSnapshot(
        userDocRef,
        (docSnap) => {
          // Guard: Ignore if user has logged out, is logging out, or auth user has changed
          if (isLoggingOutRef.current || !auth.currentUser || auth.currentUser.uid !== currentUid) {
            return;
          }

          setLoadingRole(false);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);

            // Load saved theme preference — default to "dark" if not set
            const savedTheme = data.themePreference;
            if (savedTheme === "light" || savedTheme === "dark") {
              setTheme(savedTheme);
            } else {
              setTheme("dark");
            }

            // Check role validity
            if (!["reporter", "dispatcher", "responder"].includes(data.role)) {
              setError("Access denied. Unauthorised role.");
              if (userDocUnsubRef.current) {
                try { userDocUnsubRef.current(); } catch (e) {}
                userDocUnsubRef.current = null;
              }
              signOut(auth);
            }
          } else {
            // User doc not found - for reporters, we created it on signup
            // For others, account should have been created with createStaffAccount.js
            setError("Access denied.");
            if (userDocUnsubRef.current) {
              try { userDocUnsubRef.current(); } catch (e) {}
              userDocUnsubRef.current = null;
            }
            signOut(auth);
          }
        },
        (err) => {
          // Guard: If user is logged out, logging out, or auth changed,
          // permission-denied errors on defunct listeners during sign-out are expected.
          // They must NOT be treated as application errors.
          if (isLoggingOutRef.current || !auth.currentUser || auth.currentUser.uid !== currentUid) {
            return;
          }
          console.error("Error fetching user data:", err);
          setLoadingRole(false);
          setError("Error loading user data.");
        }
      );
    });

    // Clean up listeners on unmount
    return () => {
      unsubscribeAuth();
      if (userDocUnsubRef.current) {
        try { userDocUnsubRef.current(); } catch (e) {}
        userDocUnsubRef.current = null;
      }
    };
  }, []);

  // ----- THEME HANDLER -----
  // Called by Settings page in any dashboard. Updates state immediately (instant UI
  // change via data-theme attribute) then persists to both localStorage (instant)
  // and Firestore (cross-device sync).
  async function handleThemeChange(newTheme) {
    setTheme(newTheme);
    try { localStorage.setItem('alert24_theme', newTheme); } catch {}
    if (user) {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          themePreference: newTheme
        });
      } catch (err) {
        console.error("Error saving theme preference:", err);
      }
    }
  }

  // ----- HELPERS -----
  // Validate email format
  function isValidEmail(val) {
    if (!val) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim());
  }

  // Validate phone format (optional field, but if provided must be realistic)
  function isValidPhone(val) {
    if (!val || !val.trim()) return true;
    const cleaned = val.replace(/[\s+()-]/g, '');
    return /^\d{7,15}$/.test(cleaned);
  }

  // Translate a Firebase error code into a user-friendly, non-leaking message
  function getFriendlyError(code, mode = 'login') {
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return mode === 'login'
          ? "Invalid email or password. Please check your credentials and try again."
          : "Unable to complete registration with these credentials.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/missing-password":
        return "Please enter your password.";
      case "auth/weak-password":
        return "Password is too weak. Please use at least 6 characters.";
      case "auth/email-already-in-use":
        return "An account with this email address already exists. Please sign in instead.";
      case "auth/too-many-requests":
        return "Too many failed attempts. Access has been temporarily restricted. Please try again later.";
      case "auth/network-request-failed":
        return "Network connection error. Please check your internet connection and try again.";
      case "auth/user-disabled":
        return "This account has been disabled. Please contact an administrator.";
      default:
        return mode === 'login'
          ? "Unable to sign in. Please verify your details and try again."
          : "Unable to create account. Please verify your details and try again.";
    }
  }

  // ----- HANDLERS -----
  // Create a new account with email + password
  async function handleSignup(e) {
    if (e) e.preventDefault();
    if (loading) return; // Prevent duplicate submissions

    setError("");
    setSuccessMessage("");

    const errors = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      errors.fullName = "Please enter your full name.";
    } else if (trimmedName.length < 2) {
      errors.fullName = "Full name must be at least 2 characters.";
    }

    if (!trimmedEmail) {
      errors.email = "Please enter your email address.";
    } else if (!isValidEmail(trimmedEmail)) {
      errors.email = "Please enter a valid email address.";
    }

    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      errors.phone = "Please enter a valid phone number (e.g. +27 12 345 6789).";
    }

    if (!password) {
      errors.password = "Please enter a password.";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters long.";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match. Please verify and try again.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("");
      return;
    }

    setFieldErrors({});
    setIsSigningUp(true);
    setLoading(true);

    try {
      // Firebase creates the user and signs them in automatically
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const newUser = userCredential.user;

      // Create user document in Firestore
      await setDoc(doc(db, "users", newUser.uid), {
        uid: newUser.uid,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        role: "reporter",
        createdAt: serverTimestamp()
      });

      // Sign the user out immediately so they can log in cleanly
      await signOut(auth);

      // Show success message and transition to login
      setSuccessMessage("Account created successfully. Please log in.");
      setIsLogin(true);

      // Clear form on success
      setEmail("");
      setPassword("");
      setFullName("");
      setPhone("");
      setConfirmPassword("");
      setFieldErrors({});
    } catch (err) {
      setError(getFriendlyError(err.code, 'signup'));
    } finally {
      setLoading(false);
      setIsSigningUp(false);
    }
  }

  // Sign in an existing user
  async function handleLogin(e) {
    if (e) e.preventDefault();
    if (loading) return; // Prevent duplicate submissions

    setError("");
    setSuccessMessage("");

    const errors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail && !password) {
      errors.email = "Please enter your email address.";
      errors.password = "Please enter your password.";
      setFieldErrors(errors);
      setError("Please enter your email address and password.");
      return;
    }

    if (!trimmedEmail) {
      errors.email = "Please enter your email address.";
    } else if (!isValidEmail(trimmedEmail)) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password) {
      errors.password = "Please enter your password.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("");
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      setEmail("");
      setPassword("");
      setFieldErrors({});
    } catch (err) {
      setError(getFriendlyError(err.code, 'login'));
    } finally {
      setLoading(false);
    }
  }

  // Sign the current user out
  async function handleLogout() {
    isLoggingOutRef.current = true;
    setError("");

    // 1. Immediately unsubscribe the Firestore user document listener
    if (userDocUnsubRef.current) {
      try {
        userDocUnsubRef.current();
      } catch (e) {
        console.error("Error unsubscribing user doc listener on logout:", e);
      }
      userDocUnsubRef.current = null;
    }

    // 2. Clear user and session state synchronously
    setUser(null);
    setUserData(null);
    setLoadingRole(false);

    // 3. Complete Firebase sign out
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error signing out:", err);
      setError(getFriendlyError(err.code));
    } finally {
      isLoggingOutRef.current = false;
      setError("");
    }
  }

  // ----- UI -----
  // SVG Icons
  const ShieldIcon = ({ className }) => (
    <svg className={className || "alert-icon"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L3 7V12C3 16.5 6.84 20.74 12 22C17.16 20.74 21 16.5 21 12V7L12 2Z" fill="#c0392b"/>
      <path d="M12 8V14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 16V17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );

  const EnvelopeIcon = () => (
    <svg className="input-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M22 6L12 13L2 6" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const LockIcon = () => (
    <svg className="input-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 11V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V11" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const PersonIcon = () => (
    <svg className="input-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const PhoneIcon = () => (
    <svg className="input-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 16.92V21C22 21.2652 21.8946 21.5196 21.7071 21.7071C21.5196 21.8946 21.2652 22 21 22C12.5 22 5 14.5 5 6C5 5.73478 5.10536 5.48043 5.29289 5.29289C5.48043 5.10536 5.73478 5 6 5H10.08C10.35 5 10.61 5.11 10.8 5.3L12.89 7.39C12.9736 7.47894 13.0207 7.59046 13.0237 7.70719C13.0268 7.82391 12.9856 7.93623 12.909 8.026L11.7 9.5C11.86 11.07 12.54 12.63 13.8 13.9C15.07 15.16 16.63 15.84 18.2 16L19.67 14.8C19.7615 14.7258 19.8722 14.6864 19.9875 14.6896C20.1027 14.6928 20.2126 14.7385 20.296 14.819L22.7 17.2C22.89 17.39 23 17.63 23 17.9C22.99 17.9 23 17.91 22.99 17.92L22 16.92Z" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const EyeIcon = () => (
    <svg className="toggle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const EyeOffIcon = () => (
    <svg className="toggle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.94 17.94C16.2306 19.243 14.1491 19.9649 12 20C5 20 1 12 1 12C2.24389 9.6819 3.96914 7.65661 6.06 6.06" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.9 4.24C10.5883 4.03669 11.2931 3.93555 12 3.93999C19 3.93999 23 12 23 12C22.393 13.1486 21.6691 14.2231 20.84 15.19" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14.12 14.12C13.8454 14.4147 13.5083 14.6404 13.1341 14.7781C12.7598 14.9158 12.3558 14.9618 11.9557 14.9114C11.5557 14.861 11.1753 14.7161 10.8478 14.4923C10.5202 14.2686 10.2539 13.9715 10.0668 13.6274C9.87966 13.2833 9.77794 12.9024 9.77005 12.5151C9.76216 12.1279 9.84849 11.7438 10.0212 11.3963C10.1939 11.0488 10.4476 10.746 10.76 10.51" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 1L23 23" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const WarningIcon = () => (
    <svg className="warning-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.29 3.86L1.82 18C1.64 18.3 1.57 18.63 1.61 18.95C1.65 19.27 1.79 19.58 2 19.83C2.21 20.08 2.48 20.27 2.79 20.38C3.09 20.49 3.42 20.51 3.73 20.43L20.27 16.14C20.59 16.06 20.88 15.89 21.1 15.65C21.33 15.41 21.47 15.11 21.51 14.79C21.55 14.47 21.49 14.14 21.33 13.86L14.71 2.86C14.55 2.57 14.31 2.34 14.01 2.19C13.72 2.04 13.39 1.98 13.06 2.02C12.73 2.06 12.42 2.19 12.17 2.41C11.92 2.62 11.74 2.9 11.65 3.22C11.62 3.3 11.59 3.39 11.58 3.47L10.29 3.86Z" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 9V13" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 17H12.01" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );

  // If we're loading the user's role, show a loading indicator
  if (loadingRole) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" role="status" aria-label="Loading"></div>
        <span>Verifying credentials…</span>
      </div>
    );
  }

  // If a user is signed in, show appropriate dashboard based on role
  if (user && !isSigningUp && userData) {
    switch (userData.role) {
      case "reporter":
        return <Dashboard onLogout={handleLogout} user={user} userData={userData} theme={theme} onThemeChange={handleThemeChange} />;
      case "dispatcher":
        return <DispatcherDashboard onLogout={handleLogout} user={user} userData={userData} theme={theme} onThemeChange={handleThemeChange} />;
      case "responder":
        return <ResponderDashboard onLogout={handleLogout} user={user} userData={userData} theme={theme} onThemeChange={handleThemeChange} />;
      default:
        return null; // Handled by error check earlier
    }
  }

  return (
    <div className="app-container">

      {/* ── LEFT — Hero / Brand Panel ─────────────────────── */}
      <div className="auth-hero" role="complementary" aria-label="Alert24 brand panel">
        {/* Top logo mark */}
        <div className="hero-logo-mark">
          <ShieldIcon className="logo-shield" />
          <span className="logo-name">Alert24</span>
        </div>

        {/* Bottom content */}
        <div className="auth-hero-content">
          <div className="hero-status-badge">
            <span className="hero-status-dot" aria-hidden="true"></span>
            System Operational
          </div>

          <h2 className="hero-headline">
            Emergency response,{" "}
            <span className="hero-headline-accent">connected.</span>
          </h2>

          <p className="hero-subtext">
            Real-time incident tracking and rapid dispatch coordination.
            Built for emergency operations and response teams.
          </p>

          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">24 / 7</span>
              <span className="hero-stat-label">Always On</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">3</span>
              <span className="hero-stat-label">Response Roles</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">Live</span>
              <span className="hero-stat-label">Incident Tracking</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT — Authentication Form Panel ───────────────── */}
      <div className="auth-card" role="main">

        {/* Form header */}
        <div className="card-header">
          <div className="form-brand">
            <ShieldIcon className="logo-shield" />
            <span className="logo-name">Alert24</span>
          </div>
          <h1 className="form-heading">
            {isLogin ? "Sign in" : "Create account"}
          </h1>
          <p className="form-subheading">
            {isLogin
              ? "Enter your credentials to access the response system."
              : "Register to report incidents to emergency services."}
          </p>
        </div>

        {/* ---- AUTHENTICATION FORM ---- */}
        <form className="auth-form" onSubmit={isLogin ? handleLogin : handleSignup} noValidate>
          {isLogin ? (
            // ── Login fields ──
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="login-email">Email address</label>
                <div className="input-wrapper">
                  <EnvelopeIcon />
                  <input
                    id="login-email"
                    type="email"
                    className={`field-input ${fieldErrors.email ? "input-has-error" : ""}`}
                    placeholder="you@organisation.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      if (error) setError("");
                    }}
                    autoComplete="email"
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                    required
                  />
                </div>
                {fieldErrors.email && (
                  <span id="login-email-error" className="field-error-msg" role="alert">
                    {fieldErrors.email}
                  </span>
                )}
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="login-password">Password</label>
                <div className="input-wrapper">
                  <LockIcon />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className={`field-input ${fieldErrors.password ? "input-has-error" : ""}`}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      if (error) setError("");
                    }}
                    autoComplete="current-password"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <span id="login-password-error" className="field-error-msg" role="alert">
                    {fieldErrors.password}
                  </span>
                )}
              </div>
            </>
          ) : (
            // ── Signup fields ──
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="signup-name">Full name</label>
                <div className="input-wrapper">
                  <PersonIcon />
                  <input
                    id="signup-name"
                    type="text"
                    className={`field-input ${fieldErrors.fullName ? "input-has-error" : ""}`}
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                      if (error) setError("");
                    }}
                    autoComplete="name"
                    aria-invalid={!!fieldErrors.fullName}
                    aria-describedby={fieldErrors.fullName ? "signup-name-error" : undefined}
                    required
                  />
                </div>
                {fieldErrors.fullName && (
                  <span id="signup-name-error" className="field-error-msg" role="alert">
                    {fieldErrors.fullName}
                  </span>
                )}
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="signup-email">Email address</label>
                <div className="input-wrapper">
                  <EnvelopeIcon />
                  <input
                    id="signup-email"
                    type="email"
                    className={`field-input ${fieldErrors.email ? "input-has-error" : ""}`}
                    placeholder="you@organisation.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      if (error) setError("");
                    }}
                    autoComplete="email"
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
                    required
                  />
                </div>
                {fieldErrors.email && (
                  <span id="signup-email-error" className="field-error-msg" role="alert">
                    {fieldErrors.email}
                  </span>
                )}
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="signup-phone">Phone number</label>
                <div className="input-wrapper">
                  <PhoneIcon />
                  <input
                    id="signup-phone"
                    type="tel"
                    className={`field-input ${fieldErrors.phone ? "input-has-error" : ""}`}
                    placeholder="+27 00 000 0000"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                      if (error) setError("");
                    }}
                    autoComplete="tel"
                    aria-invalid={!!fieldErrors.phone}
                    aria-describedby={fieldErrors.phone ? "signup-phone-error" : undefined}
                  />
                </div>
                {fieldErrors.phone && (
                  <span id="signup-phone-error" className="field-error-msg" role="alert">
                    {fieldErrors.phone}
                  </span>
                )}
              </div>

              <div className="form-section-label">Security</div>

              <div className="field-group">
                <label className="field-label" htmlFor="signup-password">Password</label>
                <div className="input-wrapper">
                  <LockIcon />
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    className={`field-input ${fieldErrors.password ? "input-has-error" : ""}`}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      if (error) setError("");
                    }}
                    autoComplete="new-password"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? "signup-password-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <span id="signup-password-error" className="field-error-msg" role="alert">
                    {fieldErrors.password}
                  </span>
                )}
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="signup-confirm">Confirm password</label>
                <div className="input-wrapper">
                  <LockIcon />
                  <input
                    id="signup-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    className={`field-input ${fieldErrors.confirmPassword ? "input-has-error" : ""}`}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                      if (error) setError("");
                    }}
                    autoComplete="new-password"
                    aria-invalid={!!fieldErrors.confirmPassword}
                    aria-describedby={fieldErrors.confirmPassword ? "signup-confirm-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <span id="signup-confirm-error" className="field-error-msg" role="alert">
                    {fieldErrors.confirmPassword}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Error / Success feedback */}
          {error && (
            <div className="error-banner" role="alert">
              <WarningIcon />
              <span>{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="success-banner" role="status">
              <span>{successMessage}</span>
            </div>
          )}

          {/* Primary action button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Please wait…" : (isLogin ? "Access System" : "Create Account")}
          </button>

          {/* Toggle between login / signup */}
          <div className="auth-link">
            {isLogin ? (
              <>
                <span>Don't have an account?</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setIsLogin(false);
                    setError("");
                    setFieldErrors({});
                    setSuccessMessage("");
                  }}
                >
                  Register
                </button>
              </>
            ) : (
              <>
                <span>Already have an account?</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setIsLogin(true);
                    setError("");
                    setFieldErrors({});
                    setSuccessMessage("");
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
