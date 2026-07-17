import { get, onValue, ref, serverTimestamp, set } from "firebase/database";
import { realtimeDb } from "./firebase.js";
import { createBackupData, getActiveBranch, getUsers } from "./reportStorage.js";

const ENCODED_KEY_PREFIX = "__firebase_key__";
const INVALID_FIREBASE_KEY = /[.#$\[\]\/]/;

function safeFirebaseKey(value) {
  return String(value || "default")
    .trim()
    .toLowerCase()
    .replace(/[.#$\[\]\/]/g, "_");
}

function cloudReportRef(branchName = getActiveBranch()) {
  return ref(realtimeDb, `reportSystems/domexDailyCourier_${safeFirebaseKey(branchName)}`);
}

function encodeFirebaseKey(key) {
  const value = String(key);
  if (value && !INVALID_FIREBASE_KEY.test(value) && !value.startsWith(ENCODED_KEY_PREFIX)) return value;
  return `${ENCODED_KEY_PREFIX}${encodeURIComponent(value).replace(/\./g, "%2E")}`;
}

function decodeFirebaseKey(key) {
  if (!key.startsWith(ENCODED_KEY_PREFIX)) return key;
  try {
    return decodeURIComponent(key.slice(ENCODED_KEY_PREFIX.length));
  } catch {
    return key;
  }
}

function transformObjectKeys(value, transformKey) {
  if (Array.isArray(value)) return value.map((item) => transformObjectKeys(item, transformKey));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [transformKey(key), transformObjectKeys(item, transformKey)]),
  );
}

function toFirebaseJson(value) {
  const jsonValue = JSON.parse(JSON.stringify(value));
  return transformObjectKeys(jsonValue, encodeFirebaseKey);
}

function fromFirebaseJson(value) {
  return transformObjectKeys(value, decodeFirebaseKey);
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
  return fromFirebaseJson(cloudSnapshot.val()?.snapshot || null);
}

export function subscribeToFirebaseSnapshot(onSnapshotData, onError) {
  return onValue(
    cloudReportRef(),
    (cloudSnapshot) => {
      if (!cloudSnapshot.exists()) return;
      onSnapshotData(fromFirebaseJson(cloudSnapshot.val()?.snapshot || null));
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
  return fromFirebaseJson(usersSnapshot.val()?.users || []);
}
