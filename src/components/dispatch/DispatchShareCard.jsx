import { useRef, useState } from "react";
import { Download, Copy, Check, Share2 } from "lucide-react";
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

  // Logged-in user name
  const rawName = session?.branchName || session?.homeBranchName || session?.userId || "Regional Manager";
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const userRole = session?.role === "superadmin" ? "Super Admin" : "Regional Manager";

  async function handleExportPng() {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      // 1. Ensure images are completely loaded with natural dimensions
      const images = Array.from(cardRef.current.querySelectorAll("img"));
      await Promise.all(
        images.map((img) => {
          if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      // 2. Capture using html2canvas with pure inline styles
      // Removing external stylesheets prevents Tailwind v4 oklch crash
      // while inline styles ensure the output looks 100% identical to preview!
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => {
          // Remove external stylesheets containing Tailwind v4 oklch colors
          const extStyles = clonedDoc.querySelectorAll('link[rel="stylesheet"], style');
          extStyles.forEach((s) => s.remove());

          // Clean standard CSS reset
          const cleanStyle = clonedDoc.createElement("style");
          cleanStyle.textContent = `
            * { box-sizing: border-box !important; }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background-color: #ffffff !important;
              color: #071537 !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
              -webkit-font-smoothing: antialiased;
            }
          `;
          clonedDoc.head.appendChild(cleanStyle);

          clonedDoc.documentElement.style.backgroundColor = "#ffffff";
          clonedDoc.body.style.backgroundColor = "#ffffff";
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
    text += `🎯 Total Target: *${summary.totalTarget || 0}*\n`;
    text += `🚚 Total Dispatched: *${summary.totalDispatch || 0}*\n`;
    text += `📊 Achievement: *${summary.overallPercentage || 0}%*\n\n`;
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
        {/* Modal Header */}
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
            Swipe sideways to view full card &rarr;
          </span>
        </div>

        {/* The Card Viewport */}
        <div className="mt-2 sm:mt-4 flex-1 overflow-x-auto overflow-y-auto pr-1">
          {/* 
            Self-contained Card with 100% Inline Styles:
            Guarantees identical rendering in preview AND exported PNG!
          */}
          <div
            ref={cardRef}
            style={{
              width: "560px",
              minWidth: "560px",
              margin: "0 auto",
              backgroundColor: "#ffffff",
              color: "#071537",
              border: "1px solid #e2e8f0",
              borderRadius: "24px",
              padding: "24px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              boxSizing: "border-box"
            }}
          >
            {/* Header: Logo, Title, and Highlighted User */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                borderBottom: "2px solid #f1f5f9",
                paddingBottom: "16px",
                boxSizing: "border-box"
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <img
                  src="/report-assets/domex-logo-new.jpg"
                  alt="DOMEX"
                  style={{
                    height: "48px",
                    width: "auto",
                    maxWidth: "120px",
                    objectFit: "contain",
                    display: "block"
                  }}
                  onError={(e) => {
                    e.target.src = "/report-assets/domex-logo.png";
                  }}
                />
                <div>
                  <h2
                    style={{
                      fontSize: "18px",
                      fontWeight: "900",
                      textTransform: "uppercase",
                      letterSpacing: "-0.02em",
                      color: "#071537",
                      margin: "0 0 2px 0",
                      lineHeight: "1.2"
                    }}
                  >
                    Regional Dispatch Performance
                  </h2>
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: "800",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      color: "#6d28d9",
                      margin: "0 0 6px 0"
                    }}
                  >
                    Daily Courier Branch Analytics
                  </p>

                  {/* Highlighted Logged-in User Badge */}
                  <div>
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
                        fontWeight: "800",
                        border: "1px solid #d8b4fe"
                      }}
                    >
                      👤 Prepared by:{" "}
                      <span style={{ textDecoration: "underline", color: "#581c87" }}>
                        {userName} ({userRole})
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right", minWidth: "90px" }}>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: "900",
                    textTransform: "uppercase",
                    color: "#94a3b8",
                    margin: 0
                  }}
                >
                  Report Date
                </p>
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: "900",
                    color: "#1e293b",
                    margin: "2px 0 0 0"
                  }}
                >
                  {date}
                </p>
              </div>
            </div>

            {/* Quick KPI Row - 3 Boxes */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "10px",
                marginTop: "16px",
                boxSizing: "border-box"
              }}
            >
              {/* Total Target */}
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "12px",
                  textAlign: "center",
                  boxSizing: "border-box"
                }}
              >
                <p
                  style={{
                    fontSize: "10px",
                    fontWeight: "900",
                    textTransform: "uppercase",
                    color: "#64748b",
                    margin: 0
                  }}
                >
                  Total Target
                </p>
                <p
                  style={{
                    fontSize: "24px",
                    fontWeight: "900",
                    color: "#071537",
                    margin: "4px 0 0 0",
                    lineHeight: 1
                  }}
                >
                  {summary.totalTarget || 0}
                </p>
              </div>

              {/* Actual Dispatched */}
              <div
                style={{
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "16px",
                  padding: "12px",
                  textAlign: "center",
                  boxSizing: "border-box"
                }}
              >
                <p
                  style={{
                    fontSize: "10px",
                    fontWeight: "900",
                    textTransform: "uppercase",
                    color: "#1e40af",
                    margin: 0
                  }}
                >
                  Dispatched
                </p>
                <p
                  style={{
                    fontSize: "24px",
                    fontWeight: "900",
                    color: "#1e3a8a",
                    margin: "4px 0 0 0",
                    lineHeight: 1
                  }}
                >
                  {summary.totalDispatch || 0}
                </p>
              </div>

              {/* Achievement Rate */}
              <div
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
                  }`,
                  borderRadius: "16px",
                  padding: "12px",
                  textAlign: "center",
                  boxSizing: "border-box"
                }}
              >
                <p style={{ fontSize: "10px", fontWeight: "900", textTransform: "uppercase", margin: 0 }}>
                  Achievement
                </p>
                <p
                  style={{
                    fontSize: "24px",
                    fontWeight: "900",
                    margin: "4px 0 0 0",
                    lineHeight: 1
                  }}
                >
                  {summary.overallPercentage || 0}%
                </p>
              </div>
            </div>

            {/* Highlights */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "12px",
                fontSize: "12px",
                fontWeight: "700"
              }}
            >
              {summary.topBranch && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#d1fae5",
                    color: "#065f46",
                    padding: "4px 10px",
                    borderRadius: "12px"
                  }}
                >
                  🏆 Top: <strong>{summary.topBranch.branch}</strong> ({summary.topBranch.percentage}%)
                </span>
              )}
              {summary.lowestBranch && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#ffe4e6",
                    color: "#9f1239",
                    padding: "4px 10px",
                    borderRadius: "12px"
                  }}
                >
                  ⚠️ Needs Attention: <strong>{summary.lowestBranch.branch}</strong> (
                  {summary.lowestBranch.percentage}%)
                </span>
              )}
            </div>

            {/* Branch Performance Table */}
            <div
              style={{
                marginTop: "14px",
                border: "1px solid #f1f5f9",
                borderRadius: "16px",
                overflow: "hidden",
                boxSizing: "border-box"
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                  textAlign: "left"
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "#f8fafc",
                      color: "#64748b",
                      fontWeight: "900",
                      textTransform: "uppercase",
                      fontSize: "11px"
                    }}
                  >
                    <th style={{ padding: "8px 12px" }}>Rank</th>
                    <th style={{ padding: "8px 12px" }}>Branch</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Target</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Actual</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", width: "110px" }}>
                      Progress
                    </th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Achv %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr
                      key={r.branch}
                      style={{
                        backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                        borderTop: "1px solid #f1f5f9",
                        fontWeight: "700"
                      }}
                    >
                      <td style={{ padding: "8px 12px", color: "#94a3b8", fontWeight: "900" }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#071537", fontWeight: "900" }}>
                        {r.branch}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#64748b" }}>
                        {r.target}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          color: "#1e3a8a",
                          fontWeight: "900"
                        }}
                      >
                        {r.dispatch}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <div
                          style={{
                            height: "8px",
                            width: "100%",
                            backgroundColor: "#e2e8f0",
                            borderRadius: "9999px",
                            overflow: "hidden"
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              borderRadius: "9999px",
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
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        <span
                          style={{
                            display: "inline-block",
                            minWidth: "48px",
                            padding: "2px 6px",
                            borderRadius: "8px",
                            textAlign: "center",
                            fontWeight: "900",
                            fontSize: "11px",
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

            {/* Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: "1px solid #f1f5f9",
                paddingTop: "10px",
                marginTop: "14px",
                fontSize: "10px",
                fontWeight: "700",
                color: "#94a3b8"
              }}
            >
              <span>Domestic Express (PVT) Ltd • Regional Management</span>
              <span>Confidential • Internal Only</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
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
