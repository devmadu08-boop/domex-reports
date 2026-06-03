import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firestoreDb } from "./firebase.js";
import { createBackupData } from "./reportStorage.js";

const CLOUD_REPORT_DOC = doc(firestoreDb, "reportSystems", "domexDailyCourier");

export async function uploadLocalSnapshotToFirestore(reason = "manual", sourceClientId = "") {
  const snapshot = {
    ...createBackupData(),
    reason,
    sourceClientId,
    cloudUpdatedAt: new Date().toISOString(),
  };

  await setDoc(
    CLOUD_REPORT_DOC,
    {
      snapshot,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return snapshot;
}

export async function saveWeeklyBackupToFirestore() {
  const date = new Date().toISOString().slice(0, 10);
  const snapshot = {
    ...createBackupData(),
    reason: "weekly-firebase-backup",
    sourceClientId: "",
    cloudUpdatedAt: new Date().toISOString(),
  };

  await setDoc(doc(firestoreDb, "reportSystemWeeklyBackups", date), {
    snapshot,
    createdAt: serverTimestamp(),
  });

  return snapshot;
}

export async function downloadSnapshotFromFirestore() {
  const cloudDoc = await getDoc(CLOUD_REPORT_DOC);
  if (!cloudDoc.exists()) return null;
  return cloudDoc.data()?.snapshot || null;
}

export function subscribeToFirestoreSnapshot(onSnapshotData, onError) {
  return onSnapshot(
    CLOUD_REPORT_DOC,
    (cloudDoc) => {
      if (!cloudDoc.exists()) return;
      onSnapshotData(cloudDoc.data()?.snapshot || null);
    },
    onError,
  );
}
