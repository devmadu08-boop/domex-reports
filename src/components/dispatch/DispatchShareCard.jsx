import { useRef, useState } from "react";
import { Download, Copy, Check, Share2, Award, TrendingDown, User } from "lucide-react";
import html2canvas from "html2canvas";

export default function DispatchShareCard({
  date,
  metrics,
  branchCount,
  session,
  onClose
}) {
  const cardRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const { rows = [], summary = {} } = metrics || {};

  // Formatted username to display under title
  const rawName = session?.branchName || session?.homeBranchName || session?.userId || "Regional Manager";
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const userRole = session?.role === "superadmin" ? "Super Admin" : "Regional Manager";

  async function handleExportPng() {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      // 1. Wait for any images inside the card to load completely
      const images = Array.from(cardRef.current.querySelectorAll("img"));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      // 2. Export with html2canvas - stripping all Tailwind v4 stylesheets from clonedDoc
      // to completely eliminate the "oklch" unsupported color function error!
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => {
          // A. Remove all external stylesheets (these contain Tailwind v4 oklch rules)
          const extStyles = clonedDoc.querySelectorAll('link[rel="stylesheet"], style');
          extStyles.forEach((s) => s.remove());

          // B. Add a pure, clean fallback stylesheet without any modern oklch
          const cleanStyle = clonedDoc.createElement("style");
          cleanStyle.id = "dispatch-clean-card-style";
          cleanStyle.textContent = `
            * {
              box-sizing: border-box !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
              -webkit-font-smoothing: antialiased;
            }
            body, html {
              background-color: #ffffff !important;
              color: #071537 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
          `;
          clonedDoc.head.appendChild(cleanStyle);

          // C. Explicitly guarantee document and body have solid hex background
          clonedDoc.documentElement.style.backgroundColor = "#ffffff";
          clonedDoc.documentElement.style.color = "#071537";
          clonedDoc.body.style.backgroundColor = "#ffffff";
          clonedDoc.body.style.color = "#071537";

          // D. Fallback canvas converter for any inline oklch string
          const helperCanvas = document.createElement("canvas");
          const ctx = helperCanvas.getContext("2d");
          function oklchToRgb(str) {
            if (!str || typeof str !== "string" || !str.includes("oklch")) return str;
            try {
              ctx.fillStyle = "#ffffff";
              ctx.fillStyle = str;
              return ctx.fillStyle;
            } catch {
              return "#ffffff";
            }
          }

          const allElements = clonedDoc.querySelectorAll("*");
          const colorProps = ["color", "backgroundColor", "borderColor"];
          allElements.forEach((el) => {
            try {
              const comp = window.getComputedStyle(el);
              colorProps.forEach((prop) => {
                const val = comp[prop];
                if (val && typeof val === "string" && val.includes("oklch")) {
                  el.style[prop] = oklchToRgb(val);
                }
              });
            } catch {}
          });
        }
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `DOMEX_Regional_Dispatch_${date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export image: " + (err.message || String(err)));
    } finally {
      setExporting(false);
    }
  }

  function handleCopyWhatsAppText() {
    if (!rows.length) return;

    let text = `📦 *DOMEX REGIONAL DISPATCH UPDATE*\n`;
    text += `👤 Regional Manager: *${userName}*\n`;
    text += `📅 Date: *${date}*\n`;
    text += `🎯 Total Target: *${summary.totalTarget}*\n`;
    text += `🚚 Total Dispatched: *${summary.totalDispatch}*\n`;
    text += `📊 Achievement: *${summary.overallPercentage}%*\n\n`;
    text += `*BRANCH PERFORMANCE BREAKDOWN:*\n`;

    rows.forEach((r, idx) => {
      let icon = "🔴";
      if (r.percentage >= 100) icon = "🟢";
      else if (r.percentage >= 70) icon = "🟡";

      text += `${idx + 1}. ${icon} *${r.branch}*: ${r.dispatch} / ${r.target} (${r.percentage}%)\n`;
    });

    if (summary.topBranch) {
      text += `\n🏆 *Top Branch:* ${summary.topBranch.branch} (${summary.topBranch.percentage}%)`;
    }
    if (summary.lowestBranch) {
      text += `\n⚠️ *Needs Attention:* ${summary.lowestBranch.branch} (${summary.lowestBranch.percentage}%)`;
    }
    text += `\n\n_Generated via DOMEX Regional Dispatch System_`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="flex max-h-[96vh] w-full max-w-2xl flex-col rounded-3xl border border-white/80 bg-slate-100 p-3.5 sm:p-5 shadow-2xl">
        {/* Header modal bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-violet-700" />
            <h3 className="text-sm sm:text-base font-black text-[#071537]">
              Dispatch Share Card &amp; Export
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 shadow-sm"
          >
            Close
          </button>
        </div>

        {/* Mobile Swipe Hint */}
        <div className="mt-2 block sm:hidden text-center">
          <span className="inline-block rounded-lg bg-violet-100 px-2.5 py-0.5 text-[10px] font-bold text-violet-800">
            Swipe sideways to view full card on mobile &rarr;
          </span>
        </div>

        {/* The Card to be Captured with safe hex colors and mobile scroll */}
        <div className="mt-2 sm:mt-4 flex-1 overflow-x-auto overflow-y-auto pr-1">
          <div
            ref={cardRef}
            className="rounded-3xl p-4 sm:p-6 shadow-md mx-auto"
            style={{
              width: "100%",
              minWidth: "500px",
              maxWidth: "600px",
              backgroundColor: "#ffffff",
              color: "#071537",
              border: "1px solid #e2e8f0"
            }}
          >
            {/* Header with Logo, Title, and Highlighted Logged-in User */}
            <div
              className="flex items-start justify-between pb-4"
              style={{ borderBottom: "2px solid #f1f5f9" }}
            >
              <div className="flex items-start gap-3">
                <img
                  src="/report-assets/domex-logo-new.jpg"
                  alt="DOMEX"
                  className="h-12 w-auto object-contain"
                  onError={(e) => {
                    e.target.src = "/report-assets/domex-logo.png";
                  }}
                />
                <div>
                  <h2
                    className="text-lg sm:text-xl font-black uppercase tracking-tight"
                    style={{ color: "#071537", margin: 0, lineHeight: "1.2" }}
                  >
                    Regional Dispatch Performance
                  </h2>
                  <p
                    className="text-[11px] font-black uppercase tracking-widest"
                    style={{ color: "#6d28d9", margin: "2px 0 0 0" }}
                  >
                    Daily Courier Branch Analytics
                  </p>

                  {/* Highlighted Logged-in User Badge */}
                  <div style={{ marginTop: "6px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        backgroundColor: "#f3e8ff",
                        color: "#6b21a8",
                        padding: "3px 10px",
                        borderRadius: "8px",
                        fontSize: "11px",
                        fontWeight: "900",
                        border: "1px solid #d8b4fe"
                      }}
                    >
                      <User style={{ width: "12px", height: "12px", display: "inline" }} />
                      Prepared by:{" "}
                      <span style={{ textDecoration: "underline", color: "#581c87" }}>
                        {userName} ({userRole})
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[11px] font-black uppercase" style={{ color: "#94a3b8", margin: 0 }}>
                  Report Date
                </p>
                <p className="text-sm sm:text-base font-black" style={{ color: "#1e293b", margin: 0 }}>
                  {date}
                </p>
              </div>
            </div>

            {/* Quick KPI Row */}
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              <div
                className="rounded-2xl p-2.5 sm:p-3 text-center"
                style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}
              >
                <p className="text-[10px] sm:text-[11px] font-black uppercase" style={{ color: "#64748b", margin: 0 }}>
                  Total Target
                </p>
                <p className="mt-1 text-xl sm:text-2xl font-black" style={{ color: "#071537", margin: 0 }}>
                  {summary.totalTarget || 0}
                </p>
              </div>

              <div
                className="rounded-2xl p-2.5 sm:p-3 text-center"
                style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}
              >
                <p className="text-[10px] sm:text-[11px] font-black uppercase" style={{ color: "#1e40af", margin: 0 }}>
                  Dispatched
                </p>
                <p className="mt-1 text-xl sm:text-2xl font-black" style={{ color: "#1e3a8a", margin: 0 }}>
                  {summary.totalDispatch || 0}
                </p>
              </div>

              <div
                className="rounded-2xl p-2.5 sm:p-3 text-center"
                style={{
                  backgroundColor:
                    summary.overallPercentage >= 100
                      ? "#ecfdf5"
                      : summary.overallPercentage >= 70
                      ? "#fffbeb"
                      : "#fff1f2",
                  color:
                    summary.overallPercentage >= 100
                      ? "#065f46"
                      : summary.overallPercentage >= 70
                      ? "#92400e"
                      : "#9f1239",
                  border: `1px solid ${
                    summary.overallPercentage >= 100
                      ? "#a7f3d0"
                      : summary.overallPercentage >= 70
                      ? "#fde68a"
                      : "#fecdd3"
                  }`
                }}
              >
                <p className="text-[10px] sm:text-[11px] font-black uppercase" style={{ margin: 0 }}>
                  Achievement
                </p>
                <p className="mt-1 text-xl sm:text-2xl font-black" style={{ margin: 0 }}>
                  {summary.overallPercentage || 0}%
                </p>
              </div>
            </div>

            {/* Highlights */}
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              {summary.topBranch && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1"
                  style={{ backgroundColor: "#d1fae5", color: "#065f46" }}
                >
                  <Award className="h-3.5 w-3.5" style={{ color: "#059669" }} />
                  Top: <strong>{summary.topBranch.branch}</strong> ({summary.topBranch.percentage}%)
                </span>
              )}
              {summary.lowestBranch && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1"
                  style={{ backgroundColor: "#ffe4e6", color: "#9f1239" }}
                >
                  <TrendingDown className="h-3.5 w-3.5" style={{ color: "#e11d48" }} />
                  Needs Attention: <strong>{summary.lowestBranch.branch}</strong> (
                  {summary.lowestBranch.percentage}%)
                </span>
              )}
            </div>

            {/* Branch Performance List */}
            <div
              className="mt-3.5 overflow-hidden rounded-2xl"
              style={{ border: "1px solid #f1f5f9" }}
            >
              <table className="w-full text-left text-xs">
                <thead
                  className="font-black uppercase"
                  style={{ backgroundColor: "#f8fafc", color: "#64748b" }}
                >
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2 text-right">Target</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-center" style={{ width: "110px" }}>
                      Progress
                    </th>
                    <th className="px-3 py-2 text-right">Achv %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {rows.map((r, idx) => (
                    <tr
                      key={r.branch}
                      style={{
                        backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc"
                      }}
                    >
                      <td className="px-3 py-2 font-black" style={{ color: "#94a3b8" }}>
                        #{idx + 1}
                      </td>
                      <td className="px-3 py-2 font-black" style={{ color: "#071537" }}>
                        {r.branch}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "#64748b" }}>
                        {r.target}
                      </td>
                      <td className="px-3 py-2 text-right font-black" style={{ color: "#1e3a8a" }}>
                        {r.dispatch}
                      </td>
                      <td className="px-3 py-2">
                        <div
                          className="h-2 w-full overflow-hidden rounded-full"
                          style={{ backgroundColor: "#e2e8f0" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, r.percentage)}%`,
                              backgroundColor:
                                r.percentage >= 100
                                  ? "#10b981"
                                  : r.percentage >= 70
                                  ? "#f59e0b"
                                  : "#f43f5e"
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className="inline-block min-w-[48px] rounded-lg px-1.5 py-0.5 text-center font-black"
                          style={{
                            backgroundColor:
                              r.percentage >= 100
                                ? "#d1fae5"
                                : r.percentage >= 70
                                ? "#fef3c7"
                                : "#ffe4e6",
                            color:
                              r.percentage >= 100
                                ? "#065f46"
                                : r.percentage >= 70
                                ? "#92400e"
                                : "#9f1239"
                          }}
                        >
                          {r.percentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className="mt-3.5 flex items-center justify-between pt-2.5 text-[10px] font-bold"
              style={{ borderTop: "1px solid #f1f5f9", color: "#94a3b8" }}
            >
              <span>Domestic Express (PVT) Ltd • Regional Management</span>
              <span>Confidential • Internal Only</span>
            </div>
          </div>
        </div>

        {/* Action Controls - responsive on mobile */}
        <div className="mt-3.5 grid grid-cols-1 sm:flex sm:items-center sm:justify-between gap-2.5 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={handleCopyWhatsAppText}
            className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied to Clipboard!" : "Copy WhatsApp Text"}
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            disabled={exporting}
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-xs font-black text-white shadow-lg transition hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Generating PNG Card..." : "Export High-Res PNG Card"}
          </button>
        </div>
      </div>
    </div>
  );
}
