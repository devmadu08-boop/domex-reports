const apiBaseUrl = (import.meta.env.VITE_WHATSAPP_API_BASE_URL || "").replace(/\/$/, "");

async function requestJson(path, options = {}) {
  const url = apiBaseUrl ? `${apiBaseUrl}/api/meter-monitor${path}` : `/api/meter-monitor${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
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

function chatHeaders(accessKey) {
  return { "x-meter-chat-key": String(accessKey || "") };
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

export function runMeterMonitorCheck(sessionKey) {
  return requestJson("/run-check", {
    method: "POST",
    body: JSON.stringify({ sessionKey }),
  });
}

export function fetchMeterChats(accessKey) {
  return requestJson("/chats", { headers: chatHeaders(accessKey) });
}

export function fetchMeterChatMessages(accessKey, jid, limit = 150) {
  const query = new URLSearchParams({ jid, limit: String(limit) });
  return requestJson(`/chats/messages?${query}`, { headers: chatHeaders(accessKey) });
}

export function markMeterChatRead(accessKey, jid) {
  return requestJson("/chats/read", {
    method: "POST",
    headers: chatHeaders(accessKey),
    body: JSON.stringify({ jid }),
  });
}

export function sendMeterChatReply(accessKey, jid, text) {
  return requestJson("/chats/send", {
    method: "POST",
    headers: chatHeaders(accessKey),
    body: JSON.stringify({ jid, text }),
  });
}
