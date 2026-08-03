import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import fs from "node:fs/promises";
import path from "node:path";
import Pino from "pino";
import QRCode from "qrcode";
import {
  fetchPrimaryWhatsAppGroupMetadata,
  fetchWhatsAppGroups,
  getPrimaryWhatsAppRuntimeStatus,
  sendPrimaryWhatsAppMessage,
  subscribeToPrimaryWhatsAppMessages,
} from "./whatsappService.js";

const dataDir = path.resolve("backend", "data");
const authDir = path.join(dataDir, "whatsapp-meter-auth");
const configPath = path.join(dataDir, "whatsapp-meter-config.json");
const statePath = path.join(dataDir, "whatsapp-meter-state.json");
const FIXED_METER_SCHEDULE = {
  inWindowStart: "08:00",
  inWindowEnd: "11:30",
  outWindowStart: "15:00",
  outWindowEnd: "17:00",
};
export const METER_SCAN_INTERVAL_MS = 10_000;
const DEFAULT_CONFIG = {
  accountMode: "separate",
  enabled: false,
  groupJid: "",
  groupName: "",
  ...FIXED_METER_SCHEDULE,
  reminderIntervalMinutes: 60,
  messageDelaySeconds: 15,
  specialHolidays: [],
  groupReminder: true,
  privateReminder: true,
  reminderTemplate: "📸 *Daily Rider {type} Photo Reminder*\n\n{name}, please send today's {type} photo before {end}.",
  riders: [],
};
const METER_SESSIONS = [
  { key: "in", label: "IN Meter", startField: "inWindowStart", endField: "inWindowEnd" },
  { key: "out", label: "OUT Meter", startField: "outWindowStart", endField: "outWindowEnd" },
];
const LEGACY_REMINDER_TEMPLATE = "📸 *Daily Rider Meter Photo Reminder*\n\n{name}, please send today's rider meter photo before the daily check closes.";

let meterSocket = null;
let meterQr = "";
let meterQrDataUrl = "";
let meterConnectionState = "disconnected";
let meterConnectedNumber = "";
let meterReconnecting = false;
let meterSchedulerStarted = false;
let meterCheckRunning = false;
let stateWriteQueue = Promise.resolve();
let meterManualQueue = Promise.resolve();
const queuedManualChecks = new Set();

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function normalizePhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 && digits.startsWith("0") ? `94${digits.slice(1)}` : digits;
}

function jidDigits(value) {
  return normalizePhoneDigits(String(value || "").split("@")[0].split(":")[0]);
}

export function buildMeterRiderMention(rider = {}) {
  const riderName = String(rider.name || "Rider").trim() || "Rider";
  const phoneDigits = normalizePhoneDigits(rider.phoneNumber || rider.phoneJid);
  const fallbackDigits = jidDigits(rider.jid || rider.lid);
  const mentionDigits = phoneDigits || fallbackDigits;
  const mentionJids = [...new Set(
    [rider.phoneJid, rider.jid, rider.lid]
      .map((value) => String(value || "").trim())
      .filter((value) => value.includes("@")),
  )];

  return {
    text: mentionDigits ? `*${riderName}* - @${mentionDigits}` : `*${riderName}*`,
    jids: mentionJids,
  };
}

function normalizeRecipientJid(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  const digits = normalizePhoneDigits(raw);
  return digits ? `${digits}@s.whatsapp.net` : "";
}

function validTime(value, fallback) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : fallback;
}

function validReminderInterval(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 15 && minutes <= 240 ? minutes : 60;
}

function validMessageDelay(value) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 5 && seconds <= 120 ? seconds : 15;
}

function normalizeDateList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  )].sort();
}

export function normalizeMeterAccountMode(value) {
  return value === "primary" ? "primary" : "separate";
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours * 60) + minutes;
}

