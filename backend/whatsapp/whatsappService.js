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

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readConfig() {
  await ensureDataDir();
  try {
    const content = await fs.readFile(configPath, "utf8");
    return normalizeConfig(JSON.parse(content));
  } catch {
    return { defaultGroupJid: "", defaultGroupJids: [] };
  }
}

async function writeConfig(config) {
  await ensureDataDir();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return config;
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
  return {
    ...config,
    defaultGroupJid: defaultGroupJids[0] || "",
    defaultGroupJids,
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

export async function sendReportToDefaultGroup({ imageDataUrl, caption }) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const config = await readConfig();
  const defaultGroupJids = normalizeGroupJids(config.defaultGroupJids?.length ? config.defaultGroupJids : config.defaultGroupJid);
  if (!defaultGroupJids.length) {
    throw new Error("Default WhatsApp groups are not selected. Select groups in Settings.");
  }

  if (!imageDataUrl?.startsWith("data:image/png;base64,")) {
    throw new Error("A PNG report image is required.");
  }

  const imageBuffer = Buffer.from(imageDataUrl.split(",")[1], "base64");
  for (const groupJid of defaultGroupJids) {
    await socket.sendMessage(groupJid, {
      image: imageBuffer,
      caption,
    });
  }

  return {
    ok: true,
    groupJid: defaultGroupJids[0],
    groupJids: defaultGroupJids,
    sentCount: defaultGroupJids.length,
    sentAt: new Date().toISOString(),
  };
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
