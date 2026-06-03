import express from "express";
import {
  fetchWhatsAppGroups,
  getQrCode,
  getWhatsAppStatus,
  logoutWhatsApp,
  reconnectWhatsApp,
  saveDefaultGroupJids,
  sendReportToDefaultGroup,
} from "./whatsappService.js";

const router = express.Router();

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

router.post("/send-report", async (request, response) => {
  try {
    response.json(await sendReportToDefaultGroup(request.body));
  } catch (error) {
    sendError(response, error);
  }
});

export default router;
