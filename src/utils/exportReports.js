import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const scale = 3;

function safeFileName(value) {
  return value.replaceAll(" ", "_");
}

async function captureElement(element) {
  if (!element) {
    throw new Error("Report area is not available for export.");
  }

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const exportHost = document.createElement("div");
  const exportClone = element.cloneNode(true);
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

export async function captureElementAsPngDataUrl(element) {
  const canvas = await captureElement(element);
  return canvas.toDataURL("image/png", 1);
}

export async function exportElementAsPng(element, reportName, date) {
  const canvas = await captureElement(element);
  const link = document.createElement("a");
  link.download = `${safeFileName(reportName)}_${date}.png`;
  link.href = canvas.toDataURL("image/png", 1);
  link.click();
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

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let index = 0; index < pageElements.length; index += 1) {
    const canvas = await captureElement(pageElements[index]);
    if (index > 0) pdf.addPage("a4", "portrait");
    addCanvasToPdfPage(pdf, canvas);
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

function addCanvasToPdfPage(pdf, canvas) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
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
