import fs from "node:fs/promises";
import { chromium } from "playwright-core";
import { findBrowserExecutable } from "./rescheduleReportRenderer.js";

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (value) => value === null ? "—" : Number(value || 0).toLocaleString("en-US");
const percentage = (value) => Number(value || 0).toFixed(2) + "%";
const colors = { route: "#1672e5", delivery: "#10ad4c", resend: "#fa3751", rate: "#8524d6", pickup: "#f09210" };
function icon(type, size = 28) {
  const paths = {
    route: '<path d="M3 5h11v11H3zM14 9h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    delivery: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
    resend: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
    rate: '<path d="M12 3v9h9A9 9 0 1 1 12 3ZM15 3v6h6A8 8 0 0 0 15 3Z"/>',
    pickup: '<path d="m3 7 9-4 9 4v10l-9 4-9-4ZM3 7l9 5 9-5M12 12v9M7 5l9 5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18M7 15h2M13 15h2"/>',
    trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4M17 5h4v3a4 4 0 0 1-5 4M12 14v6M7 21h10"/>',
    chart: '<path d="M4 20V12h3v8M10 20V7h3v13M16 20V3h3v17"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[type] || paths.chart}</svg>`;
}
function performance(value) {
  return value >= 85 ? { label: "Excellent", color: "#119c42", bg: "#ddfbe7" }
    : value >= 75 ? { label: "Good", color: "#23983d", bg: "#ddfbe7" }
      : value >= 60 ? { label: "Average", color: "#c36a00", bg: "#fff3d9" }
        : { label: "Needs attention", color: "#d82e41", bg: "#ffe6eb" };
}
function comparison(current, previous, percentagePoints = false, reverse = false) {
  if (previous === null || previous === undefined || (!percentagePoints && previous === 0)) return '<small class="comparison neutral">No previous-day comparison</small>';
  const delta = percentagePoints ? current - previous : (current - previous) / previous * 100;
  const positive = reverse ? delta <= 0 : delta >= 0;
  return `<small class="comparison" style="color:${positive ? "#059b32" : "#dd3b23"}">${delta >= 0 ? "▲ +" : "▼ "}${delta.toFixed(1)}${percentagePoints ? " pts" : "%"}<span>vs previous day</span></small>`;
}

export function buildCourierSummaryHtml(report, { logo = "", hero = "" } = {}) {
  const { totals: t, previousTotals: p, rows } = report;
  const cards = [
    ["route", "Total On Route", t.onRouteCount, p?.onRouteCount],
    ["delivery", "Total Delivered", t.deliveryCount, p?.deliveryCount],
    ["resend", "Total Resend", t.resendCount, p?.resendCount],
    ["rate", "Overall Delivery %", t.deliveryPercent, p?.deliveryPercent],
    ["pickup", "Total Pickups", t.pickupCount, p?.pickupCount],
  ];
  const ranked = rows.filter((row) => row.onRouteCount > 0 && row.deliveryCount !== null).map((row, index) => ({ ...row, index }))
    .sort((a, b) => b.deliveryPercent - a.deliveryPercent || a.index - b.index).slice(0, 3);
  const deliveredAngle = t.onRouteCount ? Math.min(360, t.deliveryCount / t.onRouteCount * 360) : 0;
  const resendAngle = t.onRouteCount ? Math.min(360, deliveredAngle + t.resendCount / t.onRouteCount * 360) : 0;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Branch Courier Performance Report</title><style>
  *{box-sizing:border-box}html,body{margin:0;background:#f7f0e5;font-family:Arial,Helvetica,sans-serif;color:#23141b}
  .courier-summary{width:1600px;padding:18px;display:grid;gap:15px;background:linear-gradient(115deg,#fbf2e5,#fffaf2)}
  header{height:148px;border-radius:19px;overflow:hidden;position:relative;display:flex;align-items:center;gap:23px;padding:23px 28px;color:white;background:#50060c;box-shadow:0 5px 12px #5c210d20}
  header:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#51040efa 0%,#4e040de6 57%,#41050c65),url("${hero}") right 57%/cover;z-index:0}
  header>*{position:relative}.logo{width:310px;height:108px;object-fit:contain;border-right:1px solid #ffffff70;padding-right:20px}.brand-text{font-size:49px;font-style:italic;font-weight:1000;color:#f6c03d}
  .heading{flex:1}.heading p{font-size:19px;margin:0 0 2px}.heading h1{font-size:35px;line-height:1.1;margin:0;font-weight:900;letter-spacing:-.7px}.heading h1 span{color:#f4c843}
  .branch{display:inline-flex;gap:10px;align-items:center;margin-top:12px;padding:7px 17px;border:1px solid #ffffff55;border-radius:25px;background:#40040dc0;font-size:20px;color:#ffd65a}.branch strong{color:white}
  .date{display:flex;gap:13px;align-items:center;min-width:192px;align-self:center;padding:13px 17px;border:1px solid #fff9;border-radius:17px;background:#53080cb8;box-shadow:0 2px 8px #0003}.date small{display:block;font-size:17px}.date strong{font-size:22px;display:block;margin-top:4px}
  .cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.card{min-height:128px;padding:19px 15px;display:flex;gap:14px;align-items:center;border-radius:18px;border:1px solid #fff;background:white;box-shadow:0 3px 8px #7b442016}
  .card-icon{flex:none;width:77px;height:77px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 30% 20%,#ffffffcc,#ffffff00),var(--tint);color:var(--color)}.card-copy{flex:1}.card-label{font-size:17px;font-weight:800;white-space:nowrap}.card-value{display:flex;gap:10px;align-items:center;margin-top:5px}.card-value strong{font-size:43px;font-weight:900;letter-spacing:-1px;color:var(--color)}.card[data-type=rate] .card-value strong{font-size:35px}.comparison{font-size:15px;font-weight:800;line-height:1.25}.comparison span{display:block;color:#6c6b71;font-size:11px;font-weight:400}.comparison.neutral{font-size:10px;color:#85777b;max-width:74px}
  .table-wrap{border-radius:17px;overflow:hidden;box-shadow:0 3px 10px #57322516;border:1px solid #eadfda}table{width:100%;border-collapse:collapse;table-layout:fixed}th{height:49px;background:linear-gradient(#7e0e14,#5a080d);color:#fff;font-size:19px;border-right:1px solid #ffffff44;text-align:center}th:first-child{width:74px}th:nth-child(2){width:265px;text-align:left;padding-left:19px}th:nth-child(6){width:300px}th:last-child{width:208px}th svg{vertical-align:middle;margin-right:9px;color:#ffd969}
  td{height:82px;border-right:1px solid #dedfe0;border-bottom:1px solid #dedfe0;background:#fff;text-align:center;padding:10px 14px;font-size:23px;font-weight:800}tr:last-child td{border-bottom:0}.courier-name{text-align:left;font-size:19px;line-height:1.23;overflow-wrap:anywhere;font-weight:700}.rank{display:inline-grid;place-items:center;background:linear-gradient(#fafafa,#e8e8e9);border-radius:50%;width:45px;height:45px;font-size:24px}.route-cell{background:linear-gradient(100deg,#e5f3ff,#f4faff);color:#074084}.delivery-cell{background:linear-gradient(100deg,#e8fbed,#f5fff7)}.resend-cell{background:linear-gradient(100deg,#ffe9ec,#fff6f8)}.pickup-cell{background:linear-gradient(100deg,#fff2da,#fffaf0)}
  .count{display:inline-flex;align-items:center;gap:13px}.count svg{color:var(--color)}.rate-cell{text-align:left;padding-left:27px;padding-right:22px}.rate-value{font-size:21px}.track{height:13px;background:#e9e9ec;border-radius:5px;overflow:hidden;margin-top:5px}.track span{display:block;height:100%;border-radius:5px}.performance{display:inline-flex;align-items:center;gap:9px;border-radius:28px;padding:9px 15px;font-size:18px;white-space:nowrap}
  .bottom{display:grid;grid-template-columns:1.45fr .83fr 1.45fr;gap:13px}.panel{padding:16px 19px;border-radius:17px;background:#ffffffed;border:1px solid #efe7e0;box-shadow:0 4px 10px #77432010}.panel h2{display:flex;align-items:center;gap:11px;font-size:22px;margin:0 0 12px;color:#6a1417}.panel h2 svg{color:#e8870e}.overview{display:flex;gap:25px;align-items:center}.donut{width:155px;height:155px;flex:none;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#28b75d 0deg ${deliveredAngle}deg,#fa3a58 ${deliveredAngle}deg ${resendAngle}deg,#b9bbbf ${resendAngle}deg 360deg);transform:rotate(-22deg)}.donut>div{width:115px;height:115px;background:white;border-radius:50%;display:grid;align-content:center;text-align:center;transform:rotate(22deg)}.donut strong{font-size:29px}.donut small{font-size:13px;color:#666;margin-top:4px}.legend{display:grid;gap:13px;flex:1}.legend-row{display:grid;grid-template-columns:17px 1fr auto auto;gap:9px;font-size:16px;align-items:center}.legend-row i{height:15px;width:15px;border-radius:50%}.legend-row b{min-width:28px;text-align:right}.legend-row em{font-style:normal;color:#6c6c75;font-size:14px;width:64px;text-align:right}
  .pickup-total{display:flex;align-items:center;justify-content:center;gap:19px;padding:8px 0 14px;color:#ea890a}.pickup-total strong{font-size:57px;color:#21151b;display:block}.pickup-total span{font-size:19px;color:#332b31}.pickup-comparison{text-align:center;min-height:25px}.pickup-comparison .comparison{font-size:14px}.pickup-comparison .comparison span{display:inline;margin-left:6px;font-size:13px}.top-list{display:grid;gap:11px}.top-row{display:grid;grid-template-columns:34px 1fr auto;gap:12px;align-items:center;font-size:14px;min-height:34px}.top-name{overflow-wrap:anywhere;line-height:1.25}.medal{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;font-size:22px;background:linear-gradient(130deg,#ffe57a,#eda300);font-weight:800}.top-row:nth-child(2) .medal{background:linear-gradient(130deg,#f7f7f8,#acb2b8)}.top-row:nth-child(3) .medal{background:linear-gradient(130deg,#f8c6a7,#b97350)}.top-percent{font-size:19px;font-weight:900;border-radius:25px;padding:6px 13px}.footer{display:flex;justify-content:space-between;font-size:12px;color:#8b7a77;padding:0 3px}.muted{color:#8b7a77;font-weight:500}.no-rank{font-size:16px;color:#8b7a77;padding:20px 0}
  .card-copy{min-width:0}.card-value{flex-wrap:wrap;gap:4px 8px}.card[data-type=rate] .card-value{display:block}.card[data-type=rate] .comparison{display:block;margin-top:2px}
  </style></head><body><article class="courier-summary">
  <header>${logo ? `<img class="logo" src="${logo}" alt="DOMEX · We deliver islandwide">` : '<div class="brand-text">DOMEX</div>'}<div class="heading"><p>${esc(report.companyName)}</p><h1>Branch Courier <span>Performance Report</span></h1><div class="branch">● <span>Branch: <strong>${esc(report.branchName.toUpperCase())}</strong></span></div></div><div class="date">${icon("calendar",35)}<div><small>Date</small><strong>${esc(report.date)}</strong></div></div></header>
  <section class="cards">${cards.map(([type,label,value,previous]) => `<div class="card" data-type="${type}" style="--color:${colors[type]};--tint:${type==="route"?"#ffebbb":type==="delivery"?"#c5fad5":type==="resend"?"#ffd5df":type==="rate"?"#e7d4ff":"#ffeab9"};background:linear-gradient(115deg,white,${type==="delivery"?"#f0fff5":type==="resend"?"#fff0f3":type==="rate"?"#f4ecff":"#fff9eb"})"><div class="card-icon">${icon(type,44)}</div><div class="card-copy"><div class="card-label">${label}</div><div class="card-value"><strong>${type==="rate"?percentage(value):number(value)}</strong>${comparison(value,previous,type==="rate",type==="resend")}</div></div></div>`).join("")}</section>
  <section class="table-wrap"><table><thead><tr><th>#</th><th>Courier Name</th><th>${icon("route",24)}On Route</th><th>${icon("delivery",24)}Delivery</th><th>${icon("resend",24)}Resend</th><th>Delivery %</th><th>${icon("pickup",24)}Pickup</th><th>Performance</th></tr></thead><tbody>
  ${rows.map((row,index)=>{const rating=performance(row.deliveryPercent);const complete=row.onRouteCount!==null&&row.deliveryCount!==null;return `<tr><td><span class="rank">${index+1}</span></td><td class="courier-name">${esc(row.courierName.toUpperCase())}</td><td class="route-cell"><span class="count" style="--color:${colors.route}">${icon("route",25)}${number(row.onRouteCount)}</span></td><td class="delivery-cell"><span class="count" style="--color:${colors.delivery}">${icon("delivery",25)}${number(row.deliveryCount)}</span></td><td class="resend-cell"><span class="count" style="--color:${colors.resend}">${icon("resend",25)}${number(row.resendCount)}</span></td><td class="rate-cell"><span class="rate-value">${complete?percentage(row.deliveryPercent):"—"}</span><div class="track"><span style="width:${complete?Math.min(100,row.deliveryPercent):0}%;background:${row.deliveryPercent>=85?"linear-gradient(90deg,#34cf6c,#159d3e)":row.deliveryPercent>=75?"linear-gradient(90deg,#ffc131,#ffa300)":"linear-gradient(90deg,#fb526a,#ee214d)"}"></span></div></td><td class="pickup-cell"><span class="count" style="--color:${colors.pickup}">${icon("pickup",25)}${number(row.pickupCount)}</span></td><td><span class="performance" style="color:${complete?rating.color:"#8b7a77"};background:${complete?rating.bg:"#f4f1ef"}">${icon("chart",23)}${complete?rating.label:"Incomplete"}</span></td></tr>`;}).join("")}
  </tbody></table></section>
  <section class="bottom"><div class="panel"><h2>${icon("chart")}Delivery Overview</h2><div class="overview"><div class="donut"><div><strong>${percentage(t.deliveryPercent)}</strong><small>Delivery Rate</small></div></div><div class="legend">${[["Delivered",t.deliveryCount,"#28b75d"],["Resend",t.resendCount,"#fa3a58"],["Pending",t.pending,"#aeb0b5"],["Total On Route",t.onRouteCount,"#d9dadd"]].map(([label,value,color])=>`<div class="legend-row"><i style="background:${color}"></i><span>${label}</span><b>${number(value)}</b><em>${t.onRouteCount?percentage(value/t.onRouteCount*100):"0.00%"}</em></div>`).join("")}</div></div></div>
  <div class="panel"><h2>${icon("pickup")}Pickup Summary</h2><div class="pickup-total">${icon("pickup",75)}<div><strong>${number(t.pickupCount)}</strong><span>Total Pickups</span></div></div><div class="pickup-comparison">${comparison(t.pickupCount,p?.pickupCount)}</div></div>
  <div class="panel"><h2>${icon("trophy")}Top Performers <small style="font-size:13px;font-weight:500">(by Delivery %)</small></h2><div class="top-list">${ranked.length?ranked.map((row,index)=>{const rating=performance(row.deliveryPercent);return `<div class="top-row"><span class="medal">${index+1}</span><span class="top-name">${esc(row.courierName.toUpperCase())}</span><span class="top-percent" style="color:${rating.color};background:${rating.bg}">${percentage(row.deliveryPercent)}</span></div>`;}).join(""):'<div class="no-rank">No completed delivery figures to rank.</div>'}</div></div></section>
  <div class="footer"><span>DOMEX · WE DELIVER ISLANDWIDE</span><span>${report.completion.completedCount} / ${report.completion.requiredCount} couriers complete · Blank counts shown as — · Sri Lanka time</span></div>
  </article></body></html>`;
}

async function asset(relative, mime) {
  return `data:${mime};base64,${(await fs.readFile(new URL(relative, import.meta.url))).toString("base64")}`;
}
export async function renderCourierSummaryImage(report) {
  const [logo, hero] = await Promise.all([
    asset("../../public/report-assets/domex-logo.png", "image/png"),
    asset("../../public/dashboard-assets/domex-islandwide-hero.jpg", "image/jpeg"),
  ]);
  const browser = await chromium.launch({ headless: true, executablePath: await findBrowserExecutable(),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1.5 });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(buildCourierSummaryHtml(report, { logo, hero }), { waitUntil: "load" });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode())); });
    return await page.locator(".courier-summary").screenshot({ type: "png", timeout: 30000 });
  } finally {
    await browser.close();
  }
}
