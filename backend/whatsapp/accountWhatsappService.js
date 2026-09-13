import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import Pino from "pino";
import QRCode from "qrcode";
import * as primary from "./whatsappService.js";
import { renderRescheduleReportImages } from "../reports/rescheduleReportRenderer.js";

export const PRIMARY_WHATSAPP_ACCOUNT = "default";
export const accountMessageListeners = new Set();

export function subscribeToAccountMessages(listener) {
  accountMessageListeners.add(listener);
  return () => accountMessageListeners.delete(listener);
}

// Forward incoming messages and updates on primary WhatsApp socket to accountMessageListeners as "default" account
primary.subscribeToPrimaryWhatsAppMessages(({ messages, updates, type }) => {
  for (const listener of accountMessageListeners) {
    try {
      listener("default", { messages: messages || [], updates: updates || [], type });
    } catch (error) {
      console.error("[whatsapp-account-message-listener:default]", error.message || error);
    }
  }
});

const accountsDir = path.resolve("backend", "data", "whatsapp-accounts");
const runtimes = new Map();

export function normalizeWhatsAppAccountKey(value) {
  const clean = String(value || PRIMARY_WHATSAPP_ACCOUNT).trim().toLowerCase();
  if (!clean || clean === PRIMARY_WHATSAPP_ACCOUNT) return PRIMARY_WHATSAPP_ACCOUNT;
  const normalized = clean.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (!normalized) return "account";
  return normalized === PRIMARY_WHATSAPP_ACCOUNT ? `account-${normalized}` : normalized;
}

export function getRuntime(accountKey) {
  let key = normalizeWhatsAppAccountKey(accountKey);
  if (!runtimes.has(key)) {
    const altKey = key.startsWith("user-") ? key.replace(/^user-/, "") : `user-${key}`;
    if (runtimes.has(altKey)) {
      return runtimes.get(altKey);
    }
  }
  if (!runtimes.has(key)) {
    const rootDir = path.join(accountsDir, key);
    runtimes.set(key, {
      key,
      rootDir,
      authDir: path.join(rootDir, "auth"),
      configPath: path.join(rootDir, "config.json"),
      socket: null,
      qr: "",
      qrDataUrl: "",
      status: "disconnected",
      connectedNumber: "",
      reconnecting: false,
      reconnectTimer: null,
      approvalSending: false,
    });
  }
  return runtimes.get(key);
}

export async function ensureConnected(runtime) {
  if (!runtime.socket || runtime.status !== "connected") {
    throw new Error("WhatsApp is not connected for this login. Scan its QR from Settings.");
  }
  return runtime.socket;
}

function normalizeGroupJids(groupJids) {
  return [...new Set((Array.isArray(groupJids) ? groupJids : [groupJids])
    .map((jid) => String(jid || "").trim()).filter(Boolean))];
}

function normalizeConfig(config = {}) {
  const keys = ["default", "convertDefault", "rescheduleDefault", "auditDefault"];
  const next = { ...config };
  for (const key of keys) {
    const plural = `${key}GroupJids`;
    const singular = `${key}GroupJid`;
    const values = normalizeGroupJids(config[plural]?.length ? config[plural] : config[singular]);
    next[singular] = values[0] || "";
    next[plural] = values;
  }
  next.backupWhatsappNumber = String(config.backupWhatsappNumber || "");
  next.latestBackupSnapshot = config.latestBackupSnapshot || null;
  next.lastDailyBackupDate = config.lastDailyBackupDate || "";
  next.lastRescheduleApprovalDate = config.lastRescheduleApprovalDate || "";
  next.rescheduleApprovalReaction = String(config.rescheduleApprovalReaction || "✅").trim() || "✅";
  next.pendingRescheduleApproval = config.pendingRescheduleApproval || null;
  return next;
}

async function readConfig(runtime) {
  try {
    return normalizeConfig(JSON.parse(await fs.readFile(runtime.configPath, "utf8")));
  } catch {
    return normalizeConfig();
  }
}

async function writeConfig(runtime, config) {
  await fs.mkdir(runtime.rootDir, { recursive: true });
  const normalized = normalizeConfig(config);
  await fs.writeFile(runtime.configPath, JSON.stringify(normalized, null, 2));
  return normalized;
}

