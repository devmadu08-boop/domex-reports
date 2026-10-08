import { useMemo, useState } from "react";
import { ArrowRight, BarChart3, CalendarDays, MapPin, Package, PackageCheck, ShieldCheck, Target, Users } from "lucide-react";
import TodayOperationsDashboard from "./TodayOperationsDashboard.jsx";
import DailyWorkflowWizard from "./DailyWorkflowWizard.jsx";
import { getReportByDate } from "../services/reportStorage.js";
import { displayDate } from "../utils/date.js";

export default function IslandwideDashboard({
  session, branchName, summary, stats, history, courierNames,
  selectedDate, onDateChange, onOpen, backendOnline,
}) {
  const percent = Math.round(Math.max(0, Math.min(100, Number(stats.deliveryPercent) || 0)));
  const pending = Math.max(0, stats.totalOnRoute - stats.totalDelivery);
  const firstName = (session.displayName || session.homeBranchName || session.branchName || "Team").split(" ")[0];
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(new Date(`${selectedDate}T12:00:00`));
  const connectionLabel = backendOnline === null ? "Checking…" : backendOnline ? "Online" : "Offline";

  return (
    <section className="islandwide-dashboard">
      <section className="islandwide-hero" aria-label="DOMEX islandwide delivery">
        <div className="islandwide-hero-copy">
          <p className="hero-welcome">WELCOME BACK, {firstName.toUpperCase()} <span aria-hidden="true">👋</span></p>
          <h1>Keep<br /><em>Sri Lanka</em><br />Moving</h1>
          <p className="hero-subtitle">Fast. Secure. Islandwide.<span aria-hidden="true" /></p>
          <button className="domex-primary-button" type="button" onClick={() => {
            document.getElementById("daily-workflow")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}>Today’s Operations<ArrowRight size={17} /></button>
          <div className="hero-benefits">
            <span><Target size={21} /><span>
              <strong>{stats.targetValue || "—"}{stats.targetValue ? "+" : ""}</strong><small>Daily Target</small>
            </span></span>
            <span><MapPin size={21} /><span><strong>Islandwide</strong><small>Coverage</small></span></span>
            <span><ShieldCheck size={21} /><span><strong>Trusted</strong><small>By Thousands</small></span></span>
          </div>
        </div>
        <div className="hero-live-card frosted-card">
          <h2>Live Operations</h2>
          <p><span className={`connection-dot ${backendOnline ? "online" : "offline"}`} />
            <strong>{branchName} Branch</strong><small>{connectionLabel}</small></p>
          <p><Users size={15} /><span>Couriers in report</span>
            <strong>{getReportByDate(selectedDate).courierRows.length}</strong></p>
          <p><PackageCheck size={15} /><span>Selected day’s deliveries</span>
            <strong>{stats.totalDelivery} / {stats.totalOnRoute}</strong></p>
          <div className="live-progress"><span style={{ width: `${percent}%` }} /></div>
          <small className="live-percent">{percent}%</small>
        </div>
        <div className="hero-branch-card frosted-card"><MapPin size={29} /><span>
          <strong>{branchName} Branch</strong>
          <small>{backendOnline === null ? "Checking backend…" : backendOnline ? "Operational" : "Backend offline"}</small>
        </span></div>
        <blockquote className="hero-quote frosted-card"><span aria-hidden="true">“</span>
          Delivering<br />Trust,<br />Connecting<br />People<span className="quote-line" />
        </blockquote>
      </section>

      <div className="islandwide-statistics">
        <TodayOperationsDashboard summary={summary} onOpen={onOpen} />
        <section className="delivery-ratio frosted-card" aria-label="Delivery summary">
          <div className="delivery-ring" style={{
            "--delivery-percent": `${percent}%`,
            background: stats.totalOnRoute ? undefined : "#e8e2df",
          }}><div><strong>{percent}%</strong><small>Overall</small></div></div>
          <div className="delivery-legend">
            <span><i className="dot-delivered" />Delivered<strong>{percent}% ({stats.totalDelivery})</strong></span>
            <span><i className="dot-pending" />Pending<strong>{stats.totalOnRoute ? 100 - percent : 0}% ({pending})</strong></span>
            <span><i className="dot-total" />Total<strong>{stats.totalOnRoute}</strong></span>
          </div>
        </section>
        <section className="dashboard-date-card frosted-card">
          <CalendarDays size={29} /><div><small>{weekday}</small><strong>{displayDate(selectedDate)}</strong></div>
          <label>Report date<input aria-label="Dashboard report date" type="date" value={selectedDate}
            onChange={(event) => { if (event.target.value) onDateChange(event.target.value); }} /></label>
        </section>
      </div>

      <div className="islandwide-overview">
        <DailyWorkflowWizard date={selectedDate} steps={summary.steps} onOpen={onOpen} />
        <DashboardPerformance selectedDate={selectedDate} history={history} stats={stats} savedNames={courierNames.length} />
        <section className="islandwide-campaign">
          <div><h2>Every <br />Delivery <br />Creates a <br /><em>Brighter <br />Sri Lanka</em></h2>
            <p>One parcel. A world of possibilities.</p></div>
          <footer>
            <span className="campaign-brand">DOMEX<small>WE DELIVER ISLANDWIDE</small></span>
            <button type="button" aria-label="Open Delivered Reports" onClick={() => onOpen("deliveredConverter")}>
              <ArrowRight size={21} />
            </button>
          </footer>
        </section>
      </div>
    </section>
  );
}

function DashboardPerformance({ selectedDate, history, stats, savedNames }) {
  const [range, setRange] = useState(7);
  const series = useMemo(() => Array.from({ length: range }, (_, index) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() - (range - 1 - index));
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const rows = getReportByDate(iso).courierRows;
    const total = rows.reduce((sum, row) => sum + (Number(row.onRouteCount) || 0), 0);
    const delivered = rows.reduce((sum, row) => sum + (Number(row.deliveryCount) || 0), 0);
    return {
      date: iso, label: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date),
      total, delivered, pending: Math.max(0, total - delivered),
    };
  }), [selectedDate, range, history, stats]);
  const max = Math.max(10, ...series.map((day) => Math.max(day.total, day.delivered)));
  const ceiling = Math.ceil(max / 4) * 4;
  const pending = Math.max(0, stats.totalOnRoute - stats.totalDelivery);
  const reportCount = history.reduce((sum, day) => (
    sum + Number(day.hasCourier) + Number(day.hasOperation) + day.deliveredCount + Number(day.hasReschedule)
  ), 0);
  const metrics = [
    { value: reportCount, label: "Saved Reports", icon: CalendarDays, tone: "violet" },
    { value: stats.totalDelivery, label: "Total Deliveries", icon: PackageCheck, tone: "blue" },
    { value: pending, label: "Pending Items", icon: Package, tone: "amber" },
    { value: savedNames, label: "Saved Couriers", icon: Users, tone: "green" },
  ];
  const chartDescription = series.map((day) => (
    `${day.label}: ${day.delivered} delivered, ${day.pending} pending, ${day.total} total`
  )).join(". ");

  return (
    <section className="dashboard-performance frosted-card">
      <div className="dashboard-panel-heading"><span className="panel-icon"><BarChart3 size={21} /></span>
        <h2>Performance Overview</h2>
        <select aria-label="Performance period" value={range} onChange={(event) => setRange(Number(event.target.value))}>
          <option value={7}>Last 7 days</option><option value={14}>Last 14 days</option>
        </select>
      </div>
      <div className="chart-legend">
        <span><i className="dot-delivered" />Delivered</span><span><i className="dot-pending" />Pending</span>
        <span><i className="dot-total" />Total</span>
      </div>
      <div className="dashboard-chart" role="img"
        aria-label={`Courier performance for the last ${range} days ending ${selectedDate}. ${chartDescription}`}>
        <div className="chart-y-axis">{[4, 3, 2, 1, 0].map((tick) => <span key={tick}>{ceiling * tick / 4}</span>)}</div>
        <div className="chart-plot">
          <div className="chart-grid-lines">{[0, 1, 2, 3, 4].map((line) => <i key={line} />)}</div>
          <div className={`chart-days ${range === 14 ? "is-fortnight" : ""}`}>
            {series.map((day) => (
              <div key={day.date} className="chart-day"
                title={`${day.label}: ${day.delivered} delivered, ${day.pending} pending, ${day.total} total`}>
                <div className="chart-bars">
                  <span className="bar-delivered" style={{ height: `${day.delivered / ceiling * 100}%` }} />
                  <span className="bar-pending" style={{ height: `${day.pending / ceiling * 100}%` }} />
                  <span className="bar-total" style={{ height: `${day.total / ceiling * 100}%` }} />
                </div>
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      {!series.some((day) => day.total)
        ? <p className="chart-empty">Save a Courier Performance report to see your delivery activity.</p>
        : null}
      <div className="performance-metrics">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div key={label}><span className={`stat-icon stat-${tone}`}><Icon size={19} /></span>
            <span><strong>{value}</strong><small>{label}</small></span></div>
        ))}
      </div>
    </section>
  );
}
