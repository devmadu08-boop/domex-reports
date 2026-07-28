const apiBaseUrl = (import.meta.env.VITE_WHATSAPP_API_BASE_URL || "").replace(/\/$/, "");

async function requestJson(path, options = {}) {
  const url = apiBaseUrl ? `${apiBaseUrl}/api/meter-monitor${path}` : `/api/meter-monitor${path}`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error("Rider Meter Monitor backend is not reachable.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Rider Meter Monitor API was not found. Update and restart the VPS backend.");
    }
    throw new Error(data.error || "Rider Meter Monitor request failed.");
  }
  return data;
}

export function getMeterMonitorStatus() {
  return requestJson("/status");
}

export function getMeterMonitorQr() {
  return requestJson("/qr");
}

export function reconnectMeterMonitor() {
  return requestJson("/reconnect", { method: "POST" });
}

export function logoutMeterMonitor() {
  return requestJson("/logout", { method: "POST" });
}

export function fetchMeterMonitorGroups() {
  return requestJson("/groups");
}

export function fetchMeterGroupParticipants(groupJid) {
  return requestJson(`/groups/${encodeURIComponent(groupJid)}/participants`);
}

export function saveMeterMonitorConfig(config) {
  return requestJson("/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function runMeterMonitorCheck() {
  return requestJson("/run-check", { method: "POST" });
}
