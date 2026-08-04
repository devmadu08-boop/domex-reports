import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Pino from "pino";
import QRCode from "qrcode";
import { renderRescheduleReportImages } from "../reports/rescheduleReportRenderer.js";

const dataDir = path.resolve("backend", "data");
const authDir = path.join(dataDir, "whatsapp-auth");
const configPath = path.join(dataDir, "whatsapp-config.json");
const DEFAULT_RESCHEDULE_APPROVAL_REACTION = "✅";

let socket = null;
let currentQr = "";
let currentQrDataUrl = "";
let connectionState = "disconnected";
let connectedNumber = "";
let reconnecting = false;
let backupSchedulerStarted = false;
let rescheduleApprovalSending = false;
let rescheduleApprovalRequestRunning = false;
const primaryMessageListeners = new Set();

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readConfig() {
  await ensureDataDir();
  try {
    const content = await fs.readFile(configPath, "utf8");
    return normalizeConfig(JSON.parse(content));
  } catch {
    return {
      defaultGroupJid: "",
      defaultGroupJids: [],
      convertDefaultGroupJid: "",
      convertDefaultGroupJids: [],
      rescheduleDefaultGroupJid: "",
      rescheduleDefaultGroupJids: [],
    };
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

function normalizeApprovalReaction(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return DEFAULT_RESCHEDULE_APPROVAL_REACTION;

  const firstGrapheme = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(cleanValue)][0]?.segment;
  const isEmoji = firstGrapheme && /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u20E3]/u.test(firstGrapheme);
  return isEmoji ? firstGrapheme : DEFAULT_RESCHEDULE_APPROVAL_REACTION;
}

function comparableReaction(value) {
  return normalizeApprovalReaction(value).replaceAll("\uFE0F", "");
}

