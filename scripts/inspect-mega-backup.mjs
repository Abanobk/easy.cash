#!/usr/bin/env node
/**
 * فحص باكب Mega Cash قراءة فقط — لا يعدّل الملف ولا يلمس قاعدة Mega الحية.
 *
 * الاستخدام:
 *   node scripts/inspect-mega-backup.mjs /path/to/backup.zip
 *   node scripts/inspect-mega-backup.mjs ./mega-kam-backup/
 *
 * ضع نسخة الباكب في: mega-kam-backup/
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// إعادة استخدام mapping بدون tsx إن أمكن — نسخ مبسّط هنا للـ .mjs
function normalizeEntityKey(name) {
  return name
    .replace(/\.(csv|json|xml|xlsx|xls|txt)$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "");
}

const ALIASES = {
  customers: ["customers", "customer", "عملاء", "cust", "clients"],
  suppliers: ["suppliers", "supplier", "موردين", "vendors"],
  items: ["items", "item", "اصناف", "أصناف", "products"],
  accounts: ["accounts", "account", "الحسابات", "chartofaccounts", "coa"],
  salesInvoices: ["salesinvoices", "sales_invoices", "فواتيرالبيع", "salesinvoice"],
  salesInvoiceItems: ["salesinvoiceitems", "salesinvoicedetails", "salesdetails"],
  purchaseInvoices: ["purchaseinvoices", "purchase_invoices", "فواتيرالشراء"],
  journalEntries: ["journalentries", "journal", "قيود"],
  journalEntryLines: ["journalentrylines", "journaldetails"],
  cashTransactions: ["cash", "cashtransactions", "حركاتنقدية"],
  bankAccounts: ["bankaccounts", "banks", "بنوك", "bank"],
  checks: ["checks", "cheques", "شيكات"],
  employees: ["employees", "موظفين"],
  warehouses: ["warehouses", "مخازن", "stores"],
};

function resolveEntity(name) {
  const key = normalizeEntityKey(name);
  for (const [entity, list] of Object.entries(ALIASES)) {
    for (const a of list) {
      const na = normalizeEntityKey(a);
      if (key === na || key.includes(na) || na.includes(key)) return entity;
    }
  }
  return null;
}

function sniffMagic(buf) {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) return "zip";
  if (buf.length >= 4 && buf[0] === 0x1f && buf[1] === 0x8b) return "gzip";
  if (buf.length >= 8 && buf.toString("ascii", 0, 8).includes("SQLite")) return "sqlite";
  if (buf.length >= 16 && buf.toString("ascii", 0, 16).includes("Microsoft")) return "ole_compound"; // Access mdb often
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  const head = buf.slice(0, 200).toString("utf8");
  if (head.trimStart().startsWith("{") || head.trimStart().startsWith("[")) return "json";
  if (/CREATE TABLE|INSERT INTO|BACKUP DATABASE/i.test(head)) return "sql";
  if (/,/.test(head) && /\n/.test(head)) return "csv_like";
  // SQL Server .bak often starts with specific headers
  if (buf.length > 100 && buf.toString("ascii", 0, 4) === "TAPE") return "mssql_bak";
  return "unknown_binary";
}

function listDirRecursive(dir, depth = 0, max = 200) {
  const out = [];
  if (out.length >= max || depth > 6) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push({ type: "dir", path: full, name: e.name });
      out.push(...listDirRecursive(full, depth + 1, max - out.length));
    } else {
      const st = fs.statSync(full);
      out.push({
        type: "file",
        path: full,
        name: e.name,
        size: st.size,
        entity: resolveEntity(e.name),
      });
    }
    if (out.length >= max) break;
  }
  return out;
}

function peekCsv(file, maxRows = 3) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, maxRows + 1);
  const headers = lines[0]?.split(/[,;\t]/).map((h) => h.replace(/^"|"$/g, "").trim()) || [];
  return { headers, sampleLines: lines.slice(1), rowEstimate: text.split(/\r?\n/).filter(Boolean).length - 1 };
}

function peekJson(file) {
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) {
    return {
      kind: "array",
      count: data.length,
      keys: data[0] ? Object.keys(data[0]) : [],
      sample: data[0] || null,
    };
  }
  if (data && typeof data === "object") {
    const keys = Object.keys(data);
    const summary = {};
    for (const k of keys.slice(0, 40)) {
      const v = data[k];
      summary[k] = Array.isArray(v) ? `array(${v.length})` : typeof v;
    }
    return {
      kind: "object",
      topKeys: keys,
      summary,
      isEasyCashBackup: !!(data.version && data.data),
      entity: resolveEntity(path.basename(file)),
    };
  }
  return { kind: "other" };
}

async function tryZipList(file) {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(file);
    return zip.getEntries().slice(0, 100).map((e) => ({
      name: e.entryName,
      size: e.header.size,
      isDir: e.isDirectory,
      entity: e.isDirectory ? null : resolveEntity(path.basename(e.entryName)),
    }));
  } catch {
    // fallback: unzip -l if available
    return null;
  }
}

function printReport(target, report) {
  console.log("\n========== Mega Backup Inspect (read-only) ==========");
  console.log("Path:", target);
  console.log(JSON.stringify(report, null, 2));
  console.log("=====================================================\n");
  const mapped = (report.files || report.zipEntries || [])
    .filter((f) => f.entity)
    .map((f) => `${f.name || f.path} → ${f.entity}`);
  if (mapped.length) {
    console.log("Matched entities:");
    for (const m of mapped) console.log(" -", m);
  } else {
    console.log("No known Mega table names matched yet — update server/mega-mapping.ts after review.");
  }
}

async function main() {
  const arg = process.argv[2] || path.join(root, "mega-kam-backup");
  const target = path.resolve(arg);

  if (!fs.existsSync(target)) {
    console.error("Not found:", target);
    console.error("Copy Mega backup (file or folder) into mega-kam-backup/ then re-run.");
    process.exit(1);
  }

  const st = fs.statSync(target);
  const report = { target, isDirectory: st.isDirectory(), inspectedAt: new Date().toISOString() };

  if (st.isDirectory()) {
    const files = listDirRecursive(target);
    report.files = files.filter((f) => f.type === "file");
    report.dirs = files.filter((f) => f.type === "dir").map((d) => d.path);
    report.entityHits = {};
    for (const f of report.files) {
      if (!f.entity) continue;
      report.entityHits[f.entity] = (report.entityHits[f.entity] || 0) + 1;
      if (/\.csv$/i.test(f.name)) {
        try {
          f.peek = peekCsv(f.path);
        } catch (e) {
          f.peekError = String(e.message || e);
        }
      }
      if (/\.json$/i.test(f.name)) {
        try {
          f.peek = peekJson(f.path);
        } catch (e) {
          f.peekError = String(e.message || e);
        }
      }
    }
  } else {
    const buf = fs.readFileSync(target);
    report.size = buf.length;
    report.format = sniffMagic(buf);
    report.entityGuess = resolveEntity(path.basename(target));

    if (report.format === "json") {
      report.peek = peekJson(target);
    } else if (report.format === "csv_like") {
      report.peek = peekCsv(target);
    } else if (report.format === "zip") {
      report.zipEntries = await tryZipList(target);
      if (!report.zipEntries) {
        report.note = "ZIP detected. Install adm-zip for listing, or extract manually to mega-kam-backup/";
      }
    } else if (report.format === "mssql_bak" || report.format === "unknown_binary") {
      report.note =
        "Binary SQL Server (.bak) or proprietary Mega backup. Restore ONLY on a disposable SQL Server instance (never on live Mega), then export tables to CSV/JSON into mega-kam-backup/.";
    } else if (report.format === "sql") {
      report.note = "SQL dump text — converter can parse INSERT statements in a later pass.";
      report.head = buf.slice(0, 500).toString("utf8");
    }
  }

  const outPath = path.join(root, "mega-kam-backup", "last-inspect-report.json");
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    report.reportSavedTo = outPath;
  } catch {
    /* ignore */
  }

  printReport(target, report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
