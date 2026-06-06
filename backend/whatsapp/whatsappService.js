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
const authDir = path.join(dataDir, "whatsapp-auth");
const configPath = path.join(dataDir, "whatsapp-config.json");

let socket = null;
let currentQr = "";
let currentQrDataUrl = "";
let connectionState = "disconnected";
let connectedNumber = "";
let reconnecting = false;
let backupSchedulerStarted = false;

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readConfig() {
  await ensureDataDir();
  try {
    const content = await fs.readFile(configPath, "utf8");
    return normalizeConfig(JSON.parse(content));
  } catch {
    return { defaultGroupJid: "", defaultGroupJids: [], convertDefaultGroupJid: "", convertDefaultGroupJids: [] };
  }
}

async function writeConfig(config) {
  await ensureDataDir();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return config;
}

function buildBackupFileName(date = new Date()) {
  const stamp = new Intl.DateTimeFormat("en-CA", {
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
  return `Daily_Courier_Backup_${stamp.year}-${stamp.month}-${stamp.day}_${stamp.hour}-${stamp.minute}-${stamp.second}.json`;
}

function getColomboClock() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function normalizePhone(jid) {
  return jid ? jid.split("@")[0] : "";
}

function normalizeGroupJids(groupJids) {
  return [...new Set((Array.isArray(groupJids) ? groupJids : [groupJids]).map((jid) => String(jid || "").trim()).filter(Boolean))];
}

function normalizeRecipientJid(phoneNumber) {
  const rawValue = String(phoneNumber || "").trim();
  if (!rawValue) return "";
  if (rawValue.includes("@")) return rawValue;

  const digits = rawValue.replace(/\D/g, "");
  if (!digits) return "";
  const internationalDigits = digits.length === 10 && digits.startsWith("0") ? `94${digits.slice(1)}` : digits;
  return `${internationalDigits}@s.whatsapp.net`;
}

function normalizeConfig(config = {}) {
  const defaultGroupJids = normalizeGroupJids(config.defaultGroupJids?.length ? config.defaultGroupJids : config.defaultGroupJid);
  const convertDefaultGroupJids = normalizeGroupJids(config.convertDefaultGroupJids?.length ? config.convertDefaultGroupJids : config.convertDefaultGroupJid);
  return {
    ...config,
    defaultGroupJid: defaultGroupJids[0] || "",
    defaultGroupJids,
    convertDefaultGroupJid: convertDefaultGroupJids[0] || "",
    convertDefaultGroupJids,
    backupWhatsappNumber: String(config.backupWhatsappNumber || ""),
    latestBackupSnapshot: config.latestBackupSnapshot || null,
    lastDailyBackupDate: config.lastDailyBackupDate || "",
  };
}

export async function startWhatsAppClient(force = false) {
  if (socket && !force) return socket;
  if (reconnecting) return socket;

  reconnecting = true;
  await ensureDataDir();

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    logger: Pino({ level: "silent" }),
    browser: ["Daily Report System", "Chrome", "1.0.0"],
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
      connectionState = "qr";
    }

    if (connection === "open") {
      currentQr = "";
      currentQrDataUrl = "";
      connectionState = "connected";
      connectedNumber = normalizePhone(socket.user?.id);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      connectionState = "disconnected";
      connectedNumber = "";
      socket = null;

      if (!loggedOut) {
        setTimeout(() => startWhatsAppClient(true).catch(console.error), 2500);
      }
    }
  });

  reconnecting = false;
  return socket;
}

export async function getWhatsAppStatus() {
  const config = await readConfig();
  return {
    status: connectionState,
    connected: connectionState === "connected",
    connectedNumber,
    hasQr: Boolean(currentQrDataUrl),
    defaultGroupJid: config.defaultGroupJid || "",
    defaultGroupJids: config.defaultGroupJids || [],
    convertDefaultGroupJid: config.convertDefaultGroupJid || "",
    convertDefaultGroupJids: config.convertDefaultGroupJids || [],
    backupWhatsappNumber: config.backupWhatsappNumber || "",
    hasBackupSnapshot: Boolean(config.latestBackupSnapshot),
    lastDailyBackupDate: config.lastDailyBackupDate || "",
  };
}

