import React, { useRef, useState, useMemo } from "react";
import { Download, Printer, Eye, EyeOff } from "lucide-react";
import { exportElementAsPortraitPdf } from "../utils/exportReports.js";

// Number to words helper
function numberToWords(num) {
  if (num === 0) return "Zero Only";
  
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  function convertLessThanOneThousand(n) {
    if (n === 0) return "";
    let result = "";
    if (n >= 100) {
      result += a[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n > 0) {
      if (n < 20) {
        result += a[n] + " ";
      } else {
        result += b[Math.floor(n / 10)] + " ";
        if (n % 10 > 0) {
          result += a[n % 10] + " ";
        }
      }
    }
    return result;
  }
  
  let result = "";
  const integerPart = Math.floor(num);
  let n = integerPart;
  
  if (n >= 1000000) {
    result += convertLessThanOneThousand(Math.floor(n / 1000000)) + "Million ";
    n %= 1000000;
  }
  if (n >= 1000) {
    result += convertLessThanOneThousand(Math.floor(n / 1000)) + "Thousand ";
    n %= 1000;
  }
  if (n > 0) {
    result += convertLessThanOneThousand(n);
  }
  
  return result.trim() + " Only";
}

export default function ReceiptGenerator({ session }) {
  const receiptRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form State
  const [senderName, setSenderName] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [pcs, setPcs] = useState("1");
  const [weight, setWeight] = useState("");
  const [paymentType, setPaymentType] = useState("CASH");
  
  const [rateType, setRateType] = useState("normal");
  const [manualPrice, setManualPrice] = useState("");
  
  const [receiptNo, setReceiptNo] = useState(() => `MID${Math.floor(Math.random() * 10000000).toString().padStart(8, '0')}`);
  const [waybillNo, setWaybillNo] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date();
    return d.getFullYear() + "-" + 
           String(d.getMonth() + 1).padStart(2, '0') + "-" + 
           String(d.getDate()).padStart(2, '0') + "T" + 
           String(d.getHours()).padStart(2, '0') + ":" + 
           String(d.getMinutes()).padStart(2, '0') + ":" + 
           String(d.getSeconds()).padStart(2, '0') + "." + 
           String(d.getMilliseconds()).padStart(3, '0');
  });

  const rates = {
    normal: { base: 500, additional: 200 },
    reg1: { base: 450, additional: 150 },
    reg2: { base: 400, additional: 100 },
    reg3: { base: 425, additional: 125 }
  };

  const calculatedPrice = useMemo(() => {
    if (rateType === "manual") {
      return parseFloat(manualPrice) || 0;
    }
    const w = parseFloat(weight) || 0;
    if (w <= 0) return 0;
    
    const rate = rates[rateType];
    if (w <= 1) return rate.base;
    
    const additionalKg = Math.ceil(w - 1);
    return rate.base + (additionalKg * rate.additional);
  }, [weight, rateType, manualPrice]);

  const amountInWords = useMemo(() => {
    return numberToWords(calculatedPrice);
  }, [calculatedPrice]);

  async function handleExportPdf() {
    if (!receiptRef.current) return;
    setShowPreview(true); // Ensure it's rendered in DOM to capture
    setExporting(true);
    // Add small delay to let React render the preview if it was hidden
    setTimeout(async () => {
      try {
        const dateStr = new Date().toISOString().split('T')[0];
        await exportElementAsPortraitPdf(receiptRef.current, "Receipt", dateStr);
      } catch (error) {
        alert("Failed to export PDF: " + error.message);
      } finally {
        setExporting(false);
      }
    }, 100);
  }

  function handlePrint() {
    const printContent = receiptRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print.");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <base href="${window.location.origin}">
          <title>Print Receipt</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            body { 
              margin: 0; 
              padding: 0; 
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact; 
              font-family: Arial, sans-serif;
            }
            .print-container {
              width: 210mm;
              height: 148.5mm;
              position: relative;
              background: white;
              overflow: hidden;
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            ${printContent}
          </div>
          <script>
            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <section className="receipt-generator-section max-w-4xl mx-auto flex flex-col gap-6 pb-12">
      {/* Form Area */}
      <div className="glass-panel p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-violet-700">Tool</p>
            <h2 className="text-2xl font-black text-[#071537]">Receipt Generator</h2>
            <p className="mt-1 text-sm font-semibold text-blue-950/70">Fill out the details to generate a PDF receipt.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handlePrint} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 shadow-sm">
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button type="button" onClick={handleExportPdf} disabled={exporting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black text-white hover:bg-violet-700 shadow-sm disabled:opacity-50">
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export PDF"}
            </button>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Metadata */}
          <div className="rounded-2xl bg-violet-50/50 p-4 border border-violet-100 grid gap-4 sm:col-span-2 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-black text-violet-900">Receipt No</label>
              <input type="text" value={receiptNo} onChange={e => setReceiptNo(e.target.value)} className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm outline-none focus:border-violet-500 bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-violet-900">WayBill No</label>
              <input type="text" value={waybillNo} onChange={e => setWaybillNo(e.target.value)} className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm outline-none focus:border-violet-500 bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-violet-900">Payment Date</label>
              <input type="text" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm outline-none focus:border-violet-500 bg-white" />
            </div>
          </div>

          {/* Sender */}
          <div className="rounded-2xl bg-white p-4 border border-slate-200 grid gap-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Sender Details</h3>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-600">Name</label>
              <input type="text" value={senderName} onChange={e => setSenderName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 uppercase" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-600">Address</label>
              <textarea value={senderAddress} onChange={e => setSenderAddress(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 uppercase resize-none" />
            </div>
          </div>

          {/* Receiver */}
          <div className="rounded-2xl bg-white p-4 border border-slate-200 grid gap-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Receiver Details</h3>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-600">Name</label>
              <input type="text" value={receiverName} onChange={e => setReceiverName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 uppercase" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-600">Address</label>
              <textarea value={receiverAddress} onChange={e => setReceiverAddress(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 uppercase resize-none" />
            </div>
          </div>

          {/* Package Details */}
          <div className="rounded-2xl bg-white p-4 border border-slate-200 grid gap-4 sm:grid-cols-2 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2 sm:col-span-2">Package Details</h3>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-600">Pieces (PCS)</label>
              <input type="number" min="1" value={pcs} onChange={e => setPcs(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-600">Weight (kg)</label>
              <input type="number" step="0.01" min="0" value={weight} onChange={e => setWeight(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="e.g. 1.54" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-black text-slate-600">Payment Type</label>
              <select value={paymentType} onChange={e => setPaymentType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500">
                <option value="CASH">CASH</option>
                <option value="COD">COD</option>
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-2xl bg-white p-4 border border-slate-200 grid gap-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Pricing</h3>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-600">Rate Method</label>
              <select value={rateType} onChange={e => setRateType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500">
                <option value="normal">Normal Rate (500 + 200/kg)</option>
                <option value="reg1">Registered Rate 1 (450 + 150/kg)</option>
                <option value="reg2">Registered Rate 2 (400 + 100/kg)</option>
                <option value="reg3">Registered Rate 3 (425 + 125/kg)</option>
                <option value="manual">Manual Price</option>
              </select>
            </div>
            {rateType === "manual" && (
              <div>
                <label className="mb-1 block text-xs font-black text-slate-600">Manual Amount (Rs)</label>
                <input type="number" step="0.01" min="0" value={manualPrice} onChange={e => setManualPrice(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500" />
              </div>
            )}
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center mt-auto">
              <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-800">Total Price</span>
              <span className="block text-2xl font-black text-emerald-950">Rs. {calculatedPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <button type="button" onClick={() => setShowPreview(!showPreview)} className="mt-2 mx-auto inline-flex items-center gap-2 text-sm font-black text-violet-600 hover:text-violet-800 transition-colors">
          {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showPreview ? "Hide Preview" : "Show Receipt Preview"}
        </button>
      </div>

      {/* Preview Area */}
      <div className={`transition-all duration-300 overflow-hidden ${showPreview ? "opacity-100 h-auto" : "opacity-0 h-0"}`}>
        <div className="overflow-x-auto bg-slate-200/50 rounded-2xl border border-slate-200 flex justify-center p-4 md:p-8">
          {/* Half A4 Paper scale representation (A5 Landscape basically: 210mm x 148.5mm) */}
          <div 
            className="print-area bg-white shadow-2xl relative shrink-0" 
            style={{ width: "210mm", height: "148.5mm", fontFamily: "Arial, sans-serif" }}
          >
            <div ref={receiptRef} className="bg-white w-full h-full relative overflow-hidden" style={{ width: "210mm", height: "148.5mm", padding: "0" }}>
              
              {/* Top Red Banner */}
              <div style={{ height: "18px", backgroundColor: "#b0121a", width: "100%" }}></div>

              <div style={{ padding: "20px 40px", fontFamily: "Arial, sans-serif", color: "#000" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                  <div>
                    <h1 style={{ fontSize: "24px", fontWeight: "900", margin: "0 0 10px 0", letterSpacing: "1px", color: "#000" }}>RECEIPT</h1>
                    <p style={{ margin: "0 0 3px 0", fontSize: "11px", color: "#000" }}>Domestic Express (Pvt) Ltd</p>
                    <p style={{ margin: "0 0 3px 0", fontSize: "11px", color: "#000" }}>No.511, 10th Mile Post Rd, Werahera, Boralesgamuwa</p>
                    <p style={{ margin: "0 0 3px 0", fontSize: "11px", color: "#000" }}>Land Line: 011 7 759 759 &nbsp;&nbsp; Web: www.Domex.lk</p>
                    <p style={{ margin: "0 0 3px 0", fontSize: "11px", color: "#000" }}>recovery@domex.lk</p>
                  </div>
                  <div>
                    <img src="/report-assets/domex-logo-new.jpg" alt="DOMEX Logo" style={{ width: "160px", objectFit: "contain", borderRadius: "10px" }} />
                  </div>
                </div>

                {/* Receipt Metadata */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "25px" }}>
                  <table style={{ fontSize: "11px", lineHeight: "1.5", width: "280px", color: "#000" }}>
                    <tbody>
                      <tr>
                        <td style={{ width: "100px" }}>Payment Date</td>
                        <td style={{ width: "10px" }}>:</td>
                        <td>{paymentDate}</td>
                      </tr>
                      <tr>
                        <td>Receipt No</td>
                        <td>:</td>
                        <td>{receiptNo}</td>
                      </tr>
                      <tr>
                        <td>WayBill No</td>
                        <td>:</td>
                        <td>{waybillNo}</td>
                      </tr>
                      <tr>
                        <td>Created User</td>
                        <td>:</td>
                        <td>{session?.userId || session?.email?.split('@')[0] || "Unknown"}</td>
                      </tr>
                      <tr>
                        <td>Created Branch</td>
                        <td>:</td>
                        <td>{session?.branchName || "Main"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Sender and Receiver Details */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "25px", gap: "30px" }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: "12px", fontWeight: "bold", margin: "0 0 8px 0", borderBottom: "1.5px solid #000", paddingBottom: "4px", color: "#000" }}>SENDER DETAILS</h3>
                    <div style={{ fontSize: "11px", lineHeight: "1.4", textTransform: "uppercase", color: "#000" }}>
                      <div style={{ fontWeight: "bold", marginBottom: "2px" }}>{senderName || " "}</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{senderAddress || " "}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: "12px", fontWeight: "bold", margin: "0 0 8px 0", borderBottom: "1.5px solid #000", paddingBottom: "4px", color: "#000" }}>RECEIVER DETAILS</h3>
                    <div style={{ fontSize: "11px", lineHeight: "1.4", textTransform: "uppercase", color: "#000" }}>
                      <div style={{ fontWeight: "bold", marginBottom: "2px" }}>{receiverName || " "}</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{receiverAddress || " "}</div>
                    </div>
                  </div>
                </div>

                {/* Package Details & Pricing */}
                <div>
                  <table style={{ fontSize: "11px", lineHeight: "1.6", fontWeight: "bold", color: "#000" }}>
                    <tbody>
                      <tr>
                        <td style={{ width: "120px" }}>COD</td>
                        <td style={{ width: "20px", textAlign: "center" }}>:</td>
                        <td>
                          {paymentType === "COD" && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>CASH</td>
                        <td style={{ textAlign: "center" }}>:</td>
                        <td>
                          {paymentType === "CASH" && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>PCS</td>
                        <td style={{ textAlign: "center" }}>:</td>
                        <td style={{ fontWeight: "normal" }}>{pcs}</td>
                      </tr>
                      <tr>
                        <td>Weight</td>
                        <td style={{ textAlign: "center" }}>:</td>
                        <td style={{ fontWeight: "normal" }}>{weight}</td>
                      </tr>
                      <tr>
                        <td>Amount In Word</td>
                        <td style={{ textAlign: "center" }}>:</td>
                        <td style={{ fontWeight: "normal" }}>{amountInWords}</td>
                      </tr>
                      <tr>
                        <td>RS</td>
                        <td style={{ textAlign: "center" }}>:</td>
                        <td style={{ fontWeight: "normal" }}>{calculatedPrice.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>
              
              {/* Bottom Red Banner */}
              <div style={{ position: "absolute", bottom: "0", height: "18px", backgroundColor: "#b0121a", width: "100%" }}></div>

            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-area, .print-area * {
            visibility: visible !important;
          }
          .print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 148.5mm !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}} />
    </section>
  );
}
