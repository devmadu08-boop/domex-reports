import { browserLocalPersistence, GoogleAuthProvider, setPersistence, signInAnonymously, signInWithPopup, signOut } from "firebase/auth";
import { firebaseAuth } from "./firebase.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function loginWithGoogleAccount() {
  await setPersistence(firebaseAuth, browserLocalPersistence);
  const credential = await signInWithPopup(firebaseAuth, googleProvider);
  return {
    uid: credential.user.uid,
    email: credential.user.email || "",
    displayName: credential.user.displayName || credential.user.email || "Google user",
    photoURL: credential.user.photoURL || "",
  };
}

export async function logoutFirebaseAccount() {
  if (!firebaseAuth.currentUser) return;
  await signOut(firebaseAuth);
}

export async function ensureFirebaseAuthForSession(authProvider = "password") {
  await setPersistence(firebaseAuth, browserLocalPersistence);
  await firebaseAuth.authStateReady();
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  if (authProvider === "google") throw new Error("Google session expired. Please sign in again.");
  const credential = await signInAnonymously(firebaseAuth);
  return credential.user;
}
