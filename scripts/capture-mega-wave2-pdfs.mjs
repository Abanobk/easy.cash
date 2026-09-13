/**
 * Capture Mega wave-2 remaining sales+purchases PDFs (short date range + عرض).
 * Evidence only — do not invent column labels.
 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "https://km.mega-cash.net";
const OUT = "artifacts/mega-wave2-sales/pdf";
const COMPANY = "KM-01_01_2022";
const USER = "test";
const PASS = "112233445566";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REPORTS = [
  { key: "customer-statement", featureKey: "accountingreports-customerstatment", path: "/AccountingReports/CustomerStatment.aspx" },
  { key: "customers-list", featureKey: "accountingreports-customerslist", path: "/AccountingReports/CustomersList.aspx" },
  { key: "debits-ages", featureKey: "accountingreports-debitsages", path: "/AccountingReports/DebitsAges.aspx" },
  { key: "debits-ages-by-year", featureKey: "accountingreports-debitsagesbyyear", path: "/AccountingReports/DebitsAgesByYear.aspx" },
  { key: "debits-ages-by-half-year", featureKey: "accountingreports-debitsagesbyhalfyear", path: "/AccountingReports/DebitsAgesByHalfYear.aspx" },
  { key: "mature-invoices", featureKey: "accountingreports-matureinvoices", path: "/AccountingReports/MatureInvoices.aspx" },
  { key: "sales-orders", featureKey: "accountingreports-salesorders", path: "/AccountingReports/SalesOrders.aspx" },
  { key: "areas-summary", featureKey: "accountingreports-areassummary", path: "/AccountingReports/AreasSummary.aspx" },
  { key: "customers-summary", featureKey: "accountingreports-customerssummary", path: "/AccountingReports/CustomersSummary.aspx" },
  { key: "monthly-sales-by-items", featureKey: "accountingreports-monthlysalesbyitems", path: "/AccountingReports/MonthlySalesByItems.aspx" },
  { key: "monthly-sales-by-items-totals", featureKey: "accountingreports-monthlysalesbyitemstotals", path: "/AccountingReports/MonthlySalesByItemsTotals.aspx" },
  { key: "last-prices", featureKey: "accountingreports-lastprices", path: "/AccountingReports/LastPrices.aspx" },
  { key: "vendor-statement", featureKey: "accountingreports-vendorstatment", path: "/AccountingReports/VendorStatment.aspx" },
  { key: "vendor-by-items", featureKey: "accountingreports-vendoraccountstatementbyitems", path: "/AccountingReports/VendorAccountStatementByItems.aspx" },
  { key: "vendors-list", featureKey: "accountingreports-vendorslist", path: "/AccountingReports/VendorsList.aspx" },
  { key: "mature-receipts", featureKey: "accountingreports-maturereceipts", path: "/AccountingReports/MatureReceipts.aspx" },
  { key: "vendors-summary", featureKey: "accountingreports-vendorssummary", path: "/AccountingReports/VendorsSummary.aspx" },
  { key: "purchase-orders", featureKey: "accountingreports-purchaseorders", path: "/AccountingReports/PurchaseOrders.aspx" },
];

function extractUrls(text) {
  const urls = new Set();
  for (const re of [
    /\/(?:show|download)report\/[^\s"'<>\\]+/gi,
    /https?:\/\/[^"'\\\s]+\/(?:show|download)report\/[^"'\\\s]+/gi,
  ]) {
    for (const m of text.matchAll(re)) urls.add(m[0].replace(/&amp;/g, "&"));
  }
  return [...urls];
}

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(1500);
  await page.waitForSelector("input[type=password]", { timeout: 30000 });
  await page.evaluate((company, user, pass) => {
    const texts = [...document.querySelectorAll("input[type=text]")];
    if (texts[0]) {
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
    if (/مسجل|جلسة|logged/i.test(t)) {
      const btn = [...document.querySelectorAll("input,button,a")].find((el) =>
        /متابعة|استمرار|نعم|OK|دخول/i.test((el.value || el.innerText || "") + "")
      );
      btn?.click();
    }
  });
  await sleep(2500);
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
  await sleep(5000);
  return getMain(page);
}

async function captureOne(page, report) {
  const frame = await openReport(page, report.path);
  if (!frame) return { key: report.key, error: "no-MainIframe" };

  const netHits = [];
  const onResponse = async (res) => {
    try {
      const url = res.url();
      const method = res.request().method();
      const ct = (res.headers()["content-type"] || "") + "";
      const interesting =
        /showreport|downloadreport|\.pdf/i.test(url) ||
        /pdf/i.test(ct) ||
        (method === "POST" && /AccountingReports\/.+\.aspx/i.test(url));
      if (!interesting) return;
      const buf = await res.buffer().catch(() => null);
      const item = { url, method, ct, status: res.status(), size: buf?.length || 0, urls: [] };
      if (buf) {
        const isPdf = buf.slice(0, 5).toString() === "%PDF-";
        if (isPdf) {
          const fname = `${report.key}-net.pdf`;
          fs.writeFileSync(path.join(OUT, fname), buf);
          item.saved = fname;
        } else {
          item.urls = extractUrls(buf.toString("utf8"));
        }
      }
      netHits.push(item);
      console.log("NET", report.key, method, res.status(), url.slice(0, 120), item.urls);
    } catch {}
  };
  page.on("response", onResponse);

  const prep = await frame.evaluate(() => {
    const setDate = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.removeAttribute("readonly");
      el.value = val;
      el.setAttribute("OriginalValue", val);
      for (const ev of ["focus", "input", "change", "blur"]) el.dispatchEvent(new Event(ev, { bubbles: true }));
      return true;
    };
    const okFrom = setDate("cph_txtDateFrom", "1/1/2022") || setDate("cph_txtFromDate", "1/1/2022");
    const okTo =
      setDate("cph_txtDateTo", "3/1/2022") ||
      setDate("cph_txtToDate", "3/1/2022") ||
      setDate("cph_txtDate", "3/1/2022");
    // لو التقرير يطلب عميل/مورد — اختار أول قيمة غير فاضية
    for (const sel of document.querySelectorAll("select")) {
      const id = (sel.id || "") + (sel.name || "");
      if (!/Customer|Vendor|Supplier|Contact/i.test(id)) continue;
      const opt = [...sel.options].find((o) => o.value && o.value !== "0");
      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    document.body.click();
    try {
      if (typeof Page_Validators !== "undefined") {
        for (const v of Page_Validators) {
          v.enabled = false;
          v.isvalid = true;
        }
      }
      window.Page_ValidationActive = false;
      window.ValidatorOnSubmit = () => true;
      window.Page_ClientValidate = () => true;
    } catch {}
    return {
      okFrom,
      okTo,
      from: document.getElementById("cph_txtDateFrom")?.value,
      to: document.getElementById("cph_txtDateTo")?.value,
      hasBtn: !!document.getElementById("cph_btnShow"),
      hasViewer: !!document.getElementById("cph_ifViewer"),
      dateIds: [...document.querySelectorAll("input[id*='Date']")].map((el) => el.id).slice(0, 20),
    };
  });
  console.log("prep", report.key, prep);

  // Prefer real click (avoids ASP.NET strict-mode caller error inside evaluate)
  const btn = await frame.$("#cph_btnShow");
  if (btn) {
    await btn.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(200);
    await btn.click({ delay: 40 });
  } else {
    await frame.evaluate(() => {
      const form = document.forms[0];
      const et = document.getElementById("__EVENTTARGET");
      const ea = document.getElementById("__EVENTARGUMENT");
      if (et) et.value = "ctl00$cph$btnShow";
      if (ea) ea.value = "";
      if (form) {
        const inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = "ctl00$cph$btnShow";
        inp.value = "عرض";
        form.appendChild(inp);
        form.submit();
      }
    });
  }

  let foundUrls = [];
  let finalSrc = null;
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const snap = await frame
      .evaluate(() => {
        const v = document.getElementById("cph_ifViewer");
        const waitText = /برجاء الانتظار|انتظر/i.test(document.body?.innerText || "");
        const lnk = [...document.querySelectorAll("a[href*='downloadreport'],a[href*='showreport']")].map((a) => a.href);
        return { src: v?.getAttribute("src"), srcProp: v?.src, waitText, lnk };
      })
      .catch((e) => ({ err: String(e) }));

    for (const h of netHits) {
      if (h.urls?.length) foundUrls.push(...h.urls);
      if (/showreport|downloadreport/i.test(h.url)) foundUrls.push(h.url);
    }
    if (snap.lnk?.length) foundUrls.push(...snap.lnk);
    if (snap.src && snap.src !== "about:blank") {
      finalSrc = snap.src;
      foundUrls.push(snap.src);
    }
    const viewer = page.frames().find((f) => f.name() === "ifViewer");
    if (viewer && viewer.url() !== "about:blank") foundUrls.push(viewer.url());

    console.log(report.key, "tick", i, "wait", !!snap.waitText, "src", snap.src || snap.srcProp, "urls", foundUrls.length);
    if (foundUrls.length) break;
    if (i === 4 && btn) await btn.click({ delay: 40 });
  }

  foundUrls = [...new Set(foundUrls)];
  const cookies = await page.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  let pdfPath = null;
  const saved = [];
  for (const u of foundUrls) {
    const abs = u.startsWith("http") ? u : `${BASE}${u.startsWith("/") ? "" : "/"}${u}`;
    const variants = [abs];
    if (/showreport/i.test(abs)) variants.push(abs.replace(/\/showreport\//i, "/downloadreport/"));
    for (const vu of variants) {
      try {
        const r = await fetch(vu, { headers: { Cookie: cookieHeader } });
        const buf = Buffer.from(await r.arrayBuffer());
        const isPdf = buf.slice(0, 5).toString() === "%PDF-";
        if (!isPdf) continue;
        const name = `${report.key}.pdf`;
        fs.writeFileSync(path.join(OUT, name), buf);
        pdfPath = path.join(OUT, name);
        saved.push({ vu, status: r.status, size: buf.length, name });
        console.log("saved", name, buf.length);
        break;
      } catch (e) {
        saved.push({ vu, err: String(e) });
      }
    }
    if (pdfPath) break;
  }

  page.off("response", onResponse);
  await page.screenshot({ path: path.join(OUT, `${report.key}-after.png`), fullPage: true }).catch(() => null);

  return {
    key: report.key,
    featureKey: report.featureKey,
    path: report.path,
    prep,
    foundUrls,
    finalSrc,
    pdfPath,
    saved,
    netHits: netHits.length,
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await login(page);
  console.log("logged in", page.url());

  const only = process.argv.slice(2);
  const list = only.length ? REPORTS.filter((r) => only.includes(r.key)) : REPORTS;
  const results = [];
  for (const report of list) {
    console.log("===", report.key);
    try {
      results.push(await captureOne(page, report));
    } catch (e) {
      console.error(report.key, e);
      results.push({ key: report.key, error: String(e) });
    }
  }

  fs.writeFileSync(path.join(OUT, "wave2-pdf-capture.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log("SUMMARY", JSON.stringify(results.map((r) => ({ key: r.key, pdf: !!r.pdfPath, err: r.error, prep: r.prep })), null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
