import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { getWhatsAppStatus } from "../services/whatsappApi.js";

export default function RescheduleAutomationStatus({ onConfigure }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const refresh = () => getWhatsAppStatus().then((value) => { if (!cancelled) { setStatus(value); setError(""); } }).catch((err) => { if (!cancelled) setError(err.message); });
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  const schedule = status?.rescheduleSchedule;
  return <section className="reschedule-readiness"><div><CalendarClock size={22} /><span><strong>Reschedule auto-send</strong><small>20:00 · Sri Lanka time · Approval reaction required</small></span>{schedule?.ready && status?.connected ? <CheckCircle2 className="readiness-ok" size={22} /> : <AlertTriangle className="readiness-warning" size={22} />}</div>{error ? <p role="status">{error}</p> : !schedule ? <p>Checking scheduled report setup…</p> : <><p>{schedule.rowCount} saved parcels for {schedule.date} · {schedule.groupCount} destination group(s)</p>{!status.connected ? <p className="readiness-warning">Connect this account’s Report WhatsApp before automatic sending.</p> : null}{schedule.missing.map((reason) => <p key={reason} className="readiness-warning">{reason}</p>)}{schedule.ready ? <p className="readiness-ok">{schedule.lastApprovalDate === schedule.date ? `Today’s approval request: ${schedule.status}.` : "Ready. The scheduler retries after 20:00 if the connection becomes available later."}</p> : null}</>}{onConfigure ? <button type="button" onClick={onConfigure}>Configure groups & WhatsApp →</button> : null}</section>;
}
