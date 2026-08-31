// Import React hooks we need for state and side effects
import { useState, useEffect } from "react";

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
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";

// Import our styles
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

  // New state variables for redesign
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ----- SIDE EFFECT -----
  // useEffect runs after the component first mounts.
  // onAuthStateChanged listens for login/logout changes and keeps our `user` state in sync.
  useEffect(() => {
    let unsubscribeUserDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setUserData(null);
      setError("");
      setLoadingRole(true);

      if (currentUser) {
        // Fetch user document from Firestore to get role
        const userDocRef = doc(db, "users", currentUser.uid);
        unsubscribeUserDoc = onSnapshot(
          userDocRef,
          (docSnap) => {
            setLoadingRole(false);
            if (docSnap.exists()) {
              const data = docSnap.data();
              setUserData(data);

              // Check role validity
              if (!["reporter", "dispatcher", "responder"].includes(data.role)) {
                setError("Access denied. Unauthorised role.");
                signOut(auth);
              }
            } else {
              // User doc not found - for reporters, we created it on signup
              // For others, account should have been created with createStaffAccount.js
              setError("Access denied.");
              signOut(auth);
            }
          },
          (err) => {
            console.error("Error fetching user data:", err);
            setLoadingRole(false);
            setError("Error loading user data.");
          }
        );
      } else {
        setLoadingRole(false);
        setUserData(null);
      }
    });

    // Clean up listeners
    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  // ----- HELPERS -----
  // Translate a Firebase error code into a friendly message
  function getFriendlyError(code) {
    switch (code) {
      case "auth/weak-password":
        return "Password is too weak. Please use at least 6 characters.";
      case "auth/invalid-email":
        return "That email address doesn't look valid. Please double-check it.";
      case "auth/user-not-found":
        return "No account found with that email. Try signing up instead.";
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Incorrect password. Please try again.";
      case "auth/email-already-in-use":
        return "That email is already registered. Try logging in.";
      case "auth/missing-password":
        return "Please enter a password.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a moment and try again.";
      default:
        return "Something went wrong. Please try again.";
    }
  }

  // ----- HANDLERS -----
  // Create a new account with email + password
  async function handleSignup(e) {
    e.preventDefault(); // stop the form from reloading the page
    setError("");
    setSuccessMessage("");
    
    // Check password match
    if (password !== confirmPassword) {
      return;
    }
    
    setIsSigningUp(true);
    setLoading(true);

    try {
      // Firebase creates the user and signs them in automatically
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: fullName,
        email: email,
        phone: phone,
        role: "reporter",
        createdAt: serverTimestamp()
      });

      // Sign the user out immediately
      await signOut(auth);

      // Show success message
      setSuccessMessage("Account created successfully. Please log in.");

      // Switch to login form
      setIsLogin(true);

      // Clear the form on success
      setEmail("");
      setPassword("");
      setFullName("");
      setPhone("");
      setConfirmPassword("");
    } catch (err) {
      setError(getFriendlyError(err.code));
    } finally {
      setLoading(false);
      setIsSigningUp(false);
    }
  }

  // Sign in an existing user
  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(getFriendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  // Sign the current user out
  async function handleLogout() {
    setError("");
    try {
      await signOut(auth);
    } catch (err) {
      setError(getFriendlyError(err.code));
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
        return <Dashboard onLogout={handleLogout} user={user} userData={userData} />;
      case "dispatcher":
        return <DispatcherDashboard onLogout={handleLogout} user={user} userData={userData} />;
      case "responder":
        return <ResponderDashboard onLogout={handleLogout} user={user} userData={userData} />;
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
            Real-time coordination for dispatch centres, municipalities,
            and emergency services — built for the seconds that matter.
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
                    className="field-input"
                    placeholder="you@organisation.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="login-password">Password</label>
                <div className="input-wrapper">
                  <LockIcon />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="field-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
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
                    className="field-input"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="signup-email">Email address</label>
                <div className="input-wrapper">
                  <EnvelopeIcon />
                  <input
                    id="signup-email"
                    type="email"
                    className="field-input"
                    placeholder="you@organisation.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="signup-phone">Phone number</label>
                <div className="input-wrapper">
                  <PhoneIcon />
                  <input
                    id="signup-phone"
                    type="tel"
                    className="field-input"
                    placeholder="+27 00 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="form-section-label">Security</div>

              <div className="field-group">
                <label className="field-label" htmlFor="signup-password">Password</label>
                <div className="input-wrapper">
                  <LockIcon />
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    className="field-input"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
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
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="signup-confirm">Confirm password</label>
                <div className="input-wrapper">
                  <LockIcon />
                  <input
                    id="signup-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    className="field-input"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
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
              </div>

              {confirmPassword && password !== confirmPassword && (
                <p className="password-error" role="alert">Passwords do not match</p>
              )}
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
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </form>

        <p className="form-footer-note">
          Alert24 &mdash; Emergency Management &amp; Response System
        </p>
      </div>
    </div>
  );
}

export default App;