function normalizePhone(jid) {
  return jid ? String(jid).split("@")[0].split(":")[0] : "";
}

function normalizeRecipientJid(phoneNumber) {
  const raw = String(phoneNumber || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `${digits.length === 10 && digits.startsWith("0") ? `94${digits.slice(1)}` : digits}@s.whatsapp.net`;
}



async function startAccountClient(accountKey, force = false) {
  const runtime = getRuntime(accountKey);
  if (runtime.socket && !force) return runtime.socket;
  if (runtime.reconnecting) return runtime.socket;
  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
  }
  runtime.reconnecting = true;
  await fs.mkdir(runtime.authDir, { recursive: true });
  try {
    const { state, saveCreds } = await useMultiFileAuthState(runtime.authDir);
    const { version } = await fetchLatestBaileysVersion();
    const socket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      logger: Pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: false,
    });
    runtime.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("messages.upsert", ({ messages, type }) => {
      for (const msg of messages || []) {
        if (msg?.pushName) {
          const pJid = msg.key?.participant || msg.participant || msg.key?.remoteJid;
          if (pJid) {
            const clean = String(pJid).replace(/@.*$/, "").replace(/:\d+$/, "").replace(/\D/g, "");
            if (clean) primary.contactNameCache.set(clean, msg.pushName);
            const user = String(pJid).split("@")[0].split(":")[0];
            if (user) primary.contactNameCache.set(user, msg.pushName);
          }
        }
      }
      for (const listener of accountMessageListeners) {
        try {
          listener(runtime.key, { messages: messages || [], type });
        } catch (error) {
          console.error(`[whatsapp-account-message-listener:${runtime.key}]`, error.message || error);
        }
      }
    });
    socket.ev.on("messages.update", (updates) => {
      for (const listener of accountMessageListeners) {
        try {
          listener(runtime.key, { messages: [], updates: updates || [], type: "update" });
        } catch (error) {
          console.error(`[whatsapp-account-update-listener:${runtime.key}]`, error.message || error);
        }
      }
    });
    socket.ev.on("messages.reaction", (reactions) => {
      for (const update of reactions || []) {
        handleAccountApprovalReaction(runtime.key, update).catch((error) => {
          console.error(`[whatsapp-approval:${runtime.key}]`, error.message || error);
        });
      }
    });
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (runtime.socket !== socket) return;
      if (qr) {
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
        if (runtime.socket !== socket || runtime.status === "connected") return;
        runtime.qr = qr;
        runtime.qrDataUrl = qrDataUrl;
        runtime.status = "qr";
      }
      if (connection === "open") {
        if (runtime.reconnectTimer) {
          clearTimeout(runtime.reconnectTimer);
          runtime.reconnectTimer = null;
        }
        runtime.qr = "";
        runtime.qrDataUrl = "";
        runtime.status = "connected";
        runtime.connectedNumber = normalizePhone(socket.user?.id);
      }
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode
          || lastDisconnect?.error?.data?.statusCode
          || lastDisconnect?.error?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        runtime.socket = null;
        runtime.status = "disconnected";
        runtime.connectedNumber = "";
        console.log(`[whatsapp-account:${runtime.key}] disconnected (${statusCode || "unknown"})${loggedOut ? " - logged out" : " - reconnecting"}`);
        if (!loggedOut) {
          runtime.reconnectTimer = setTimeout(() => {
            runtime.reconnectTimer = null;
            if (!runtime.socket) startAccountClient(runtime.key).catch(console.error);
          }, 2500);
        }
      }
    });
    return socket;
  } finally {
    runtime.reconnecting = false;
  }
}

function imageBuffers({ imageDataUrl, imageDataUrls }) {
  const urls = Array.isArray(imageDataUrls) && imageDataUrls.length ? imageDataUrls : [imageDataUrl].filter(Boolean);
  if (!urls.length || urls.some((url) => !url?.startsWith("data:image/png;base64,"))) {
    throw new Error("One or more PNG report images are required.");
  }
  return urls.map((url) => Buffer.from(url.split(",")[1], "base64"));
}

