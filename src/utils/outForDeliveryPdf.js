import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { findRiderName, findTrackingColumn } from "./outForDeliveryText.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function parseOutForDeliveryPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await getDocument({ data }).promise;
  const trackingNumbers = [];
  let riderName = "";

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => item.str?.trim())
      .map((item) => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
      }));

    if (!riderName) riderName = findRiderName(items);
    trackingNumbers.push(...findTrackingColumn(items));
  }

  const uniqueTracking = [...new Set(trackingNumbers)];
  if (!uniqueTracking.length) throw new Error("Out for Delivery PDF Tracking No column could not be read.");

  return {
    trackingNumbers: uniqueTracking,
    riderName,
    pageCount: document.numPages,
  };
}