function normalizeConfig(config = {}) {
  const defaultGroupJids = normalizeGroupJids(config.defaultGroupJids?.length ? config.defaultGroupJids : config.defaultGroupJid);
  const convertDefaultGroupJids = normalizeGroupJids(config.convertDefaultGroupJids?.length ? config.convertDefaultGroupJids : config.convertDefaultGroupJid);
  const rescheduleDefaultGroupJids = normalizeGroupJids(
    config.rescheduleDefaultGroupJids?.length ? config.rescheduleDefaultGroupJids : config.rescheduleDefaultGroupJid,
  );
  return {
    ...config,
    defaultGroupJid: defaultGroupJids[0] || "",
    defaultGroupJids,
    convertDefaultGroupJid: convertDefaultGroupJids[0] || "",
    convertDefaultGroupJids,
    rescheduleDefaultGroupJid: rescheduleDefaultGroupJids[0] || "",
    rescheduleDefaultGroupJids,
    backupWhatsappNumber: String(config.backupWhatsappNumber || ""),
    rescheduleApprovalReaction: normalizeApprovalReaction(
      config.rescheduleApprovalReaction
        || config.latestBackupSnapshot?.settings?.rescheduleApprovalReaction,
    ),
    latestBackupSnapshot: config.latestBackupSnapshot || null,
    lastDailyBackupDate: config.lastDailyBackupDate || "",
    lastRescheduleApprovalDate: config.lastRescheduleApprovalDate || "",
    pendingRescheduleApproval: config.pendingRescheduleApproval || null,
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
    syncFullHistory: true,
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("messages.upsert", ({ messages, type }) => {
    for (const listener of primaryMessageListeners) {
      try {
        listener({ messages: messages || [], type });
      } catch (error) {
        console.error("[whatsapp-message-listener]", error.message || error);
      }
    }
  });
  socket.ev.on("messaging-history.set", ({ messages, chats, contacts }) => {
    for (const listener of primaryMessageListeners) {
      try {
        listener({ messages: messages || [], chats, contacts, type: "history" });
      } catch (error) {
        console.error("[whatsapp-history-listener]", error.message || error);
      }
    }
  });
  socket.ev.on("chats.upsert", (chats) => {
    for (const listener of primaryMessageListeners) {
      try {
        listener({ messages: [], chats, type: "chats" });
      } catch (error) {
        console.error("[whatsapp-chat-listener]", error.message || error);
      }
    }
  });
  socket.ev.on("contacts.upsert", (contacts) => {
    for (const listener of primaryMessageListeners) {
      try {
        listener({ messages: [], contacts, type: "contacts" });
      } catch (error) {
        console.error("[whatsapp-contact-listener]", error.message || error);
      }
    }
  });
  socket.ev.on("messages.reaction", (reactions) => {
    for (const reactionUpdate of reactions) {
      handleRescheduleApprovalReaction(reactionUpdate).catch((error) => {
        console.error("[whatsapp-approval-reaction]", error.message || error);
      });
    }
  });
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
    rescheduleDefaultGroupJid: config.rescheduleDefaultGroupJid || "",
    rescheduleDefaultGroupJids: config.rescheduleDefaultGroupJids || [],
    backupWhatsappNumber: config.backupWhatsappNumber || "",
    rescheduleApprovalReaction: config.rescheduleApprovalReaction,
    hasBackupSnapshot: Boolean(config.latestBackupSnapshot),
    lastDailyBackupDate: config.lastDailyBackupDate || "",
    lastRescheduleApprovalDate: config.lastRescheduleApprovalDate || "",
    rescheduleApproval: sanitizeRescheduleApproval(config.pendingRescheduleApproval),
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

export function subscribeToPrimaryWhatsAppMessages(listener) {
  if (typeof listener !== "function") return () => undefined;
  primaryMessageListeners.add(listener);
  return () => primaryMessageListeners.delete(listener);
}

export function getPrimaryWhatsAppRuntimeStatus() {
  return {
    status: connectionState,
    connected: connectionState === "connected",
    connectedNumber,
  };
}

export async function sendPrimaryWhatsAppMessage(recipientJid, content) {
  if (!socket || connectionState !== "connected") {
    throw new Error("Primary report WhatsApp is not connected.");
  }
  return socket.sendMessage(recipientJid, content);
}

export async function fetchPrimaryWhatsAppGroupMetadata(groupJid) {
  if (!socket || connectionState !== "connected") {
    throw new Error("Primary report WhatsApp is not connected.");
  }
  return socket.groupMetadata(String(groupJid || ""));
}

export async function saveDefaultGroupJids(groupJids) {
  const nextGroupJids = normalizeGroupJids(groupJids);
  if (!nextGroupJids.length) throw new Error("At least one group JID is required.");
  return writeConfig(normalizeConfig({ ...(await readConfig()), defaultGroupJid: nextGroupJids[0], defaultGroupJids: nextGroupJids }));
}

export async function saveConvertDefaultGroupJids(groupJids) {
  const nextGroupJids = normalizeGroupJids(groupJids);
  if (!nextGroupJids.length) throw new Error("At least one Delivered Report group JID is required.");
  return writeConfig(normalizeConfig({ ...(await readConfig()), convertDefaultGroupJid: nextGroupJids[0], convertDefaultGroupJids: nextGroupJids }));
}

export async function saveRescheduleDefaultGroupJids(groupJids) {
  const nextGroupJids = normalizeGroupJids(groupJids);
  if (!nextGroupJids.length) throw new Error("At least one Reschedule Report group JID is required.");
  return writeConfig(normalizeConfig({
    ...(await readConfig()),
    rescheduleDefaultGroupJid: nextGroupJids[0],
    rescheduleDefaultGroupJids: nextGroupJids,
  }));
}

function getReportImageBuffers({ imageDataUrl, imageDataUrls }) {
  const urls = Array.isArray(imageDataUrls) && imageDataUrls.length
    ? imageDataUrls
    : [imageDataUrl].filter(Boolean);

  if (!urls.length || urls.some((url) => !url?.startsWith("data:image/png;base64,"))) {
    throw new Error("One or more PNG report images are required.");
  }

  return urls.map((url) => Buffer.from(url.split(",")[1], "base64"));
}

async function sendReportImages(recipientJid, imageBuffers, caption) {
  if (imageBuffers.length === 1) {
    const imageMessage = await socket.sendMessage(recipientJid, {
      image: imageBuffers[0],
      caption,
    });
    return {
      primaryKey: imageMessage.key,
      messageKeys: [imageMessage.key],
    };
  }

  const albumMessage = await socket.sendMessage(recipientJid, {
    album: {
      expectedImageCount: imageBuffers.length,
    },
  });
  const messageKeys = [albumMessage.key];

  for (let index = 0; index < imageBuffers.length; index += 1) {
    const imageMessage = await socket.sendMessage(recipientJid, {
      image: imageBuffers[index],
      ...(index === 0 && caption ? { caption } : {}),
      albumParentKey: albumMessage.key,
    });
    messageKeys.push(imageMessage.key);
  }
  return {
    primaryKey: messageKeys[1] || albumMessage.key,
    messageKeys,
  };
}

async function sendReportToGroups({ imageDataUrl, imageDataUrls, caption, groupJids, missingGroupMessage }) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const targetGroupJids = normalizeGroupJids(groupJids);
  if (!targetGroupJids.length) {
    throw new Error(missingGroupMessage || "Default WhatsApp groups are not selected. Select groups in Settings.");
  }

  const imageBuffers = getReportImageBuffers({ imageDataUrl, imageDataUrls });
  for (const groupJid of targetGroupJids) {
    await sendReportImages(groupJid, imageBuffers, caption);
  }

  return {
    ok: true,
    groupJid: targetGroupJids[0],
    groupJids: targetGroupJids,
    sentCount: targetGroupJids.length,
    mediaCount: imageBuffers.length,
    sentAt: new Date().toISOString(),
  };
}

export async function sendReportToDefaultGroup({ imageDataUrl, imageDataUrls, caption }) {
  const config = await readConfig();
  const defaultGroupJids = normalizeGroupJids(config.defaultGroupJids?.length ? config.defaultGroupJids : config.defaultGroupJid);
  return sendReportToGroups({
    imageDataUrl,
    imageDataUrls,
    caption,
    groupJids: defaultGroupJids,
    missingGroupMessage: "Default WhatsApp groups are not selected. Select groups in Settings.",
  });
}

export async function sendReportToConvertDefaultGroup({ imageDataUrl, imageDataUrls, caption }) {
  const config = await readConfig();
  const convertDefaultGroupJids = normalizeGroupJids(config.convertDefaultGroupJids?.length ? config.convertDefaultGroupJids : config.convertDefaultGroupJid);
  return sendReportToGroups({
    imageDataUrl,
    imageDataUrls,
    caption,
    groupJids: convertDefaultGroupJids,
    missingGroupMessage: "Delivered Report default WhatsApp groups are not selected. Select them in Settings.",
  });
}

export async function sendReportToRescheduleDefaultGroup({ imageDataUrl, imageDataUrls, caption }) {
  const config = await readConfig();
  const rescheduleDefaultGroupJids = normalizeGroupJids(
    config.rescheduleDefaultGroupJids?.length ? config.rescheduleDefaultGroupJids : config.rescheduleDefaultGroupJid,
  );
  return sendReportToGroups({
    imageDataUrl,
    imageDataUrls,
    caption,
    groupJids: rescheduleDefaultGroupJids,
    missingGroupMessage: "Reschedule Report default WhatsApp groups are not selected. Select them in Settings.",
  });
}

export async function sendReportToRecipient({ phoneNumber, imageDataUrl, imageDataUrls, caption }) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const recipientJid = normalizeRecipientJid(phoneNumber);
  if (!recipientJid) {
    throw new Error("Rider WhatsApp number is required.");
  }

  const imageBuffers = getReportImageBuffers({ imageDataUrl, imageDataUrls });
  await sendReportImages(recipientJid, imageBuffers, caption);

  return {
    ok: true,
    recipientJid,
    sentCount: 1,
    mediaCount: imageBuffers.length,
    sentAt: new Date().toISOString(),
  };
}

