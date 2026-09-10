import { Bot, LogOut, MessageCircle, RefreshCw, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { getWhatsAppQr, getWhatsAppStatus, logoutWhatsApp, reconnectWhatsApp, fetchWhatsAppGroups } from "../services/whatsappApi.js";

export default function RegionalWhatsAppSettings({ accountKey, session }) {
  const [status, setStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState(null);
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [config, setConfig] = useState({
    enabled: false,
    groupId: "",
    geminiApiKey: "",
    targets: []
  });

  const [testMode, setTestMode] = useState("");

  async function loadConfig() {
    try {
      const res = await fetch("/api/regional-dispatch/config", {
        headers: { "x-whatsapp-account": accountKey }
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({ ...prev, ...data }));
      }
    } catch (e) { console.error("Error loading config", e); }
  }

  async function fetchStatus() {
    try {
      const data = await getWhatsAppStatus(accountKey);
      setStatus(data.status);
      if (data.status === "qr") {
        const qrData = await getWhatsAppQr(accountKey);
        setQrCode(qrData.qrDataUrl);
      } else {
        setQrCode(null);
      }
      if (data.status === "connected") {
        setGroups((currentGroups) => {
          if (!currentGroups || currentGroups.length === 0) {
            fetchWhatsAppGroups(accountKey)
              .then((g) => {
                if (g?.groups?.length) setGroups(g.groups);
              })
              .catch((err) => console.warn("Failed fetching groups:", err));
          }
          return currentGroups;
        });
      }
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadConfig();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [accountKey]);

  useEffect(() => {
    // If the session has targets, inject them into config to be saved
    if (session?.targets && Object.keys(session.targets).length > 0) {
       const mapped = Object.entries(session.targets).map(([branch, target]) => ({ branch, target: Number(target) }));
       setConfig(c => ({ ...c, targets: mapped }));
    }
  }, [session?.targets]);

  async function handleReconnect() {
    setIsLoading(true);
    try {
      await reconnectWhatsApp(accountKey);
      setGroups([]);
      await fetchStatus();
    } finally { setIsLoading(false); }
  }

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to log out of WhatsApp?")) return;
    setIsLoading(true);
    try {
      await logoutWhatsApp(accountKey);
      await fetchStatus();
    } finally { setIsLoading(false); }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const payload = {
        ...config,
        userName: session?.userName || session?.email || "Regional Manager",
        userRole: session?.role || "Regional Manager"
      };
      await fetch("/api/regional-dispatch/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        },
        body: JSON.stringify(payload)
      });
      alert("Configuration saved successfully!");
    } catch (error) {
      alert("Error saving: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest(mode) {
    setTestMode(mode);
    try {
       const res = await fetch("/api/regional-dispatch/trigger", {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           "x-whatsapp-account": accountKey
         },
         body: JSON.stringify({ mode })
       });
       if (res.ok) alert("Test triggered successfully. Check your WhatsApp group!");
       else alert("Test failed.");
    } catch (e) { alert("Test failed."); }
    finally { setTestMode(""); }
  }

  return (
    <div className="grid gap-6">
      <div className="glass-panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-[#071537]">WhatsApp Connection</h2>
            <p className="text-sm font-semibold text-[#071537]/60">Link your WhatsApp to receive AI dispatch reports</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleReconnect} disabled={isLoading} className="inline-flex items-center gap-2 rounded-2xl bg-white/50 px-4 py-2 text-sm font-black text-[#071537] shadow-sm hover:bg-white disabled:opacity-50">
              <RefreshCw className={"h-4 w-4 " + (isLoading ? "animate-spin" : "")} /> Reconnect
            </button>
            {status === "connected" && (
              <button type="button" onClick={handleLogout} disabled={isLoading} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2 text-sm font-black text-red-600 shadow-sm hover:bg-red-100 disabled:opacity-50">
                <LogOut className="h-4 w-4" /> Disconnect
              </button>
            )}
          </div>
        </div>

        {status === "qr" && qrCode ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/70 bg-white/40 p-8">
            <div className="rounded-2xl border-4 border-white bg-white p-2 shadow-xl">
              <img src={qrCode} alt="WhatsApp QR Code" className="h-64 w-64 rounded-xl" />
            </div>
            <p className="mt-4 text-center font-bold text-[#071537]">Scan with WhatsApp</p>
          </div>
        ) : status === "connected" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-black text-emerald-800">WhatsApp Connected</p>
              <p className="text-xs font-semibold text-emerald-600">Bot is ready to read and send messages</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-white/70 bg-white/40 p-8">
            <p className="font-bold text-[#071537]/60">Waiting for connection...</p>
          </div>
        )}
      </div>

      <div className="glass-panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-[#071537]">Dispatch Automation Settings</h2>
            <p className="text-sm font-semibold text-[#071537]/60">Configure automatic group reports</p>
          </div>
          <button type="button" onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-2 rounded-2xl bg-[#071537] px-5 py-2.5 text-sm font-black text-white shadow-lg hover:bg-[#1a2b56] disabled:opacity-50">
            <Save className={"h-4 w-4 " + (isSaving ? "animate-bounce" : "")} /> {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        <div className="grid gap-5">
          <label className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/50 p-4 cursor-pointer">
            <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({...c, enabled: e.target.checked}))} className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <div>
              <p className="font-black text-[#071537]">Enable Auto Report</p>
              <p className="text-xs font-semibold text-[#071537]/60">Read dispatches from 4 PM to 11 PM and auto-reply at 11:30 PM</p>
            </div>
          </label>

          <div className="rounded-2xl border border-white/70 bg-white/50 p-4">
            <label className="mb-2 block text-sm font-black text-[#071537]">Dispatch WhatsApp Group</label>
            <select
              value={config.groupId}
              onChange={e => setConfig(c => ({...c, groupId: e.target.value}))}
              className="w-full rounded-2xl border border-white/80 bg-white/70 px-4 py-3 font-semibold text-[#071537] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">-- Select Group --</option>
              {groups.map((g) => (
                <option key={g.jid} value={g.jid}>{g.name} ({g.participants} members)</option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/50 p-4">
            <label className="mb-2 block text-sm font-black text-[#071537]">OpenRouter API Key</label>
            <input
              type="password"
              value={config.geminiApiKey}
              onChange={e => setConfig(c => ({...c, geminiApiKey: e.target.value}))}
              placeholder="sk-or-v1-..."
              className="w-full rounded-2xl border border-white/80 bg-white/70 px-4 py-3 font-semibold text-[#071537] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
            <p className="mt-2 text-xs font-semibold text-slate-500">Required for extracting numbers from messy group messages.</p>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h2 className="mb-4 text-xl font-black text-[#071537]">Manual Triggers (Testing)</h2>
        <div className="flex gap-4">
          <button type="button" onClick={() => handleTest("reminder")} disabled={!!testMode} className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white shadow-lg hover:bg-amber-600 disabled:opacity-50">
            <MessageCircle className="h-4 w-4" /> Trigger 11:00 PM Reminder
          </button>
          <button type="button" onClick={() => handleTest("report")} disabled={!!testMode} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg hover:bg-blue-700 disabled:opacity-50">
            <Send className="h-4 w-4" /> Trigger 11:30 PM Report
          </button>
        </div>
      </div>
    </div>
  );
}

