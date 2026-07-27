import { get, onValue, ref, runTransaction, serverTimestamp, set } from "firebase/database";
import { realtimeDb } from "./firebase.js";
import { createBackupData, getActiveBranch, getUsers } from "./reportStorage.js";

const ENCODED_KEY_PREFIX = "__firebase_key__";
const INVALID_FIREBASE_KEY = /[.#$\[\]\/]/;
const PENDING_SYNC_KEY = "daily-courier-report-pending-cloud-sync-v1";

function safeFirebaseKey(value) {
  return String(value || "default")
    .trim()
    .toLowerCase()
    .replace(/[.#$\[\]\/]/g, "_");
}

function cloudReportRef(branchName = getActiveBranch()) {
  return ref(realtimeDb, `reportSystems/domexDailyCourier_${safeFirebaseKey(branchName)}`);
}

function cloudVersionRef(branchName = getActiveBranch()) {
  return ref(realtimeDb, `reportSystemVersions/${safeFirebaseKey(branchName)}`);
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

function buildCloudSnapshot(reason, sourceClientId) {
  return {
    ...createBackupData(),
    branchName: getActiveBranch(),
    reason,
    sourceClientId,
    cloudUpdatedAt: new Date().toISOString(),
  };
}

async function writeCloudSnapshot(snapshot) {
  await set(cloudReportRef(snapshot.branchName), {
    snapshot: toFirebaseJson(snapshot),
    updatedAt: serverTimestamp(),
  });
  return snapshot;
}

function pendingSyncStorageKey(branchName = getActiveBranch()) {
  return `${PENDING_SYNC_KEY}::${safeFirebaseKey(branchName)}`;
}

function savePendingCloudSync(snapshot, error) {
  localStorage.setItem(
    pendingSyncStorageKey(snapshot.branchName),
    JSON.stringify({
      snapshot,
      attempts: Number(getPendingCloudSync()?.attempts || 0) + 1,
      queuedAt: new Date().toISOString(),
      lastError: error?.message || "Cloud connection unavailable.",
    }),
  );
}

export async function uploadLocalSnapshotToFirebase(reason = "manual", sourceClientId = "") {
  return writeCloudSnapshot(buildCloudSnapshot(reason, sourceClientId));
}

export async function syncLocalSnapshotWithRecovery(reason = "auto", sourceClientId = "") {
  const snapshot = buildCloudSnapshot(reason, sourceClientId);
  try {
    await writeCloudSnapshot(snapshot);
    localStorage.removeItem(pendingSyncStorageKey(snapshot.branchName));
    return { ...snapshot, queued: false };
  } catch (error) {
    savePendingCloudSync(snapshot, error);
    return { ...snapshot, queued: true, queueError: error?.message || "Cloud connection unavailable." };
  }
}

export function getPendingCloudSync() {
  try {
    return JSON.parse(localStorage.getItem(pendingSyncStorageKey()) || "null");
  } catch {
    return null;
  }
}

export async function flushPendingCloudSync() {
  const pending = getPendingCloudSync();
  if (!pending?.snapshot) return null;
  try {
    const snapshot = {
      ...pending.snapshot,
      reason: "automatic-cloud-recovery",
      cloudUpdatedAt: new Date().toISOString(),
    };
    await writeCloudSnapshot(snapshot);
    localStorage.removeItem(pendingSyncStorageKey());
    return { ...snapshot, recovered: true };
  } catch (error) {
    savePendingCloudSync(pending.snapshot, error);
    throw error;
  }
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

export async function createSystemVersion(label = "Automatic system version", sourceClientId = "") {
  const currentSnapshot = buildCloudSnapshot("system-version", sourceClientId);
  await writeCloudSnapshot(currentSnapshot);
  const [systemsSnapshot, usersSnapshot] = await Promise.all([
    get(ref(realtimeDb, "reportSystems")),
    get(ref(realtimeDb, "reportSystemAdmin/users")),
  ]);
  const versions = await listSystemVersions();
  const currentMaxMinor = versions.reduce((max, item) => Math.max(max, Number(item.minor) || 0), -1);
  const counter = await runTransaction(
    ref(realtimeDb, `reportSystemVersionCounters/${safeFirebaseKey(getActiveBranch())}`),
    (current) => Math.max(current == null || !Number.isFinite(Number(current)) ? -1 : Number(current), currentMaxMinor) + 1,
  );
  const nextMinor = Number(counter.snapshot.val());
  const branches = Object.fromEntries(
    Object.entries(systemsSnapshot.val() || {})
      .map(([branchKey, value]) => [branchKey, fromFirebaseJson(value?.snapshot || null)])
      .filter(([, value]) => value),
  );
  const snapshot = {
    ...currentSnapshot,
    users: fromFirebaseJson(usersSnapshot.val()?.users || currentSnapshot.users || getUsers()),
  };
  const id = `v1_${nextMinor}_${Date.now()}`;
  const version = {
    id,
    name: `v1.${nextMinor}`,
    minor: nextMinor,
    label,
    createdAt: snapshot.cloudUpdatedAt,
    sourceClientId,
    snapshot,
    branches,
  };
  await set(ref(realtimeDb, `reportSystemVersions/${safeFirebaseKey(getActiveBranch())}/${id}`), {
    ...version,
    snapshot: toFirebaseJson(snapshot),
    branches: toFirebaseJson(branches),
    createdAtServer: serverTimestamp(),
  });
  return version;
}

export async function listSystemVersions() {
  const versionsSnapshot = await get(cloudVersionRef());
  if (!versionsSnapshot.exists()) return [];
  const versions = Object.values(versionsSnapshot.val() || {})
    .map((item) => ({
      ...item,
      snapshot: fromFirebaseJson(item.snapshot || null),
      branches: fromFirebaseJson(item.branches || {}),
    }))
    .sort((a, b) => Number(b.minor || 0) - Number(a.minor || 0));
  return versions.filter(
    (version, index) => versions.findIndex((candidate) => Number(candidate.minor) === Number(version.minor)) === index,
  );
}

export async function getSystemVersion(versionId) {
  const versionSnapshot = await get(
    ref(realtimeDb, `reportSystemVersions/${safeFirebaseKey(getActiveBranch())}/${safeFirebaseKey(versionId)}`),
  );
  if (!versionSnapshot.exists()) return null;
  const value = versionSnapshot.val();
  return {
    ...value,
    snapshot: fromFirebaseJson(value.snapshot || null),
    branches: fromFirebaseJson(value.branches || {}),
  };
}

export async function restoreSystemVersionToFirebase(versionId, sourceClientId = "") {
  const version = await getSystemVersion(versionId);
  if (!version?.snapshot) throw new Error("Selected system version could not be loaded.");
  const fallbackKey = `domexDailyCourier_${safeFirebaseKey(version.snapshot.branchName || getActiveBranch())}`;
  const branches = Object.keys(version.branches || {}).length
    ? version.branches
    : { [fallbackKey]: version.snapshot };

  await Promise.all(
    Object.values(branches).map((branchSnapshot) =>
      writeCloudSnapshot({
        ...branchSnapshot,
        reason: `restored-${version.name}`,
        sourceClientId,
        cloudUpdatedAt: new Date().toISOString(),
      })),
  );

  if (Array.isArray(version.snapshot.users)) {
    await set(ref(realtimeDb, "reportSystemAdmin/users"), {
      users: toFirebaseJson(version.snapshot.users),
      updatedAt: serverTimestamp(),
    });
  }
  return version;
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
