import { useRef, useState } from "react";
import { Download, Copy, Check, Share2, Award, TrendingUp, TrendingDown, Target, Package } from "lucide-react";
import html2canvas from "html2canvas";

export default function DispatchShareCard({
  date,
  metrics,
  branchCount,
  onClose
}) {
  const cardRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const { rows = [], summary = {} } = metrics || {};

  async function handleExportPng() {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `DOMEX_Regional_Dispatch_${date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      alert("Failed to export image: " + err.message);
    } finally {
      setExporting(false);
    }
  }

  function handleCopyWhatsAppText() {
    if (!rows.length) return;

    let text = `📦 *DOMEX REGIONAL DISPATCH UPDATE*\n`;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border border-white/80 bg-slate-100 p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-violet-700" />
            <h3 className="text-base font-black text-[#071537]">Dispatch Share Card &amp; Export</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
          >
            Close
          </button>
        </div>

        {/* The Card to be Captured */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          <div
            ref={cardRef}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md text-[#071537]"
            style={{ width: "100%", minWidth: "520px" }}
          >
            {/* Header with Logo */}
            <div className="flex items-center justify-between border-b-2 border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <img
                  src="/report-assets/domex-logo-new.jpg"
                  alt="DOMEX"
                  className="h-12 w-auto object-contain"
                  onError={(e) => {
                    e.target.src = "/report-assets/domex-logo.png";
                  }}
                />
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-[#071537]">
                    Regional Dispatch Performance
                  </h2>
                  <p className="text-xs font-black uppercase tracking-widest text-violet-700">
                    Daily Courier Branch Analytics
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black uppercase text-slate-400">Report Date</p>
                <p className="text-base font-black text-slate-800">{date}</p>
              </div>
            </div>

            {/* Quick KPI Row */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3 text-center border border-slate-100">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Target</p>
                <p className="mt-1 text-2xl font-black text-[#071537]">{summary.totalTarget || 0}</p>
              </div>
              <div className="rounded-2xl bg-blue-50 p-3 text-center border border-blue-100">
                <p className="text-[11px] font-black uppercase text-blue-800">Actual Dispatched</p>
                <p className="mt-1 text-2xl font-black text-blue-900">{summary.totalDispatch || 0}</p>
              </div>
              <div className={`rounded-2xl p-3 text-center border ${
                summary.overallPercentage >= 100
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : summary.overallPercentage >= 70
                  ? "bg-amber-50 text-amber-900 border-amber-200"
                  : "bg-rose-50 text-rose-900 border-rose-200"
              }`}>
                <p className="text-[11px] font-black uppercase">Achievement</p>
                <p className="mt-1 text-2xl font-black">{summary.overallPercentage || 0}%</p>
              </div>
            </div>

            {/* Highlights */}
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              {summary.topBranch && (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-100/70 px-3 py-1 text-emerald-800">
                  <Award className="h-3.5 w-3.5 text-emerald-600" />
                  Top: <strong>{summary.topBranch.branch}</strong> ({summary.topBranch.percentage}%)
                </span>
              )}
              {summary.lowestBranch && (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-rose-100/70 px-3 py-1 text-rose-800">
                  <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                  Needs Attention: <strong>{summary.lowestBranch.branch}</strong> ({summary.lowestBranch.percentage}%)
                </span>
              )}
            </div>

            {/* Branch Performance List */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-black uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2 text-right">Target</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-center" style={{ width: "120px" }}>Progress</th>
                    <th className="px-3 py-2 text-right">Achv %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {rows.map((r, idx) => (
                    <tr key={r.branch} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-3 py-2 font-black text-slate-400">#{idx + 1}</td>
                      <td className="px-3 py-2 font-black text-[#071537]">{r.branch}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{r.target}</td>
                      <td className="px-3 py-2 text-right font-black text-blue-900">{r.dispatch}</td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              r.percentage >= 100
                                ? "bg-emerald-500"
                                : r.percentage >= 70
                                ? "bg-amber-400"
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(100, r.percentage)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`inline-block min-w-[50px] rounded-lg px-1.5 py-0.5 text-center font-black ${
                            r.percentage >= 100
                              ? "bg-emerald-100 text-emerald-800"
                              : r.percentage >= 70
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {r.percentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] font-bold text-slate-400">
              <span>Domestic Express (PVT) Ltd • Regional Management Operations</span>
              <span>Confidential • Internal Distribution Only</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={handleCopyWhatsAppText}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied to Clipboard!" : "Copy WhatsApp Text Summary"}
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-xs font-black text-white shadow-lg transition hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Generating PNG Card..." : "Export High-Res PNG Card"}
          </button>
        </div>
      </div>
    </div>
  );
}