async function sendImages(socket, recipientJid, buffers, caption) {
  if (buffers.length === 1) {
    const message = await socket.sendMessage(recipientJid, { image: buffers[0], caption });
    return { primaryKey: message.key, messageKeys: [message.key] };
  }
  const album = await socket.sendMessage(recipientJid, { album: { expectedImageCount: buffers.length } });
  const messageKeys = [album.key];
  for (let index = 0; index < buffers.length; index += 1) {
    const message = await socket.sendMessage(recipientJid, {
      image: buffers[index],
      ...(index === 0 && caption ? { caption } : {}),
      albumParentKey: album.key,
    });
    messageKeys.push(message.key);
  }
  return { primaryKey: messageKeys[1] || album.key, messageKeys };
}

function isPrimary(accountKey) {
  return normalizeWhatsAppAccountKey(accountKey) === PRIMARY_WHATSAPP_ACCOUNT;
}

export async function getAccountWhatsAppStatus(accountKey) {
  if (isPrimary(accountKey)) return primary.getWhatsAppStatus();
  const runtime = getRuntime(accountKey);
  const config = await readConfig(runtime);
  if (!runtime.socket && runtime.status === "disconnected") startAccountClient(runtime.key).catch(console.error);
  return {
    status: runtime.status,
    connected: runtime.status === "connected",
    connectedNumber: runtime.connectedNumber,
    hasQr: Boolean(runtime.qrDataUrl),
    accountKey: runtime.key,
    defaultGroupJid: config.defaultGroupJid,
    defaultGroupJids: config.defaultGroupJids,
    convertDefaultGroupJid: config.convertDefaultGroupJid,
    convertDefaultGroupJids: config.convertDefaultGroupJids,
    rescheduleDefaultGroupJid: config.rescheduleDefaultGroupJid,
    rescheduleDefaultGroupJids: config.rescheduleDefaultGroupJids,
    auditDefaultGroupJid: config.auditDefaultGroupJid,
    auditDefaultGroupJids: config.auditDefaultGroupJids,
    backupWhatsappNumber: config.backupWhatsappNumber,
    rescheduleApprovalReaction: config.rescheduleApprovalReaction,
    lastDailyBackupDate: config.lastDailyBackupDate,
    lastRescheduleApprovalDate: config.lastRescheduleApprovalDate,
    hasBackupSnapshot: Boolean(config.latestBackupSnapshot),
  };
}

export async function getAccountQr(accountKey) {
  if (isPrimary(accountKey)) return primary.getQrCode();
  const runtime = getRuntime(accountKey);
  if (!runtime.socket) await startAccountClient(runtime.key);
  let retries = 0;
  while (!runtime.qrDataUrl && runtime.status !== "connected" && retries < 25) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    retries++;
  }
  return { qr: runtime.qr, qrDataUrl: runtime.qrDataUrl };
}

export async function reconnectAccountWhatsApp(accountKey, options = {}) {
  if (isPrimary(accountKey)) return primary.reconnectWhatsApp(options);
  const runtime = getRuntime(accountKey);
  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
  }
  const previousSocket = runtime.socket;
  runtime.socket = null;
  runtime.reconnecting = false;
  try { previousSocket?.end(undefined); } catch { /* already closed */ }

  // Allow Windows to release any open file locks from previous socket
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (options.forceClean || runtime.status !== "connected") {
    try {
      const credsFile = path.join(runtime.authDir, "creds.json");
      let registered = false;
      try {
        const raw = JSON.parse(await fs.readFile(credsFile, "utf8"));
        registered = Boolean(raw?.registered);
      } catch {
        registered = false;
      }
      if (!registered || options.forceClean) {
        await fs.rm(runtime.authDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
    } catch {
      await fs.rm(runtime.authDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }

  runtime.qr = "";
  runtime.qrDataUrl = "";
  runtime.status = "disconnected";
  runtime.connectedNumber = "";
  await startAccountClient(runtime.key, true);

  // Wait for the new QR code so reconnect returns the actual status and QR data
  let retries = 0;
  while (!runtime.qrDataUrl && runtime.status !== "connected" && retries < 30) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    retries++;
  }

  return getAccountWhatsAppStatus(runtime.key);
}

export async function logoutAccountWhatsApp(accountKey) {
  if (isPrimary(accountKey)) return primary.logoutWhatsApp();
  const runtime = getRuntime(accountKey);
  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
  }
  const previousSocket = runtime.socket;
  runtime.socket = null;
  try { await previousSocket?.logout(); } catch { /* remove local auth regardless */ }
  runtime.qr = "";
  runtime.qrDataUrl = "";
  runtime.status = "disconnected";
  runtime.connectedNumber = "";
  await fs.rm(runtime.authDir, { recursive: true, force: true });
  return getAccountWhatsAppStatus(runtime.key);
}

const accountGroupsCache = new Map();

export async function fetchAccountGroups(accountKey) {
  if (isPrimary(accountKey)) return primary.fetchWhatsAppGroups();
  const runtime = getRuntime(accountKey);
  const cacheKey = runtime.key;
  const cached = accountGroupsCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < 180000 && cached.groups?.length > 0) {
    return cached.groups;
  }

  try {
    const socket = await ensureConnected(runtime);
    const groups = await socket.groupFetchAllParticipating();
    const list = Object.values(groups).map((group) => ({
      jid: group.id,
      name: group.subject,
      participants: group.participants?.length || 0,
    })).sort((a, b) => a.name.localeCompare(b.name));
    accountGroupsCache.set(cacheKey, { groups: list, timestamp: now });
    return list;
  } catch (error) {
    console.warn(`[account-whatsapp] groupFetchAllParticipating for ${cacheKey}:`, error.message || error);
    if (cached?.groups) return cached.groups;
    return [];
  }
}

