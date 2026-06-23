import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export async function createStaffAccount({
  name,
  email,
  phone,
  password,
  role,
  speciality = "",
}) {
  try {
    // Create Firebase Auth account
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Prepare user document data
    const userData = {
      uid: user.uid,
      name,
      email,
      phone,
      role,
      createdAt: serverTimestamp(),
    };

    // Add speciality and isAvailable only for responders
    if (role === "responder") {
      userData.speciality = speciality;
      userData.isAvailable = true;
      userData.activeIncidentId = "";
    }

    // Write to Firestore
    await setDoc(doc(db, "users", user.uid), userData);

    // Sign out immediately after creation
    await signOut(auth);

    console.log("Account created successfully");
  } catch (error) {
    console.error("Error creating staff account:", error);
    throw error;
  }
}
