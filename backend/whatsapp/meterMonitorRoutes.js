import express from "express";
import {
  fetchMeterGroupParticipants,
  fetchMeterMonitorGroups,
  getMeterMonitorQr,
  getMeterMonitorStatus,
  logoutMeterMonitor,
  reconnectMeterMonitor,
  runMeterPhotoCheck,
  saveMeterMonitorConfig,
} from "./meterMonitorService.js";

const router = express.Router();

function sendError(response, error) {
  console.error("[meter-monitor-api]", error);
  response.status(500).json({ error: error.message || "Rider Meter Monitor API error." });
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
    response.json(await runMeterPhotoCheck({
      force: true,
      sessionKey: String(request.body?.sessionKey || ""),
    }));
  } catch (error) {
    sendError(response, error);
  }
});

export default router;
