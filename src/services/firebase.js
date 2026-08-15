import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCkhI0fNJed9M-r803cvLyp9w05FtzeqMY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "domexrep-e30c4.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://domexrep-e30c4-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "domexrep-e30c4",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "domexrep-e30c4.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "841657457035",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:841657457035:web:ddf555c9ae3e53fdfc378e",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-4KSTD3SGSS",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const realtimeDb = getDatabase(firebaseApp);
export const firebaseAuth = getAuth(firebaseApp);
export let firebaseAnalytics = null;

isSupported()
  .then((supported) => {
    if (supported) {
      firebaseAnalytics = getAnalytics(firebaseApp);
    }
  })
  .catch(() => {
    firebaseAnalytics = null;
  });