export async function sendTextToRecipient({ phoneNumber, message }) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const recipientJid = normalizeRecipientJid(phoneNumber);
  if (!recipientJid) throw new Error("Rider WhatsApp number is required.");

  const text = String(message || "").trim();
  if (!text) throw new Error("Reminder message is required.");

  await socket.sendMessage(recipientJid, { text });
  return {
    ok: true,
    recipientJid,
    sentCount: 1,
    sentAt: new Date().toISOString(),
  };
}

export async function saveBackupConfig({ phoneNumber, snapshot, approvalReaction }) {
  const config = await readConfig();
  const nextConfig = normalizeConfig({
    ...config,
    backupWhatsappNumber: String(phoneNumber || config.backupWhatsappNumber || "").trim(),
    rescheduleApprovalReaction: approvalReaction || snapshot?.settings?.rescheduleApprovalReaction || config.rescheduleApprovalReaction,
    latestBackupSnapshot: snapshot || config.latestBackupSnapshot || null,
  });
  await writeConfig(nextConfig);
  return {
    ok: true,
    backupWhatsappNumber: nextConfig.backupWhatsappNumber,
    rescheduleApprovalReaction: nextConfig.rescheduleApprovalReaction,
    hasBackupSnapshot: Boolean(nextConfig.latestBackupSnapshot),
    lastDailyBackupDate: nextConfig.lastDailyBackupDate || "",
  };
}