function minutesToTime(value) {
  const hours = Math.floor(value / 60) % 24;
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeRiders(riders) {
  const result = [];
  const seen = new Set();
  for (const rider of Array.isArray(riders) ? riders : []) {
    const jid = String(rider?.jid || "").trim();
    const phoneNumber = normalizePhoneDigits(rider?.phoneNumber || rider?.phoneJid);
    const identity = phoneNumber || jid;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    result.push({
      name: String(rider?.name || phoneNumber || jidDigits(jid) || jid).trim(),
      jid,
      phoneNumber,
      phoneJid: phoneNumber ? `${phoneNumber}@s.whatsapp.net` : String(rider?.phoneJid || "").trim(),
      lid: String(rider?.lid || "").trim(),
      leaveDates: normalizeDateList(rider?.leaveDates),
    });
  }
  return result;
}

function normalizeConfig(config = {}) {
  const reminderTemplate = String(config.reminderTemplate || "");
  return {
    accountMode: normalizeMeterAccountMode(config.accountMode),
    enabled: Boolean(config.enabled),
    groupJid: String(config.groupJid || "").trim(),
    groupName: String(config.groupName || "").trim(),
    ...FIXED_METER_SCHEDULE,
    reminderIntervalMinutes: validReminderInterval(config.reminderIntervalMinutes),
    messageDelaySeconds: validMessageDelay(config.messageDelaySeconds),
    specialHolidays: normalizeDateList(config.specialHolidays),
    groupReminder: config.groupReminder !== false,
    privateReminder: config.privateReminder !== false,
    reminderTemplate: !reminderTemplate || reminderTemplate === LEGACY_REMINDER_TEMPLATE
      ? DEFAULT_CONFIG.reminderTemplate
      : reminderTemplate,
    riders: normalizeRiders(config.riders),
  };
}

async function readJson(filePath, fallback) {
  await ensureDataDir();
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readConfig() {
  return normalizeConfig(await readJson(configPath, DEFAULT_CONFIG));
}

async function writeConfig(config) {
  const normalized = normalizeConfig(config);
  await ensureDataDir();
  await fs.writeFile(configPath, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function readState() {
  const state = await readJson(statePath, { days: {} });
  return { days: state?.days && typeof state.days === "object" ? state.days : {} };
}

async function writeState(state) {
  stateWriteQueue = stateWriteQueue.then(async () => {
    const dates = Object.keys(state.days || {}).sort().slice(-45);
    const compactState = {
      days: Object.fromEntries(dates.map((date) => [date, state.days[date]])),
    };
    await ensureDataDir();
    await fs.writeFile(statePath, JSON.stringify(compactState, null, 2));
  });
  await stateWriteQueue;
}

function getColomboClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    timestamp: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30`,
  };
}

export function isTimeWithinWindow(time, start, end) {
  if (start <= end) return time >= start && time <= end;
  return time >= start || time <= end;
}

function isSunday(date) {
  const midday = new Date(`${date}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    weekday: "short",
  }).format(midday) === "Sun";
}

export function getMeterDayAvailability(config, date) {
  if (isSunday(date)) {
    return { inactive: true, reason: "Sunday branch holiday" };
  }
  if ((config.specialHolidays || []).includes(date)) {
    return { inactive: true, reason: "Special branch holiday" };
  }
  return { inactive: false, reason: "" };
}

export function buildReminderSlots(start, end) {
  const validStart = validTime(start, "");
  const validEnd = validTime(end, "");
  if (!validStart || !validEnd) return [];
  return validStart === validEnd ? [validStart] : [validStart, validEnd];
}

export function getDueReminderSlot(start, end, currentTime, lastReminderSlot = "") {
  return buildReminderSlots(start, end)
    .find((slot) => slot === currentTime && slot > lastReminderSlot) || "";
}

function getSession(config, sessionKey) {
  const session = METER_SESSIONS.find((item) => item.key === sessionKey);
  return session
    ? { ...session, start: config[session.startField], end: config[session.endField] }
    : null;
}

function getSessionForTime(config, time) {
  return METER_SESSIONS
    .map((session) => getSession(config, session.key))
    .find((session) => isTimeWithinWindow(time, session.start, session.end)) || null;
}

function getSessionState(day, sessionKey) {
  if (!day.sessions) day.sessions = {};
  if (!day.sessions[sessionKey]) {
    day.sessions[sessionKey] = {
      submissions: sessionKey === "out" && day.submissions ? day.submissions : {},
      lastReminderSlot: "",
      reminderHistory: [],
    };
  }
  day.sessions[sessionKey].submissions ||= {};
  day.sessions[sessionKey].reminderHistory ||= [];
  return day.sessions[sessionKey];
}

function unwrapMessageContent(message) {
  let content = message || {};
  for (let index = 0; index < 5; index += 1) {
    const wrapped =
      content.ephemeralMessage?.message
      || content.viewOnceMessage?.message
      || content.viewOnceMessageV2?.message
      || content.viewOnceMessageV2Extension?.message
      || content.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  return content;
}

export function hasMeterPhoto(message) {
  const content = unwrapMessageContent(message);
  return Boolean(
    content.imageMessage
    || (content.documentMessage?.mimetype || "").startsWith("image/"),
  );
}

function riderIdentityCandidates(rider) {
  return new Set([
    rider.jid,
    rider.phoneJid,
    rider.lid,
    rider.phoneNumber,
    jidDigits(rider.jid),
    jidDigits(rider.phoneJid),
    jidDigits(rider.lid),
  ].filter(Boolean));
}

function findRiderBySender(riders, message) {
  const senderValues = [
    message.key?.participant,
    message.key?.participantAlt,
    message.participant,
  ].filter(Boolean);
  const senderCandidates = new Set(senderValues.flatMap((value) => [value, jidDigits(value)]).filter(Boolean));
  return riders.find((rider) => [...riderIdentityCandidates(rider)].some((value) => senderCandidates.has(value)));
}

async function recordPhotoSubmission(message, sourceMode) {
  if (!message?.key?.remoteJid?.endsWith("@g.us") || !hasMeterPhoto(message.message)) return;

  const config = await readConfig();
  if (config.accountMode !== sourceMode) return;
  if (!config.enabled || message.key.remoteJid !== config.groupJid) return;

  const clock = getColomboClock();
  if (getMeterDayAvailability(config, clock.date).inactive) return;
  const session = getSessionForTime(config, clock.time);
  if (!session) return;

  const rider = findRiderBySender(config.riders, message);
  if (!rider || rider.leaveDates?.includes(clock.date)) return;

  const state = await readState();
  const day = state.days[clock.date] || { sessions: {} };
  const sessionState = getSessionState(day, session.key);
  const riderKey = rider.phoneNumber || rider.jid || rider.lid;
  sessionState.submissions[riderKey] = {
    name: rider.name,
    jid: rider.jid,
    phoneNumber: rider.phoneNumber,
    receivedAt: clock.timestamp,
    messageId: message.key.id || "",
    session: session.key,
  };
  state.days[clock.date] = day;
  await writeState(state);
}

subscribeToPrimaryWhatsAppMessages(({ messages, type }) => {
  if (type !== "notify") return;
  for (const message of messages) {
    recordPhotoSubmission(message, "primary").catch((error) => {
      console.error("[meter-monitor-primary-photo]", error.message || error);
    });
  }
});

function getRiderKey(rider) {
  return rider.phoneNumber || rider.jid || rider.lid;
}

export function buildMeterTodayStatus(config, state, date = getColomboClock().date) {
  const day = state.days[date] || { sessions: {} };
  const availability = getMeterDayAvailability(config, date);
  const onLeave = availability.inactive
    ? [...config.riders]
    : config.riders.filter((rider) => rider.leaveDates?.includes(date));
  const requiredRiders = availability.inactive
    ? []
    : config.riders.filter((rider) => !rider.leaveDates?.includes(date));
  const sessions = Object.fromEntries(METER_SESSIONS.map((sessionDefinition) => {
    const session = getSession(config, sessionDefinition.key);
    const sessionState = getSessionState(day, session.key);
    const submittedKeys = new Set(Object.keys(sessionState.submissions || {}));
    const submitted = requiredRiders.filter((rider) => submittedKeys.has(getRiderKey(rider)));
    const missing = requiredRiders.filter((rider) => !submittedKeys.has(getRiderKey(rider)));
    return [session.key, {
      key: session.key,
      label: session.label,
      start: session.start,
      end: session.end,
      submitted,
      missing,
      submissionCount: submitted.length,
      missingCount: missing.length,
      riderCount: requiredRiders.length,
      lastReminderSlot: sessionState.lastReminderSlot || "",
      reminderHistory: sessionState.reminderHistory || [],
      submissions: sessionState.submissions || {},
    }];
  }));
  return {
    date,
    sessions,
    in: sessions.in,
    out: sessions.out,
    inactive: availability.inactive,
    inactiveReason: availability.reason,
    onLeave,
    onLeaveCount: onLeave.length,
    submissionCount: sessions.in.submissionCount + sessions.out.submissionCount,
    missingCount: sessions.in.missingCount + sessions.out.missingCount,
    riderCount: requiredRiders.length,
  };
}

function formatReminder(template, rider, config, clock, session) {
  return String(template || DEFAULT_CONFIG.reminderTemplate)
    .replaceAll("{name}", rider.name || "Rider")
    .replaceAll("{date}", clock.date)
    .replaceAll("{group}", config.groupName || "Rider group")
    .replaceAll("{type}", session.label)
    .replaceAll("{start}", session.start)
    .replaceAll("{end}", session.end);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function getMeterReminderDelayMs(config, randomValue = Math.random()) {
  const baseDelay = validMessageDelay(config.messageDelaySeconds) * 1000;
  const randomGap = Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * 5000);
  return baseDelay + randomGap;
}

async function waitBeforeNextReminder(config, messagesSent) {
  if (!messagesSent) return;
  await wait(getMeterReminderDelayMs(config));
}

function getMeterRuntimeStatus(config) {
  if (config.accountMode === "primary") {
    return getPrimaryWhatsAppRuntimeStatus();
  }
  return {
    status: meterConnectionState,
    connected: meterConnectionState === "connected",
    connectedNumber: meterConnectedNumber,
  };
}

async function sendMeterMessage(config, recipientJid, content) {
  if (config.accountMode === "primary") {
    return sendPrimaryWhatsAppMessage(recipientJid, content);
  }
  if (!meterSocket || meterConnectionState !== "connected") {
    throw new Error("Separate Meter Monitor WhatsApp is not connected.");
  }
  return meterSocket.sendMessage(recipientJid, content);
}

async function sendMissingReminders(config, status, clock, session) {
  if (!getMeterRuntimeStatus(config).connected) {
    throw new Error(
      config.accountMode === "primary"
        ? "Primary report WhatsApp is not connected."
        : "Separate Meter Monitor WhatsApp is not connected.",
    );
  }
  if (!status.missing.length) return { groupSent: false, privateSent: 0 };

  let groupSent = false;
  let messagesSent = 0;
  if (config.groupReminder && config.groupJid) {
    const riderMentions = status.missing.map(buildMeterRiderMention);
    const mentions = [...new Set(riderMentions.flatMap((rider) => rider.jids))];
    await sendMeterMessage(config, config.groupJid, {
      text: `📸 *${session.label} Photo Reminder*\n📅 ${clock.date}\n⏰ ${session.start} - ${session.end}\n\nPhoto not received from:\n${riderMentions.map((rider) => `• ${rider.text}`).join("\n")}\n\nPlease send the ${session.label} photo now.`,
      mentions,
    });
    groupSent = true;
    messagesSent += 1;
  }

  let privateSent = 0;
  if (config.privateReminder) {
    for (const rider of status.missing) {
      const recipientJid = normalizeRecipientJid(rider.phoneJid || rider.phoneNumber || rider.jid);
      if (!recipientJid) continue;
      await waitBeforeNextReminder(config, messagesSent);
      await sendMeterMessage(config, recipientJid, {
        text: formatReminder(config.reminderTemplate, rider, config, clock, session),
      });
      privateSent += 1;
      messagesSent += 1;
    }
  }

  return {
    groupSent,
    privateSent,
    messagesSent,
    messageDelaySeconds: config.messageDelaySeconds,
  };
}

export async function runMeterPhotoCheck({ force = false, sessionKey = "" } = {}) {
  if (meterCheckRunning) return { ok: true, skipped: true, reason: "Meter photo check is already running." };
  meterCheckRunning = true;
  try {
    const config = await readConfig();
    const clock = getColomboClock();
    if (!config.enabled && !force) return { ok: true, skipped: true, reason: "Meter monitoring is disabled." };
    if (!config.groupJid) throw new Error("Select a Rider Meter WhatsApp group.");
    if (!config.riders.length) throw new Error("Select at least one required rider.");
    const availability = getMeterDayAvailability(config, clock.date);
    if (availability.inactive) {
      return { ok: true, skipped: true, reason: availability.reason };
    }

    const session = sessionKey ? getSession(config, sessionKey) : getSessionForTime(config, clock.time);
    if (!session) {
      return { ok: true, skipped: true, reason: "No IN or OUT meter photo window is currently active." };
    }

    const state = await readState();
    const todayStatus = buildMeterTodayStatus(config, state, clock.date);
    const status = todayStatus.sessions[session.key];
    const sent = await sendMissingReminders(config, status, clock, session);
    const day = state.days[clock.date] || { sessions: {} };
    const sessionState = getSessionState(day, session.key);
    sessionState.reminderHistory.push({
      sentAt: clock.timestamp,
      slot: force ? "manual" : clock.time,
      missingCount: status.missingCount,
    });
    sessionState.missingAtLastReminder = status.missing.map((rider) => ({
      name: rider.name,
      jid: rider.jid,
      phoneNumber: rider.phoneNumber,
    }));
    state.days[clock.date] = day;
    await writeState(state);
    return {
      ok: true,
      sessionKey: session.key,
      sessionLabel: session.label,
      ...status,
      ...sent,
      reminderSentAt: clock.timestamp,
    };
  } finally {
    meterCheckRunning = false;
  }
}

export async function queueMeterPhotoCheck({ sessionKey = "" } = {}) {
  const config = await readConfig();
  const clock = getColomboClock();
  if (!getMeterRuntimeStatus(config).connected) {
    throw new Error(
      config.accountMode === "primary"
        ? "Primary report WhatsApp is not connected."
        : "Separate Meter Monitor WhatsApp is not connected.",
    );
  }
  if (!config.groupJid) throw new Error("Select a Rider Meter WhatsApp group.");
  if (!config.riders.length) throw new Error("Select at least one required rider.");

  const availability = getMeterDayAvailability(config, clock.date);
  if (availability.inactive) {
    return { ok: true, skipped: true, reason: availability.reason };
  }

  const session = getSession(config, sessionKey);
  if (!session) throw new Error("Choose either the IN or OUT meter check.");

  const state = await readState();
  const status = buildMeterTodayStatus(config, state, clock.date).sessions[session.key];
  if (!status.missingCount) {
    return {
      ok: true,
      queued: false,
      sessionKey: session.key,
      sessionLabel: session.label,
      ...status,
    };
  }

  const queueKey = `${clock.date}:${session.key}`;
  if (queuedManualChecks.has(queueKey)) {
    return {
      ok: true,
      queued: true,
      duplicatePrevented: true,
      sessionKey: session.key,
      sessionLabel: session.label,
      missingCount: status.missingCount,
      messageDelaySeconds: config.messageDelaySeconds,
    };
  }

  queuedManualChecks.add(queueKey);
  meterManualQueue = meterManualQueue
    .catch(() => undefined)
    .then(() => runMeterPhotoCheck({ force: true, sessionKey: session.key }))
    .catch((error) => {
      console.error("[meter-monitor-manual-queue]", error.message || error);
    })
    .finally(() => {
      queuedManualChecks.delete(queueKey);
    });

  const estimatedMessages =
    (config.groupReminder ? 1 : 0)
    + (config.privateReminder ? status.missing.length : 0);
  return {
    ok: true,
    queued: true,
    sessionKey: session.key,
    sessionLabel: session.label,
    missingCount: status.missingCount,
    estimatedMessages,
    estimatedMinimumSeconds: Math.max(0, estimatedMessages - 1) * config.messageDelaySeconds,
    messageDelaySeconds: config.messageDelaySeconds,
  };
}

async function schedulerTick() {
  const config = await readConfig();
  const clock = getColomboClock();
  if (!config.enabled) return;
  if (getMeterDayAvailability(config, clock.date).inactive) return;
  const session = getSessionForTime(config, clock.time);
  if (!session) return;

  const state = await readState();
  const day = state.days[clock.date] || { sessions: {} };
  const sessionState = getSessionState(day, session.key);
  const dueSlot = getDueReminderSlot(
    session.start,
    session.end,
    clock.time,
    sessionState.lastReminderSlot || "",
  );
  if (!dueSlot) return;

  // Claim the slot before sending so a partial failure cannot trigger repeated batches.
  sessionState.lastReminderSlot = dueSlot;
  day.sessions[session.key] = sessionState;
  state.days[clock.date] = day;
  await writeState(state);
  await runMeterPhotoCheck({ sessionKey: session.key });
}

export function startMeterMonitorScheduler() {
  if (meterSchedulerStarted) return;
  meterSchedulerStarted = true;
  setInterval(() => {
    schedulerTick().catch((error) => console.error("[meter-monitor-scheduler]", error.message || error));
  }, METER_SCAN_INTERVAL_MS);
}

export async function startMeterMonitorClient(force = false) {
  const config = await readConfig();
  if (config.accountMode === "primary") {
    meterQr = "";
    meterQrDataUrl = "";
    return null;
  }
  if (meterSocket && !force) return meterSocket;
  if (meterReconnecting) return meterSocket;

  meterReconnecting = true;
  await ensureDataDir();
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    const nextSocket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      logger: Pino({ level: "silent" }),
      browser: ["Rider Meter Monitor", "Chrome", "1.0.0"],
    });
    meterSocket = nextSocket;

    nextSocket.ev.on("creds.update", saveCreds);
    nextSocket.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages || []) {
        recordPhotoSubmission(message, "separate").catch((error) => {
          console.error("[meter-monitor-photo]", error.message || error);
        });
      }
    });
    nextSocket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        meterQr = qr;
        meterQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
        meterConnectionState = "qr";
      }
      if (connection === "open") {
        meterQr = "";
        meterQrDataUrl = "";
        meterConnectionState = "connected";
        meterConnectedNumber = jidDigits(nextSocket.user?.id);
      }
      if (connection === "close") {
        if (meterSocket !== nextSocket) return;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        meterConnectionState = "disconnected";
        meterConnectedNumber = "";
        meterSocket = null;
        if (!loggedOut) {
          setTimeout(() => startMeterMonitorClient(true).catch(console.error), 2500);
        }
      }
    });
    return meterSocket;
  } finally {
    meterReconnecting = false;
  }
}

