/**
 * Wave 1: capture Mega sales/purchases Excel column headers after عرض.
 * Evidence only — do not invent labels.
 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const BASE = "https://km.mega-cash.net";
const USER = "test";
const PASS = "112233445566";
const COMPANY = "KM-01_01_2022";
const OUT_DIR = "/workspace/artifacts/mega-wave1-sales";
const OUT_JSON = path.join(OUT_DIR, "COLUMNS.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NOISE = new Set([
  "س", "ح", "ن", "ث", "ر", "خ", "ج",
  "يناير", "فبراير", "مارس", "أبريل", "ابريل", "مايو", "يونيو", "يوليو",
  "أغسطس", "اغسطس", "سبتمبر", "أكتوبر", "اكتوبر", "نوفمبر", "ديسمبر",
]);
function keepHeader(h) {
  const t = String(h || "").replace(/\s+/g, " ").trim();
  return t.length > 1 && !NOISE.has(t) && !/^\d+$/.test(t);
}

const REPORTS = [
  { key: "sales", featureKey: "accountingreports-sales", path: "/AccountingReports/Sales.aspx", fromId: "cph_txtDateFrom", toId: "cph_txtDateTo" },
  { key: "customers_sales", featureKey: "accountingreports-customerssales", path: "/AccountingReports/CustomersSales.aspx", fromId: "cph_txtDateFrom", toId: "cph_txtDateTo" },
  { key: "gross_customer_sales_by_items", featureKey: "accountingreports-grosscustomersalesbyitems", path: "/AccountingReports/GrossCustomerSalesByItems.aspx", fromId: "cph_txtDateFrom", toId: "cph_txtDateTo" },
  { key: "purchases", featureKey: "accountingreports-purchases", path: "/AccountingReports/Purchases.aspx", fromId: "cph_txtDateFrom", toId: "cph_txtDateTo" },
  { key: "vendors_purchases", featureKey: "accountingreports-vendorspurchases", path: "/AccountingReports/VendorsPurchases.aspx", fromId: "cph_txtDateFrom", toId: "cph_txtDateTo" },
  { key: "gross_vendor_purchases_by_items", featureKey: "accountingreports-grossvendorpurchasesbyitems", path: "/AccountingReports/GrossVendorPurchasesByItems.aspx", fromId: "cph_txtDateFrom", toId: "cph_txtDateTo" },
];

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(1500);
  await page.waitForSelector("input[type=password]", { timeout: 30000 });
  await page.evaluate((company, user, pass) => {
    const texts = [...document.querySelectorAll("input[type=text]")];
    if (texts[0] && company) {
      texts[0].value = company;
      texts[0].dispatchEvent(new Event("input", { bubbles: true }));
      texts[0].dispatchEvent(new Event("change", { bubbles: true }));
    }
    const userEl = texts.at(-1);
    const passEl = document.querySelector("input[type=password]");
    if (userEl) {
      userEl.value = user;
      userEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (passEl) {
      passEl.value = pass;
      passEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    document.querySelector("input[type=submit]")?.click();
  }, COMPANY, USER, PASS);
  await Promise.race([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => null),
    sleep(8000),
  ]);
  await page.evaluate(() => {
    const t = document.body?.innerText || "";
    if (/مسجل|logged|جلسة/i.test(t)) {
      const btn = [...document.querySelectorAll("input,button,a")].find((el) =>
        /متابعة|استمرار|نعم|OK|دخول/i.test((el.value || el.innerText || "") + "")
      );
      btn?.click();
    }
  });
  await sleep(2000);
  return page.url();
}

async function getMain(page) {
  for (let i = 0; i < 50; i++) {
    const f = page.frames().find((fr) => fr.name() === "MainIframe");
    if (f) return f;
    await sleep(200);
  }
  return null;
}

async function openReport(page, reportPath) {
  await page.evaluate((u) => {
    const ifr = document.querySelector("#MainIframe, iframe[name=MainIframe]");
    if (ifr) ifr.src = u;
  }, `${BASE}${reportPath}`);
  await sleep(4500);
  return getMain(page);
}

async function fillAndShow(frame, report) {
  return frame.evaluate(async (report) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const setDate = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.removeAttribute("readonly");
      el.value = val;
      el.setAttribute("OriginalValue", val);
      for (const ev of ["focus", "input", "change", "blur"]) el.dispatchEvent(new Event(ev, { bubbles: true }));
      return true;
    };
    if (!setDate(report.fromId, "01/01/2022") || !setDate(report.toId, "12/09/2026")) {
      return {
        ok: false,
        reason: "dates",
        ids: [...document.querySelectorAll("input")].map((i) => i.id).filter(Boolean).slice(0, 80),
      };
    }
    const excelFmt = document.getElementById("ddlExcelFormat");
    if (excelFmt) {
      excelFmt.value = "1";
      excelFmt.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const btn =
      document.getElementById("cph_btnShow") ||
      [...document.querySelectorAll("input[type=submit],input[type=button],button")].find((el) =>
        /عرض|Show/i.test((el.value || el.innerText || "") + "")
      );
    if (!btn) return { ok: false, reason: "no-show" };
    btn.click();
    await wait(300);
    return { ok: true };
  }, report);
}

async function exportExcel(page, frame, key) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const client = await page.createCDPSession();
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: OUT_DIR });
  const before = new Set(fs.readdirSync(OUT_DIR));

  const clicked = await frame.evaluate(() => {
    const excelFmt = document.getElementById("ddlExcelFormat");
    if (excelFmt) {
      excelFmt.value = "1";
      excelFmt.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const btn =
      document.getElementById("cph_btnExportToExcel") ||
      [...document.querySelectorAll("input,button,a")].find((el) =>
        /اكسل|Excel|تصدير/i.test((el.value || el.innerText || el.title || "") + "")
      );
    if (!btn) {
      return {
        ok: false,
        reason: "no-btn",
        buttons: [...document.querySelectorAll("input,button,a")]
          .map((el) => (el.value || el.innerText || el.title || "").trim())
          .filter(Boolean)
          .slice(0, 40),
      };
    }
    btn.click();
    return { ok: true, text: (btn.value || btn.innerText || "").slice(0, 40) };
  });
  if (!clicked.ok) return clicked;

  let file = null;
  for (let i = 0; i < 50; i++) {
    await sleep(500);
    const files = fs.readdirSync(OUT_DIR).filter((f) => !before.has(f) && !f.endsWith(".crdownload"));
    if (files.length) {
      file = path.join(OUT_DIR, files[0]);
      break;
    }
  }
  if (!file) return { ok: false, reason: "no-download", clicked };

  const dest = path.join(OUT_DIR, `${key}${path.extname(file) || ".xls"}`);
  fs.copyFileSync(file, dest);

  try {
    const wb = XLSX.readFile(dest);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    let headers = null;
    for (const row of rows.slice(0, 40)) {
      const cells = row.map((c) => String(c || "").trim()).filter(keepHeader);
      if (cells.length >= 3) {
        headers = cells;
        break;
      }
    }
    return { ok: true, file: dest, headers, preview: rows.slice(0, 8), rowCount: rows.length };
  } catch (e) {
    return { ok: true, file: dest, headers: null, parseError: String(e.message || e) };
  }
}

async function captureOne(page, report) {
  const result = {
    featureKey: report.featureKey,
    url: `${BASE}${report.path}`,
    status: "UNKNOWN",
    headers: null,
    blocker: null,
  };
  const frame = await openReport(page, report.path);
  if (!frame) {
    result.blocker = "MainIframe missing";
    return result;
  }
  await page.screenshot({ path: path.join(OUT_DIR, `filters-${report.key}.png`), fullPage: false });
  result.prep = await fillAndShow(frame, report);
  await sleep(10000);
  const main = (await getMain(page)) || frame;
  result.excel = await exportExcel(page, main, report.key);
  if (result.excel?.headers?.length >= 3) {
    result.status = "OK";
    result.headers = result.excel.headers;
    result.headerSource = "excel";
  } else {
    result.blocker = result.excel?.reason || result.excel?.parseError || "no excel headers";
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${report.key}-after.png`), fullPage: false });
  return result;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1600,1000"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  const loginUrl = await login(page);
  console.log("login", loginUrl);

  const out = {
    extraction_date: new Date().toISOString(),
    company: COMPANY,
    loginUrl,
    reports: {},
    notes: ["No invented headers — Excel after عرض only"],
  };

  for (const report of REPORTS) {
    process.stdout.write(`capturing ${report.key} ... `);
    try {
      const r = await captureOne(page, report);
      out.reports[report.key] = r;
      console.log(r.status, r.headers ? `cols=${r.headers.length}` : r.blocker);
    } catch (e) {
      out.reports[report.key] = {
        featureKey: report.featureKey,
        url: `${BASE}${report.path}`,
        status: "UNKNOWN",
        headers: null,
        blocker: String(e?.message || e),
      };
      console.log("ERR", e?.message || e);
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));

  const lines = [
    "# موجة 1 — أعمدة مبيعات/مشتريات من إكسل ميجا",
    "",
    `التقاط: ${out.extraction_date} · شركة \`${COMPANY}\``,
    "",
    "مصدر فقط من ملف الإكسل بعد عرض — بدون اختراع عناوين.",
    "",
  ];
  for (const [key, r] of Object.entries(out.reports)) {
    lines.push(`## ${key} (\`${r.featureKey}\`)`);
    lines.push(`- Mega: \`${r.url}\``);
    if (r.headers?.length) {
      lines.push(`- أعمدة (${r.headers.length}):`);
      for (const c of r.headers) lines.push(`  - ${c}`);
    } else {
      lines.push(`- ⚠️ لم تُستخرج أعمدة: ${r.blocker || "unknown"}`);
    }
    lines.push("");
  }
  fs.writeFileSync(path.join(OUT_DIR, "COLUMNS.md"), lines.join("\n"));
  console.log("wrote", OUT_JSON);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
