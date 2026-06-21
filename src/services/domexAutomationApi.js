const backendBaseUrl = (import.meta.env.VITE_WHATSAPP_API_BASE_URL || "").replace(/\/$/, "");

async function requestDomex(path, options = {}) {
  const url = backendBaseUrl ? `${backendBaseUrl}/api/domex${path}` : `/api/domex${path}`;
  let response;
  try {
    response = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error("DOMEX automation backend is not reachable. Check the VPS backend and Cloudflare tunnel.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) throw new Error("DOMEX automation API was not found. Pull the latest GitHub code on the VPS and restart the backend.");
    throw new Error(data.error || "DOMEX automation request failed.");
  }
  return data;
}

export function getDomexAutomationStatus() {
  return requestDomex("/status");
}

export function saveDomexAutomationConfig(config) {
  return requestDomex("/config", { method: "POST", body: JSON.stringify(config) });
}

export function fetchDomexDeliveredCsv({ riderName, reportDate, branchName }) {
  return requestDomex("/delivered-csv", {
    method: "POST",
    body: JSON.stringify({ riderName, reportDate, branchName }),
  });
}
