const whatsappApiBaseUrl = (import.meta.env.VITE_WHATSAPP_API_BASE_URL || "").replace(/\/$/, "");

async function requestJson(path, options = {}) {
  let response;
  const url = whatsappApiBaseUrl ? `${whatsappApiBaseUrl}/api/whatsapp${path}` : `/api/whatsapp${path}`;

  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error("WhatsApp backend is not reachable. Start it locally with npm run server or set VITE_WHATSAPP_API_BASE_URL in Vercel.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("WhatsApp API was not found. On Vercel, deploy the WhatsApp backend separately and set VITE_WHATSAPP_API_BASE_URL.");
    }
    if (response.status === 502) {
      throw new Error("WhatsApp backend is not running. Start it locally with npm run server or check the hosted backend URL.");
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
