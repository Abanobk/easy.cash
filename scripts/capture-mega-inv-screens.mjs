/**
 * Capture Mega Inv screens via MainIframe (operational forms + lists).
 * Evidence only — do not invent labels.
 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "https://km.mega-cash.net";
const OUT = "artifacts/mega-inv-screens";
const USER = process.env.MEGA_USER || "test";
const PASS = process.env.MEGA_PASS || "112233445566";
const COMPANY = process.env.MEGA_COMPANY || "KM-01_01_2022";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCREENS = [
  { key: "stores", path: "/Inv/Stores.aspx", label: "المخازن" },
  { key: "categories", path: "/Inv/Categories.aspx", label: "فئات الاصناف" },
  { key: "item", path: "/Inv/Items.aspx", label: "صنف" },
  { key: "items-list", path: "/Inv/ItemsList.aspx", label: "قائمة الاصناف" },
  { key: "inventory-correction", path: "/Inv/InventoryCorrection.aspx", label: "تسوية مخزنية" },
  { key: "inventory-correction-list", path: "/Inv/InventoryDocumentsList.aspx/InvCorr", label: "قائمة التسويات المخزنية" },
  { key: "inventory-transfer", path: "/Inv/InventoryTransfer.aspx", label: "تحويل مخزني" },
  { key: "inventory-transfer-list", path: "/Inv/InventoryDocumentsList.aspx/InvTrans", label: "قائمة التحويلات المخزنية" },
  { key: "beginning-inventory", path: "/Inv/BeginingInventory.aspx?OneUser=1", label: "مخزون اول المدة" },
  { key: "price-changer", path: "/Inv/PriceChanger.aspx", label: "تغيير الاسعار" },
  { key: "items-batches", path: "/Inv/ItemsBatches.aspx", label: "ارقام التشغيلة" },
  { key: "item-serials", path: "/Inv/ItemSerials.aspx", label: "الأرقام التسلسلية" },
  { key: "offers", path: "/Inv/Offers.aspx", label: "العروض" },
];

fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

function uniq(arr) {
  return [...new Set(arr.map((s) => String(s || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
}

async function login(page) {
  await page.goto(`${BASE}/Login.aspx`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(1500);
  // select company if listed
  await page.evaluate((company) => {
    const hit = [...document.querySelectorAll("a,button,li,div,span")]
      .find((el) => (el.innerText || "").trim() === company);
    hit?.click();
  }, COMPANY);
  await sleep(500);
  await page.waitForSelector("#txtUserName, input[type=password]", { timeout: 30000 });
  await page.type("#txtUserName", USER, { delay: 20 });
  await page.type("#txtPassword", PASS, { delay: 20 });
  await Promise.all([
    page.click("#Login").catch(() => page.click("input[type=submit]")),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => null),
  ]);
  await sleep(2000);
  // continue session dialog if any
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("input,button,a")].find((el) =>
      /متابعة|استمرار|نعم|OK|دخول/i.test((el.value || el.innerText || "") + "")
    );
    btn?.click();
  });
  await sleep(2000);
}

async function getMain(page) {
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find((fr) => fr.name() === "MainIframe");
    if (f) return f;
    await sleep(200);
  }
  return null;
}

async function openPath(page, invPath) {
  await page.evaluate((u) => {
    const ifr = document.querySelector("#MainIframe, iframe[name=MainIframe]");
    if (ifr) ifr.src = u;
  }, `${BASE}${invPath}`);
  await sleep(4500);
  return getMain(page);
}

async function extract(frame) {
  return frame.evaluate(() => {
    const textOf = (el) => (el?.innerText || el?.textContent || el?.value || "").replace(/\s+/g, " ").trim();
    const labels = [...document.querySelectorAll("label, .control-label, td.Label, span.Label, .AspLabel, .form-group > span, legend")]
      .map(textOf)
      .filter((t) => t && t.length < 80);
    const headers = [...document.querySelectorAll("table th, .rgHeader, .HeaderStyle th, .GridHeader th, thead th, thead td, .RadGrid th")]
      .map(textOf)
      .filter(Boolean);
    const buttons = [...document.querySelectorAll("input[type=submit],input[type=button],button,a.btn,.btn")]
      .map((el) => textOf(el) || el.value || "")
      .filter((t) => t && t.length < 60);
    const selects = [...document.querySelectorAll("select")].map((el) => ({
      id: el.id,
      name: el.name,
      options: [...el.options].map((o) => o.text.trim()).filter(Boolean).slice(0, 12),
      nearby: textOf(el.closest("td,div")?.querySelector("label,span")) || "",
    }));
    const inputs = [...document.querySelectorAll("input[type=text],input[type=date],input[type=number],textarea")]
      .map((el) => ({
        id: el.id,
        name: el.name,
        type: el.getAttribute("type") || el.tagName.toLowerCase(),
        placeholder: el.getAttribute("placeholder") || "",
        nearby: textOf(el.closest("td,div")?.querySelector("label,span")) || textOf(el.previousElementSibling) || "",
      }))
      .slice(0, 60);
    const title =
      textOf(document.querySelector("h1,h2,.page-title,#lblTitle,.Title,.content-header,#ContentPlaceHolder1_lblTitle")) ||
      document.title;
    const body = (document.body?.innerText || "").slice(0, 2000);
    return { title, labels, headers, buttons, selects, inputs, bodyStart: body, url: location.href };
  });
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.setDefaultTimeout(90000);

await login(page);
console.log("logged", page.url());

const results = [];
for (const screen of SCREENS) {
  console.log("GOTO", screen.key, screen.path);
  try {
    const frame = await openPath(page, screen.path);
    if (!frame) {
      results.push({ key: screen.key, error: "no-MainIframe" });
      console.log("FAIL no iframe", screen.key);
      continue;
    }
    // click show/search if present on list screens
    await frame.evaluate(() => {
      const btns = [...document.querySelectorAll("input[type=submit],input[type=button],button,a")];
      const show = btns.find((b) => /عرض|بحث|Search|Show|Load/i.test((b.value || b.innerText || "").trim()));
      show?.click();
    }).catch(() => {});
    await sleep(2500);
    const info = await extract(frame);
    info.labels = uniq(info.labels);
    info.headers = uniq(info.headers);
    info.buttons = uniq(info.buttons).slice(0, 30);
    info.key = screen.key;
    info.megaLabel = screen.label;
    info.path = screen.path;
    // screenshot of whole page (iframe area visible)
    await page.screenshot({ path: path.join(OUT, "screenshots", `${screen.key}.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(OUT, `${screen.key}.json`), JSON.stringify(info, null, 2));
    console.log("OK", screen.key, "headers=", info.headers.length, "labels=", info.labels.length, "title=", info.title);
    results.push(info);
  } catch (e) {
    console.error("FAIL", screen.key, e.message);
    results.push({ key: screen.key, error: e.message });
  }
}

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2));
await browser.close();
console.log("DONE");