export async function getMeterMonitorStatus() {
  const [config, state] = await Promise.all([readConfig(), readState()]);
  const runtime = getMeterRuntimeStatus(config);
  return {
    status: runtime.status,
    connected: runtime.connected,
    connectedNumber: runtime.connectedNumber,
    accountMode: config.accountMode,
    connectionSource: config.accountMode === "primary" ? "Primary Report WhatsApp" : "Separate Monitor WhatsApp",
    hasQr: config.accountMode === "separate" && Boolean(meterQrDataUrl),
    config,
    today: buildMeterTodayStatus(config, state),
  };
}

export async function getMeterMonitorQr() {
  const config = await readConfig();
  if (config.accountMode === "primary") {
    return { qr: "", qrDataUrl: "", accountMode: config.accountMode };
  }
  return { qr: meterQr, qrDataUrl: meterQrDataUrl, accountMode: config.accountMode };
}

export async function reconnectMeterMonitor() {
  const config = await readConfig();
  if (config.accountMode === "primary") {
    return getMeterMonitorStatus();
  }
  const previousSocket = meterSocket;
  meterSocket = null;
  if (previousSocket) {
    try {
      previousSocket.end(undefined);
    } catch {
      // The old monitor socket may already be closed.
    }
  }
  meterConnectionState = "disconnected";
  await startMeterMonitorClient(true);
  return getMeterMonitorStatus();
}

