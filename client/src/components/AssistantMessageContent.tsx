import { Link } from "wouter";
import { tenantPath } from "@/lib/tenant";
import { parseAssistantContent } from "@/lib/assistant-links";

type Props = {
  content: string;
  tenantSlug: string;
};

function InlineLink({ label, path, tenantSlug }: { label: string; path: string; tenantSlug: string }) {
  const text = label === "اضغط هنا" || label === "اضغطى هنا" ? "اضغط هنا" : label;
  return (
    <Link href={tenantPath(tenantSlug, path)}>
      <span className="inline text-blue-600 underline underline-offset-2 font-medium hover:text-blue-800 cursor-pointer mx-0.5">
        {text}
      </span>
    </Link>
  );
}

function renderLine(line: string, tenantSlug: string, lineKey: number) {
  const parts = parseAssistantContent(line);
  return (
    <p key={lineKey} className="mb-1.5 last:mb-0 leading-relaxed">
      {parts.map((part, i) =>
        part.type === "text" ? (
          <span key={i}>{part.text}</span>
        ) : (
          <InlineLink key={i} label={part.label} path={part.path} tenantSlug={tenantSlug} />
        ),
      )}
    </p>
  );
}

export default function AssistantMessageContent({ content, tenantSlug }: Props) {
  const lines = content.split("\n").filter((l, i, arr) => l.trim() || i < arr.length - 1);

  return (
    <div className="text-sm text-right" dir="rtl">
      {lines.map((line, i) => renderLine(line, tenantSlug, i))}
    </div>
  );
}
