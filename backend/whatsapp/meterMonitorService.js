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
  windowStart: "17:00",
  windowEnd: "19:00",
  reminderTime: "19:05",
  groupReminder: true,
  privateReminder: true,
  reminderTemplate: "📸 *Daily Rider Meter Photo Reminder*\n\n{name}, please send today's rider meter photo before the daily check closes.",
  riders: [],
};

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
  return {
    ...DEFAULT_CONFIG,
    ...config,
    enabled: Boolean(config.enabled),
    groupJid: String(config.groupJid || "").trim(),
    groupName: String(config.groupName || "").trim(),
    windowStart: validTime(config.windowStart, DEFAULT_CONFIG.windowStart),
    windowEnd: validTime(config.windowEnd, DEFAULT_CONFIG.windowEnd),
    reminderTime: validTime(config.reminderTime, DEFAULT_CONFIG.reminderTime),
    groupReminder: config.groupReminder !== false,
    privateReminder: config.privateReminder !== false,
    reminderTemplate: String(config.reminderTemplate || DEFAULT_CONFIG.reminderTemplate),
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
  if (!isTimeWithinWindow(clock.time, config.windowStart, config.windowEnd)) return;

  const rider = findRiderBySender(config.riders, message);
  if (!rider) return;

  const state = await readState();
  const day = state.days[clock.date] || { submissions: {} };
  const riderKey = rider.phoneNumber || rider.jid || rider.lid;
  day.submissions = day.submissions || {};
  day.submissions[riderKey] = {
    name: rider.name,
    jid: rider.jid,
    phoneNumber: rider.phoneNumber,
    receivedAt: clock.timestamp,
    messageId: message.key.id || "",
  };
  state.days[clock.date] = day;
  await writeState(state);
}

function getRiderKey(rider) {
  return rider.phoneNumber || rider.jid || rider.lid;
}

export function buildMeterTodayStatus(config, state, date = getColomboClock().date) {
  const day = state.days[date] || { submissions: {} };
  const submittedKeys = new Set(Object.keys(day.submissions || {}));
  const submitted = config.riders.filter((rider) => submittedKeys.has(getRiderKey(rider)));
  const missing = config.riders.filter((rider) => !submittedKeys.has(getRiderKey(rider)));
  return {
    date,
    submitted,
    missing,
    submissionCount: submitted.length,
    missingCount: missing.length,
    riderCount: config.riders.length,
    reminderSentAt: day.reminderSentAt || "",
    submissions: day.submissions || {},
  };
}

function formatReminder(template, rider, config, clock) {
  return String(template || DEFAULT_CONFIG.reminderTemplate)
    .replaceAll("{name}", rider.name || "Rider")
    .replaceAll("{date}", clock.date)
    .replaceAll("{group}", config.groupName || "Rider group")
    .replaceAll("{start}", config.windowStart)
    .replaceAll("{end}", config.windowEnd);
}

async function sendMissingReminders(config, status, clock) {
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
      text: `📸 *Rider Meter Photo Reminder*\n📅 ${clock.date}\n\nPhoto not received from:\n${names.map((name) => `• ${name}`).join("\n")}\n\nPlease send the meter photo now.`,
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
        text: formatReminder(config.reminderTemplate, rider, config, clock),
      });
      privateSent += 1;
    }
  }

  return { groupSent, privateSent };
}

export async function runMeterPhotoCheck({ force = false } = {}) {
  if (meterCheckRunning) return { ok: true, skipped: true, reason: "Meter photo check is already running." };
  meterCheckRunning = true;
  try {
    const config = await readConfig();
    const clock = getColomboClock();
    if (!config.enabled && !force) return { ok: true, skipped: true, reason: "Meter monitoring is disabled." };
    if (!config.groupJid) throw new Error("Select a Rider Meter WhatsApp group.");
    if (!config.riders.length) throw new Error("Select at least one required rider.");

    const state = await readState();
    const status = buildMeterTodayStatus(config, state, clock.date);
    if (status.reminderSentAt && !force) {
      return { ok: true, skipped: true, reason: "Today's reminder was already sent.", ...status };
    }

    const sent = await sendMissingReminders(config, status, clock);
    const day = state.days[clock.date] || { submissions: {} };
    day.reminderSentAt = clock.timestamp;
    day.missingAtReminder = status.missing.map((rider) => ({
      name: rider.name,
      jid: rider.jid,
      phoneNumber: rider.phoneNumber,
    }));
    state.days[clock.date] = day;
    await writeState(state);
    return { ok: true, ...status, ...sent, reminderSentAt: clock.timestamp };
  } finally {
    meterCheckRunning = false;
  }
}

async function schedulerTick() {
  const config = await readConfig();
  const clock = getColomboClock();
  if (!config.enabled || clock.time < config.reminderTime) return;
  const state = await readState();
  if (state.days[clock.date]?.reminderSentAt) return;
  await runMeterPhotoCheck();
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
  if (
    normalized.windowStart <= normalized.windowEnd
    && normalized.reminderTime < normalized.windowEnd
  ) {
    throw new Error("Reminder time must be at or after the photo window end time.");
  }
  const saved = await writeConfig(normalized);
  return { ok: true, config: saved };
}
