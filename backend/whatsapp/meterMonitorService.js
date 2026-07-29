import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import fs from "node:fs/promises";
import path from "node:path";
import Pino from "pino";
import QRCode from "qrcode";

const dataDir = path.resolve("backend", "data");
const authDir = path.join(dataDir, "whatsapp-meter-auth");
const configPath = path.join(dataDir, "whatsapp-meter-config.json");
const statePath = path.join(dataDir, "whatsapp-meter-state.json");
const DEFAULT_CONFIG = {
  enabled: false,
  groupJid: "",
  groupName: "",
  inWindowStart: "08:00",
  inWindowEnd: "11:30",
  outWindowStart: "17:00",
  outWindowEnd: "20:00",
  reminderIntervalMinutes: 60,
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
    });
  }
  return result;
}

function normalizeConfig(config = {}) {
  const reminderTemplate = String(config.reminderTemplate || "");
  return {
    enabled: Boolean(config.enabled),
    groupJid: String(config.groupJid || "").trim(),
    groupName: String(config.groupName || "").trim(),
    inWindowStart: validTime(config.inWindowStart, DEFAULT_CONFIG.inWindowStart),
    inWindowEnd: validTime(config.inWindowEnd, DEFAULT_CONFIG.inWindowEnd),
    outWindowStart: validTime(config.outWindowStart, DEFAULT_CONFIG.outWindowStart),
    outWindowEnd: validTime(config.outWindowEnd, DEFAULT_CONFIG.outWindowEnd),
    reminderIntervalMinutes: validReminderInterval(config.reminderIntervalMinutes),
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

export function buildReminderSlots(start, end, intervalMinutes = 60) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (endMinutes <= startMinutes) return [];

  const slots = [];
  for (
    let slot = startMinutes + validReminderInterval(intervalMinutes);
    slot <= endMinutes;
    slot += validReminderInterval(intervalMinutes)
  ) {
    slots.push(minutesToTime(slot));
  }
  const endTime = minutesToTime(endMinutes);
  if (!slots.includes(endTime)) slots.push(endTime);
  return slots;
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

async function recordPhotoSubmission(message) {
  if (!message?.key?.remoteJid?.endsWith("@g.us") || !hasMeterPhoto(message.message)) return;

  const config = await readConfig();
  if (!config.enabled || message.key.remoteJid !== config.groupJid) return;

  const clock = getColomboClock();
  const session = getSessionForTime(config, clock.time);
  if (!session) return;

  const rider = findRiderBySender(config.riders, message);
  if (!rider) return;

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

function getRiderKey(rider) {
  return rider.phoneNumber || rider.jid || rider.lid;
}

export function buildMeterTodayStatus(config, state, date = getColomboClock().date) {
  const day = state.days[date] || { sessions: {} };
  const sessions = Object.fromEntries(METER_SESSIONS.map((sessionDefinition) => {
    const session = getSession(config, sessionDefinition.key);
    const sessionState = getSessionState(day, session.key);
    const submittedKeys = new Set(Object.keys(sessionState.submissions || {}));
    const submitted = config.riders.filter((rider) => submittedKeys.has(getRiderKey(rider)));
    const missing = config.riders.filter((rider) => !submittedKeys.has(getRiderKey(rider)));
    return [session.key, {
      key: session.key,
      label: session.label,
      start: session.start,
      end: session.end,
      submitted,
      missing,
      submissionCount: submitted.length,
      missingCount: missing.length,
      riderCount: config.riders.length,
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
    submissionCount: sessions.in.submissionCount + sessions.out.submissionCount,
    missingCount: sessions.in.missingCount + sessions.out.missingCount,
    riderCount: config.riders.length,
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

async function sendMissingReminders(config, status, clock, session) {
  if (!meterSocket || meterConnectionState !== "connected") {
    throw new Error("Rider Meter WhatsApp is not connected.");
  }
  if (!status.missing.length) return { groupSent: false, privateSent: 0 };

  let groupSent = false;
  if (config.groupReminder && config.groupJid) {
    const mentions = status.missing.map((rider) => rider.phoneJid || rider.jid || rider.lid).filter(Boolean);
    const names = status.missing.map((rider) => {
      const mentionDigits = jidDigits(rider.phoneJid || rider.jid);
      return mentionDigits ? `@${mentionDigits}` : rider.name;
    });
    await meterSocket.sendMessage(config.groupJid, {
      text: `📸 *${session.label} Photo Reminder*\n📅 ${clock.date}\n⏰ ${session.start} - ${session.end}\n\nPhoto not received from:\n${names.map((name) => `• ${name}`).join("\n")}\n\nPlease send the ${session.label} photo now.`,
      mentions,
    });
    groupSent = true;
  }

  let privateSent = 0;
  if (config.privateReminder) {
    for (const rider of status.missing) {
      const recipientJid = normalizeRecipientJid(rider.phoneJid || rider.phoneNumber || rider.jid);
      if (!recipientJid) continue;
      await meterSocket.sendMessage(recipientJid, {
        text: formatReminder(config.reminderTemplate, rider, config, clock, session),
      });
      privateSent += 1;
    }
  }

  return { groupSent, privateSent };
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

async function schedulerTick() {
  const config = await readConfig();
  const clock = getColomboClock();
  if (!config.enabled) return;
  const session = getSessionForTime(config, clock.time);
  if (!session) return;

  const state = await readState();
  const day = state.days[clock.date] || { sessions: {} };
  const sessionState = getSessionState(day, session.key);
  const dueSlots = buildReminderSlots(
    session.start,
    session.end,
    config.reminderIntervalMinutes,
  ).filter((slot) => slot <= clock.time && slot > (sessionState.lastReminderSlot || ""));
  const latestDueSlot = dueSlots.at(-1);
  if (!latestDueSlot) return;

  await runMeterPhotoCheck({ sessionKey: session.key });
  const latestState = await readState();
  const latestDay = latestState.days[clock.date] || { sessions: {} };
  getSessionState(latestDay, session.key).lastReminderSlot = latestDueSlot;
  latestState.days[clock.date] = latestDay;
  await writeState(latestState);
}

export function startMeterMonitorScheduler() {
  if (meterSchedulerStarted) return;
  meterSchedulerStarted = true;
  setInterval(() => {
    schedulerTick().catch((error) => console.error("[meter-monitor-scheduler]", error.message || error));
  }, 30_000);
}

export async function startMeterMonitorClient(force = false) {
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
        recordPhotoSubmission(message).catch((error) => {
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
  return {
    status: meterConnectionState,
    connected: meterConnectionState === "connected",
    connectedNumber: meterConnectedNumber,
    hasQr: Boolean(meterQrDataUrl),
    config,
    today: buildMeterTodayStatus(config, state),
  };
}

export async function getMeterMonitorQr() {
  return { qr: meterQr, qrDataUrl: meterQrDataUrl };
}

export async function reconnectMeterMonitor() {
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
  if (!meterSocket || meterConnectionState !== "connected") {
    throw new Error("Rider Meter WhatsApp is not connected. Scan its QR code first.");
  }
  const metadata = await meterSocket.groupMetadata(String(groupJid || ""));
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
  return { ok: true, config: saved };
}
