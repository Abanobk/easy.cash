/**
 * محلّل تقرير "مراجع الحسابات الذكي" — النص القادم من النموذج اللغوي مش JSON منظم،
 * هو نص حر بييجي أحياناً بعناوين "### رقم) عنوان"، تشديد **كده**، روابط [[نص|مسار]]
 * (وأحياناً معكوسة [[مسار|نص]])، وفواصل "---"، رغم إن الأمر بالنظام يمنع الـMarkdown صراحة.
 * الهدف هنا: نتعامل مع أي من الشكلين بأمان ونعرضهم كتقرير منظم بصرياً، مش نص خام.
 */

export type NarrativeInline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; label: string; path: string };

export type NarrativeBlock =
  | { type: "paragraph"; parts: NarrativeInline[] }
  | { type: "bullets"; items: NarrativeInline[][] }
  | { type: "numbered"; items: NarrativeInline[][] };

export type NarrativeSection = {
  index: number | null;
  title: string;
  blocks: NarrativeBlock[];
};

export type ParsedNarrative = {
  intro: NarrativeBlock[];
  sections: NarrativeSection[];
};

const HEADING_RE = /^#{1,6}\s*(.+?)\s*#*$/;
const DIVIDER_RE = /^-{3,}$/;
const BULLET_RE = /^[-*]\s+(.+)$/;
const NUMBERED_RE = /^(\d+)[.)]\s+(.+)$/;
const SECTION_NUMBER_RE = /^(\d{1,2})[.)]\s*(.+)$/;
const INLINE_RE = /\*\*([^*]+)\*\*|\[\[([^|\]]+)\|([^\]]+)\]\]/g;

function looksLikePath(s: string): boolean {
  const t = s.trim();
  if (!t.includes("/")) return false;
  return /^\/?[a-zA-Z0-9/_-]+(\?[a-zA-Z0-9=&_%-]*)?$/.test(t);
}

function normalizePath(s: string): string {
  const t = s.trim();
  return t.startsWith("/") ? t : `/${t}`;
}

export function parseInline(text: string): NarrativeInline[] {
  const parts: NarrativeInline[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const start = m.index ?? 0;
    if (start > lastIndex) parts.push({ type: "text", text: text.slice(lastIndex, start) });

    if (m[1] !== undefined) {
      parts.push({ type: "bold", text: m[1] });
    } else {
      const a = (m[2] || "").trim();
      const b = (m[3] || "").trim();
      if (looksLikePath(b) && !looksLikePath(a)) {
        parts.push({ type: "link", label: a, path: normalizePath(b) });
      } else if (looksLikePath(a) && !looksLikePath(b)) {
        parts.push({ type: "link", label: b, path: normalizePath(a) });
      } else {
        // مفيش طرف منهم شكله مسار حقيقي — نعرضه كنص عادي بدل أقواس مكسورة
        parts.push({ type: "text", text: a || b });
      }
    }
    lastIndex = start + m[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: "text", text: text.slice(lastIndex) });
  return parts.length ? parts : [{ type: "text", text }];
}

function flushParagraph(buf: string[], blocks: NarrativeBlock[]) {
  const text = buf.join(" ").trim();
  if (text) blocks.push({ type: "paragraph", parts: parseInline(text) });
  buf.length = 0;
}

function pushList(items: string[][], kind: "bullets" | "numbered", blocks: NarrativeBlock[]) {
  if (!items.length) return;
  blocks.push({
    type: kind,
    items: items.map((lines) => parseInline(lines.join(" "))),
  } as NarrativeBlock);
}

function parseBody(lines: string[]): NarrativeBlock[] {
  const blocks: NarrativeBlock[] = [];
  let paraBuf: string[] = [];
  let listBuf: string[][] = [];
  let listKind: "bullets" | "numbered" | null = null;

  const flushList = () => {
    if (listKind) pushList(listBuf, listKind, blocks);
    listBuf = [];
    listKind = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || DIVIDER_RE.test(line)) {
      flushParagraph(paraBuf, blocks);
      flushList();
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    const numbered = NUMBERED_RE.exec(line);
    if (bullet) {
      flushParagraph(paraBuf, blocks);
      if (listKind !== "bullets") flushList();
      listKind = "bullets";
      listBuf.push([bullet[1]]);
      continue;
    }
    if (numbered) {
      flushParagraph(paraBuf, blocks);
      if (listKind !== "numbered") flushList();
      listKind = "numbered";
      listBuf.push([numbered[2]]);
      continue;
    }
    flushList();
    paraBuf.push(line);
  }
  flushParagraph(paraBuf, blocks);
  flushList();
  return blocks;
}

export function parseAuditNarrative(raw: string): ParsedNarrative {
  const lines = (raw || "").replace(/\r\n/g, "\n").split("\n");

  const introLines: string[] = [];
  const sections: { index: number | null; title: string; lines: string[] }[] = [];
  let current: { index: number | null; title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = HEADING_RE.exec(line.trim());
    if (heading) {
      const raw2 = heading[1].trim();
      const numbered = SECTION_NUMBER_RE.exec(raw2);
      current = numbered
        ? { index: Number(numbered[1]), title: numbered[2].trim(), lines: [] }
        : { index: null, title: raw2, lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else introLines.push(line);
  }

  return {
    intro: parseBody(introLines),
    sections: sections.map((s) => ({ index: s.index, title: s.title, blocks: parseBody(s.lines) })),
  };
}
