import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import * as authModule from 'firebase/auth';
import * as firestoreModule from 'firebase/firestore';
import { auth } from './firebase';

// Mock Firebase
jest.mock('./firebase', () => {
  const auth = { currentUser: null };
  const db = {};
  return { auth, db };
});

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  setPersistence: jest.fn(() => Promise.resolve()),
  browserSessionPersistence: 'SESSION',
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn((db, col, id) => ({ db, col, id })),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  onSnapshot: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

// Mock dashboards to focus purely on App auth state and transition logic
jest.mock('./Dashboard', () => ({ onLogout, user, userData }) => (
  <div data-testid="reporter-dashboard">
    <span>Reporter: {userData.name}</span>
    <button onClick={onLogout} data-testid="reporter-logout">Logout</button>
  </div>
));

jest.mock('./DispatcherDashboard', () => ({ onLogout, user, userData }) => (
  <div data-testid="dispatcher-dashboard">
    <span>Dispatcher: {userData.name}</span>
    <button onClick={onLogout} data-testid="dispatcher-logout">Logout</button>
  </div>
));

jest.mock('./ResponderDashboard', () => ({ onLogout, user, userData }) => (
  <div data-testid="responder-dashboard">
    <span>Responder: {userData.name}</span>
    <button onClick={onLogout} data-testid="responder-logout">Logout</button>
  </div>
));

describe('Alert24 Authentication & Logout Bug Fix Verification', () => {
  let authCallback;
  let snapshotCallback;
  let snapshotErrorCallback;
  let unsubscribeUserDocMock;

  beforeEach(() => {
    jest.clearAllMocks();

    unsubscribeUserDocMock = jest.fn();

    authModule.onAuthStateChanged.mockImplementation((auth, callback) => {
      authCallback = callback;
      return jest.fn();
    });

    firestoreModule.onSnapshot.mockImplementation((docRef, onNext, onError) => {
      snapshotCallback = onNext;
      snapshotErrorCallback = onError;
      return unsubscribeUserDocMock;
    });

    authModule.signOut.mockResolvedValue();
  });

  test('1. Initial logged-out state shows clean login screen with no error message', async () => {
    render(<App />);

    act(() => {
      authCallback(null);
    });

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/error loading user data/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('2. Reporter flow: Login -> Dashboard -> Logout -> Clean login screen without Error loading user data', async () => {
    render(<App />);

    // Step 1: Simulate Firebase authenticating a Reporter
    const reporterUser = { uid: 'rep-123', email: 'reporter@alert24.com' };
    auth.currentUser = reporterUser;

    act(() => {
      authCallback(reporterUser);
    });

    // Step 2: Firestore returns reporter profile
    act(() => {
      snapshotCallback({
        exists: () => true,
        data: () => ({ name: 'John Reporter', role: 'reporter', themePreference: 'dark' }),
      });
    });

    expect(screen.getByTestId('reporter-dashboard')).toBeInTheDocument();

    // Step 3: Reporter clicks Logout
    const logoutBtn = screen.getByTestId('reporter-logout');
    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    // Verify user doc listener was immediately unsubscribed before signOut
    expect(unsubscribeUserDocMock).toHaveBeenCalled();
    expect(authModule.signOut).toHaveBeenCalled();

    // Step 4: Simulate defunct Firestore permission-denied error fired during logout
    auth.currentUser = null;
    act(() => {
      if (snapshotErrorCallback) {
        snapshotErrorCallback(new Error('Missing or insufficient permissions'));
      }
    });

    // Step 5: Firebase auth listener fires with null
    act(() => {
      authCallback(null);
    });

    // Step 6: Verify clean login screen
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/error loading user data/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('3. Dispatcher flow: Login -> Dashboard -> Logout -> Clean login screen without Error loading user data', async () => {
    render(<App />);

    // Step 1: Login as Dispatcher
    const dispatcherUser = { uid: 'disp-456', email: 'dispatcher@alert24.com' };
    auth.currentUser = dispatcherUser;

    act(() => {
      authCallback(dispatcherUser);
    });

    act(() => {
      snapshotCallback({
        exists: () => true,
        data: () => ({ name: 'Sarah Dispatcher', role: 'dispatcher', themePreference: 'dark' }),
      });
    });

    expect(screen.getByTestId('dispatcher-dashboard')).toBeInTheDocument();

    // Step 2: Dispatcher clicks Logout
    const logoutBtn = screen.getByTestId('dispatcher-logout');
    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    expect(unsubscribeUserDocMock).toHaveBeenCalled();
    expect(authModule.signOut).toHaveBeenCalled();

    auth.currentUser = null;
    act(() => {
      if (snapshotErrorCallback) {
        snapshotErrorCallback(new Error('Missing or insufficient permissions'));
      }
      authCallback(null);
    });

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/error loading user data/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('4. Responder flow: Login -> Dashboard -> Logout -> Clean login screen without Error loading user data', async () => {
    render(<App />);

    // Step 1: Login as Responder
    const responderUser = { uid: 'resp-789', email: 'responder@alert24.com' };
    auth.currentUser = responderUser;

    act(() => {
      authCallback(responderUser);
    });

    act(() => {
      snapshotCallback({
        exists: () => true,
        data: () => ({ name: 'Unit 4 Responder', role: 'responder', themePreference: 'dark' }),
      });
    });

    expect(screen.getByTestId('responder-dashboard')).toBeInTheDocument();

    // Step 2: Responder clicks Logout
    const logoutBtn = screen.getByTestId('responder-logout');
    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    expect(unsubscribeUserDocMock).toHaveBeenCalled();
    expect(authModule.signOut).toHaveBeenCalled();

    auth.currentUser = null;
    act(() => {
      if (snapshotErrorCallback) {
        snapshotErrorCallback(new Error('Missing or insufficient permissions'));
      }
      authCallback(null);
    });

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/error loading user data/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('5. Role Transition: Login as Reporter -> Logout -> Login as Dispatcher without stale data or errors', async () => {
    render(<App />);

    // --- 1. Login as Reporter ---
    const user1 = { uid: 'user-1', email: 'user1@alert24.com' };
    auth.currentUser = user1;

    act(() => {
      authCallback(user1);
    });
    act(() => {
      snapshotCallback({
        exists: () => true,
        data: () => ({ name: 'First User', role: 'reporter', themePreference: 'light' }),
      });
    });

    expect(screen.getByTestId('reporter-dashboard')).toHaveTextContent('Reporter: First User');

    // --- 2. Logout ---
    await act(async () => {
      fireEvent.click(screen.getByTestId('reporter-logout'));
    });
    auth.currentUser = null;
    act(() => {
      authCallback(null);
    });

    expect(screen.queryByTestId('reporter-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText(/error loading user data/i)).not.toBeInTheDocument();

    // --- 3. Login as Dispatcher ---
    const user2 = { uid: 'user-2', email: 'user2@alert24.com' };
    auth.currentUser = user2;

    act(() => {
      authCallback(user2);
    });
    act(() => {
      snapshotCallback({
        exists: () => true,
        data: () => ({ name: 'Second User', role: 'dispatcher', themePreference: 'dark' }),
      });
    });

    expect(screen.getByTestId('dispatcher-dashboard')).toHaveTextContent('Dispatcher: Second User');
    expect(screen.queryByTestId('reporter-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText(/error loading user data/i)).not.toBeInTheDocument();
  });
});
