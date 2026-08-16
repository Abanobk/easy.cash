/**
 * تحويل ملفات باكب Mega (مجلد CSV/JSON أو Easy Cash JSON) → حمولة fullRestore.
 * لا يلمس قاعدة Mega الحية — يعمل على نسخة الملفات فقط.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveMegaEntity } from "./mega-mapping";
import type { FullRestorePayload } from "./full-restore";

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = lines[0].includes(";") && !lines[0].includes(",") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === delim && !inQ) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]).map((h) => h.replace(/^\uFEFF/, ""));
  const rows: Record<string, unknown>[] = [];
  for (const line of lines.slice(1)) {
    const cols = split(line);
    if (cols.every((c) => !c)) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function loadJsonFile(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".") || name === "last-inspect-report.json") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walkFiles(full));
    else if (/\.(csv|json)$/i.test(name)) out.push(full);
  }
  return out;
}

/**
 * يبني حمولة Easy Cash من:
 * - ملف easy-cash-backup-*.json (version + data)
 * - أو مجلد فيه CSV/JSON بأسماء جداول Mega
 */
export function buildPayloadFromMegaPath(targetPath: string): FullRestorePayload {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`المسار غير موجود: ${targetPath}`);
  }

  const st = fs.statSync(targetPath);

  if (st.isFile() && /\.json$/i.test(targetPath)) {
    const raw = loadJsonFile(targetPath) as any;
    if (raw?.data && typeof raw.data === "object") {
      return { version: raw.version || "mega-1.0", data: raw.data };
    }
    if (Array.isArray(raw)) {
      const entity = resolveMegaEntity(path.basename(targetPath)) || "customers";
      return { version: "mega-1.0", data: { [entity]: raw } };
    }
    throw new Error("ملف JSON غير معروف — توقّعنا { version, data } أو مصفوفة صفوف");
  }

  if (st.isFile() && /\.csv$/i.test(targetPath)) {
    const entity = resolveMegaEntity(path.basename(targetPath));
    if (!entity) throw new Error(`تعذر تحديد نوع الجدول من اسم الملف: ${path.basename(targetPath)}`);
    return { version: "mega-1.0", data: { [entity]: parseCsv(fs.readFileSync(targetPath, "utf8")) } };
  }

  if (!st.isDirectory()) {
    throw new Error(
      "صيغة الباكب غير مدعومة مباشرة (مثل .bak ثنائي). استخرج الجداول إلى CSV/JSON داخل مجلد mega-kam-backup ثم أعد المحاولة. لا تستعد الباكب على Mega الحي.",
    );
  }

  const data: Record<string, Record<string, unknown>[]> = {};
  const files = walkFiles(targetPath);
  if (!files.length) {
    throw new Error(
      `المجلد فارغ من CSV/JSON: ${targetPath}\nضع نسخة باكب Mega المستخرجة هنا (جداول كملفات)، ثم شغّل inspect ثم الاستيراد.`,
    );
  }

  for (const file of files) {
    const base = path.basename(file);
    const entity = resolveMegaEntity(base);
    if (!entity) continue;
    let rows: Record<string, unknown>[] = [];
    if (/\.csv$/i.test(file)) {
      rows = parseCsv(fs.readFileSync(file, "utf8"));
    } else {
      const raw = loadJsonFile(file) as any;
      if (Array.isArray(raw)) rows = raw;
      else if (raw?.data?.[entity]) rows = raw.data[entity];
      else if (raw?.rows) rows = raw.rows;
      else if (raw && typeof raw === "object") {
        // single object wrapper
        const arr = Object.values(raw).find((v) => Array.isArray(v));
        if (arr) rows = arr as Record<string, unknown>[];
      }
    }
    if (!rows.length) continue;
    if (!data[entity]) data[entity] = [];
    data[entity].push(...rows);
  }

  if (!Object.keys(data).length) {
    throw new Error(
      "لم تُطابق أي ملفات لجداول معروفة. راجع scripts/inspect-mega-backup.mjs وحدّث server/mega-mapping.ts.",
    );
  }

  return { version: "mega-1.0", data };
}

export function summarizePayload(payload: FullRestorePayload) {
  const summary: Record<string, number> = {};
  for (const [k, v] of Object.entries(payload.data || {})) {
    summary[k] = Array.isArray(v) ? v.length : 0;
  }
  return summary;
}
