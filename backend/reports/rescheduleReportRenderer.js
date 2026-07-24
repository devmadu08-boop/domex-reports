import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const rowsPerPage = 18;
const dataDir = path.resolve("backend", "data", "reschedule-approvals");
const logoPath = path.resolve("public", "report-assets", "domex-logo.png");
const signaturePath = path.resolve("public", "report-assets", "branch-manager-signature.png");

export async function renderRescheduleReportImages({ rows, reportDate, branchName }) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(`No Reschedule Report rows are saved for ${reportDate}.`);
  }

  const pages = paginate(rows);
  const outputDir = path.join(dataDir, reportDate);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const [logoDataUrl, signatureDataUrl] = await Promise.all([
    imageFileToDataUrl(logoPath),
    imageFileToDataUrl(signaturePath),
  ]);

  const browser = await chromium.launch({
    headless: true,
    executablePath: await findBrowserExecutable(),
    args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 820, height: 1160 },
      deviceScaleFactor: 2,
    });
    await page.setContent(buildReportHtml({
      pages,
      reportDate,
      branchName,
      totalCount: rows.length,
      logoDataUrl,
      signatureDataUrl,
    }), { waitUntil: "load" });

    const imagePaths = [];
    const pageElements = page.locator(".report-page");
    for (let index = 0; index < pages.length; index += 1) {
      const imagePath = path.join(outputDir, `page-${index + 1}.png`);
      await pageElements.nth(index).screenshot({ path: imagePath, type: "png" });
      imagePaths.push(imagePath);
    }
    return imagePaths;
  } finally {
    await browser.close();
  }
}

async function findBrowserExecutable() {
  const candidates = [
    process.env.DOMEX_BROWSER_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error("Chrome or Chromium was not found for the scheduled Reschedule Report.");
}

async function imageFileToDataUrl(filePath) {
  try {
    return `data:image/png;base64,${(await fs.readFile(filePath)).toString("base64")}`;
  } catch {
    return "";
  }
}

function paginate(rows) {
  const pages = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pages.push(rows.slice(index, index + rowsPerPage));
  }
  return pages;
}