export async function logoutMeterMonitor() {
  const config = await readConfig();
  if (config.accountMode === "primary") {
    return getMeterMonitorStatus();
  }
  const previousSocket = meterSocket;
  meterSocket = null;
  if (previousSocket) {
    try {
      await previousSocket.logout();
    } catch {
      // Remove the isolated auth state even if the remote logout fails.
    }
  }
  meterQr = "";
  meterQrDataUrl = "";
  meterConnectionState = "disconnected";
  meterConnectedNumber = "";
  await fs.rm(authDir, { recursive: true, force: true });
  return getMeterMonitorStatus();
}

export async function fetchMeterMonitorGroups() {
  const config = await readConfig();
  if (config.accountMode === "primary") {
    return fetchWhatsAppGroups();
  }
  if (!meterSocket || meterConnectionState !== "connected") {
    throw new Error("Rider Meter WhatsApp is not connected. Scan its QR code first.");
  }
  const groups = await meterSocket.groupFetchAllParticipating();
  return Object.values(groups)
    .map((group) => ({
      jid: group.id,
      name: group.subject,
      participants: group.participants?.length || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchMeterGroupParticipants(groupJid) {
  const config = await readConfig();
  let metadata;
  if (config.accountMode === "primary") {
    metadata = await fetchPrimaryWhatsAppGroupMetadata(groupJid);
  } else {
    if (!meterSocket || meterConnectionState !== "connected") {
      throw new Error("Separate Meter Monitor WhatsApp is not connected. Scan its QR code first.");
    }
    metadata = await meterSocket.groupMetadata(String(groupJid || ""));
  }
  return {
    groupJid: metadata.id,
    groupName: metadata.subject,
    participants: (metadata.participants || []).map((participant) => {
      const phoneJid = participant.phoneNumber || (participant.id?.endsWith("@s.whatsapp.net") ? participant.id : "");
      return {
        jid: participant.id || "",
        phoneJid,
        phoneNumber: jidDigits(phoneJid),
        lid: participant.lid || (participant.id?.endsWith("@lid") ? participant.id : ""),
        admin: participant.admin || "",
      };
    }),
  };
}

export async function saveMeterMonitorConfig(config) {
  const normalized = normalizeConfig(config);
  for (const session of METER_SESSIONS.map((item) => getSession(normalized, item.key))) {
    if (timeToMinutes(session.end) <= timeToMinutes(session.start)) {
      throw new Error(`${session.label} end time must be after its start time.`);
    }
  }
  const saved = await writeConfig(normalized);
  if (saved.accountMode === "primary" && meterSocket) {
    const previousSocket = meterSocket;
    meterSocket = null;
    meterConnectionState = "disconnected";
    meterConnectedNumber = "";
    meterQr = "";
    meterQrDataUrl = "";
    try {
      previousSocket.end(undefined);
    } catch {
      // Keep the separate auth files so the user can switch back later.
    }
  } else if (saved.accountMode === "separate" && !meterSocket) {
    startMeterMonitorClient().catch((error) => {
      console.error("[meter-monitor-mode-switch]", error.message || error);
    });
  }
  return { ok: true, config: saved };
}