export async function getQrCode() {
  return {
    qr: currentQr,
    qrDataUrl: currentQrDataUrl,
  };
}

export async function reconnectWhatsApp() {
  if (socket) {
    try {
      socket.end(undefined);
    } catch {
      // Existing socket may already be closed.
    }
  }
  socket = null;
  connectionState = "disconnected";
  await startWhatsAppClient(true);
  return getWhatsAppStatus();
}

export async function logoutWhatsApp() {
  if (socket) {
    try {
      await socket.logout();
    } catch {
      // Continue removing local auth even if remote logout fails.
    }
  }

  socket = null;
  currentQr = "";
  currentQrDataUrl = "";
  connectionState = "disconnected";
  connectedNumber = "";
  await fs.rm(authDir, { recursive: true, force: true });
  return getWhatsAppStatus();
}

export async function fetchWhatsAppGroups() {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const groups = await socket.groupFetchAllParticipating();
  return Object.values(groups)
    .map((group) => ({
      jid: group.id,
      name: group.subject,
      participants: group.participants?.length || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveDefaultGroupJids(groupJids) {
  const nextGroupJids = normalizeGroupJids(groupJids);
  if (!nextGroupJids.length) throw new Error("At least one group JID is required.");
  return writeConfig(normalizeConfig({ ...(await readConfig()), defaultGroupJid: nextGroupJids[0], defaultGroupJids: nextGroupJids }));
}

export async function saveConvertDefaultGroupJids(groupJids) {
  const nextGroupJids = normalizeGroupJids(groupJids);
  if (!nextGroupJids.length) throw new Error("At least one Convert Report group JID is required.");
  return writeConfig(normalizeConfig({ ...(await readConfig()), convertDefaultGroupJid: nextGroupJids[0], convertDefaultGroupJids: nextGroupJids }));
}

async function sendReportToGroups({ imageDataUrl, caption, groupJids, missingGroupMessage }) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const targetGroupJids = normalizeGroupJids(groupJids);
  if (!targetGroupJids.length) {
    throw new Error(missingGroupMessage || "Default WhatsApp groups are not selected. Select groups in Settings.");
  }

  if (!imageDataUrl?.startsWith("data:image/png;base64,")) {
    throw new Error("A PNG report image is required.");
  }

  const imageBuffer = Buffer.from(imageDataUrl.split(",")[1], "base64");
  for (const groupJid of targetGroupJids) {
    await socket.sendMessage(groupJid, {
      image: imageBuffer,
      caption,
    });
  }

  return {
    ok: true,
    groupJid: targetGroupJids[0],
    groupJids: targetGroupJids,
    sentCount: targetGroupJids.length,
    sentAt: new Date().toISOString(),
  };
}

export async function sendReportToDefaultGroup({ imageDataUrl, caption }) {
  const config = await readConfig();
  const defaultGroupJids = normalizeGroupJids(config.defaultGroupJids?.length ? config.defaultGroupJids : config.defaultGroupJid);
  return sendReportToGroups({
    imageDataUrl,
    caption,
    groupJids: defaultGroupJids,
    missingGroupMessage: "Default WhatsApp groups are not selected. Select groups in Settings.",
  });
}

export async function sendReportToConvertDefaultGroup({ imageDataUrl, caption }) {
  const config = await readConfig();
  const convertDefaultGroupJids = normalizeGroupJids(config.convertDefaultGroupJids?.length ? config.convertDefaultGroupJids : config.convertDefaultGroupJid);
  return sendReportToGroups({
    imageDataUrl,
    caption,
    groupJids: convertDefaultGroupJids,
    missingGroupMessage: "Convert Report default WhatsApp groups are not selected. Select them in Settings.",
  });
}

export async function sendReportToRecipient({ phoneNumber, imageDataUrl, caption }) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const recipientJid = normalizeRecipientJid(phoneNumber);
  if (!recipientJid) {
    throw new Error("Rider WhatsApp number is required.");
  }

  if (!imageDataUrl?.startsWith("data:image/png;base64,")) {
    throw new Error("A PNG report image is required.");
  }

  const imageBuffer = Buffer.from(imageDataUrl.split(",")[1], "base64");
  await socket.sendMessage(recipientJid, {
    image: imageBuffer,
    caption,
  });

  return {
    ok: true,
    recipientJid,
    sentCount: 1,
    sentAt: new Date().toISOString(),
  };
}

export async function saveBackupConfig({ phoneNumber, snapshot }) {
  const config = await readConfig();
  const nextConfig = normalizeConfig({
    ...config,
    backupWhatsappNumber: String(phoneNumber || config.backupWhatsappNumber || "").trim(),
    latestBackupSnapshot: snapshot || config.latestBackupSnapshot || null,
  });
  await writeConfig(nextConfig);
  return {
    ok: true,
    backupWhatsappNumber: nextConfig.backupWhatsappNumber,
    hasBackupSnapshot: Boolean(nextConfig.latestBackupSnapshot),
    lastDailyBackupDate: nextConfig.lastDailyBackupDate || "",
  };
}

export async function saveLatestBackupSnapshot({ snapshot, phoneNumber }) {
  const config = await readConfig();
  const nextConfig = normalizeConfig({
    ...config,
    backupWhatsappNumber: String(phoneNumber || config.backupWhatsappNumber || "").trim(),
    latestBackupSnapshot: snapshot || config.latestBackupSnapshot || null,
  });
  await writeConfig(nextConfig);
  return {
    ok: true,
    backupWhatsappNumber: nextConfig.backupWhatsappNumber,
    hasBackupSnapshot: Boolean(nextConfig.latestBackupSnapshot),
    updatedAt: new Date().toISOString(),
  };
}

export async function sendBackupToWhatsApp({ force = false } = {}) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const config = await readConfig();
  const recipientJid = normalizeRecipientJid(config.backupWhatsappNumber);
  if (!recipientJid) {
    throw new Error("Backup WhatsApp number is required.");
  }
  if (!config.latestBackupSnapshot) {
    throw new Error("No backup snapshot is available yet. Open the app once after saving reports.");
  }

  const clock = getColomboClock();
  if (!force && config.lastDailyBackupDate === clock.date) {
    return { ok: true, skipped: true, reason: "Daily backup already sent.", sentDate: clock.date };
  }

  const snapshot = {
    ...config.latestBackupSnapshot,
    whatsappBackupSentAt: new Date().toISOString(),
    whatsappBackupDate: clock.date,
  };
  const backupText = JSON.stringify(snapshot, null, 2);
  const fileName = buildBackupFileName();

  await socket.sendMessage(recipientJid, {
    document: Buffer.from(backupText, "utf8"),
    mimetype: "application/json",
    fileName,
    caption: `Daily Courier Report System backup\nDate: ${clock.date}\nTime: 08:00\nReports: Courier Performance, Operation, Delivered Collection`,
  });

  await writeConfig(normalizeConfig({ ...config, lastDailyBackupDate: clock.date }));
  return { ok: true, sentAt: new Date().toISOString(), fileName, recipientJid };
}

export function startDailyBackupScheduler() {
  if (backupSchedulerStarted) return;
  backupSchedulerStarted = true;

  setInterval(() => {
    const clock = getColomboClock();
    if (clock.hour !== 8 || clock.minute !== 0) return;
    sendBackupToWhatsApp({ force: false }).catch((error) => {
      console.error("[whatsapp-backup-scheduler]", error.message || error);
    });
  }, 60 * 1000);
}
