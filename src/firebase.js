// Import the Firebase functions we need (modular v9+ syntax)
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Load configuration strictly from environment variables
const isTestEnv = process.env.NODE_ENV === "test";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || (isTestEnv ? "test-api-key" : ""),
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || (isTestEnv ? "test.firebaseapp.com" : ""),
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || (isTestEnv ? "test-project" : ""),
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || (isTestEnv ? "test.appspot.com" : ""),
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || (isTestEnv ? "000000000000" : ""),
  appId: process.env.REACT_APP_FIREBASE_APP_ID || (isTestEnv ? "1:000:web:000" : ""),
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || ""
};

// Validate that required environment variables are present in non-test runtime
if (!isTestEnv) {
  const missingKeys = [];
  if (!firebaseConfig.apiKey) missingKeys.push("REACT_APP_FIREBASE_API_KEY");
  if (!firebaseConfig.projectId) missingKeys.push("REACT_APP_FIREBASE_PROJECT_ID");
  if (!firebaseConfig.authDomain) missingKeys.push("REACT_APP_FIREBASE_AUTH_DOMAIN");

  if (missingKeys.length > 0) {
    const errorMsg =
      `[Alert24] Missing required Firebase configuration: ${missingKeys.join(", ")}. ` +
      `Please create a .env file from .env.example with your Firebase credentials.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

// Initialize the Firebase app with our config
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the auth service
const auth = getAuth(app);

// Set persistence to session only - user must log in every time they open a new tab
setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error("Error setting persistence:", error);
});

// Initialize Cloud Firestore (kept from original) and get a reference to the DB
const db = getFirestore(app);

// Initialize Firebase Storage and get a reference to the service
const storage = getStorage(app);

// Export auth, db, and storage
export { auth, db, storage };
