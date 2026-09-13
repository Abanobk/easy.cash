/**
 * Login to Mega Cash, open every mapped report URL, extract filter labels/controls.
 * Organizes Mega report tabs for Easy Cash parity planning.
 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "https://km.mega-cash.net";
const USER = process.env.MEGA_USER || "test";
const PASS = process.env.MEGA_PASS || "112233445566";
const COMPANY = process.env.MEGA_COMPANY || "KM-01_01_2022";
const OUT_DIR = "/workspace/artifacts/mega-report-menu";
const OUT_JSON = path.join(OUT_DIR, "mega-report-filters-scan.json");
const OUT_MD = path.join(OUT_DIR, "MENU-MAP.md");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const inventory = JSON.parse(
  fs.readFileSync("/workspace/artifacts/mega-easy-report-inventory.json", "utf8")
);

/** Mega sidebar groups from user screenshots 2026-09-13 (RTL menu under التقارير) */
const MEGA_MENU_FROM_SCREENSHOTS = {
  source: "user screenshots 2026-09-13 km.mega-cash.net",
  groups: [
    {
      label: "تقارير المخازن",
      note: "expanded structure not in this batch — Easy has 10 inv reports",
      children: null,
    },
    {
      label: "تقارير الحسابات",
      note: "not expanded in screenshots — open live for full list",
      children: null,
    },
    {
      label: "تقارير المبيعات",
      children: [
        "كشف حساب عميل",
        "كشف حساب عميل بالاصناف",
        "المبيعات بالاصناف",
        "البيع",
        "قائمة العملاء",
        "اعمار الديون",
        "اعمار الديون سنوي",
        "اعمار الديون نصف سنوي",
        "فواتير بيع مستحقة",
        "طلبات البيع",
        "ملخص حركة العملاء",
        "ملخص حركة المناطق",
        "مبيعات الاصناف شهريا بالكميات",
        "مبيعات الاصناف شهريا",
        "اخر سعر بيع / شراء",
        "المبيعات بالعملاء",
      ],
    },
    {
      label: "تقارير الارباح",
      children: ["ارباح الاصناف", "ارباح العملاء", "ارباح الفواتير"],
    },
    {
      label: "تقارير المندوبين",
      children: [
        "مبيعات المندوبين بالاصناف",
        "تحصيلات المندوبين",
        "يومية مندوب",
        "مديونية مندوب",
      ],
    },
    {
      label: "تقارير المشتريات",
      children: [
        "كشف حساب مورد",
        "كشف حساب مورد بالاصناف",
        "الشراء",
        "قائمة الموردين",
        "فواتير شراء مستحقة",
        "المشتريات بالاصناف",
        "ملخص حركة الموردين",
        "المشتريات بالموردين",
        "طلبات الشراء",
      ],
    },
    {
      label: "تقارير التحصيل والسداد",
      children: [
        "الشيكات الصادرة",
        "الشيكات الواردة",
        "اقساط العملاء",
        "معاملات نقدية وبنكية",
        "الاستحقاقات",
      ],
      note: "Easy currently lists supplier aging (اعمار ديون الموردين) under this group instead of الاستحقاقات — verify live",
    },
    {
      label: "تقارير الانتاج",
      children: ["اوامر الانتاج", "خامات وتوالف الانتاج"],
    },
    {
      label: "تقارير شئون الموظفين",
      children: [
        "حضور وانصراف الموظفين",
        "اجازات الموظفين",
        "رواتب الموظفين",
        "قائمة رواتب الموظفين",
        "موظفين تحت الطلب",
        "قائمة الموظفين",
        "السلف",
      ],
    },
    {
      label: "تقارير الاصول الثابتة",
      children: ["اهلاكات الاصول الثابتة", "الاصول المباعة"],
    },
    {
      label: "التقارير الختامية",
      children: [
        "دفتر اليومية",
        "الاستاذ العام",
        "الاستاذ المساعد",
        "ميزان المراجعة",
        "تكلفة المبيعات",
        "قائمة الدخل",
        "الميزانية العمومية",
        "قائمة المركز المالي",
        "التدفقات النقدية",
      ],
    },
  ],
};

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(1500);
  await page.waitForSelector("input[type=password]", { timeout: 30000 });

  // Fill company if present, then user/pass
  await page.evaluate(
    (company, user, pass) => {
      const texts = [...document.querySelectorAll("input[type=text]")];
      // Heuristic: company often first text field, username last before password
      if (texts.length >= 2 && company) {
        const companyEl = texts[0];
        companyEl.focus();
        companyEl.value = company;
        companyEl.dispatchEvent(new Event("input", { bubbles: true }));
        companyEl.dispatchEvent(new Event("change", { bubbles: true }));
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
      document.querySelector("input[type=submit], button[type=submit]")?.click();
    },
    COMPANY,
    USER,
    PASS
  );

  await Promise.race([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => null),
    sleep(8000),
  ]);

  // Handle "already logged in" / continue session dialog
  await page.evaluate(() => {
    const t = document.body?.innerText || "";
    if (/مسجل|logged|جلسة|متصل/i.test(t)) {
      const btn = [...document.querySelectorAll("input,button,a")].find((el) =>
        /متابعة|استمرار|نعم|OK|دخول|Continue/i.test((el.value || el.innerText || "") + "")
      );
      btn?.click();
    }
  });
  await sleep(2500);
  return page.url();
}

