import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firestoreDb } from "./firebase.js";
import { createBackupData, getActiveBranch, getUsers } from "./reportStorage.js";

function cloudReportDoc(branchName = getActiveBranch()) {
  return doc(firestoreDb, "reportSystems", `domexDailyCourier_${branchName || "default"}`);
}

export async function uploadLocalSnapshotToFirestore(reason = "manual", sourceClientId = "") {
  const snapshot = {
    ...createBackupData(),
    branchName: getActiveBranch(),
    reason,
    sourceClientId,
    cloudUpdatedAt: new Date().toISOString(),
  };

  await setDoc(
    cloudReportDoc(),
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
    branchName: getActiveBranch(),
    reason: "weekly-firebase-backup",
    sourceClientId: "",
    cloudUpdatedAt: new Date().toISOString(),
  };

  await setDoc(doc(firestoreDb, "reportSystemWeeklyBackups", `${getActiveBranch() || "default"}_${date}`), {
    snapshot,
    createdAt: serverTimestamp(),
  });

  return snapshot;
}

export async function downloadSnapshotFromFirestore() {
  const cloudDoc = await getDoc(cloudReportDoc());
  if (!cloudDoc.exists()) return null;
  return cloudDoc.data()?.snapshot || null;
}

export function subscribeToFirestoreSnapshot(onSnapshotData, onError) {
  return onSnapshot(
    cloudReportDoc(),
    (cloudDoc) => {
      if (!cloudDoc.exists()) return;
      onSnapshotData(cloudDoc.data()?.snapshot || null);
    },
    onError,
  );
}

export async function uploadUsersToFirestore() {
  await setDoc(
    doc(firestoreDb, "reportSystemAdmin", "users"),
    {
      users: getUsers(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function downloadUsersFromFirestore() {
  const usersDoc = await getDoc(doc(firestoreDb, "reportSystemAdmin", "users"));
  if (!usersDoc.exists()) return [];
  return usersDoc.data()?.users || [];
}
