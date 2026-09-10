import express from "express";
import { 
  getRegionalConfig, 
  saveRegionalConfig, 
  manualTrigger, 
  getRegionalLiveStatus,
  getRegionalDispatchReports,
  saveRegionalDispatchReport,
  deleteRegionalDispatchReport
} from "./regionalDispatchAutomationService.js";
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
    const { mode, targets } = request.body || {}; // "reminder" or "report"
    const key = accountKey(request);
    const result = await manualTrigger(key, mode, targets);
    response.json({ ok: true, message: "Triggered successfully", result });
  } catch (error) {
    console.error("[regional-dispatch] Trigger error:", error.message || error);
    response.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/reports", async (request, response) => {
  try {
    const key = accountKey(request);
    const reports = await getRegionalDispatchReports(key);
    response.json({ ok: true, reports });
  } catch (error) {
    console.error("[regional-dispatch] Get reports error:", error.message || error);
    response.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/reports", async (request, response) => {
  try {
    const key = accountKey(request);
    const report = request.body;
    if (!report || !report.date) {
      return response.status(400).json({ ok: false, error: "Missing report date or data" });
    }
    const saved = await saveRegionalDispatchReport(key, report);
    response.json({ ok: true, report: saved });
  } catch (error) {
    console.error("[regional-dispatch] Save report error:", error.message || error);
    response.status(500).json({ ok: false, error: error.message });
  }
});

router.delete("/reports/:id", async (request, response) => {
  try {
    const key = accountKey(request);
    const result = await deleteRegionalDispatchReport(key, request.params.id);
    response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[regional-dispatch] Delete report error:", error.message || error);
    response.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
