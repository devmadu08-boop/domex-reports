import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { getSettings } from "../services/reportStorage.js";
import { sendReportToWhatsApp } from "../services/whatsappApi.js";
import { captureElementAsPngDataUrl } from "../utils/exportReports.js";

export default function SendToWhatsAppButton({ reportRef, reportTitle, reportDate, reportType = "courier", disabled, compact = false }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSend() {
    setSending(true);
    setMessage("");

    try {
      const imageDataUrl = await captureElementAsPngDataUrl(reportRef.current);
      await sendReportToWhatsApp({
        imageDataUrl,
        caption: buildCaption(reportType, reportTitle, reportDate),
      });
      setMessage("Sent to WhatsApp successfully.");
    } catch (error) {
      setMessage(error.message || "Send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={disabled || sending}
        onClick={handleSend}
        className={
          compact
            ? "export-action-button bg-gradient-to-br from-green-600 to-emerald-500 shadow-emerald-300/50"
            : "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/65 bg-gradient-to-br from-green-600 to-emerald-500 px-4 py-3 text-sm font-extrabold text-white shadow-xl shadow-emerald-300/50 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <MessageCircle className="h-5 w-5" />
        {sending ? "Sending..." : compact ? "WhatsApp" : "Send to WhatsApp"}
      </button>
      {message && <p className="rounded-2xl bg-white/65 px-3 py-2 text-xs font-black text-blue-950">{message}</p>}
    </div>
  );
}

function buildCaption(reportType, reportTitle, reportDate) {
  const templates = getSettings().whatsappCaptionTemplates || {};
  const template = templates[reportType] || "{title} - {date}\nSent automatically from Daily Report System";
  return template.replaceAll("{title}", reportTitle).replaceAll("{date}", reportDate);
}

