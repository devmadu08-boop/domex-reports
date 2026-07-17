import { get, onValue, ref, serverTimestamp, set } from "firebase/database";
import { realtimeDb } from "./firebase.js";
import { createBackupData, getActiveBranch, getUsers } from "./reportStorage.js";

function safeFirebaseKey(value) {
  return String(value || "default")
    .trim()
    .toLowerCase()
    .replace(/[.#$\[\]\/]/g, "_");
}

function cloudReportRef(branchName = getActiveBranch()) {
  return ref(realtimeDb, `reportSystems/domexDailyCourier_${safeFirebaseKey(branchName)}`);
}

function toFirebaseJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function uploadLocalSnapshotToFirebase(reason = "manual", sourceClientId = "") {
  const snapshot = {
    ...createBackupData(),
    branchName: getActiveBranch(),
    reason,
    sourceClientId,
    cloudUpdatedAt: new Date().toISOString(),
  };

  await set(cloudReportRef(), {
    snapshot: toFirebaseJson(snapshot),
    updatedAt: serverTimestamp(),
  });

  return snapshot;
}

export async function saveWeeklyBackupToFirebase() {
  const date = new Date().toISOString().slice(0, 10);
  const snapshot = {
    ...createBackupData(),
    branchName: getActiveBranch(),
    reason: "weekly-firebase-backup",
    sourceClientId: "",
    cloudUpdatedAt: new Date().toISOString(),
  };

  await set(ref(realtimeDb, `reportSystemWeeklyBackups/${safeFirebaseKey(getActiveBranch())}_${date}`), {
    snapshot: toFirebaseJson(snapshot),
    createdAt: serverTimestamp(),
  });

  return snapshot;
}

export async function downloadSnapshotFromFirebase() {
  const cloudSnapshot = await get(cloudReportRef());
  if (!cloudSnapshot.exists()) return null;
  return cloudSnapshot.val()?.snapshot || null;
}

export function subscribeToFirebaseSnapshot(onSnapshotData, onError) {
  return onValue(
    cloudReportRef(),
    (cloudSnapshot) => {
      if (!cloudSnapshot.exists()) return;
      onSnapshotData(cloudSnapshot.val()?.snapshot || null);
    },
    onError,
  );
}

export async function uploadUsersToFirebase() {
  await set(ref(realtimeDb, "reportSystemAdmin/users"), {
    users: toFirebaseJson(getUsers()),
    updatedAt: serverTimestamp(),
  });
}

export async function downloadUsersFromFirebase() {
  const usersSnapshot = await get(ref(realtimeDb, "reportSystemAdmin/users"));
  if (!usersSnapshot.exists()) return [];
  return usersSnapshot.val()?.users || [];
}
