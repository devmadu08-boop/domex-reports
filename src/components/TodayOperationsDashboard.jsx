import { AlertTriangle, CheckCircle2, Clock3, FileWarning, Send, Users } from "lucide-react";

export default function TodayOperationsDashboard({ summary, onOpen }) {
  const items = [
    { label: "Riders completed", value: summary.deliveredRiders, helper: "Saved delivered reports", icon: Users, tone: "violet", tab: "deliveredConverter" },
    { label: "Exceptions to review", value: summary.exceptions, helper: "Missing or unreviewed parcels", icon: AlertTriangle, tone: "red", tab: "deliveredConverter" },
    { label: "Reports remaining", value: summary.reportsRemaining, helper: "Courier and Operation", icon: FileWarning, tone: "amber", tab: summary.hasCourier ? "operation" : "courier" },
    { label: "WhatsApp pending", value: summary.whatsappPending, helper: "Queued or failed sends", icon: Send, tone: "blue", tab: "settings" },
  ];

  return (
    <section className="glass-panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-violet-600">Today operations</p>
          <h2 className="text-xl font-black text-[#071537]">{summary.date}</h2>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${
          summary.ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
        }`}>
          {summary.ready ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
          {summary.ready ? "Daily work complete" : "Work in progress"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} type="button" onClick={() => onOpen(item.tab)} className="min-w-0 rounded-2xl border border-white bg-[#fffaf7] p-3 text-left shadow-[6px_7px_16px_rgba(96,75,140,0.10)]">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${toneClass(item.tone)}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="mt-3 block text-2xl font-black text-[#071537]">{item.value}</span>
              <span className="block text-xs font-black uppercase text-blue-950/60">{item.label}</span>
              <span className="mt-1 block text-xs font-bold text-blue-950/45">{item.helper}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function toneClass(tone) {
  return {
    violet: "bg-violet-100 text-violet-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
  }[tone];
}
