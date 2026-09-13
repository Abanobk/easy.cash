/**
 * Capture Mega wave-5 final statement leftover PDFs.
 * Evidence only — never invent column labels.
 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "https://km.mega-cash.net";
const OUT = "artifacts/mega-wave5-final/pdf";
const COMPANY = "KM-01_01_2022";
const USER = "test";
const PASS = "112233445566";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REPORTS = [
  { key: "subledger", featureKey: "finalreports-subledger", path: "/FinalReports/SubLedger.aspx", needsAccount: true },
  { key: "salescost", featureKey: "finalreports-salescost", path: "/FinalReports/SalesCost.aspx" },
  { key: "incomestatment", featureKey: "finalreports-incomestatment", path: "/FinalReports/IncomeStatment.aspx" },
  { key: "balancesheet", featureKey: "finalreports-balancesheet", path: "/FinalReports/BalanceSheet.aspx", asOf: true },
  { key: "financialstatment", featureKey: "finalreports-financialstatment", path: "/FinalReports/FinancialStatment.aspx", asOf: true },
  { key: "cashflow", featureKey: "finalreports-cashflow", path: "/FinalReports/CashFlow.aspx" },
];

function extractUrls(text) {
  const urls = new Set();
  for (const re of [
    /\/(?:show|download)report\/[^\s"'<>\\]+/gi,
    /https?:\/\/[^"'\\\s]+\/(?:show|download)report\/[^"'\\\s]+/gi,
  ]) {
    for (const m of String(text).matchAll(re)) urls.add(m[0].replace(/&amp;/g, "&"));
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
  let frame = await openReport(page, report.path);
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
        (method === "POST" && /FinalReports\/.+\.aspx/i.test(url));
      if (!interesting) return;
      const buf = await res.buffer().catch(() => null);
      const item = { url, method, ct, status: res.status(), size: buf?.length || 0, urls: [], saved: null };
      if (buf) {
        if (buf.slice(0, 5).toString() === "%PDF-") {
          const fname = `${report.key}-net.pdf`;
          fs.writeFileSync(path.join(OUT, fname), buf);
          item.saved = fname;
        } else {
          item.urls = extractUrls(buf.toString("utf8"));
        }
      }
      netHits.push(item);
      console.log("NET", report.key, method, res.status(), url.slice(0, 120), item.saved || item.urls.length || 0);
    } catch {
      /* ignore */
    }
  };
  page.on("response", onResponse);

  const prep = await frame.evaluate((needsAccount, asOf) => {
    const setDate = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.removeAttribute("readonly");
      el.value = val;
      el.setAttribute("OriginalValue", val);
      for (const ev of ["focus", "input", "change", "blur"]) el.dispatchEvent(new Event(ev, { bubbles: true }));
      return true;
    };

    let okFrom = false;
    let okTo = false;
    if (asOf) {
      okFrom = okTo =
        setDate("cph_txtDate", "3/1/2022") ||
        setDate("cph_txtDateSrch", "3/1/2022") ||
        setDate("cph_txtDateToSrch", "3/1/2022") ||
        setDate("cph_txtDateTo", "3/1/2022");
    } else {
      okFrom =
        setDate("cph_txtDateFromSrch", "1/1/2022") ||
        setDate("cph_txtFromDateSrch", "1/1/2022") ||
        setDate("cph_txtDateFrom", "1/1/2022") ||
        setDate("cph_txtFromDate", "1/1/2022");
      okTo =
        setDate("cph_txtDateToSrch", "3/1/2022") ||
        setDate("cph_txtToDateSrch", "3/1/2022") ||
        setDate("cph_txtDateTo", "3/1/2022") ||
        setDate("cph_txtToDate", "3/1/2022");
    }

    let account = null;
    if (needsAccount) {
      for (const sel of document.querySelectorAll("select")) {
        const opt = [...sel.options].find((o) => o.value && o.value !== "0" && !/اختر|^$|الكل|^All$/i.test(o.text.trim()));
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          account = `${sel.id}=${opt.text.trim()}`;
          break;
        }
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
    } catch {
      /* ignore */
    }

    const btn =
      document.getElementById("cph_btnShow") ||
      [...document.querySelectorAll("input[type=submit],input[type=button],button")].find((el) =>
        /عرض|Show/i.test((el.value || el.innerText || "") + "")
      );

    return {
      okFrom,
      okTo,
      account,
      from:
        document.getElementById("cph_txtDateFromSrch")?.value ||
        document.getElementById("cph_txtDateFrom")?.value ||
        document.getElementById("cph_txtDate")?.value,
      to:
        document.getElementById("cph_txtDateToSrch")?.value ||
        document.getElementById("cph_txtDateTo")?.value ||
        document.getElementById("cph_txtDate")?.value,
      hasBtn: !!btn,
      btnId: btn?.id || null,
      hasViewer: !!document.getElementById("cph_ifViewer"),
      dateIds: [...document.querySelectorAll("input[id*='Date']")].map((el) => el.id).slice(0, 20),
      selectIds: [...document.querySelectorAll("select")].map((el) => el.id).slice(0, 25),
    };
  }, !!report.needsAccount, !!report.asOf);
  console.log("prep", report.key, prep);

  await page.screenshot({ path: path.join(OUT, `${report.key}-before.png`), fullPage: true }).catch(() => null);

  let btn = await frame.$("#cph_btnShow");
  if (!btn) {
    const handle = await frame.evaluateHandle(() =>
      [...document.querySelectorAll("input[type=submit],input[type=button],button")].find((el) =>
        /عرض|Show/i.test((el.value || el.innerText || "") + "")
      ) || null
    );
    btn = handle.asElement();
  }
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
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    frame = (await getMain(page)) || frame;
    const snap = await frame
      .evaluate(() => {
        const v = document.getElementById("cph_ifViewer");
        const waitText = /برجاء الانتظار|انتظر/i.test(document.body?.innerText || "");
        const validation = /مطلوب|يجب اختيار|اختر الحساب/i.test(document.body?.innerText || "");
        const lnk = [...document.querySelectorAll("a[href*='downloadreport'],a[href*='showreport']")].map((a) => a.href);
        return {
          src: v?.getAttribute("src"),
          srcProp: v?.src,
          waitText,
          validation,
          lnk,
          hint: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 280),
        };
      })
      .catch((e) => ({ errMsg: String(e) }));

    for (const h of netHits) {
      if (h.urls?.length) foundUrls.push(...h.urls);
      if (/showreport|downloadreport/i.test(h.url || "")) foundUrls.push(h.url);
      if (h.saved) foundUrls.push(`file:${h.saved}`);
    }
    if (snap.lnk?.length) foundUrls.push(...snap.lnk);
    if (snap.src && snap.src !== "about:blank") {
      finalSrc = snap.src;
      foundUrls.push(snap.src);
    }
    const viewer = page.frames().find((f) => f.name() === "ifViewer");
    if (viewer && viewer.url() !== "about:blank") foundUrls.push(viewer.url());

    console.log(
      report.key,
      "tick",
      i,
      "wait",
      !!snap.waitText,
      "val",
      !!snap.validation,
      "src",
      snap.src || snap.srcProp || snap.errMsg,
      "urls",
      foundUrls.length
    );
    if (foundUrls.length) break;
    if (i === 5) {
      try {
        frame = await getMain(page);
        const b2 = await frame?.$("#cph_btnShow");
        if (b2) await b2.click({ delay: 40 });
      } catch {
        /* ignore */
      }
    }
  }

  foundUrls = [...new Set(foundUrls)];
  const cookies = await page.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  let pdfPath = null;
  const saved = [];
  for (const u of foundUrls) {
    if (u.startsWith("file:")) {
      pdfPath = path.join(OUT, u.slice(5));
      saved.push({ u, local: true });
      break;
    }
    const abs = u.startsWith("http") ? u : `${BASE}${u.startsWith("/") ? "" : "/"}${u}`;
    const variants = [abs];
    if (/showreport/i.test(abs)) variants.push(abs.replace(/\/showreport\//i, "/downloadreport/"));
    for (const vu of variants) {
      try {
        const r = await fetch(vu, { headers: { Cookie: cookieHeader } });
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.slice(0, 5).toString() !== "%PDF-") continue;
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
    executablePath: "/usr/bin/google-chrome-stable",
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

  fs.writeFileSync(path.join(OUT, "wave5-pdf-capture.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(
    "SUMMARY",
    JSON.stringify(
      results.map((r) => ({ key: r.key, pdf: !!r.pdfPath, err: r.error, from: r.prep?.from, to: r.prep?.to, account: r.prep?.account })),
      null,
      2
    )
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
