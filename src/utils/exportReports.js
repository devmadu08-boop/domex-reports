import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const scale = 3;

function safeFileName(value) {
  return value.replaceAll(" ", "_");
}

async function captureElement(element, options = {}) {
  if (!element) {
    throw new Error("Report area is not available for export.");
  }

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const exportHost = document.createElement("div");
  const exportClone = element.cloneNode(true);
  if (options.whatsappBranded) {
    exportClone.classList.add("branded-report");
    if (!exportClone.classList.contains("a4-portrait-report")) {
      exportClone.classList.add("branded-report-landscape");
    }
  }
  const exportWidth = Math.max(element.scrollWidth, element.getBoundingClientRect().width);

  exportHost.style.position = "fixed";
  exportHost.style.left = "-10000px";
  exportHost.style.top = "0";
  exportHost.style.width = `${exportWidth}px`;
  exportHost.style.background = "#ffffff";
  exportHost.style.zIndex = "-1";

  exportClone.style.width = `${exportWidth}px`;
  exportClone.style.maxWidth = "none";
  exportClone.style.overflow = "visible";

  exportHost.appendChild(exportClone);
  document.body.appendChild(exportHost);

  try {
    await waitForImages(exportClone);
    return await html2canvas(exportClone, {
      backgroundColor: "#ffffff",
      scale,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: exportWidth,
      windowHeight: exportClone.scrollHeight,
    });
  } finally {
    document.body.removeChild(exportHost);
  }
}

async function waitForImages(element) {
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 3000);
      const finish = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    });
  }));
}

export async function captureElementAsPngDataUrl(element, options = {}) {
  const canvas = await captureElement(element, options);
  return canvas.toDataURL("image/png", 1);
}

export async function exportElementAsPng(element, reportName, date) {
  const canvas = await captureElement(element);
  const link = document.createElement("a");
  link.download = `${safeFileName(reportName)}_${date}.png`;
  link.href = canvas.toDataURL("image/png", 1);
  link.click();
}

export async function exportElementsAsPng(elements, reportName, date) {
  const pageElements = elements.filter(Boolean);
  if (!pageElements.length) {
    throw new Error("Report area is not available for export.");
  }

  for (let index = 0; index < pageElements.length; index += 1) {
    const canvas = await captureElement(pageElements[index]);
    const link = document.createElement("a");
    const pageSuffix = pageElements.length > 1 ? `_Page_${index + 1}` : "";
    link.download = `${safeFileName(reportName)}_${date}${pageSuffix}.png`;
    link.href = canvas.toDataURL("image/png", 1);
    link.click();
  }

  return { pageCount: pageElements.length };
}

export async function exportElementAsPdf(element, reportName, date, orientation = "landscape") {
  const canvas = await captureElement(element);
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  addCanvasToPdfPage(pdf, canvas);
  pdf.save(`${safeFileName(reportName)}_${date}.pdf`);
}

export async function exportElementAsPortraitPdf(element, reportName, date) {
  return exportElementAsPdf(element, reportName, date, "portrait");
}

export async function exportElementsAsPortraitPdf(elements, reportName, date) {
  const pageElements = elements.filter(Boolean);
  if (!pageElements.length) {
    throw new Error("Report area is not available for export.");
  }

  const imageDataUrls = [];
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let index = 0; index < pageElements.length; index += 1) {
    const canvas = await captureElement(pageElements[index]);
    imageDataUrls.push(canvas.toDataURL("image/png", 1));
    if (index > 0) pdf.addPage("a4", "portrait");
    addCanvasToPdfPage(pdf, canvas);
  }

  pdf.save(`${safeFileName(reportName)}_${date}.pdf`);
  return { pageCount: pageElements.length, imageDataUrls };
}

export async function exportElementsAsLandscapePdf(elements, reportName, date, options = {}) {
  const pageElements = elements.filter(Boolean);
  if (!pageElements.length) throw new Error("Report area is not available for export.");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  for (let index = 0; index < pageElements.length; index += 1) {
    const canvas = await captureElement(pageElements[index]);
    if (index > 0) pdf.addPage("a4", "landscape");
    addCanvasToPdfPage(pdf, canvas, options);
  }
  pdf.save(`${safeFileName(reportName)}_${date}.pdf`);
  return { pageCount: pageElements.length };
}

export async function exportBothAsPdf(reports, date) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  for (let index = 0; index < reports.length; index += 1) {
    const canvas = await captureElement(reports[index]);
    if (index > 0) pdf.addPage("a4", "landscape");
    addCanvasToPdfPage(pdf, canvas);
  }

  pdf.save(`Daily_Courier_Reports_${date}.pdf`);
}

function addCanvasToPdfPage(pdf, canvas, options = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (options.fullBleed) {
    pdf.addImage(canvas.toDataURL("image/png", 1), "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
    return;
  }
  const margin = 8;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;
  const x = (pageWidth - width) / 2;
  const y = margin;

  pdf.addImage(canvas.toDataURL("image/png", 1), "PNG", x, y, width, height, undefined, "FAST");
}

// Print the exact exported page images inside this tab, without replacing the report editor.
export function printReportImages(imageDataUrls) {
  const images = imageDataUrls.filter((url) => url.startsWith("data:image/png;base64,"));
  if (!images.length) throw new Error("No report pages are available to print.");
  const frame = document.createElement("iframe");
  frame.title = "Print Delivered A4 report";
  frame.className = "report-print-frame";
  Object.assign(frame.style, { position: "fixed", width: "1px", height: "1px", right: "0", bottom: "0", opacity: "0", border: "0" });
  const cleanup = () => frame.remove();
  frame.onload = async () => {
    const doc = frame.contentDocument;
    await Promise.all(Array.from(doc.images).map((image) => image.decode().catch(() => {})));
    frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    frame.contentWindow.focus();
    frame.contentWindow.print();
    // Keep the frame alive while a print preview is open; next export replaces abandoned frames.
  };
  document.querySelectorAll(".report-print-frame").forEach((previous) => previous.remove());
  frame.srcdoc = '<!doctype html><html><head><title>DOMEX Delivered Collection Report</title><style>@page{size:A4 portrait;margin:8mm}html,body{margin:0;padding:0}.page{width:194mm;height:281mm;break-after:page}.page:last-child{break-after:auto}.page img{width:100%;height:100%;object-fit:contain;object-position:top center}</style></head><body>' + images.map((url) => '<section class="page"><img src="' + url + '" alt="Delivered collection report"></section>').join('') + '</body></html>';
  document.body.appendChild(frame);
}