const configFieldByType = {
  default: "defaultGroupJids",
  delivered: "convertDefaultGroupJids",
  reschedule: "rescheduleDefaultGroupJids",
  audit: "auditDefaultGroupJids",
};

export async function saveAccountGroups(accountKey, type, groupJids) {
  if (isPrimary(accountKey)) {
    if (type === "delivered") return primary.saveConvertDefaultGroupJids(groupJids);
    if (type === "reschedule") return primary.saveRescheduleDefaultGroupJids(groupJids);
    if (type === "audit") return primary.saveAuditDefaultGroupJids(groupJids);
    return primary.saveDefaultGroupJids(groupJids);
  }
  const values = normalizeGroupJids(groupJids);
  if (!values.length) throw new Error("At least one WhatsApp group is required.");
  const runtime = getRuntime(accountKey);
  const field = configFieldByType[type] || configFieldByType.default;
  const singular = field.replace(/s$/, "");
  return writeConfig(runtime, { ...(await readConfig(runtime)), [field]: values, [singular]: values[0] });
}

export async function sendAccountGroupReport(accountKey, type, payload) {
  if (isPrimary(accountKey)) {
    if (type === "delivered") return primary.sendReportToConvertDefaultGroup(payload);
    if (type === "reschedule") return primary.sendReportToRescheduleDefaultGroup(payload);
    if (type === "audit") return primary.sendReportToAuditDefaultGroup(payload);
    return primary.sendReportToDefaultGroup(payload);
  }
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const config = await readConfig(runtime);
  const groupJids = normalizeGroupJids(config[configFieldByType[type] || configFieldByType.default]);
  if (!groupJids.length) throw new Error("Default WhatsApp groups are not selected for this login.");
  const buffers = imageBuffers(payload);
  for (const jid of groupJids) await sendImages(socket, jid, buffers, payload.caption);
  return { ok: true, groupJids, sentCount: groupJids.length, mediaCount: buffers.length, sentAt: new Date().toISOString() };
}

export async function sendAccountRecipientReport(accountKey, payload) {
  if (isPrimary(accountKey)) return primary.sendReportToRecipient(payload);
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const recipientJid = normalizeRecipientJid(payload.phoneNumber);
  if (!recipientJid) throw new Error("Rider WhatsApp number is required.");
  const buffers = imageBuffers(payload);
  const res = await sendImages(socket, recipientJid, buffers, payload.caption);
  return { 
    ok: true, 
    recipientJid, 
    sentCount: 1, 
    mediaCount: buffers.length, 
    sentAt: new Date().toISOString(),
    primaryKey: res?.primaryKey,
    messageKeys: res?.messageKeys || (res?.primaryKey ? [res.primaryKey] : [])
  };
}

