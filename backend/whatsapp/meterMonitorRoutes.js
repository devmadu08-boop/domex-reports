import express from "express";
import {
  fetchMeterGroupParticipants,
  fetchMeterMonitorGroups,
  getMeterMonitorQr,
  getMeterMonitorStatus,
  logoutMeterMonitor,
  queueMeterPhotoCheck,
  reconnectMeterMonitor,
  saveMeterMonitorConfig,
} from "./meterMonitorService.js";
import {
  getMeterChatMessages,
  isMeterChatAccessAllowed,
  listMeterChats,
  markMeterChatRead,
  sendMeterChatReply,
} from "./meterChatService.js";

const router = express.Router();

function sendError(response, error) {
  console.error("[meter-monitor-api]", error);
  response.status(500).json({ error: error.message || "Rider Meter Monitor API error." });
}

async function requireMeterChatAccess(request, response, next) {
  if (await isMeterChatAccessAllowed(request.get("x-meter-chat-key"))) {
    next();
    return;
  }
  response.status(401).json({ error: "Enter the Meter Chats access key." });
}

router.get("/status", async (_request, response) => {
  try {
    response.json(await getMeterMonitorStatus());
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/qr", async (_request, response) => {
  try {
    response.json(await getMeterMonitorQr());
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/reconnect", async (_request, response) => {
  try {
    response.json(await reconnectMeterMonitor());
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/logout", async (_request, response) => {
  try {
    response.json(await logoutMeterMonitor());
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/groups", async (_request, response) => {
  try {
    response.json({ groups: await fetchMeterMonitorGroups() });
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/groups/:groupJid/participants", async (request, response) => {
  try {
    response.json(await fetchMeterGroupParticipants(decodeURIComponent(request.params.groupJid)));
  } catch (error) {
    sendError(response, error);
  }
});

router.put("/config", async (request, response) => {
  try {
    response.json(await saveMeterMonitorConfig(request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/run-check", async (request, response) => {
  try {
    response.json(await queueMeterPhotoCheck({
      sessionKey: String(request.body?.sessionKey || ""),
    }));
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/chats", requireMeterChatAccess, async (_request, response) => {
  try {
    response.json(await listMeterChats());
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/chats/messages", requireMeterChatAccess, async (request, response) => {
  try {
    response.json(await getMeterChatMessages(request.query.jid, request.query.limit));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/chats/read", requireMeterChatAccess, async (request, response) => {
  try {
    response.json(await markMeterChatRead(request.body?.jid));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/chats/send", requireMeterChatAccess, async (request, response) => {
  try {
    response.json(await sendMeterChatReply(request.body?.jid, request.body?.text));
  } catch (error) {
    sendError(response, error);
  }
});

export default router;