function buildReportHtml({ pages, reportDate, branchName, totalCount, logoDataUrl, signatureDataUrl }) {
  const branch = titleCase(String(branchName || "Middeniya").trim() || "Middeniya");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #e9e5e5; font-family: Arial, Helvetica, sans-serif; }
    body { display: grid; gap: 20px; justify-content: center; padding: 12px; }
    .report-page { position: relative; width: 794px; height: 1123px; overflow: hidden; background: #fff; color: #171717; }
    .brand-bar { height: 112px; display: flex; align-items: center; justify-content: space-between; padding: 18px 34px; color: #fff; background: linear-gradient(115deg, #71060d 0%, #a20e18 52%, #4e0308 100%); border-bottom: 5px solid #efb328; }
    .logo { width: 238px; max-height: 76px; object-fit: contain; }
    .branch-mark { display: flex; align-items: center; gap: 12px; text-align: left; }
    .pin { color: #f2b52b; font-size: 35px; }
    .branch-mark strong { display: block; font-size: 17px; }
    .branch-mark span { display: block; margin-top: 3px; color: #f5c957; font-size: 11px; }
    .heading { padding: 25px 36px 8px; }
    .heading p { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
    .heading h1 { margin: 0; font-size: 35px; line-height: 1; text-transform: uppercase; }
    .heading h1 span { color: #a50d17; }
    .rule { width: 100px; height: 5px; margin-top: 12px; border-radius: 5px; background: #efb328; }
    .meta { display: flex; gap: 16px; padding: 4px 36px 18px; }
    .meta-card { min-width: 164px; display: flex; align-items: center; gap: 12px; border-radius: 8px; padding: 10px 14px; color: #fff; background: linear-gradient(135deg, #af131d, #71060d); }
    .meta-card.page { background: linear-gradient(135deg, #2a2a2a, #101010); }
    .meta-icon { font-size: 24px; }
    .meta-card small, .meta-card strong { display: block; }
    .meta-card small { font-size: 9px; font-weight: 900; text-transform: uppercase; }
    .meta-card strong { margin-top: 2px; font-size: 16px; }
    .content { padding: 0 36px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border-radius: 9px; box-shadow: 0 6px 18px rgba(55, 16, 20, .10); }
    th { height: 38px; padding: 5px 6px; border-right: 1px solid rgba(255,255,255,.2); color: #fff; background: linear-gradient(#a70f18, #72070d); font-size: 11px; text-align: left; }
    td { height: 32px; padding: 4px 7px; border-right: 1px solid #e7e2e2; border-bottom: 1px solid #e7e2e2; background: #fff; font-size: 10.5px; }
    tbody tr:nth-child(even) td { background: #fffafa; }
    td:first-child, th:first-child { width: 48px; text-align: center; }
    td:nth-child(2), th:nth-child(2) { width: 190px; font-weight: 800; }
    td:nth-child(3), th:nth-child(3) { width: 180px; }
    .number { display: inline-flex; min-width: 24px; height: 24px; align-items: center; justify-content: center; padding: 0 4px; border-radius: 5px; color: #fff; background: linear-gradient(145deg, #bd1721, #65050b); font-size: 10px; font-weight: 900; }
    .reason::before { content: "↻"; margin-right: 6px; color: #e21b2b; font-size: 15px; font-weight: 900; vertical-align: -1px; }
    .footer { position: absolute; left: 36px; right: 36px; bottom: 54px; }
    .summary { height: 92px; display: grid; grid-template-columns: 78px 1fr 200px 84px; align-items: center; overflow: hidden; border: 1px solid #e8dfdf; border-radius: 9px; background: #fff; box-shadow: 0 8px 20px rgba(55,16,20,.10); }
    .summary-icon { align-self: stretch; display: grid; place-items: center; color: #fff; background: linear-gradient(145deg, #af131d, #71060d); font-size: 35px; }
    .summary-copy { padding-left: 22px; border-right: 1px solid #ddd; }
    .summary-copy small { display: block; font-size: 11px; font-weight: 900; text-transform: uppercase; }
    .summary-copy strong { display: block; margin-top: 3px; color: #a50d17; font-size: 30px; }
    .signature { display: grid; justify-items: center; font-size: 9px; font-weight: 800; }
    .signature img { width: 120px; height: 48px; object-fit: contain; }
    .signature small { font-weight: 500; }
    .seal { width: 65px; height: 65px; display: grid; place-items: center; border: 3px double #d5cece; border-radius: 50%; color: #c5bebe; font-size: 12px; font-weight: 900; text-align: center; }
    .seal small { display: block; font-size: 6px; }
    .footer-strip { position: absolute; left: -36px; right: -36px; top: 101px; height: 48px; display: flex; align-items: center; justify-content: space-between; padding: 0 36px; color: #fff; background: linear-gradient(115deg, #71060d, #9d0c15 60%, #4e0308); border-top: 3px solid #efb328; font-size: 10px; }
  </style>
</head>
<body>
${pages.map((rows, pageIndex) => `
  <section class="report-page">
    <header class="brand-bar">
      ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="DOMEX">` : "<strong>DOMEX - WE DELIVER ISLANDWIDE</strong>"}
      <div class="branch-mark"><span class="pin">●</span><div><strong>${escapeHtml(branch.toUpperCase())} BRANCH</strong><span>Reliable Delivery. Every Time.</span></div></div>
    </header>
    <div class="heading"><p>Domex ${escapeHtml(branch)} Branch</p><h1><span>Reschedule</span> Report</h1><div class="rule"></div></div>
    <div class="meta">
      <div class="meta-card"><span class="meta-icon">▣</span><span><small>Date</small><strong>${escapeHtml(reportDate)}</strong></span></div>
      <div class="meta-card page"><span class="meta-icon">▤</span><span><small>Page</small><strong>${pageIndex + 1} / ${pages.length}</strong></span></div>
    </div>
    <main class="content">
      <table>
        <thead><tr><th>No</th><th>Rider Name</th><th>Tracking No</th><th>Reason</th></tr></thead>
        <tbody>
          ${rows.map((row, rowIndex) => `<tr>
            <td><span class="number">${pageIndex * rowsPerPage + rowIndex + 1}</span></td>
            <td>${escapeHtml(row.riderName || "-")}</td>
            <td>${escapeHtml(row.trackingNo || "-")}</td>
            <td class="reason">${escapeHtml(row.reason || "-")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </main>
    <footer class="footer">
      <div class="summary">
        <span class="summary-icon">◇</span>
        <span class="summary-copy"><small>Total Rescheduled Parcels</small><strong>${totalCount}</strong></span>
        <span class="signature">${signatureDataUrl ? `<img src="${signatureDataUrl}" alt="">` : ""}<strong>Branch Manager</strong><small>Domex ${escapeHtml(branch)} Branch</small></span>
        <span class="seal">DOMEX<small>Courier Service</small></span>
      </div>
      <div class="footer-strip"><span>● ${escapeHtml(branch)}, Sri Lanka</span><span>▣ Generated by Daily Courier Report System</span></div>
    </footer>
  </section>`).join("")}
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleCase(value) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