export async function sendAccountRecipientText(accountKey, payload) {
  if (isPrimary(accountKey)) return primary.sendTextToRecipient(payload);
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const recipientJid = normalizeRecipientJid(payload.phoneNumber);
  const text = String(payload.message || "").trim();
  if (!recipientJid || !text) throw new Error("Recipient number and message are required.");
  const mentionJids = Array.isArray(payload.mentions) ? payload.mentions : [];
  const msgContent = mentionJids.length > 0 ? { text, mentions: mentionJids } : { text };
  const sent = await socket.sendMessage(recipientJid, msgContent);
  return { 
    ok: true, 
    recipientJid, 
    sentCount: 1, 
    sentAt: new Date().toISOString(),
    messageKey: sent?.key,
    messageKeys: sent?.key ? [sent.key] : []
  };
}

export async function reactToAccountMessage(accountKey, { remoteJid, key, emoji = "✅" }) {
  if (isPrimary(accountKey)) {
    return primary.reactToMessage({ remoteJid, key, emoji });
  }
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const recipientJid = normalizeRecipientJid(remoteJid);
  if (!recipientJid || !key) throw new Error("remoteJid and key are required to react.");
  try {
    const sent = await socket.sendMessage(recipientJid, {
      react: {
        text: emoji,
        key: {
          remoteJid: key.remoteJid || recipientJid,
          id: key.id,
          fromMe: key.fromMe,
          participant: key.participant
        }
      }
    });
    return { ok: true, key: sent?.key };
  } catch (err) {
    console.warn(`[whatsapp] Failed to react to message ${key.id}:`, err.message || err);
    return { ok: false, error: err.message };
  }
}

export async function getAccountGroupMembers(accountKey, groupJid) {
  if (isPrimary(accountKey)) {
    return primary.getGroupMembers(groupJid);
  }
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const targetJid = normalizeRecipientJid(groupJid);
  if (!targetJid || !targetJid.endsWith("@g.us")) {
    throw new Error("Invalid WhatsApp group JID");
  }
  const metadata = await socket.groupMetadata(targetJid);
  const participants = await Promise.all(
    (metadata?.participants || []).map((p) => primary.resolveParticipantPhoneAndName(socket, runtime.authDir, p))
  );

  participants.sort((a, b) => {
    if (a.admin && !b.admin) return -1;
    if (!a.admin && b.admin) return 1;
    return (a.formattedPhone || a.phone).localeCompare(b.formattedPhone || b.phone);
  });

  return {
    ok: true,
    groupJid: targetJid,
    subject: metadata?.subject || "",
    participants
  };
}