async function getMain(page) {
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find((fr) => fr.name() === "MainIframe");
    if (f) return f;
    await sleep(200);
  }
  return page.mainFrame();
}

async function openReport(page, reportPath) {
  await page.evaluate((u) => {
    const ifr = document.querySelector("#MainIframe, iframe[name=MainIframe]");
    if (ifr) ifr.src = u;
    else location.href = u;
  }, reportPath.startsWith("http") ? reportPath : `${BASE}${reportPath}`);
  await sleep(2200);
  return getMain(page);
}

function extractFilters(frame) {
  return frame.evaluate(() => {
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const labels = [];
    const controls = [];

    // label[for] associations
    for (const lab of document.querySelectorAll("label")) {
      const text = clean(lab.innerText || lab.textContent);
      if (text && text.length < 80) labels.push(text);
    }

    // nearby text for inputs
    const pickNearby = (el) => {
      const id = el.id;
      if (id) {
        const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (byFor) return clean(byFor.innerText);
      }
      const parent = el.closest("td, div, li, span, label");
      const prev = el.previousElementSibling;
      const candidates = [
        parent?.querySelector("label, span, b, strong, .caption, .field-label"),
        prev,
        parent,
      ];
      for (const c of candidates) {
        if (!c) continue;
        const t = clean(c.innerText || c.textContent);
        if (t && t.length > 1 && t.length < 60 && t !== clean(el.value)) return t.split("\n")[0];
      }
      return clean(el.getAttribute("placeholder") || el.name || el.id || "");
    };

    for (const el of document.querySelectorAll("input, select, textarea")) {
      const type = (el.getAttribute("type") || el.tagName).toLowerCase();
      if (["hidden", "submit", "button", "image", "file"].includes(type)) continue;
      const nearby = pickNearby(el);
      let options = [];
      if (el.tagName === "SELECT") {
        options = [...el.options]
          .slice(0, 40)
          .map((o) => clean(o.text))
          .filter(Boolean);
      }
      controls.push({
        tag: el.tagName.toLowerCase(),
        type,
        id: el.id || null,
        name: el.name || null,
        nearbyLabel: nearby,
        checked: el.type === "checkbox" || el.type === "radio" ? !!el.checked : undefined,
        optionCount: options.length || undefined,
        options: options.length ? options : undefined,
      });
    }

    // Visible title / breadcrumb
    const title =
      clean(document.querySelector(".page-title, h1, h2, .Title, #cph_lblTitle")?.innerText) ||
      clean(document.title);

    // Buttons
    const buttons = [...document.querySelectorAll("input[type=submit], input[type=button], button, a.btn")]
      .map((el) => clean(el.value || el.innerText))
      .filter((t) => t && t.length < 40)
      .slice(0, 30);

    // Body snippet for empty/error pages
    const bodyText = clean(document.body?.innerText || "").slice(0, 400);

    return {
      title,
      labels: [...new Set(labels)].slice(0, 80),
      controls,
      buttons: [...new Set(buttons)],
      bodyPreview: bodyText,
      url: location.href,
    };
  });
}

