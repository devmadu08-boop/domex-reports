import express from "express";
import { getRegionalConfig, saveRegionalConfig, manualTrigger, getRegionalLiveStatus } from "./regionalDispatchAutomationService.js";
import { normalizeWhatsAppAccountKey } from "../whatsapp/accountWhatsappService.js";

const router = express.Router();

function accountKey(request) {
  return normalizeWhatsAppAccountKey(request.get("x-whatsapp-account") || "default");
}

router.get("/config", async (request, response) => {
  try {
    response.json(await getRegionalConfig(accountKey(request)));
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

router.post("/config", async (request, response) => {
  try {
    response.json(await saveRegionalConfig(accountKey(request), request.body));
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

router.get("/live", async (request, response) => {
  try {
    const data = await getRegionalLiveStatus(accountKey(request));
    response.json(data);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

router.post("/live", async (request, response) => {
  try {
    const customTargets = request.body?.targets;
    const data = await getRegionalLiveStatus(accountKey(request), customTargets);
    response.json(data);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

router.post("/trigger", async (request, response) => {
  try {
    const { mode } = request.body; // "reminder" or "report"
    await manualTrigger(accountKey(request), mode);
    response.json({ ok: true, message: "Triggered successfully" });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

export default router;
