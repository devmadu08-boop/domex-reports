import { AlertTriangle, FileWarning, Send, Users } from "lucide-react";

export default function TodayOperationsDashboard({ summary, onOpen }) {
  const items = [
    { label: "Riders Completed", value: summary.deliveredRiders, helper: "Saved delivered reports", icon: Users, tone: "green", tab: "deliveredConverter" },
    { label: "Exceptions", value: summary.exceptions, helper: summary.exceptions ? "Items need review" : "No issues so far", icon: AlertTriangle, tone: "red", tab: "deliveredConverter" },
    { label: "Reports Remaining", value: summary.reportsRemaining, helper: "Courier & Operation", icon: FileWarning, tone: "amber", tab: summary.hasCourier ? "operation" : "courier" },
    { label: "WhatsApp Pending", value: summary.whatsappPending, helper: "Queued or failed sends", icon: Send, tone: "blue", tab: "whatsappQueue" },
  ];
  return <section className="operations-stat-grid" aria-label={"Operations for " + summary.date}>
    {items.map(({ label, value, helper, icon: Icon, tone, tab }) => <button key={label} type="button" onClick={() => onOpen(tab)} className="operations-stat frosted-card"><span className={"stat-icon stat-" + tone}><Icon size={25} /></span><span className="operations-stat-copy"><strong>{value}</strong><span>{label}</span><small>{helper}</small></span></button>)}
  </section>;
}