async function scrapeSidebar(page) {
  try {
    return await page.evaluate(() => {
      const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const links = [...document.querySelectorAll("a")]
        .map((a) => ({
          text: clean(a.innerText),
          href: a.getAttribute("href") || "",
        }))
        .filter((x) => x.text && /تقرير|ميزان|استاذ|كشف|مبيعات|مشتريات|مخزن|اصل|راتب|شيك|قيد|يومية|دخل|ميزانية|تدفق|اهلاك|انتاج|مندوب|ارباح|اعمار|قائمة|ملخص|حضور|سلف|اقساط/i.test(x.text))
        .slice(0, 200);
      return links;
    });
  } catch {
    return [];
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  const loginUrl = await login(page);
  console.log("login ->", loginUrl);

  // Session continue may need second pass
  if (/Login/i.test(page.url())) {
    console.log("still on login, retrying fill...");
    await login(page);
    console.log("retry ->", page.url());
  }

  const sidebarLinks = await scrapeSidebar(page);
  const items = inventory.items.filter((i) => i.megaUrl);
  const results = [];

  // Prioritize waves: sales, purchases, accounting, final, inventory, collections, rest
  const waveOrder = (key) => {
    if (/sales|customer|debit|matureinvoice|lastprice|areassummary/i.test(key)) return 1;
    if (/purchase|vendor|credit|maturereceipt/i.test(key)) return 2;
    if (/accountstatment|costcenter|branchessummary|monthlyexpense|dashboard/i.test(key)) return 3;
    if (/finalreports|generaljournal/i.test(key)) return 4;
    if (/invreports/i.test(key)) return 5;
    if (/check|payment|installment/i.test(key)) return 6;
    return 7;
  };
  items.sort((a, b) => waveOrder(a.featureKey) - waveOrder(b.featureKey));

  for (const item of items) {
    const megaPath = item.megaUrl.includes("://")
      ? item.megaUrl
      : item.megaUrl.startsWith("/")
        ? item.megaUrl
        : `/${item.megaUrl}`;
    process.stdout.write(`scan ${item.featureKey} ... `);
    try {
      const frame = await openReport(page, megaPath);
      await sleep(800);
      const filters = await extractFilters(frame);
      // screenshot first wave only to keep size down
      let shot = null;
      if (waveOrder(item.featureKey) <= 2) {
        shot = path.join(OUT_DIR, `filters-${item.featureKey}.png`);
        await page.screenshot({ path: shot, fullPage: false });
      }
      results.push({
        featureKey: item.featureKey,
        megaUrl: item.megaUrl,
        ok: true,
        wave: waveOrder(item.featureKey),
        screenshot: shot,
        ...filters,
      });
      console.log(`ok controls=${filters.controls.length} title=${filters.title?.slice(0, 40)}`);
    } catch (e) {
      results.push({
        featureKey: item.featureKey,
        megaUrl: item.megaUrl,
        ok: false,
        error: String(e?.message || e),
      });
      console.log("FAIL", e?.message || e);
    }
  }

  const payload = {
    scannedAt: new Date().toISOString(),
    loginUrl,
    company: COMPANY,
    user: USER,
    megaMenuFromScreenshots: MEGA_MENU_FROM_SCREENSHOTS,
    sidebarLinksSample: sidebarLinks,
    count: results.length,
    okCount: results.filter((r) => r.ok).length,
    results,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));

  // Build markdown map
  const lines = [
    "# خريطة تبويبات تقارير ميجا ↔ إيزي كاش",
    "",
    `مصدر القائمة: لقطات مستخدم 2026-09-13 + مسح حي للفورم \`${path.basename(OUT_JSON)}\`.`,
    "",
    "## مجموعات القائمة (من اللقطات)",
    "",
  ];
  for (const g of MEGA_MENU_FROM_SCREENSHOTS.groups) {
    lines.push(`### ${g.label}`);
    if (g.note) lines.push(`_${g.note}_`);
    if (g.children?.length) {
      for (const c of g.children) lines.push(`- ${c}`);
    } else {
      lines.push("- _(افتح في ميجا لاستخراج العناصر)_");
    }
    lines.push("");
  }
  lines.push("## نتائج المسح الحي (فلاتر)");
  lines.push("");
  lines.push("| featureKey | controls | title | wave |");
  lines.push("|---|---:|---|---:|");
  for (const r of results) {
    lines.push(
      `| \`${r.featureKey}\` | ${r.ok ? r.controls?.length ?? 0 : "ERR"} | ${(r.title || r.error || "").replace(/\|/g, "/").slice(0, 50)} | ${r.wave ?? ""} |`
    );
  }
  lines.push("");
  lines.push("## فجوات ملحوظة من اللقطات");
  lines.push("- ميجا تحت التحصيل/السداد يظهر **الاستحقاقات**؛ إيزي حالياً يعرض أعمار ديون الموردين في نفس المجموعة — يحتاج تحقق من صفحة ميجا.");
  lines.push("- تقارير المخازن والحسابات لم تُوسَّع في اللقطات؛ المسح الحي يغطي الـ URLs المعروفة.");
  lines.push("- مطابقة الأعمدة/PDF ما زالت موجات: P0 محاسبة شبه مكتمل؛ موجة 1 مبيعات ثم مشتريات ثم مخازن.");
  fs.writeFileSync(OUT_MD, lines.join("\n"));

  console.log("wrote", OUT_JSON, OUT_MD);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
