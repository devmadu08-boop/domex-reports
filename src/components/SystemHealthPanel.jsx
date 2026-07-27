import { Cloud, CloudOff, Database, RefreshCw, Send, Server, Wifi } from "lucide-react";

export default function SystemHealthPanel({
  firebaseStatus,
  backendStatus,
  health,
  pendingCloudSync,
  onRefresh,
  onRetryQueue,
  refreshing,
}) {
  const queue = health?.queue?.counts || {};
  const whatsappConnected = Boolean(health?.whatsapp?.connected);
  const backendOnline = Boolean(health?.ok);

  return (
    <section className="glass-panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-violet-600">Admin monitoring</p>
          <h2 className="text-xl font-black text-[#071537]">System Health Panel</h2>
        </div>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="secondary-action">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <HealthItem
          icon={Database}
          label="Firebase"
          value={firebaseStatus}
          ok={firebaseStatus.includes("connected")}
          tone="violet"
        />
        <HealthItem icon={Server} label="Backend" value={backendStatus} ok={backendOnline} tone="blue" />
        <HealthItem
          icon={whatsappConnected ? Send : CloudOff}
          label="WhatsApp"
          value={whatsappConnected ? `Connected ${health?.whatsapp?.connectedNumber || ""}` : "Disconnected"}
          ok={whatsappConnected}
          tone="green"
        />
        <HealthItem
          icon={pendingCloudSync ? CloudOff : Cloud}
          label="Cloud Recovery"
          value={pendingCloudSync ? `Queued, ${pendingCloudSync.attempts || 1} attempt(s)` : "No pending changes"}
          ok={!pendingCloudSync}
          tone="orange"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-[#fff9f5] p-3">
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <QueuePill label="Pending" value={(queue.pending || 0) + (queue.sending || 0)} tone="amber" />
          <QueuePill label="Failed" value={queue.failed || 0} tone="red" />
          <QueuePill label="Sent" value={queue.sent || 0} tone="green" />
          {health?.uptimeSeconds != null && (
            <span className="rounded-full bg-blue-50 px-3 py-2 text-blue-700">
              <Wifi className="mr-1 inline h-3.5 w-3.5" />
              Uptime {formatUptime(health.uptimeSeconds)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRetryQueue}
          disabled={!queue.failed}
          className="secondary-action disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Failed Sends
        </button>
      </div>
    </section>
  );
}

function HealthItem({ icon: Icon, label, value, ok, tone }) {
  const tones = {
    violet: "bg-violet-100 text-violet-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    orange: "bg-amber-100 text-amber-700",
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white bg-[#fffaf7] p-3 shadow-[6px_7px_16px_rgba(96,75,140,0.10)]">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black uppercase text-blue-950/55">{label}</span>
        <span className={`block truncate text-sm font-black ${ok ? "text-emerald-700" : "text-red-600"}`}>{value}</span>
      </span>
    </div>
  );
}

function QueuePill({ label, value, tone }) {
  const tones = {
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    green: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`rounded-full px-3 py-2 ${tones[tone]}`}>{label}: {value}</span>;
}

function formatUptime(seconds) {
  const hours = Math.floor(Number(seconds || 0) / 3600);
  const minutes = Math.floor((Number(seconds || 0) % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