export async function saveLatestBackupSnapshot({ snapshot, phoneNumber, approvalReaction }) {
  const config = await readConfig();
  const nextConfig = normalizeConfig({
    ...config,
    backupWhatsappNumber: String(phoneNumber || config.backupWhatsappNumber || "").trim(),
    rescheduleApprovalReaction: approvalReaction || snapshot?.settings?.rescheduleApprovalReaction || config.rescheduleApprovalReaction,
    latestBackupSnapshot: snapshot || config.latestBackupSnapshot || null,
  });
  await writeConfig(nextConfig);
  return {
    ok: true,
    backupWhatsappNumber: nextConfig.backupWhatsappNumber,
    rescheduleApprovalReaction: nextConfig.rescheduleApprovalReaction,
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

export async function sendRescheduleApprovalRequest({ force = false } = {}) {
  if (rescheduleApprovalRequestRunning) {
    return { ok: true, skipped: true, reason: "A Reschedule Report approval is already being prepared." };
  }
  rescheduleApprovalRequestRunning = true;
  try {
    return await createRescheduleApprovalRequest({ force });
  } finally {
    rescheduleApprovalRequestRunning = false;
  }
}

async function createRescheduleApprovalRequest({ force = false } = {}) {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp is not connected. Scan QR from Settings.");
  }

  const config = await readConfig();
  const recipientJid = normalizeRecipientJid(config.backupWhatsappNumber);
  if (!recipientJid) {
    throw new Error("Backup WhatsApp number is required for Reschedule Report approval.");
  }

  const groupJids = normalizeGroupJids(
    config.rescheduleDefaultGroupJids?.length ? config.rescheduleDefaultGroupJids : config.rescheduleDefaultGroupJid,
  );
  if (!groupJids.length) {
    throw new Error("Select at least one Reschedule Report default WhatsApp group in Settings.");
  }

  const clock = getColomboClock();
  if (!force && config.lastRescheduleApprovalDate === clock.date) {
    return {
      ok: true,
      skipped: true,
      reason: "Today's Reschedule Report approval was already sent.",
      sentDate: clock.date,
    };
  }

  const snapshot = config.latestBackupSnapshot;
  const rows = snapshot?.reports?.[clock.date]?.rescheduleRows || [];
  if (!rows.length) {
    return {
      ok: true,
      skipped: true,
      reason: `No Reschedule Report rows are saved for ${clock.date}.`,
      sentDate: clock.date,
    };
  }

  const branchName = snapshot?.settings?.branchName || "Middeniya";
  const template = snapshot?.settings?.whatsappCaptionTemplates?.reschedule
    || "📋 *{title}*\n📅 Date: *{date}*\n\nPlease check the attached rescheduled parcel list.";
  const groupCaption = template
    .replaceAll("{title}", "Reschedule Report")
    .replaceAll("{date}", clock.date);
  const imagePaths = await renderRescheduleReportImages({
    rows,
    reportDate: clock.date,
    branchName,
  });
  const imageBuffers = await Promise.all(imagePaths.map((imagePath) => fs.readFile(imagePath)));
  const token = crypto.randomUUID();
  const buttonId = `reschedule-confirm:${clock.date}:${token}`;
  const approvalReaction = normalizeApprovalReaction(config.rescheduleApprovalReaction);
  const pendingApproval = {
    date: clock.date,
    status: "pending",
    token,
    buttonId,
    recipientJid,
    imagePaths,
    groupCaption,
    groupJids,
    rowCount: rows.length,
    pageCount: imagePaths.length,
    approvalReaction,
    requestedAt: new Date().toISOString(),
  };

  const approvalReportMessage = await sendReportImages(
    recipientJid,
    imageBuffers,
    `${groupCaption}\n\n🔐 *Approval required*\nCheck the report and react with ${approvalReaction} to send it to ${groupJids.length} assigned group${groupJids.length === 1 ? "" : "s"}.\n\nOnly the ${approvalReaction} reaction confirms this report.`,
  );

  const latestConfig = await readConfig();
  const requestMessageIds = approvalReportMessage.messageKeys
    .map((key) => key?.id || "")
    .filter(Boolean);
  const finalApproval = {
    ...pendingApproval,
    approvalMode: "reaction",
    requestMessageId: approvalReportMessage.primaryKey?.id || requestMessageIds[0] || "",
    requestMessageIds,
  };
  await writeConfig(normalizeConfig({
    ...latestConfig,
    lastRescheduleApprovalDate: clock.date,
    pendingRescheduleApproval: finalApproval,
  }));

  return {
    ok: true,
    sentAt: finalApproval.requestedAt,
    sentDate: clock.date,
    recipientJid,
    rowCount: rows.length,
    pageCount: imagePaths.length,
    groupCount: groupJids.length,
    status: "pending",
  };
}

async function handleRescheduleApprovalReaction({ key, reaction }) {
  if (!key?.id || reaction?.key?.fromMe) return;
  const config = await readConfig();
  const pending = config.pendingRescheduleApproval;
  if (!pending || pending.status !== "pending" || pending.approvalMode !== "reaction") return;
  const approvalReaction = pending.approvalReaction || DEFAULT_RESCHEDULE_APPROVAL_REACTION;
  if (comparableReaction(reaction?.text) !== comparableReaction(approvalReaction)) return;
  const requestMessageIds = pending.requestMessageIds?.length
    ? pending.requestMessageIds
    : [pending.requestMessageId].filter(Boolean);
  if (!requestMessageIds.includes(key.id)) return;
  const jidCandidates = [
    key.remoteJid,
    key.remoteJidAlt,
    reaction?.key?.remoteJid,
    reaction?.key?.remoteJidAlt,
  ].filter(Boolean);
  const approvalJid = jidCandidates.find(
    (jid) => normalizeRecipientJid(jid) === normalizeRecipientJid(pending.recipientJid),
  );
  if (!approvalJid) return;
  await confirmPendingRescheduleReport(pending.buttonId, approvalJid);
}

async function confirmPendingRescheduleReport(buttonId, responseJid) {
  if (rescheduleApprovalSending) return;
  const config = await readConfig();
  const pending = config.pendingRescheduleApproval;
  if (!pending || pending.buttonId !== buttonId) {
    await socket.sendMessage(responseJid || normalizeRecipientJid(config.backupWhatsappNumber), {
      text: "⚠️ This Reschedule Report approval is no longer active.",
    });
    return;
  }
  if (pending.status === "sent") {
    await socket.sendMessage(responseJid || pending.recipientJid, {
      text: `✅ The ${pending.date} Reschedule Report was already sent to the assigned groups.`,
    });
    return;
  }

  rescheduleApprovalSending = true;
  const sendingApproval = { ...pending, status: "sending", sendingAt: new Date().toISOString(), lastError: "" };
  await writeConfig(normalizeConfig({ ...config, pendingRescheduleApproval: sendingApproval }));

  try {
    const imageBuffers = await Promise.all(pending.imagePaths.map((imagePath) => fs.readFile(imagePath)));
    const latestConfig = await readConfig();
    const groupJids = normalizeGroupJids(
      latestConfig.rescheduleDefaultGroupJids?.length
        ? latestConfig.rescheduleDefaultGroupJids
        : latestConfig.rescheduleDefaultGroupJid || pending.groupJids,
    );
    if (!groupJids.length) {
      throw new Error("No Reschedule Report default WhatsApp groups are currently selected.");
    }
    for (const groupJid of groupJids) {
      await sendReportImages(groupJid, imageBuffers, pending.groupCaption);
    }

    const sentApproval = {
      ...sendingApproval,
      status: "sent",
      confirmedAt: new Date().toISOString(),
      sentGroupCount: groupJids.length,
    };
    await writeConfig(normalizeConfig({
      ...(await readConfig()),
      pendingRescheduleApproval: sentApproval,
    }));
    await socket.sendMessage(responseJid || pending.recipientJid, {
      text: `✅ *Send confirmed*\n${pending.date} Reschedule Report was sent successfully to ${groupJids.length} assigned group${groupJids.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    const failedApproval = {
      ...sendingApproval,
      status: "pending",
      lastError: error.message || "Group send failed.",
    };
    await writeConfig(normalizeConfig({
      ...(await readConfig()),
      pendingRescheduleApproval: failedApproval,
    }));
    await socket.sendMessage(responseJid || pending.recipientJid, {
      text: `❌ Reschedule Report group send failed.\n${failedApproval.lastError}\n\nReact with ${pending.approvalReaction || DEFAULT_RESCHEDULE_APPROVAL_REACTION} again to retry.`,
    });
    throw error;
  } finally {
    rescheduleApprovalSending = false;
  }
}

function sanitizeRescheduleApproval(approval) {
  if (!approval) return null;
  return {
    date: approval.date || "",
    status: approval.status || "",
    rowCount: Number(approval.rowCount || 0),
    pageCount: Number(approval.pageCount || 0),
    requestedAt: approval.requestedAt || "",
    confirmedAt: approval.confirmedAt || "",
    sentGroupCount: Number(approval.sentGroupCount || 0),
    approvalReaction: normalizeApprovalReaction(approval.approvalReaction),
    lastError: approval.lastError || "",
  };
}

export function startDailyBackupScheduler() {
  if (backupSchedulerStarted) return;
  backupSchedulerStarted = true;

  setInterval(() => {
    const clock = getColomboClock();
    if (clock.hour === 8 && clock.minute === 0) {
      sendBackupToWhatsApp({ force: false }).catch((error) => {
        console.error("[whatsapp-backup-scheduler]", error.message || error);
      });
    }
    if (clock.hour === 20) {
      sendRescheduleApprovalRequest({ force: false }).catch((error) => {
        console.error("[reschedule-approval-scheduler]", error.message || error);
      });
    }
  }, 60 * 1000);
}
