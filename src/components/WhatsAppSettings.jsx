import { LogOut, MessageCircle, Plus, RefreshCw, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchWhatsAppGroups,
  getWhatsAppQr,
  getWhatsAppStatus,
  logoutWhatsApp,
  reconnectWhatsApp,
  saveDefaultWhatsAppGroup,
} from "../services/whatsappApi.js";

const templatePresets = {
  courier: [
    "📊 *{title}*\n📅 Date: *{date}*\n\nSent automatically from _Daily Report System_",
    "🚚 *Daily Courier Performance Update*\n📅 *{date}*\n\nPlease check the attached report.",
    "✅ *{title}*\n🗓️ Report Date: *{date}*\n\n_For branch review and daily follow-up._",
    "📌 *Courier Performance Report*\nDate: *{date}*\n\nAttached image contains today's courier performance details.",
    "🏢 *Branch Courier Summary*\n📅 {date}\n\n• On route\n• Delivery\n• Resend\n• Pickup\n\nPlease review.",
  ],
  operation: [
    "📊 *{title}*\n📅 Date: *{date}*\n\nSent automatically from _Daily Report System_",
    "📦 *Daily Operation Report*\n🗓️ *{date}*\n\nPlease check the attached operation summary.",
    "🎯 *{title}*\nReport Date: *{date}*\n\n_Inward, outward, target and achievement details attached._",
    "✅ *Operation Update*\n📅 {date}\n\nAttached report is ready for review.",
    "🏢 *Branch Operation Summary*\n📅 *{date}*\n\n• Delivery\n• Missed Route\n• Dispatch\n\nPlease review today's operation figures.",
  ],
  delivered: [
    "💰 *{title}*\n📅 Date: *{date}*\n\nSent automatically from _Daily Report System_",
    "🚚 *Delivered Collection Report*\n🗓️ *{date}*\n\nPlease check the attached collection details.",
    "✅ *{title}*\nReport Date: *{date}*\n\n_Tracking numbers and values are attached._",
    "📌 *Delivered Collection Update*\n📅 {date}\n\nAttached report is ready for review.",
    "👤 *Rider Delivered Collection Summary*\n📅 *{date}*\n\n• Tracking numbers\n• Values\n• Total collection\n\nPlease review.",
  ],
};

