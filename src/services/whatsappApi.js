async function requestJson(path, options = {}) {
  let response;

  try {
    response = await fetch(`/api/whatsapp${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error("WhatsApp backend is not running. Start it with: npm run server");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 502) {
      throw new Error("WhatsApp backend is not running. Start it with: npm run server");
    }
    throw new Error(data.error || "WhatsApp API request failed.");
  }
  return data;
}

export function getWhatsAppStatus() {
  return requestJson("/status");
}

export function getWhatsAppQr() {
  return requestJson("/qr");
}

export function reconnectWhatsApp() {
  return requestJson("/reconnect", { method: "POST" });
}

export function logoutWhatsApp() {
  return requestJson("/logout", { method: "POST" });
}

export function fetchWhatsAppGroups() {
  return requestJson("/groups");
}

export function saveDefaultWhatsAppGroup(groupJid) {
  return requestJson("/default-group", {
    method: "POST",
    body: JSON.stringify({ groupJid }),
  });
}

export function sendReportToWhatsApp({ imageDataUrl, caption }) {
  return requestJson("/send-report", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl, caption }),
  });
}
