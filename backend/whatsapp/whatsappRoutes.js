import express from "express";
import {
  PRIMARY_WHATSAPP_ACCOUNT,
  fetchAccountGroups,
  getAccountQr,
  getAccountWhatsAppStatus,
  logoutAccountWhatsApp,
  normalizeWhatsAppAccountKey,
  reconnectAccountWhatsApp,
  saveAccountBackupConfig,
  saveAccountBackupSnapshot,
  saveAccountGroups,
  sendAccountBackup,
  sendAccountGroupReport,
  sendAccountRecipientReport,
  sendAccountRecipientText,
  sendAccountRescheduleApproval,
} from "./accountWhatsappService.js";
import {
  configureWhatsAppQueue,
  getWhatsAppQueueStatus,
  retryFailedWhatsAppJobs,
  retryWhatsAppJob,
  sendWithWhatsAppQueue,
} from "./whatsappQueue.js";

const router = express.Router();

function accountKey(request) {
  return normalizeWhatsAppAccountKey(request.get("x-whatsapp-account") || PRIMARY_WHATSAPP_ACCOUNT);
}

function accountPayload(request) {
  return { ...request.body, __whatsappAccountKey: accountKey(request) };
}

configureWhatsAppQueue(async (type, payload) => {
  const key = payload.__whatsappAccountKey || PRIMARY_WHATSAPP_ACCOUNT;
  if (type === "default-report") return sendAccountGroupReport(key, "default", payload);
  if (type === "delivered-report") return sendAccountGroupReport(key, "delivered", payload);
  if (type === "reschedule-report") return sendAccountGroupReport(key, "reschedule", payload);
  if (type === "audit-report") return sendAccountGroupReport(key, "audit", payload);
  if (type === "recipient-report") return sendAccountRecipientReport(key, payload);
  if (type === "recipient-text") return sendAccountRecipientText(key, payload);
  if (type === "backup-now") return sendAccountBackup(key, { force: true });
  if (type === "reschedule-approval") return sendAccountRescheduleApproval(key, { force: true });
  throw new Error(`Unsupported WhatsApp queue job: ${type}`);
});

function sendError(response, error) {
  console.error("[whatsapp-api]", error);
  response.status(500).json({ error: error.message || "WhatsApp API error." });
}

router.get("/status", async (request, response) => {
  try { response.json(await getAccountWhatsAppStatus(accountKey(request))); } catch (error) { sendError(response, error); }
});

router.get("/qr", async (request, response) => {
  try { response.json(await getAccountQr(accountKey(request))); } catch (error) { sendError(response, error); }
});

router.post("/reconnect", async (request, response) => {
  try { response.json(await reconnectAccountWhatsApp(accountKey(request))); } catch (error) { sendError(response, error); }
});

router.post("/logout", async (request, response) => {
  try { response.json(await logoutAccountWhatsApp(accountKey(request))); } catch (error) { sendError(response, error); }
});

router.get("/groups", async (request, response) => {
  try { response.json({ groups: await fetchAccountGroups(accountKey(request)) }); } catch (error) { sendError(response, error); }
});

router.post("/default-group", async (request, response) => {
  try { response.json(await saveAccountGroups(accountKey(request), "default", request.body.groupJids || request.body.groupJid)); } catch (error) { sendError(response, error); }
});

router.post("/convert-default-group", async (request, response) => {
  try { response.json(await saveAccountGroups(accountKey(request), "delivered", request.body.groupJids || request.body.groupJid)); } catch (error) { sendError(response, error); }
});

router.post("/reschedule-default-group", async (request, response) => {
  try { response.json(await saveAccountGroups(accountKey(request), "reschedule", request.body.groupJids || request.body.groupJid)); } catch (error) { sendError(response, error); }
});

router.post("/audit-default-group", async (request, response) => {
  try { response.json(await saveAccountGroups(accountKey(request), "audit", request.body.groupJids || request.body.groupJid)); } catch (error) { sendError(response, error); }
});

const queuedRoutes = [
  ["/send-report", "default-report"],
  ["/send-convert-report", "delivered-report"],
  ["/send-reschedule-report", "reschedule-report"],
  ["/send-audit-report", "audit-report"],
  ["/send-report-to-recipient", "recipient-report"],
  ["/send-text-to-recipient", "recipient-text"],
];

for (const [route, type] of queuedRoutes) {
  router.post(route, async (request, response) => {
    try { response.json(await sendWithWhatsAppQueue(type, accountPayload(request), accountKey(request))); } catch (error) { sendError(response, error); }
  });
}

router.post("/backup-config", async (request, response) => {
  try { response.json(await saveAccountBackupConfig(accountKey(request), request.body)); } catch (error) { sendError(response, error); }
});

router.post("/backup-snapshot", async (request, response) => {
  try { response.json(await saveAccountBackupSnapshot(accountKey(request), request.body)); } catch (error) { sendError(response, error); }
});

router.post("/send-backup-now", async (request, response) => {
  try { response.json(await sendWithWhatsAppQueue("backup-now", accountPayload(request), accountKey(request))); } catch (error) { sendError(response, error); }
});

router.post("/send-reschedule-approval-now", async (request, response) => {
  try { response.json(await sendWithWhatsAppQueue("reschedule-approval", accountPayload(request), accountKey(request))); } catch (error) { sendError(response, error); }
});

router.get("/queue", async (request, response) => {
  try { response.json(await getWhatsAppQueueStatus(accountKey(request))); } catch (error) { sendError(response, error); }
});

router.post("/queue/retry-failed", async (request, response) => {
  try { response.json(await retryFailedWhatsAppJobs(accountKey(request))); } catch (error) { sendError(response, error); }
});

router.post("/queue/:jobId/retry", async (request, response) => {
  try { response.json(await retryWhatsAppJob(request.params.jobId, accountKey(request))); } catch (error) { sendError(response, error); }
});

export default router;
