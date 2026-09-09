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
            table {
              border-collapse: collapse !important;
              table-layout: fixed !important;
              width: 100% !important;
            }
            th, td {
              vertical-align: middle !important;
              overflow: hidden !important;
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm overflow-hidden">
      {/* Bottom-sheet on mobile, centered modal on desktop */}
      <div className="flex max-h-[94vh] sm:max-h-[96vh] w-full sm:max-w-2xl flex-col rounded-t-3xl sm:rounded-3xl border border-white/20 bg-white shadow-2xl overflow-hidden">

        {/* Pull Handle (mobile) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-violet-100">
              <Share2 className="h-4 w-4 text-violet-700" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#071537] leading-tight">Share Card</h3>
              <p className="text-[10px] text-slate-400 font-semibold leading-tight">Export as PNG or copy text</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-sm"
          >
            ✕
          </button>
        </div>

        {/* The Card Viewport */}
        <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
          {/*
            The card is fixed at 560px width.
            On mobile, we use CSS transform scale so it fits without horizontal scroll.
          */}
          <div className="flex justify-center">
            {/* Outer scaler — shrinks card on small screens */}
            <div
              className="w-full overflow-hidden flex justify-center"
              style={{ minHeight: "200px" }}
            >
              <div
                style={{
                  transformOrigin: "top center",
                }}
                className="
                  scale-[0.58] xs:scale-[0.65] sm:scale-100
                  origin-top
                  -mb-[42%] xs:-mb-[36%] sm:mb-0
                "
              >
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
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
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
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1, minWidth: 0 }}>
                      <img
                        src="/report-assets/domex-logo-new.jpg"
                        alt="DOMEX"
                        style={{
                          height: "48px",
                          width: "auto",
                          maxWidth: "120px",
                          objectFit: "contain",
                          display: "block",
                          flexShrink: 0
                        }}
                        onError={(e) => {
                          e.target.src = "/report-assets/domex-logo.png";
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h2
                          style={{
                            fontSize: "18px",
                            fontWeight: "900",
                            textTransform: "uppercase",
                            letterSpacing: "-0.02em",
                            color: "#071537",
                            margin: "0 0 2px 0",
                            lineHeight: "1.2",
                            whiteSpace: "nowrap"
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
                        <div style={{ marginTop: "6px" }}>
                          <div
                            style={{
                              display: "inline-block",
                              backgroundColor: "#f5f3ff",
                              color: "#6b21a8",
                              padding: "4px 12px",
                              borderRadius: "8px",
                              fontSize: "11px",
                              fontWeight: "800",
                              border: "1px solid #ddd6fe",
                              lineHeight: "18px",
                              whiteSpace: "nowrap"
                            }}
                          >
                            👤 Prepared by: <strong style={{ color: "#4c1d95" }}>{userName}</strong> ({userRole})
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", minWidth: "100px", flexShrink: 0, marginLeft: "8px" }}>
                      <p
                        style={{
                          fontSize: "10px",
                          fontWeight: "900",
                          textTransform: "uppercase",
                          color: "#94a3b8",
                          margin: 0,
                          letterSpacing: "0.5px"
                        }}
                      >
                        Report Date
                      </p>
                      <p
                        style={{
                          fontSize: "15px",
                          fontWeight: "900",
                          color: "#1e293b",
                          margin: "3px 0 0 0",
                          lineHeight: "1.2"
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
                          borderRadius: "12px",
                          whiteSpace: "nowrap"
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
                          borderRadius: "12px",
                          whiteSpace: "nowrap"
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
                        tableLayout: "fixed",
                        borderCollapse: "collapse",
                        fontSize: "12px",
                        lineHeight: "1.3"
                      }}
                    >
                      <colgroup>
                        <col style={{ width: "44px" }} />
                        <col style={{ width: "140px" }} />
                        <col style={{ width: "60px" }} />
                        <col style={{ width: "62px" }} />
                        <col style={{ width: "118px" }} />
                        <col style={{ width: "76px" }} />
                      </colgroup>
                      <thead>
                        <tr
                          style={{
                            backgroundColor: "#f8fafc",
                            color: "#64748b",
                            fontWeight: "900",
                            textTransform: "uppercase",
                            fontSize: "10px",
                            letterSpacing: "0.5px"
                          }}
                        >
                          <th style={{ padding: "10px 6px", textAlign: "center", verticalAlign: "middle", overflow: "hidden" }}>Rank</th>
                          <th style={{ padding: "10px 8px", textAlign: "left", verticalAlign: "middle", overflow: "hidden" }}>Branch</th>
                          <th style={{ padding: "10px 6px", textAlign: "right", verticalAlign: "middle", overflow: "hidden" }}>Target</th>
                          <th style={{ padding: "10px 6px", textAlign: "right", verticalAlign: "middle", overflow: "hidden" }}>Actual</th>
                          <th style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle", overflow: "hidden" }}>Progress</th>
                          <th style={{ padding: "10px 6px", textAlign: "center", verticalAlign: "middle", overflow: "hidden" }}>Achv %</th>
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
                            <td style={{
                              padding: "10px 6px",
                              color: "#94a3b8",
                              fontWeight: "900",
                              textAlign: "center",
                              verticalAlign: "middle",
                              overflow: "hidden"
                            }}>
                              #{idx + 1}
                            </td>
                            <td
                              style={{
                                padding: "10px 8px",
                                color: "#071537",
                                fontWeight: "900",
                                textAlign: "left",
                                verticalAlign: "middle",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "140px"
                              }}
                            >
                              {r.branch}
                            </td>
                            <td style={{
                              padding: "10px 6px",
                              textAlign: "right",
                              color: "#64748b",
                              verticalAlign: "middle",
                              overflow: "hidden"
                            }}>
                              {r.target}
                            </td>
                            <td
                              style={{
                                padding: "10px 6px",
                                textAlign: "right",
                                color: "#1e3a8a",
                                fontWeight: "900",
                                verticalAlign: "middle",
                                overflow: "hidden"
                              }}
                            >
                              {r.dispatch}
                            </td>
                            <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle", overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "8px",
                                  width: "100%",
                                  backgroundColor: "#e2e8f0",
                                  borderRadius: "9999px",
                                  overflow: "hidden",
                                  margin: "0 auto"
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
                            <td style={{ padding: "10px 6px", textAlign: "center", verticalAlign: "middle", overflow: "hidden" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  width: "54px",
                                  padding: "3px 4px",
                                  borderRadius: "6px",
                                  textAlign: "center",
                                  fontWeight: "900",
                                  fontSize: "11px",
                                  lineHeight: "15px",
                                  overflow: "hidden",
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
            </div>
          </div>
        </div>

        {/* Action Buttons - Mobile app style bottom bar */}
        <div className="bg-white border-t border-slate-100 px-4 py-3 safe-area-pb">
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-center sm:justify-between sm:gap-3">
            <button
              type="button"
              onClick={handleCopyWhatsAppText}
              className="inline-flex justify-center items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-xs font-black text-emerald-800 shadow-sm transition active:scale-95 hover:bg-emerald-100"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy WhatsApp"}
            </button>

            <button
              type="button"
              onClick={handleExportPng}
              disabled={exporting}
              className="inline-flex justify-center items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3.5 text-xs font-black text-white shadow-lg transition active:scale-95 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Generating..." : "Export PNG"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
