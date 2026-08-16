export type AssistantLink = { label: string; path: string };

export type AssistantContentPart =
  | { type: "text"; text: string }
  | { type: "link"; label: string; path: string };

const LINK_PATTERN = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

export function parseAssistantLinks(text: string): AssistantLink[] {
  const links: AssistantLink[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(LINK_PATTERN)) {
    const path = m[2].trim();
    if (!path.startsWith("/")) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    links.push({ label: m[1].trim(), path });
  }
  return links;
}

/** يقسّم نص المساعد إلى نص عادي وروابط inline */
export function parseAssistantContent(text: string): AssistantContentPart[] {
  const parts: AssistantContentPart[] = [];
  let lastIndex = 0;

  for (const m of text.matchAll(LINK_PATTERN)) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, start) });
    }
    const path = m[2].trim();
    if (path.startsWith("/")) {
      parts.push({ type: "link", label: m[1].trim(), path });
    } else {
      parts.push({ type: "text", text: m[0] });
    }
    lastIndex = start + m[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text", text }];
}
