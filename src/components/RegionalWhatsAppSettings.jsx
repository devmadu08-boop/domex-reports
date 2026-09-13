import { Bot, Check, Copy, KeyRound, Loader2, LogOut, MessageCircle, QrCode, RefreshCw, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { getWhatsAppQr, getWhatsAppStatus, logoutWhatsApp, reconnectWhatsApp, fetchWhatsAppGroups, getWhatsAppPairingCode } from "../services/whatsappApi.js";
import { getDispatchTargets } from "../services/dispatchStorage.js";

export default function RegionalWhatsAppSettings({ accountKey: propAccountKey, session }) {
  const accountKey = (session?.role === "admin" || session?.role === "superadmin" || session?.role === "regional_manager" || session?.role === "regional" || !propAccountKey)
    ? "default"
    : propAccountKey;
  const [status, setStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState(null);
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [linkMethod, setLinkMethod] = useState("qr");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingCopied, setPairingCopied] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairedPhone, setPairedPhone] = useState("");
  
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
        let targets = data.targets;
        if (!Array.isArray(targets) || targets.length === 0) {
          const stored = getDispatchTargets();
          if (Array.isArray(stored) && stored.length > 0) {
            targets = stored.map(t => ({
              branch: t.branch_name,
              target: Number(t.target) || 0
            }));
          }
        }
        setConfig(prev => ({ ...prev, ...data, targets: targets || prev.targets || [] }));
      }
    } catch (e) { console.error("Error loading config", e); }
  }

  async function fetchStatus() {
    try {
      const data = await getWhatsAppStatus(accountKey);
      setStatus(data.status);
      if (data.status !== "connected") {
        const qrData = await getWhatsAppQr(accountKey);
        if (qrData?.qrDataUrl) {
          setQrCode(qrData.qrDataUrl);
        }
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
    const interval = setInterval(fetchStatus, 3000);
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
    setQrCode(null);
    try {
      await reconnectWhatsApp(accountKey);
      setGroups([]);
      await fetchStatus();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to log out of WhatsApp?")) return;
    setIsLoading(true);
    try {
      await logoutWhatsApp(accountKey);
      await fetchStatus();
    } finally { setIsLoading(false); }
  }

  async function handleRequestPairingCode(e) {
    if (e) e.preventDefault();
    const raw = pairingPhone.trim();
    if (!raw || raw.replace(/\D/g, "").length < 8) {
      setPairingError("Please enter your WhatsApp phone number (e.g. 0771234567 or 94771234567).");
      return;
    }
    setPairingLoading(true);
    setPairingError("");
    setPairingCode("");
    setPairedPhone("");
    try {
      const res = await getWhatsAppPairingCode(raw, accountKey);
      if (res.pairingCode) {
        setPairingCode(res.pairingCode);
        setPairedPhone(res.phoneNumber || raw);
      } else {
        throw new Error("No pairing code returned.");
      }
    } catch (err) {
      setPairingError(err.message || "Failed to generate pairing code. Please try again.");
    } finally {
      setPairingLoading(false);
    }
  }

  function handleCopyPairingCode() {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode.replace(/[\s-]/g, ""));
    setPairingCopied(true);
    setTimeout(() => setPairingCopied(false), 3000);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      let targetsToSave = config.targets;
      if (!Array.isArray(targetsToSave) || targetsToSave.length === 0) {
        const stored = getDispatchTargets();
        if (Array.isArray(stored) && stored.length > 0) {
          targetsToSave = stored.map(t => ({
            branch: t.branch_name,
            target: Number(t.target) || 0
          }));
        }
      }
      const payload = {
        ...config,
        targets: targetsToSave || [],
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
      let targetsToPass = config.targets;
      if (!Array.isArray(targetsToPass) || targetsToPass.length === 0) {
        const stored = getDispatchTargets();
        if (Array.isArray(stored) && stored.length > 0) {
          targetsToPass = stored.map(t => ({
            branch: t.branch_name,
            target: Number(t.target) || 0
          }));
        }
      }
      const res = await fetch("/api/regional-dispatch/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        },
        body: JSON.stringify({ mode, targets: targetsToPass || [] })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        alert("Test triggered successfully! Message sent to your WhatsApp group.");
      } else {
        alert(`Failed: ${data.error || "Could not send test message to group"}`);
      }
    } catch (e) {
      alert("Test failed: " + e.message);
    } finally {
      setTestMode(null);
    }
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

        {status === "connected" ? (
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
          <div className="rounded-2xl border border-white/70 bg-white/40 p-6">
            <div className="mx-auto mb-6 flex max-w-sm rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setLinkMethod("qr")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
                  linkMethod === "qr" ? "bg-white text-blue-950 shadow" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <QrCode className="h-4 w-4" />
                QR Code
              </button>
              <button
                type="button"
                onClick={() => setLinkMethod("code")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
                  linkMethod === "code" ? "bg-white text-blue-950 shadow" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <KeyRound className="h-4 w-4" />
                Pairing Code
              </button>
            </div>

            {linkMethod === "qr" ? (
              qrCode ? (
                <div className="flex flex-col items-center justify-center">
                  <div className="rounded-2xl border-4 border-white bg-white p-2 shadow-xl">
                    <img src={qrCode} alt="WhatsApp QR Code" className="h-64 w-64 rounded-xl" />
                  </div>
                  <p className="mt-4 text-center font-bold text-[#071537]">Scan with WhatsApp Linked Devices</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <p className="font-bold text-[#071537]/60">Waiting for connection or QR code...</p>
                  <p className="mt-1 text-xs text-[#071537]/40">Click Reconnect above if QR doesn't appear.</p>
                </div>
              )
            ) : (
              <div className="mx-auto max-w-md">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-black text-[#071537]">
                      WhatsApp Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="0771234567 or 94771234567"
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      disabled={pairingLoading}
                    />
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Enter 07xxxxxxxx or 947xxxxxxxx (e.g. 0771234567)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRequestPairingCode}
                    disabled={pairingLoading || !pairingPhone.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white shadow hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {pairingLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating Code...
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-4 w-4" />
                        Get Pairing Code
                      </>
                    )}
                  </button>
                </div>

                {pairingError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-bold text-red-700">
                    {pairingError}
                  </div>
                )}

                {pairingCode && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-center">
                    <p className="text-xs font-black text-emerald-800">Your 8-Digit Secret Code:</p>
                    {pairedPhone && (
                      <p className="text-xs font-bold text-emerald-700">for +{pairedPhone}</p>
                    )}
                    <div className="my-2.5 flex items-center justify-center gap-2">
                      <span className="rounded-xl border border-emerald-300 bg-white px-5 py-2 font-mono text-2xl font-black tracking-widest text-emerald-950 shadow-inner">
                        {pairingCode}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyPairingCode}
                        title="Copy Code"
                        className="rounded-xl border border-emerald-200 bg-white p-2.5 text-emerald-700 shadow hover:bg-emerald-100 transition"
                      >
                        {pairingCopied ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
                      </button>
                    </div>
                    <div className="mt-3 space-y-1 rounded-xl bg-white/80 p-3 text-left text-xs text-slate-600">
                      <p className="font-black text-[#071537]">How to link on your phone:</p>
                      <p>1. Open WhatsApp ➔ Settings (or ⋮ menu) ➔ <b>Linked Devices</b></p>
                      <p>2. Tap <b>Link a Device</b></p>
                      <p>3. Tap <b>&quot;Link with phone number instead&quot;</b> at the bottom</p>
                      <p>4. Enter the code shown above</p>
                    </div>
                  </div>
                )}
              </div>
            )}
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

