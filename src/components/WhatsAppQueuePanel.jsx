import { useEffect, useState } from "react";
import { Eye, Pencil, RefreshCw, Send, Trash2, X, Search } from "lucide-react";
import { clearWhatsAppQueue, deleteWhatsAppQueueJob, getWhatsAppQueue, getWhatsAppQueueJob, retryWhatsAppQueueJob, updateWhatsAppQueueJob } from "../services/whatsappApi.js";

export default function WhatsAppQueuePanel({ accountLabel = "Your branch" }) {
  const [queue, setQueue] = useState({ counts: {}, jobs: [] });
  const [filter, setFilter] = useState("outstanding");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [limit, setLimit] = useState(20);

  async function refresh() {
    try { setQueue(await getWhatsAppQueue()); }
    catch (error) { setMessage(error.message); }
  }
  useEffect(() => {
    let cancelled = false;
    const update = () => getWhatsAppQueue().then((value) => { if (!cancelled) setQueue(value); }).catch((error) => { if (!cancelled) setMessage(error.message); });
    update();
    const timer = window.setInterval(update, 10000);
    window.addEventListener("whatsapp-queue-changed", update);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("whatsapp-queue-changed", update); };
  }, [accountLabel]);

  async function act(action, success) {
    setBusy(true); setMessage("");
    try { const result = await action(); setMessage(typeof success === "function" ? success(result) : success); await refresh(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function open(job, edit) {
    await act(async () => {
      const value = await getWhatsAppQueueJob(job.id);
      setDetail(value); setDraft(value.payload || {}); setEditing(edit);
    }, "");
  }
  const jobs = queue.jobs.filter((job) => (
    (filter === "all" || (filter === "outstanding" ? job.status !== "sent" : job.status === filter))
    && `${job.type} ${job.preview} ${job.phoneNumber}`.toLowerCase().includes(query.toLowerCase())
  ));
  const media = detail?.payload?.imageDataUrls || [detail?.payload?.imageDataUrl].filter(Boolean);
  const editable = detail && ["pending", "failed"].includes(detail.status);

  return (
    <section className="whatsapp-queue-panel">
      <div className="queue-intro"><span className="queue-feature-icon"><Send size={24} /></span><div><h2>WhatsApp Outbox</h2><p>{accountLabel} · Your messages and report attachments</p></div><button type="button" className="secondary-action" disabled={busy} onClick={refresh}><RefreshCw size={16} />Refresh</button></div>
      <div className="queue-counts">{["pending", "sending", "failed", "sent"].map((status) => <button key={status} type="button" onClick={() => { setFilter(status); setLimit(20); }} className={`queue-count queue-${status}`}><span>{status}</span><strong>{queue.counts[status] || 0}</strong></button>)}</div>
      <div className="queue-toolbar"><label><Search size={17} /><input aria-label="Search queued messages" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search message, rider number or report…" /></label><select aria-label="Queue status" value={filter} onChange={(event) => { setFilter(event.target.value); setLimit(20); }}><option value="outstanding">Pending & failed</option><option value="pending">Pending</option><option value="sending">Sending</option><option value="failed">Failed</option><option value="sent">Sent history</option><option value="all">All messages</option></select><button type="button" disabled={busy || !queue.jobs.length} className="queue-clear" onClick={() => { if (confirm("Clear all messages and history for this WhatsApp account? Messages already sending will finish.")) act(clearWhatsAppQueue, (result) => `Cleared ${result.deletedCount} messages. ${result.sendingKept || 0} currently sending.`); }}><Trash2 size={16} />Clear All</button></div>
      {message ? <p className="queue-message" role="status">{message}</p> : null}
      <div className="queue-list">{jobs.slice(0, limit).map((job) => <article key={job.id} className="queue-job"><div className="queue-job-heading"><span className={`queue-status queue-${job.status}`}>{job.status}</span><strong>{job.type.replaceAll("-", " ")}</strong><small>{new Date(job.createdAt).toLocaleString()}</small></div><p>{job.preview}</p><small>{job.phoneNumber || "Configured report destination"} · {job.attempts} attempt(s){job.lastError ? ` · ${job.lastError}` : ""}</small><div className="queue-job-actions"><button type="button" disabled={busy} onClick={() => open(job, false)}><Eye size={15} />View</button>{["pending", "failed"].includes(job.status) ? <><button type="button" disabled={busy || !(job.type === "recipient-text" || job.type.endsWith("report"))} onClick={() => open(job, true)}><Pencil size={15} />Edit</button><button type="button" disabled={busy} onClick={() => act(() => retryWhatsAppQueueJob(job.id), "Message queued for retry.")}><RefreshCw size={15} />Retry</button></> : null}<button type="button" disabled={busy || job.status === "sending"} onClick={() => { if (confirm("Delete this queue message? This does not recall a message already delivered.")) act(() => deleteWhatsAppQueueJob(job.id), "Queue message deleted."); }}><Trash2 size={15} />Delete</button></div></article>)}</div>
      {!jobs.length ? <div className="queue-empty"><Send size={32} /><h3>Your outbox is clear</h3><p>No messages match this view. Exported reports appear here when WhatsApp sending is selected.</p></div> : null}
      {jobs.length > limit ? <button type="button" className="secondary-action" onClick={() => setLimit((value) => value + 20)}>Show more messages</button> : null}
      {detail ? <div className="queue-modal-backdrop"><section className="queue-detail" role="dialog" aria-modal="true" aria-labelledby="queue-detail-title" onKeyDown={(event) => {
        if (event.key === "Escape") setDetail(null);
        if (event.key === "Tab") {
          const focusable = [...event.currentTarget.querySelectorAll("button, input, textarea")].filter((element) => !element.disabled);
          const target = event.shiftKey ? focusable[0] : focusable.at(-1);
          if (document.activeElement === target) { event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus(); }
        }
      }}><div className="queue-detail-heading"><div><h3 id="queue-detail-title">{editing ? "Edit queued message" : "Message details"}</h3><small>{detail.status} · {detail.type.replaceAll("-", " ")}</small></div><button type="button" autoFocus aria-label="Close message details" onClick={() => setDetail(null)}><X size={20} /></button></div>{draft.phoneNumber ? <label>Recipient<input readOnly={!editing} value={draft.phoneNumber} onChange={(event) => setDraft((value) => ({ ...value, phoneNumber: event.target.value }))} /></label> : null}<label>{detail.type === "recipient-text" ? "Message" : "Caption"}<textarea rows={8} readOnly={!editing} value={draft.message || draft.caption || ""} onChange={(event) => setDraft((value) => ({ ...value, [detail.type === "recipient-text" ? "message" : "caption"]: event.target.value }))} /></label><div className="queue-attachments">{media.filter((url) => url.startsWith("data:image/png;base64,")).map((url, index) => <img key={index} src={url} alt={`Report attachment ${index + 1}`} />)}</div>{detail.status === "sent" ? <p>Delivered attachment data is removed from queue storage after sending.</p> : null}{message ? <p role="status">{message}</p> : null}{editing && editable ? <button type="button" className="domex-primary-button" disabled={busy} onClick={() => act(async () => { const patch = { [detail.type === "recipient-text" ? "message" : "caption"]: draft.message || draft.caption || "" }; if (draft.phoneNumber) patch.phoneNumber = draft.phoneNumber; await updateWhatsAppQueueJob(detail.id, patch); setDetail(null); }, "Message updated. Its scheduled retry is unchanged.")}>Save message</button> : null}</section></div> : null}
    </section>
  );
}
