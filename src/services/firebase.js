import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDYotKiRMmeDfmXIi9BfroR-yLgaLd2q6w",
  authDomain: "domex-new-report.firebaseapp.com",
  projectId: "domex-new-report",
  storageBucket: "domex-new-report.firebasestorage.app",
  messagingSenderId: "555453710182",
  appId: "1:555453710182:web:aa38472b7f2245fc2bd2a7",
  measurementId: "G-8J9YKXJVJZ",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firestoreDb = getFirestore(firebaseApp);
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