export default function WhatsAppSettings({ settings, onSaveSettings }) {
  const [status, setStatus] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [captionTemplates, setCaptionTemplates] = useState(settings.whatsappCaptionTemplates || {});
  const [customTemplates, setCustomTemplates] = useState(settings.whatsappCustomCaptionTemplates || {});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setCaptionTemplates(settings.whatsappCaptionTemplates || {});
    setCustomTemplates(settings.whatsappCustomCaptionTemplates || {});
  }, [settings.whatsappCaptionTemplates, settings.whatsappCustomCaptionTemplates]);

  async function refreshStatus() {
    try {
      const nextStatus = await getWhatsAppStatus();
      setStatus(nextStatus);
      setSelectedGroup((current) => current || nextStatus.defaultGroupJid || "");

      if (!nextStatus.connected) {
        const qr = await getWhatsAppQr();
        setQrDataUrl(qr.qrDataUrl || "");
      } else {
        setQrDataUrl("");
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function runAction(action, successText) {
    setLoading(true);
    setMessage("");
    try {
      await action();
      setMessage(successText);
      await refreshStatus();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchGroups() {
    await runAction(async () => {
      const data = await fetchWhatsAppGroups();
      setGroups(data.groups || []);
    }, "WhatsApp groups loaded.");
  }

  async function handleSaveGroup() {
    await runAction(async () => {
      await saveDefaultWhatsAppGroup(selectedGroup);
    }, "Default WhatsApp group saved.");
  }

  function updateTemplate(type, value) {
    setCaptionTemplates((current) => ({ ...current, [type]: value }));
  }

  async function handleSaveTemplates() {
    setMessage("");
    try {
      await onSaveSettings({
        ...settings,
        whatsappCaptionTemplates: captionTemplates,
        whatsappCustomCaptionTemplates: customTemplates,
      });
      setMessage("WhatsApp message templates saved.");
    } catch (error) {
      setMessage(error.message || "Could not save WhatsApp templates.");
    }
  }

  function addCustomTemplate(type) {
    const value = captionTemplates[type]?.trim();
    if (!value) {
      setMessage("Write a template before adding it as custom.");
      return;
    }

    setCustomTemplates((current) => {
      const existing = current[type] || [];
      if (existing.includes(value) || templatePresets[type].includes(value)) return current;
      return {
        ...current,
        [type]: [...existing, value],
      };
    });
    setMessage("Custom template added. Click Save Templates to keep it.");
  }

  const connected = Boolean(status?.connected);

  return (
    <div className="glass-panel p-4 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-green-100 text-green-700 shadow-inner">
            <MessageCircle className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-black text-[#071537]">WhatsApp Settings</h3>
            <p className="text-sm font-semibold text-blue-950/65">Connect WhatsApp and choose the default report group.</p>
          </div>
        </div>
        <span className={`rounded-2xl px-4 py-2 text-sm font-black ${connected ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="whatsapp-settings-card text-center">
          {connected ? (
            <div className="grid min-h-[280px] place-items-center">
              <div>
                <MessageCircle className="mx-auto h-16 w-16 text-emerald-700" />
                <p className="mt-3 text-lg font-black text-[#071537]">WhatsApp Connected</p>
                <p className="mt-1 text-sm font-bold text-blue-950/65">{status?.connectedNumber || "Number unavailable"}</p>
              </div>
            </div>
          ) : qrDataUrl ? (
            <>
              <img src={qrDataUrl} alt="WhatsApp QR code" className="mx-auto h-64 w-64 rounded-2xl bg-white p-2 shadow-lg" />
              <p className="mt-3 text-sm font-bold text-blue-950/65">Scan with WhatsApp Linked Devices.</p>
            </>
          ) : (
            <div className="grid min-h-[280px] place-items-center text-sm font-bold text-blue-950/65">
              Click reconnect to generate QR.
            </div>
          )}
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" disabled={loading} onClick={() => runAction(reconnectWhatsApp, "WhatsApp reconnect started.")} className="primary-action primary-action-blue disabled:opacity-50">
              <RefreshCw className="h-5 w-5" />
              Reconnect
            </button>
            <button type="button" disabled={loading} onClick={() => runAction(logoutWhatsApp, "WhatsApp session removed.")} className="primary-action primary-action-red disabled:opacity-50">
              <LogOut className="h-5 w-5" />
              Logout / Remove Session
            </button>
          </div>

          <div className="whatsapp-settings-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[#071537]">Default Report Group</p>
                <p className="text-xs font-semibold text-blue-950/60">Fetch joined groups, select one, then save it.</p>
              </div>
              <button type="button" disabled={loading || !connected} onClick={handleFetchGroups} className="secondary-action disabled:opacity-50">
                <Users className="h-5 w-5" />
                Fetch Groups
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <select
                value={selectedGroup}
                onChange={(event) => setSelectedGroup(event.target.value)}
                className="whatsapp-control h-12"
              >
                <option value="">Select WhatsApp group</option>
                {groups.map((group) => (
                  <option key={group.jid} value={group.jid}>
                    {group.name} ({group.participants})
                  </option>
                ))}
                {selectedGroup && !groups.some((group) => group.jid === selectedGroup) && (
                  <option value={selectedGroup}>{selectedGroup}</option>
                )}
              </select>
              <button type="button" disabled={loading || !selectedGroup} onClick={handleSaveGroup} className="primary-action primary-action-green disabled:opacity-50">
                <Save className="h-5 w-5" />
                Save Group
              </button>
            </div>
          </div>

          <div className="whatsapp-settings-card">
            <div className="mb-3">
              <p className="text-sm font-black text-[#071537]">Report Message Templates</p>
              <p className="text-xs font-semibold text-blue-950/60">Use {"{date}"} and {"{title}"} in the WhatsApp caption.</p>
            </div>
            <div className="grid gap-3">
              <TemplateField
                label="Courier Performance"
                value={captionTemplates.courier || ""}
                presets={[...templatePresets.courier, ...(customTemplates.courier || [])]}
                onChange={(value) => updateTemplate("courier", value)}
                onAddCustom={() => addCustomTemplate("courier")}
              />
              <TemplateField
                label="Operation Report"
                value={captionTemplates.operation || ""}
                presets={[...templatePresets.operation, ...(customTemplates.operation || [])]}
                onChange={(value) => updateTemplate("operation", value)}
                onAddCustom={() => addCustomTemplate("operation")}
              />
              <TemplateField
                label="Delivered Collection"
                value={captionTemplates.delivered || ""}
                presets={[...templatePresets.delivered, ...(customTemplates.delivered || [])]}
                onChange={(value) => updateTemplate("delivered", value)}
                onAddCustom={() => addCustomTemplate("delivered")}
              />
              <button type="button" onClick={handleSaveTemplates} className="primary-action primary-action-green">
                <Save className="h-5 w-5" />
                Save Templates
              </button>
            </div>
          </div>

          {message && <p className="rounded-2xl bg-white/60 p-3 text-sm font-black text-blue-950">{message}</p>}
        </div>
      </div>
    </div>
  );
}

function TemplateField({ label, value, presets, onChange, onAddCustom }) {
  return (
    <label className="whatsapp-template-card grid gap-3">
      <span className="text-sm font-black text-[#071537]">{label}</span>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
          className="whatsapp-control h-11 text-sm"
        >
          <option value="">Choose preset template</option>
          {presets.map((preset, index) => (
            <option key={`${label}-${index}`} value={preset}>
              {index < 5 ? `Preset ${index + 1}` : `Custom ${index - 4}`}
            </option>
          ))}
        </select>
        <button type="button" onClick={onAddCustom} className="secondary-action min-h-11">
          <Plus className="h-4 w-4" />
          Add Custom
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows="3"
        className="whatsapp-control min-h-28 resize-y px-4 py-3 text-sm leading-6"
      />
    </label>
  );
}
