import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "https://km.mega-cash.net";
const OUT = "artifacts/mega-wave1-sales/pdf";
const COMPANY = "KM-01_01_2022";
const USER = "test";
const PASS = "112233445566";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REPORTS = [
  { key: "sales", path: "/AccountingReports/Sales.aspx" },
];

function extractShowReportUrls(text) {
  const urls = new Set();
  for (const re of [
    /\/(?:show|download)report\/[^\s"'<>\\]+/gi,
    /https?:\/\/[^"'\\\s]+\/(?:show|download)report\/[^"'\\\s]+/gi,
  ]) {
    for (const m of text.matchAll(re)) urls.add(m[0].replace(/&amp;/g, "&"));
  }
  for (const re of [
    /id=["']cph_ifViewer["'][^>]*src=["']([^"']+)["']/gi,
    /src=["']([^"']*showreport[^"']*)["']/gi,
  ]) {
    for (const m of text.matchAll(re)) if (m[1] && m[1] !== "about:blank") urls.add(m[1]);
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: path.resolve(OUT) });

  const netHits = [];
  page.on("response", async (res) => {
    try {
      const url = res.url();
      const method = res.request().method();
      const ct = (res.headers()["content-type"] || "") + "";
      const cd = (res.headers()["content-disposition"] || "") + "";
      const interesting =
        /showreport|downloadreport|\.pdf/i.test(url) ||
        /pdf/i.test(ct + cd) ||
        (method === "POST" && /AccountingReports\/.+\.aspx/i.test(url));
      if (!interesting) return;
      const buf = await res.buffer().catch(() => null);
      const item = { url, method, ct, cd, status: res.status(), size: buf?.length || 0 };
      if (buf) {
        const isPdf = buf.slice(0, 5).toString() === "%PDF-";
        const fname = isPdf ? `net-${netHits.length + 1}.pdf` : `net-${netHits.length + 1}.txt`;
        fs.writeFileSync(path.join(OUT, fname), buf);
        item.saved = fname;
        if (!isPdf) {
          const text = buf.toString("utf8");
          item.urls = extractShowReportUrls(text);
          // also search for any src= with report
          item.hasIfViewer = /ifViewer|showreport/i.test(text);
          item.pipeParts = text.startsWith("1|#") || text.includes("|updatePanel|");
          item.snippet = text.slice(0, 800);
          // save script blocks
          const scripts = [...text.matchAll(/\|scriptBlock\|[^|]*\|([\s\S]*?)(?=\|\d+\|)/g)].map((m) => m[1]).slice(0, 20);
          item.scripts = scripts.map((s) => s.slice(0, 500));
        }
      }
      netHits.push(item);
      console.log("NET", item.method, item.status, item.ct.slice(0, 40), item.url.slice(0, 100), item.saved, item.urls);
    } catch (e) {
      console.log("net err", e.message);
    }
  });

  await login(page);
  console.log("logged in", page.url());

  const report = REPORTS[0];
  const frame = await openReport(page, report.path);
  if (!frame) throw new Error("no MainIframe");

  // Prep dates + disable validators
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
    const okFrom = setDate("cph_txtDateFrom", "1/1/2022");
    const okTo = setDate("cph_txtDateTo", "3/1/2022");
    document.body.click();
    try {
      if (typeof Page_Validators !== "undefined") {
        for (const v of Page_Validators) {
          v.enabled = false;
          v.isvalid = true;
        }
      }
      window.Page_ValidationActive = false;
      // ValidatorOnSubmit always true
      window.ValidatorOnSubmit = function () {
        return true;
      };
      window.Page_ClientValidate = function () {
        return true;
      };
    } catch {}
    return {
      okFrom,
      okTo,
      from: document.getElementById("cph_txtDateFrom")?.value,
      to: document.getElementById("cph_txtDateTo")?.value,
      btn: !!document.getElementById("cph_btnShow"),
    };
  });
  console.log("prep", prep);

  // Method A: native DOM click on button (non-strict page context via click handler)
  await frame.click("#cph_btnShow").catch(() => null);
  await sleep(1000);

  // Method B if no network yet: set event target and submit form without WebForm helpers
  if (netHits.length === 0) {
    console.log("fallback form submit");
    await frame.evaluate(() => {
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
      const et = document.getElementById("__EVENTTARGET");
      const ea = document.getElementById("__EVENTARGUMENT");
      if (et) et.value = "ctl00$cph$btnShow";
      if (ea) ea.value = "";
      const form = document.forms[0];
      // Prefer ASP.NET AJAX async postback if available
      try {
        const prm = Sys.WebForms.PageRequestManager.getInstance();
        if (prm && !prm.get_isInAsyncPostBack()) {
          // trigger unique async postback by setting form and calling _doPostBack
          // Use the button's name as submitter
          const btn = document.getElementById("cph_btnShow");
          // Create a temporary input to submit
          const inp = document.createElement("input");
          inp.type = "hidden";
          inp.name = "ctl00$cph$btnShow";
          inp.value = "عرض";
          form.appendChild(inp);
          // Use requestSubmit if available
          if (form.requestSubmit) form.requestSubmit(btn);
          else form.submit();
          return "submit";
        }
      } catch (e) {
        return "prm-err " + e;
      }
      document.getElementById("cph_btnShow")?.click();
      return "click2";
    });
  }

  let foundUrls = [];
  let finalSrc = null;
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const snap = await frame.evaluate(() => {
      const v = document.getElementById("cph_ifViewer");
      const waitText = (document.body?.innerText || "").includes("برجاء الانتظار");
      const waitEls = [...document.querySelectorAll(".inProgressDiv, .jqifade, .WaitWord, [id*=Wait], .blockUI")];
      const waitVis = waitEls.some((el) => {
        const s = getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden";
      });
      // any links added by ViewReports
      const lnk = document.getElementById("lnkReportDownload") || document.getElementById("lnkReportInNewTab");
      return {
        src: v?.getAttribute("src"),
        srcProp: v?.src,
        waitText,
        waitVis,
        lnk: lnk?.href || null,
        htmlShow: /showreport/i.test(document.documentElement.innerHTML),
      };
    }).catch((e) => ({ err: String(e) }));

    for (const h of netHits) {
      if (h.urls?.length) foundUrls.push(...h.urls);
      if (/showreport|downloadreport/i.test(h.url)) foundUrls.push(h.url);
    }
    if (snap.lnk) foundUrls.push(snap.lnk);
    if (snap.src && snap.src !== "about:blank") {
      finalSrc = snap.src;
      foundUrls.push(snap.src);
    }
    const viewer = page.frames().find((f) => f.name() === "ifViewer");
    console.log("tick", i, "wait", !!(snap.waitVis || snap.waitText), "src", snap.src || snap.srcProp, "lnk", snap.lnk, "net", netHits.length, "viewer", viewer?.url());

    if (foundUrls.length || (viewer && viewer.url() !== "about:blank")) {
      if (viewer && viewer.url() !== "about:blank") foundUrls.push(viewer.url());
      break;
    }

    // If still nothing at tick 3, try clicking with puppeteer mouse on button coordinates
    if (i === 3 && netHits.length === 0) {
      console.log("retry mouse click");
      const btn = await frame.$("#cph_btnShow");
      if (btn) {
        await btn.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await sleep(300);
        await btn.click({ delay: 50 });
      }
    }
  }

  foundUrls = [...new Set(foundUrls)];
  console.log("foundUrls", foundUrls);
  console.log(
    "netHits detail",
    JSON.stringify(
      netHits.map((h) => ({
        saved: h.saved,
        urls: h.urls,
        hasIfViewer: h.hasIfViewer,
        pipe: h.pipeParts,
        scripts: h.scripts,
        snippet: h.snippet?.slice(0, 300),
      })),
      null,
      2
    )
  );

  const cookies = await page.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
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
        const name = `${report.key}-${isPdf ? "dl" : "raw"}-${saved.length}.${isPdf ? "pdf" : "bin"}`;
        fs.writeFileSync(path.join(OUT, name), buf);
        saved.push({ vu, status: r.status, ct: r.headers.get("content-type"), size: buf.length, name, isPdf });
        console.log("downloaded", name, r.status, buf.length, isPdf);
        if (isPdf) fs.copyFileSync(path.join(OUT, name), path.join(OUT, `${report.key}.pdf`));
      } catch (e) {
        saved.push({ vu, err: String(e) });
      }
    }
  }

  await page.screenshot({ path: path.join(OUT, `${report.key}-final.png`), fullPage: true });
  try {
    const body = await frame.$("body");
    if (body) await body.screenshot({ path: path.join(OUT, `${report.key}-frame.png`) });
  } catch {}

  fs.writeFileSync(
    path.join(OUT, "capture-pdf-summary.json"),
    JSON.stringify({ prep, foundUrls, finalSrc, saved, netHits }, null, 2)
  );
  console.log("DONE", { foundUrls, saved });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
