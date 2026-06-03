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
    return JSON.parse(content);
  } catch {
    return { defaultGroupJid: "" };
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

export async function saveDefaultGroupJid(groupJid) {
  if (!groupJid) throw new Error("Group JID is required.");
  return writeConfig({ ...(await readConfig()), defaultGroupJid: groupJid });
}

export async function sendReportToDefaultGroup({ imageDataUrl, caption }) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const config = await readConfig();
  if (!config.defaultGroupJid) {
    throw new Error("Default WhatsApp group is not selected. Select it in Settings.");
  }

  if (!imageDataUrl?.startsWith("data:image/png;base64,")) {
    throw new Error("A PNG report image is required.");
  }

  const imageBuffer = Buffer.from(imageDataUrl.split(",")[1], "base64");
  await socket.sendMessage(config.defaultGroupJid, {
    image: imageBuffer,
    caption,
  });

  return {
    ok: true,
    groupJid: config.defaultGroupJid,
    sentAt: new Date().toISOString(),
  };
}