export async function requestAccountPairingCode(accountKey, phoneNumber) {
  if (isPrimary(accountKey)) {
    return primary.requestWhatsAppPairingCode(phoneNumber);
  }
  const clean = primary.cleanPhoneNumberForPairing(phoneNumber);
  if (!clean || clean.length < 9) {
    throw new Error("A valid phone number is required (e.g. 94771234567 or 0771234567).");
  }

  const runtime = getRuntime(accountKey);
  if (runtime.status === "connected") {
    throw new Error("WhatsApp is already connected for this account.");
  }

  // Purge any unregistered/corrupted auth state so Baileys generates fresh pairing keys
  try {
    const { state } = await useMultiFileAuthState(runtime.authDir);
    if (!state.creds?.registered) {
      if (runtime.socket) {
        try { runtime.socket.end(undefined); } catch {}
        runtime.socket = null;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      await fs.rm(runtime.authDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  } catch {
    await fs.rm(runtime.authDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  runtime.qr = "";
  runtime.qrDataUrl = "";
  runtime.status = "disconnected";
  runtime.connectedNumber = "";
  await startAccountClient(accountKey, true);

  // Wait until socket has completed WebSocket/Noise handshake and emitted QR or status
  let retries = 0;
  while (!runtime.qr && runtime.status !== "connected" && retries < 40) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    retries++;
  }

  if (runtime.status === "connected") {
    throw new Error("WhatsApp is already connected for this account.");
  }

  const socket = runtime.socket;
  if (!socket || typeof socket.requestPairingCode !== "function") {
    throw new Error("Failed to initialize WhatsApp connection. Please try reconnecting.");
  }

  // Small delay to ensure companion pairing request is cleanly registered
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const rawCode = await socket.requestPairingCode(clean);
    const formattedCode = rawCode ? (rawCode.match(/.{1,4}/g)?.join("-") || rawCode) : "";
    return {
      ok: true,
      accountKey: runtime.key,
      phoneNumber: clean,
      pairingCode: formattedCode,
      rawCode
    };
  } catch (err) {
    console.error(`[whatsapp-pairing-code:${runtime.key}]`, err.message || err);
    throw new Error(err.message || "Failed to generate pairing code. Make sure WhatsApp is not already linked.");
  }
}

export async function deleteAccountMessage(accountKey, { phoneNumber, messageKeys, messageKey }) {
  if (isPrimary(accountKey)) {
    return primary.deleteMessage({ phoneNumber, messageKeys, messageKey });
  }
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const recipientJid = normalizeRecipientJid(phoneNumber);
  if (!recipientJid) throw new Error("Recipient JID / phone number is required.");

  const keysToDelete = Array.isArray(messageKeys) ? messageKeys : (messageKey ? [messageKey] : []);
  if (!keysToDelete.length) throw new Error("No message keys provided to delete.");

  for (const k of keysToDelete) {
    if (!k || !k.id) continue;
    const key = {
      remoteJid: k.remoteJid || recipientJid,
      id: k.id,
      fromMe: k.fromMe !== false,
      participant: k.participant
    };
    try {
      await socket.sendMessage(recipientJid, { delete: key });
    } catch (err) {
      console.warn(`[whatsapp] Failed to delete message ${k.id} for everyone:`, err.message || err);
    }
  }

  return { ok: true, deletedCount: keysToDelete.length };
}

export async function saveAccountBackupConfig(accountKey, { phoneNumber, snapshot, approvalReaction }) {
  if (isPrimary(accountKey)) return primary.saveBackupConfig({ phoneNumber, snapshot, approvalReaction });
  const runtime = getRuntime(accountKey);
  const config = await writeConfig(runtime, {
    ...(await readConfig(runtime)),
    backupWhatsappNumber: String(phoneNumber || "").trim(),
    latestBackupSnapshot: snapshot || null,
    rescheduleApprovalReaction: approvalReaction || "✅",
  });
  return { ok: true, backupWhatsappNumber: config.backupWhatsappNumber, hasBackupSnapshot: Boolean(config.latestBackupSnapshot) };
}

export async function saveAccountBackupSnapshot(accountKey, payload) {
  if (isPrimary(accountKey)) return primary.saveLatestBackupSnapshot(payload);
  const runtime = getRuntime(accountKey);
  const previous = await readConfig(runtime);
  return saveAccountBackupConfig(runtime.key, {
    phoneNumber: payload.phoneNumber || previous.backupWhatsappNumber,
    snapshot: payload.snapshot || previous.latestBackupSnapshot,
    approvalReaction: payload.approvalReaction || previous.rescheduleApprovalReaction,
  });
}

export async function sendAccountBackup(accountKey, { force = false } = {}) {
  if (isPrimary(accountKey)) return primary.sendBackupToWhatsApp({ force });
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const config = await readConfig(runtime);
  const recipientJid = normalizeRecipientJid(config.backupWhatsappNumber);
  if (!recipientJid || !config.latestBackupSnapshot) throw new Error("Backup number and snapshot are required for this login.");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
  if (!force && config.lastDailyBackupDate === date) return { ok: true, skipped: true, reason: "Daily backup already sent." };
  const fileName = `Daily_Courier_Backup_${date}_${runtime.key}.json`;
  await socket.sendMessage(recipientJid, {
    document: Buffer.from(JSON.stringify(config.latestBackupSnapshot, null, 2), "utf8"),
    mimetype: "application/json",
    fileName,
    caption: `Daily Courier Report System backup\nAccount: ${runtime.key}\nDate: ${date}`,
  });
  await writeConfig(runtime, { ...config, lastDailyBackupDate: date });
  return { ok: true, fileName, recipientJid, sentAt: new Date().toISOString() };
}

function comparableReaction(value) {
  return String(value || "").trim().replaceAll("\uFE0F", "");
}

export async function sendAccountRescheduleApproval(accountKey, { force = false } = {}) {
  if (isPrimary(accountKey)) return primary.sendRescheduleApprovalRequest({ force });
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const config = await readConfig(runtime);
  const recipientJid = normalizeRecipientJid(config.backupWhatsappNumber);
  if (!recipientJid) throw new Error("Backup WhatsApp number is required for Reschedule approval.");
  const groupJids = normalizeGroupJids(config.rescheduleDefaultGroupJids);
  if (!groupJids.length) throw new Error("Select a Reschedule Report WhatsApp group for this login.");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
  if (!force && config.lastRescheduleApprovalDate === date) {
    return { ok: true, skipped: true, reason: "Today's Reschedule approval was already sent." };
  }
  const rows = config.latestBackupSnapshot?.reports?.[date]?.rescheduleRows || [];
  if (!rows.length) return { ok: true, skipped: true, reason: `No Reschedule Report rows are saved for ${date}.` };
  const branchName = config.latestBackupSnapshot?.settings?.branchName || runtime.key;
  const captionTemplate = config.latestBackupSnapshot?.settings?.whatsappCaptionTemplates?.reschedule
    || "📋 *{title}*\n📅 Date: *{date}*\n\nPlease check the attached rescheduled parcel list.";
  const groupCaption = captionTemplate.replaceAll("{title}", "Reschedule Report").replaceAll("{date}", date);
  const imagePaths = await renderRescheduleReportImages({ rows, reportDate: date, branchName });
  const buffers = await Promise.all(imagePaths.map((imagePath) => fs.readFile(imagePath)));
  const reaction = config.rescheduleApprovalReaction || "✅";
  const reportMessage = await sendImages(socket, recipientJid, buffers,
    `${groupCaption}\n\n🔐 *Approval required*\nReact with ${reaction} to send this report to ${groupJids.length} assigned group${groupJids.length === 1 ? "" : "s"}.`);
  const requestMessageIds = reportMessage.messageKeys.map((key) => key?.id || "").filter(Boolean);
  const pending = {
    id: crypto.randomUUID(), date, status: "pending", recipientJid, groupJids, imagePaths,
    groupCaption, reaction, requestMessageIds, rowCount: rows.length, pageCount: imagePaths.length,
    requestedAt: new Date().toISOString(),
  };
  await writeConfig(runtime, { ...config, lastRescheduleApprovalDate: date, pendingRescheduleApproval: pending });
  return { ok: true, sentDate: date, rowCount: rows.length, pageCount: imagePaths.length, groupCount: groupJids.length };
}

async function handleAccountApprovalReaction(accountKey, { key, reaction }) {
  if (!key?.id || reaction?.key?.fromMe) return;
  const runtime = getRuntime(accountKey);
  const config = await readConfig(runtime);
  const pending = config.pendingRescheduleApproval;
  if (!pending || pending.status !== "pending") return;
  if (!pending.requestMessageIds?.includes(key.id)) return;
  if (comparableReaction(reaction?.text) !== comparableReaction(pending.reaction)) return;
  if (runtime.approvalSending) return;
  runtime.approvalSending = true;
  try {
    const socket = await ensureConnected(runtime);
    const buffers = await Promise.all(pending.imagePaths.map((imagePath) => fs.readFile(imagePath)));
    const latest = await readConfig(runtime);
    const groupJids = normalizeGroupJids(latest.rescheduleDefaultGroupJids?.length
      ? latest.rescheduleDefaultGroupJids : pending.groupJids);
    for (const jid of groupJids) await sendImages(socket, jid, buffers, pending.groupCaption);
    await writeConfig(runtime, {
      ...latest,
      pendingRescheduleApproval: { ...pending, status: "sent", confirmedAt: new Date().toISOString(), sentGroupCount: groupJids.length },
    });
    await socket.sendMessage(pending.recipientJid, { text: `✅ ${pending.date} Reschedule Report sent to ${groupJids.length} assigned group${groupJids.length === 1 ? "" : "s"}.` });
  } finally {
    runtime.approvalSending = false;
  }
}

export async function listAccountKeys() {
  try {
    const entries = await fs.readdir(accountsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => normalizeWhatsAppAccountKey(entry.name));
  } catch {
    return [];
  }
}

export async function startSavedAccountClients() {
  for (const key of await listAccountKeys()) startAccountClient(key).catch(console.error);
}

export function startAccountBackupScheduler() {
  setInterval(async () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (minute !== 0 || (hour !== 8 && hour !== 20)) return;
    for (const key of await listAccountKeys()) {
      const action = hour === 8 ? sendAccountBackup(key, { force: false }) : sendAccountRescheduleApproval(key, { force: false });
      action.catch((error) => console.error(`[whatsapp-scheduler:${key}]`, error.message || error));
    }
  }, 60_000);
}
