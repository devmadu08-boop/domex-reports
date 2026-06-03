const STORAGE_KEY = "daily-courier-report-system-v1";
const COURIER_NAMES_KEY = "daily-courier-report-system-courier-names-v1";
const SETTINGS_KEY = "daily-courier-report-system-settings-v1";
const META_KEY = "daily-courier-report-system-meta-v1";
const BACKUP_VERSION = 1;
const DEFAULT_COMPANY_NAME = "Domestic Express (pvt) ltd";
const DEFAULT_WHATSAPP_CAPTION_TEMPLATES = {
  courier: "Branch Courier Performance Report - {date}\nSent automatically from Daily Report System",
  operation: "Operation Report - {date}\nSent automatically from Daily Report System",
  delivered: "Delivered Collection Report - {date}\nSent automatically from Daily Report System",
};
const DATA_CHANGED_EVENT = "daily-courier-report-data-changed";
let suppressChangeEvent = false;

const emptyReport = {
  courierRows: [],
  operation: null,
  delivered: {},
};

function normalizeDelivered(value) {
  if (!value) return {};
  if (Array.isArray(value) || value.entries) {
    const riderName = value.riderName || "Unknown Rider";
    return {
      [riderName]: value,
    };
  }
  return value;
}

function readStore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function emitDataChanged() {
  if (suppressChangeEvent || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}

export function addDataChangeListener(listener) {
  window.addEventListener(DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  markLocalDataChanged();
  emitDataChanged();
}

function readJson(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  markLocalDataChanged();
  emitDataChanged();
}

function writeMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function markLocalDataChanged(value = new Date().toISOString()) {
  writeMeta({
    ...readJson(META_KEY, {}),
    localUpdatedAt: value,
  });
}

export function getLocalUpdatedAt() {
  return readJson(META_KEY, {}).localUpdatedAt || "";
}

export function getReportByDate(date) {
  const store = readStore();
  const report = {
    ...emptyReport,
    ...(store[date] || {}),
  };
  return {
    ...report,
    delivered: normalizeDelivered(report.delivered),
  };
}

export function saveReportByDate(date, report) {
  const store = readStore();
  store[date] = {
    ...emptyReport,
    ...report,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
}

export function saveReportType(date, type, data) {
  const store = readStore();
  store[date] = {
    ...emptyReport,
    ...(store[date] || {}),
    [type]: data,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store[date];
}

export function saveDeliveredReport(date, riderName, data) {
  const cleanRiderName = riderName.trim() || "Unknown Rider";
  const store = readStore();
  const current = {
    ...emptyReport,
    ...(store[date] || {}),
  };
  const delivered = normalizeDelivered(current.delivered);

  store[date] = {
    ...current,
    delivered: {
      ...delivered,
      [cleanRiderName]: {
        ...data,
        riderName: cleanRiderName,
      },
    },
    updatedAt: new Date().toISOString(),
  };

  writeStore(store);
  return store[date].delivered[cleanRiderName];
}

export function getDeliveredReport(date, riderName) {
  const cleanRiderName = riderName.trim();
  if (!cleanRiderName) return null;
  return getReportByDate(date).delivered?.[cleanRiderName] || null;
}

export function getDeliveredRiderNames(date) {
  return Object.keys(getReportByDate(date).delivered || {}).sort((a, b) => a.localeCompare(b));
}

export function deleteDeliveredReport(date, riderName) {
  const cleanRiderName = riderName.trim();
  const store = readStore();
  if (!store[date] || !cleanRiderName) return;

  const delivered = normalizeDelivered(store[date].delivered);
  delete delivered[cleanRiderName];

  store[date] = {
    ...emptyReport,
    ...store[date],
    delivered,
    updatedAt: new Date().toISOString(),
  };

  const isEmpty =
    (store[date].courierRows?.length || 0) === 0 &&
    !store[date].operation &&
    Object.keys(normalizeDelivered(store[date].delivered)).length === 0;

  if (isEmpty) {
    delete store[date];
  }

  writeStore(store);
}

export function deleteReportType(date, type) {
  const store = readStore();
  if (!store[date]) return;

  store[date] = {
    ...emptyReport,
    ...store[date],
    [type]: type === "courierRows" ? [] : type === "delivered" ? {} : null,
    updatedAt: new Date().toISOString(),
  };

  const isEmpty =
    (store[date].courierRows?.length || 0) === 0 &&
    !store[date].operation &&
    Object.keys(normalizeDelivered(store[date].delivered)).length === 0;

  if (isEmpty) {
    delete store[date];
  }

  writeStore(store);
}

export function getReportHistory() {
  const store = readStore();
  return Object.entries(store)
    .map(([date, value]) => ({
      date,
      courierCount: value.courierRows?.length || 0,
      hasCourier: (value.courierRows?.length || 0) > 0,
      hasOperation: Boolean(value.operation),
      deliveredCount: Object.keys(normalizeDelivered(value.delivered)).length,
      deliveredRiders: Object.keys(normalizeDelivered(value.delivered)),
      hasDelivered: Object.keys(normalizeDelivered(value.delivered)).length > 0,
      updatedAt: value.updatedAt,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function clearReportByDate(date) {
  const store = readStore();
  delete store[date];
  writeStore(store);
}

export function getCourierNames() {
  return readJson(COURIER_NAMES_KEY, []).sort((a, b) => a.localeCompare(b));
}

export function saveCourierName(name) {
  const cleanName = name.trim();
  if (!cleanName) return getCourierNames();

  const names = getCourierNames();
  const exists = names.some((item) => item.toLowerCase() === cleanName.toLowerCase());
  const nextNames = exists ? names : [...names, cleanName].sort((a, b) => a.localeCompare(b));
  writeJson(COURIER_NAMES_KEY, nextNames);
  return nextNames;
}

export function deleteCourierName(name) {
  const nextNames = getCourierNames().filter((item) => item !== name);
  writeJson(COURIER_NAMES_KEY, nextNames);
  return nextNames;
}

export function getSettings() {
  const savedSettings = readJson(SETTINGS_KEY, {});
  return {
    companyName: DEFAULT_COMPANY_NAME,
    operationTarget: "",
    autoWeeklyBackup: true,
    lastAutoBackupAt: "",
    firestoreRealtimeSync: false,
    cloudLastSyncedAt: "",
    ...savedSettings,
    whatsappCaptionTemplates: {
      ...DEFAULT_WHATSAPP_CAPTION_TEMPLATES,
      ...(savedSettings.whatsappCaptionTemplates || {}),
    },
    whatsappCustomCaptionTemplates: {
      courier: [],
      operation: [],
      delivered: [],
      ...(savedSettings.whatsappCustomCaptionTemplates || {}),
    },
  };
}

export function saveSettings(settings) {
  const nextSettings = {
    ...getSettings(),
    ...settings,
  };
  writeJson(SETTINGS_KEY, nextSettings);
  return nextSettings;
}

export function createBackupData() {
  return {
    app: "Daily Courier Report System",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    localUpdatedAt: getLocalUpdatedAt(),
    reports: readStore(),
    courierNames: getCourierNames(),
    settings: getSettings(),
  };
}

export function downloadBackupFile(reason = "manual") {
  const data = {
    ...createBackupData(),
    reason,
  };
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Daily_Courier_Report_System_Backup_${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return data;
}

export async function restoreBackupFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  return restoreBackupData(data);
}

export function restoreBackupData(data, { silent = false } = {}) {
  if (!data || typeof data !== "object" || !data.reports || !Array.isArray(data.courierNames)) {
    throw new Error("Invalid backup file.");
  }

  suppressChangeEvent = silent;
  try {
    writeStore(data.reports || {});
    writeJson(COURIER_NAMES_KEY, data.courierNames || []);
    writeJson(SETTINGS_KEY, {
      ...getSettings(),
      ...(data.settings || {}),
      restoredAt: new Date().toISOString(),
    });
    markLocalDataChanged(data.cloudUpdatedAt || data.exportedAt || new Date().toISOString());
  } finally {
    suppressChangeEvent = false;
  }

  return createBackupData();
}

export function shouldRunWeeklyBackup(settings = getSettings()) {
  if (!settings.autoWeeklyBackup) return false;
  if (!settings.lastAutoBackupAt) return true;

  const lastBackupTime = new Date(settings.lastAutoBackupAt).getTime();
  if (!Number.isFinite(lastBackupTime)) return true;

  const weekInMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - lastBackupTime >= weekInMs;
}

export function markWeeklyBackupComplete() {
  return saveSettings({ lastAutoBackupAt: new Date().toISOString() });
}
