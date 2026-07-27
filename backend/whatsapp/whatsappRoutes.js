import express from "express";
import {
  fetchWhatsAppGroups,
  getQrCode,
  getWhatsAppStatus,
  logoutWhatsApp,
  reconnectWhatsApp,
  saveConvertDefaultGroupJids,
  saveBackupConfig,
  saveDefaultGroupJids,
  saveRescheduleDefaultGroupJids,
  saveLatestBackupSnapshot,
  sendBackupToWhatsApp,
  sendRescheduleApprovalRequest,
  sendReportToConvertDefaultGroup,
  sendReportToDefaultGroup,
  sendReportToRescheduleDefaultGroup,
  sendReportToRecipient,
  sendTextToRecipient,
} from "./whatsappService.js";
import {
  configureWhatsAppQueue,
  getWhatsAppQueueStatus,
  retryFailedWhatsAppJobs,
  retryWhatsAppJob,
  sendWithWhatsAppQueue,
} from "./whatsappQueue.js";

const router = express.Router();

configureWhatsAppQueue(async (type, payload) => {
  if (type === "default-report") return sendReportToDefaultGroup(payload);
  if (type === "delivered-report") return sendReportToConvertDefaultGroup(payload);
  if (type === "reschedule-report") return sendReportToRescheduleDefaultGroup(payload);
  if (type === "recipient-report") return sendReportToRecipient(payload);
  if (type === "recipient-text") return sendTextToRecipient(payload);
  if (type === "backup-now") return sendBackupToWhatsApp({ force: true });
  if (type === "reschedule-approval") return sendRescheduleApprovalRequest({ force: true });
  throw new Error(`Unsupported WhatsApp queue job: ${type}`);
});

function sendError(response, error) {
  console.error("[whatsapp-api]", error);
  response.status(500).json({ error: error.message || "WhatsApp API error." });
}

router.get("/status", async (_request, response) => {
  try {
    response.json(await getWhatsAppStatus());
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/qr", async (_request, response) => {
  try {
    response.json(await getQrCode());
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/reconnect", async (_request, response) => {
  try {
    response.json(await reconnectWhatsApp());
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/logout", async (_request, response) => {
  try {
    response.json(await logoutWhatsApp());
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/groups", async (_request, response) => {
  try {
    response.json({ groups: await fetchWhatsAppGroups() });
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/default-group", async (request, response) => {
  try {
    const config = await saveDefaultGroupJids(request.body.groupJids || request.body.groupJid);
    response.json(config);
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/convert-default-group", async (request, response) => {
  try {
    const config = await saveConvertDefaultGroupJids(request.body.groupJids || request.body.groupJid);
    response.json(config);
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/reschedule-default-group", async (request, response) => {
  try {
    const config = await saveRescheduleDefaultGroupJids(request.body.groupJids || request.body.groupJid);
    response.json(config);
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/send-report", async (request, response) => {
  try {
    response.json(await sendWithWhatsAppQueue("default-report", request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/send-convert-report", async (request, response) => {
  try {
    response.json(await sendWithWhatsAppQueue("delivered-report", request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/send-reschedule-report", async (request, response) => {
  try {
    response.json(await sendWithWhatsAppQueue("reschedule-report", request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/send-report-to-recipient", async (request, response) => {
  try {
    response.json(await sendWithWhatsAppQueue("recipient-report", request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/send-text-to-recipient", async (request, response) => {
  try {
    response.json(await sendWithWhatsAppQueue("recipient-text", request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/backup-config", async (request, response) => {
  try {
    response.json(await saveBackupConfig(request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/backup-snapshot", async (request, response) => {
  try {
    response.json(await saveLatestBackupSnapshot(request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/send-backup-now", async (_request, response) => {
  try {
    response.json(await sendWithWhatsAppQueue("backup-now", {}));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/send-reschedule-approval-now", async (_request, response) => {
  try {
    response.json(await sendWithWhatsAppQueue("reschedule-approval", {}));
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/queue", async (_request, response) => {
  try {
    response.json(await getWhatsAppQueueStatus());
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/queue/retry-failed", async (_request, response) => {
  try {
    response.json(await retryFailedWhatsAppJobs());
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/queue/:jobId/retry", async (request, response) => {
  try {
    response.json(await retryWhatsAppJob(request.params.jobId));
  } catch (error) {
    sendError(response, error);
  }
});

export default router;
