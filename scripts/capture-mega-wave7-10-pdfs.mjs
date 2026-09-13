/**
 * Capture Mega waves 7–10 PDF evidence (reps, production, HR, fixed assets).
 * Evidence only — never invent column labels.
 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "https://km.mega-cash.net";
const COMPANY = "KM-01_01_2022";
const USER = "test";
const PASS = "112233445566";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WAVE_OUT = {
  7: "artifacts/mega-wave7-reps/pdf",
  8: "artifacts/mega-wave8-production/pdf",
  9: "artifacts/mega-wave9-hr/pdf",
  10: "artifacts/mega-wave10-assets/pdf",
};

const REPORTS = [
  // Wave 7 — reps
  {
    wave: 7,
    key: "grossrepsalesbyitems",
    featureKey: "accountingreports-grossrepsalesbyitems",
    path: "/AccountingReports/GrossRepSalesByItems.aspx",
  },
  {
    wave: 7,
    key: "repscollectings",
    featureKey: "accountingreports-repscollectings",
    path: "/AccountingReports/RepsCollectings.aspx",
  },
  {
    wave: 7,
    key: "repdaily",
    featureKey: "accountingreports-repdaily",
    path: "/AccountingReports/RepDaily.aspx",
  },
  {
    wave: 7,
    key: "repdebit",
    featureKey: "accountingreports-repdebit",
    path: "/AccountingReports/RepDebit.aspx",
  },

  // Wave 8 — production
  {
    wave: 8,
    key: "productionorders",
    featureKey: "accountingreports-productionorders",
    path: "/AccountingReports/ProductionOrders.aspx",
  },
  {
    wave: 8,
    key: "productionmaterials",
    featureKey: "accountingreports-productionmaterials",
    path: "/AccountingReports/ProductionMaterials.aspx",
  },

  // Wave 9 — HR
  {
    wave: 9,
    key: "attendance",
    featureKey: "hrreports-attendance",
    path: "/HRReports/Attendance.aspx",
  },
  {
    wave: 9,
    key: "employeesvactions",
    featureKey: "hrreports-employeesvations",
    path: "/HRReports/EmployeesVactions.aspx",
  },
  {
    wave: 9,
    key: "employeespayroll",
    featureKey: "hrreports-employeespayroll",
    path: "/HRReports/EmployeesPayroll.aspx",
    monthYear: true,
  },
  {
    wave: 9,
    key: "employeespayroll-list",
    featureKey: "hrreports-employeespayroll-list",
    path: "/HRReports/EmployeesPayroll.aspx/List",
    monthYear: true,
  },
  {
    wave: 9,
    key: "employeesunderrequest",
    featureKey: "hrreports-employeesunderrequest",
    path: "/HRReports/EmployeesUnderRequest.aspx",
  },
  {
    wave: 9,
    key: "employeeslist",
    featureKey: "hrreports-employeeslist",
    path: "/HRReports/EmployeesList.aspx",
    hireDates: true,
  },
  {
    wave: 9,
    key: "loans-list",
    featureKey: "hrreports-loans-list",
    path: "/HRReports/Loans.aspx/List",
  },
  {
    wave: 9,
    key: "loans",
    featureKey: "hrreports-loans",
    path: "/HRReports/Loans.aspx",
    note: "non-List path; compare with loans-list",
  },

  // Wave 10 — fixed assets
  {
    wave: 10,
    key: "dep",
    featureKey: "fixedassetsreports-dep",
    path: "/FixedAssetsReports/Dep.aspx",
    asOf: true,
    note: "same page also mapped as fixedassetsreports-depruns",
  },
  {
    wave: 10,
    key: "soldfixedassets",
    featureKey: "fixedassetsreports-soldfixedassets",
    path: "/FixedAssetsReports/SoldFixedAssets.aspx",
  },
];

function outDir(report) {
  return WAVE_OUT[report.wave];
}

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
  await page.evaluate(
    (company, user, pass) => {
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
    },
    COMPANY,
    USER,
    PASS
  );
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

function postPathRe(report) {
  if (/HRReports/i.test(report.path)) return /HRReports\/.+/i;
  if (/FixedAssetsReports/i.test(report.path)) return /FixedAssetsReports\/.+/i;
  return /AccountingReports\/.+\.aspx/i;
}

async function captureOne(page, report) {
  const OUT = outDir(report);
  fs.mkdirSync(OUT, { recursive: true });

  let frame = await openReport(page, report.path);
  if (!frame) {
    return { key: report.key, featureKey: report.featureKey, path: report.path, wave: report.wave, error: "no-MainIframe" };
  }

  const gate = await frame
    .evaluate(() => {
      const t = (document.body?.innerText || "").replace(/\s+/g, " ");
      const href = location.href;
      return {
        href,
        authDenied: /الوصول مرفوض|ليس لديك صلاحيات/i.test(t),
        startScreen: /StartScreen\.aspx/i.test(href),
        hasShow: !!document.getElementById("cph_btnShow"),
        hasDateFrom: !!(
          document.getElementById("cph_txtDateFromSrch") ||
          document.getElementById("cph_txtFromDateSrch") ||
          document.getElementById("cph_txtDateFrom") ||
          document.getElementById("cph_txtFromDate")
        ),
        hasAsOf: !!(document.getElementById("cph_txtDate") || document.getElementById("cph_txtDateSrch")),
        hasMonth: !!(
          document.getElementById("cph_ddlMonthFrom") ||
          document.getElementById("cph_ddlFromMonth") ||
          document.querySelector("select[id*='Month']")
        ),
        title: document.title || "",
        hint: t.slice(0, 360),
      };
    })
    .catch((e) => ({ errMsg: String(e) }));

  if (gate.authDenied || gate.startScreen || (!gate.hasShow && !gate.hasDateFrom && !gate.hasAsOf && !gate.hasMonth)) {
    await page.screenshot({ path: path.join(OUT, `${report.key}-blocked.png`), fullPage: true }).catch(() => null);
    return {
      key: report.key,
      featureKey: report.featureKey,
      path: report.path,
      wave: report.wave,
      note: report.note || null,
      error: gate.authDenied
        ? "authorization-denied"
        : gate.startScreen
          ? "redirected-to-startscreen"
          : "page-unavailable-or-no-filters",
      gate,
      pdfPath: null,
    };
  }

  const netHits = [];
  const interestingPost = postPathRe(report);
  const onResponse = async (res) => {
    try {
      const url = res.url();
      const method = res.request().method();
      const ct = (res.headers()["content-type"] || "") + "";
      const interesting =
        /showreport|downloadreport|\.pdf/i.test(url) ||
        /pdf/i.test(ct) ||
        (method === "POST" && interestingPost.test(url));
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

  const prep = await frame.evaluate(
    (opts) => {
      const setDate = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.removeAttribute("readonly");
        el.value = val;
        el.setAttribute("OriginalValue", val);
        for (const ev of ["focus", "input", "change", "blur"]) el.dispatchEvent(new Event(ev, { bubbles: true }));
        return true;
      };

      const setSelectById = (ids, preferTexts) => {
        for (const id of ids) {
          const sel = document.getElementById(id);
          if (!sel || !sel.options?.length) continue;
          let opt = null;
          if (preferTexts?.length) {
            opt = [...sel.options].find((o) => preferTexts.some((t) => (o.text || "").trim() === t || o.value === t));
          }
          if (!opt) opt = [...sel.options].find((o) => o.value && o.value !== "0" && !/اختر|^$|الكل|^All$/i.test(o.text.trim()));
          if (!opt) continue;
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return `${id}=${opt.text.trim()} (${opt.value})`;
        }
        return null;
      };

      let okFrom = false;
      let okTo = false;
      let okAsOf = false;
      let monthYear = null;
      let hireDates = null;

      if (opts.monthYear) {
        monthYear = {
          fromMonth: setSelectById(
            ["cph_ddlMonthFrom", "cph_ddlFromMonth", "cph_ddlMonthFromSrch", "cph_ddlFromMonthSrch"],
            ["يناير", "1"]
          ),
          fromYear: setSelectById(
            ["cph_ddlYearFrom", "cph_ddlFromYear", "cph_ddlYearFromSrch", "cph_ddlFromYearSrch"],
            ["2022"]
          ),
          toMonth: setSelectById(
            ["cph_ddlMonthTo", "cph_ddlToMonth", "cph_ddlMonthToSrch", "cph_ddlToMonthSrch"],
            ["مارس", "3"]
          ),
          toYear: setSelectById(
            ["cph_ddlYearTo", "cph_ddlToYear", "cph_ddlYearToSrch", "cph_ddlToYearSrch"],
            ["2022"]
          ),
        };
        // Fallback: any month/year selects
        if (!monthYear.fromMonth || !monthYear.fromYear) {
          const monthSels = [...document.querySelectorAll("select")].filter((s) => /Month|شهر/i.test(s.id + (s.name || "")));
          const yearSels = [...document.querySelectorAll("select")].filter((s) => /Year|سنة/i.test(s.id + (s.name || "")));
          for (const sel of monthSels) {
            const jan = [...sel.options].find((o) => /يناير|^1$/.test(o.text.trim()) || o.value === "1");
            if (jan) {
              sel.value = jan.value;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              monthYear.fromMonth = monthYear.fromMonth || `${sel.id}=${jan.text.trim()}`;
              if (!monthYear.toMonth && monthSels.length === 1) monthYear.toMonth = monthYear.fromMonth;
            }
          }
          for (const sel of yearSels) {
            const y = [...sel.options].find((o) => o.text.trim() === "2022" || o.value === "2022");
            if (y) {
              sel.value = y.value;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              monthYear.fromYear = monthYear.fromYear || `${sel.id}=${y.text.trim()}`;
              if (!monthYear.toYear && yearSels.length === 1) monthYear.toYear = monthYear.fromYear;
            }
          }
          // If two month selects, set second to March
          if (monthSels.length >= 2) {
            const sel = monthSels[1];
            const mar = [...sel.options].find((o) => /مارس|^3$/.test(o.text.trim()) || o.value === "3");
            if (mar) {
              sel.value = mar.value;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              monthYear.toMonth = `${sel.id}=${mar.text.trim()}`;
            }
          }
          if (yearSels.length >= 2) {
            const sel = yearSels[1];
            const y = [...sel.options].find((o) => o.text.trim() === "2022" || o.value === "2022");
            if (y) {
              sel.value = y.value;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              monthYear.toYear = `${sel.id}=${y.text.trim()}`;
            }
          }
        }
      } else if (opts.asOf) {
        okAsOf =
          setDate("cph_txtDate", "3/1/2022") ||
          setDate("cph_txtDateSrch", "3/1/2022") ||
          setDate("cph_txtDateToSrch", "3/1/2022") ||
          setDate("cph_txtDateTo", "3/1/2022");
        okFrom = okTo = okAsOf;
      } else if (opts.hireDates) {
        hireDates = {
          from:
            setDate("cph_txtHireDateFromSrch", "1/1/2000") ||
            setDate("cph_txtDateFromSrch", "1/1/2000") ||
            setDate("cph_txtFromDateSrch", "1/1/2000") ||
            setDate("cph_txtDateFrom", "1/1/2000"),
          to:
            setDate("cph_txtHireDateToSrch", "3/1/2022") ||
            setDate("cph_txtDateToSrch", "3/1/2022") ||
            setDate("cph_txtToDateSrch", "3/1/2022") ||
            setDate("cph_txtDateTo", "3/1/2022"),
        };
        okFrom = !!hireDates.from;
        okTo = !!hireDates.to;
        // Also try generic date range if hire-specific missing
        if (!okFrom) {
          okFrom =
            setDate("cph_txtDateFromSrch", "1/1/2022") ||
            setDate("cph_txtFromDateSrch", "1/1/2022") ||
            setDate("cph_txtDateFrom", "1/1/2022");
        }
        if (!okTo) {
          okTo =
            setDate("cph_txtDateToSrch", "3/1/2022") ||
            setDate("cph_txtToDateSrch", "3/1/2022") ||
            setDate("cph_txtDateTo", "3/1/2022");
        }
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
        okAsOf =
          setDate("cph_txtDate", "3/1/2022") ||
          setDate("cph_txtDateSrch", "3/1/2022");
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

      const labels = [...document.querySelectorAll("label,span,td,th,div")]
        .map((el) => (el.innerText || "").trim())
        .filter((t) => t && t.length < 40)
        .slice(0, 80);

      return {
        okFrom,
        okTo,
        okAsOf,
        monthYear,
        hireDates,
        from:
          document.getElementById("cph_txtDateFromSrch")?.value ||
          document.getElementById("cph_txtDateFrom")?.value ||
          document.getElementById("cph_txtDate")?.value ||
          document.getElementById("cph_txtHireDateFromSrch")?.value,
        to:
          document.getElementById("cph_txtDateToSrch")?.value ||
          document.getElementById("cph_txtDateTo")?.value ||
          document.getElementById("cph_txtDate")?.value ||
          document.getElementById("cph_txtHireDateToSrch")?.value,
        hasBtn: !!btn,
        btnId: btn?.id || null,
        hasViewer: !!document.getElementById("cph_ifViewer"),
        dateIds: [...document.querySelectorAll("input[id*='Date'],input[id*='date']")].map((el) => el.id).slice(0, 25),
        selectIds: [...document.querySelectorAll("select")].map((el) => `${el.id}`).slice(0, 30),
        nearbyFilterHints: labels.filter((t) =>
          /فرع|تاريخ|عميل|مورد|صنف|مخزن|مندوب|منطقة|فئة|ترتيب|حالة|اخفاء|عرض|موظف|ادارة|شهر|سنة|اصل|انتاج|خامة|قرض|حضور|اجازة/i.test(
            t
          )
        ),
      };
    },
    {
      monthYear: !!report.monthYear,
      asOf: !!report.asOf,
      hireDates: !!report.hireDates,
    }
  );
  console.log("prep", report.key, JSON.stringify(prep).slice(0, 500));

  await page.screenshot({ path: path.join(OUT, `${report.key}-before.png`), fullPage: true }).catch(() => null);

  let btn = await frame.$("#cph_btnShow");
  if (!btn) {
    const handle = await frame.evaluateHandle(
      () =>
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
  let lastSnap = null;
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    frame = (await getMain(page)) || frame;
    const snap = await frame
      .evaluate(() => {
        const v = document.getElementById("cph_ifViewer");
        const waitText = /برجاء الانتظار|انتظر/i.test(document.body?.innerText || "");
        const validation = /مطلوب|يجب اختيار|اختر/i.test(document.body?.innerText || "");
        const authDenied = /الوصول مرفوض|ليس لديك صلاحيات/i.test(document.body?.innerText || "");
        const emptyHint = /لا توجد|لا يوجد بيانات|لا يوجد سجلات|لا يوجد نتيجة/i.test(document.body?.innerText || "");
        const lnk = [...document.querySelectorAll("a[href*='downloadreport'],a[href*='showreport']")].map((a) => a.href);
        return {
          src: v?.getAttribute("src"),
          srcProp: v?.src,
          waitText,
          validation,
          authDenied,
          emptyHint,
          lnk,
          hint: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 280),
        };
      })
      .catch((e) => ({ errMsg: String(e) }));
    lastSnap = snap;

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
      "auth",
      !!snap.authDenied,
      "src",
      snap.src || snap.srcProp || snap.errMsg,
      "urls",
      foundUrls.length
    );
    if (foundUrls.length) break;
    if (snap.authDenied) break;
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

  let error = null;
  if (!pdfPath) {
    if (lastSnap?.authDenied) error = "authorization-denied-after-show";
    else if (lastSnap?.validation) error = "validation-or-required-field";
    else if (lastSnap?.emptyHint) error = "empty-or-no-data";
    else error = "no-pdf-url";
  }

  return {
    key: report.key,
    featureKey: report.featureKey,
    path: report.path,
    wave: report.wave,
    note: report.note || null,
    gate,
    prep,
    foundUrls,
    finalSrc,
    pdfPath,
    saved,
    netHits: netHits.length,
    lastSnap,
    error,
  };
}

(async () => {
  for (const d of Object.values(WAVE_OUT)) fs.mkdirSync(d, { recursive: true });

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
  const list = only.length ? REPORTS.filter((r) => only.includes(r.key) || only.includes(String(r.wave))) : REPORTS;
  const results = [];
  for (const report of list) {
    console.log("===", `W${report.wave}`, report.key);
    try {
      results.push(await captureOne(page, report));
    } catch (e) {
      console.error(report.key, e);
      results.push({
        key: report.key,
        featureKey: report.featureKey,
        path: report.path,
        wave: report.wave,
        error: String(e),
      });
    }
  }

  const summaryPath = "artifacts/mega-wave7-10-pdf-capture.json";
  fs.writeFileSync(summaryPath, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  for (const w of [7, 8, 9, 10]) {
    const waveResults = results.filter((r) => r.wave === w);
    fs.writeFileSync(
      path.join(WAVE_OUT[w], `wave${w}-pdf-capture.json`),
      JSON.stringify({ at: new Date().toISOString(), results: waveResults }, null, 2)
    );
  }

  console.log(
    "SUMMARY",
    JSON.stringify(
      results.map((r) => ({
        wave: r.wave,
        key: r.key,
        pdf: !!r.pdfPath,
        err: r.error,
        from: r.prep?.from,
        to: r.prep?.to,
        gate: r.gate?.authDenied || r.gate?.startScreen || null,
      })),
      null,
      2
    )
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
