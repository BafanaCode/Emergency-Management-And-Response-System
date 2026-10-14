// Import the Firebase functions we need (modular v9+ syntax)
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your Firebase project configuration
// (You get this from the Firebase Console -> Project Settings -> Your apps)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyADF3IbBTUSU6IJFmQfYVSApeXT-SkQqFc",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "alert24-a1601.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "alert24-a1601",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "alert24-a1601.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "898634364096",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:898634364096:web:e09426324848ae04aa2925",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-BM49N18NVT"
};
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
