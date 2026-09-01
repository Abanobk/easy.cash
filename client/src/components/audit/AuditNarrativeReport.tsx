import type { ComponentType } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  BarChart3,
  FileSearch,
  Flag,
  GitCompare,
  Landmark,
  ListChecks,
  Lock,
  Scale,
  SearchCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { tenantPath } from "@/lib/tenant";
import {
  parseAuditNarrative,
  type NarrativeBlock,
  type NarrativeInline,
  type NarrativeSection,
} from "@/lib/audit-narrative";

type IconType = ComponentType<{ size?: number; className?: string }>;

const KEYWORD_ICONS: Array<{ test: RegExp; icon: IconType; tone: string }> = [
  { test: /ميزان|توازن/, icon: Scale, tone: "emerald" },
  { test: /بنك|كشوف/, icon: Landmark, tone: "sky" },
  { test: /مطابق|ذمم/, icon: GitCompare, tone: "violet" },
  { test: /مستند|ثغر/, icon: FileSearch, tone: "amber" },
  { test: /فتر|هامش|مقارن/, icon: BarChart3, tone: "indigo" },
  { test: /سيول/, icon: Wallet, tone: "teal" },
  { test: /إقفال|جاهزي/, icon: Lock, tone: "rose" },
  { test: /ملاحظ|متكرر/, icon: AlertTriangle, tone: "orange" },
  { test: /عين/, icon: SearchCheck, tone: "cyan" },
  { test: /خطة|تصحيح/, icon: ListChecks, tone: "blue" },
  { test: /خاتم|ختام|إدار/, icon: Flag, tone: "slate" },
];

const TONE_STYLES: Record<string, { bar: string; chip: string; icon: string }> = {
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", icon: "text-emerald-600" },
  sky: { bar: "bg-sky-500", chip: "bg-sky-50 text-sky-700", icon: "text-sky-600" },
  violet: { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700", icon: "text-violet-600" },
  amber: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700", icon: "text-amber-600" },
  indigo: { bar: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700", icon: "text-indigo-600" },
  teal: { bar: "bg-teal-500", chip: "bg-teal-50 text-teal-700", icon: "text-teal-600" },
  rose: { bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700", icon: "text-rose-600" },
  orange: { bar: "bg-orange-500", chip: "bg-orange-50 text-orange-700", icon: "text-orange-600" },
  cyan: { bar: "bg-cyan-500", chip: "bg-cyan-50 text-cyan-700", icon: "text-cyan-600" },
  blue: { bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700", icon: "text-blue-600" },
  slate: { bar: "bg-slate-500", chip: "bg-slate-50 text-slate-700", icon: "text-slate-600" },
};

function iconFor(title: string) {
  const hit = KEYWORD_ICONS.find((k) => k.test.test(title));
  return hit ? { Icon: hit.icon, tone: hit.tone } : { Icon: Sparkles, tone: "slate" };
}

function Inline({ part, tenantSlug }: { part: NarrativeInline; tenantSlug: string | null }) {
  if (part.type === "bold") return <strong className="font-semibold text-slate-900">{part.text}</strong>;
  if (part.type === "link") {
    return (
      <Link href={tenantPath(tenantSlug, part.path)}>
        <span className="mx-0.5 cursor-pointer font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800">
          {part.label || "فتح الشاشة"}
        </span>
      </Link>
    );
  }
  return <>{part.text}</>;
}

function Block({ block, tenantSlug, bkey }: { block: NarrativeBlock; tenantSlug: string | null; bkey: number }) {
  if (block.type === "paragraph") {
    return (
      <p key={bkey} className="text-sm leading-7 text-slate-700">
        {block.parts.map((p, i) => (
          <Inline key={i} part={p} tenantSlug={tenantSlug} />
        ))}
      </p>
    );
  }
  const ListTag = block.type === "numbered" ? "ol" : "ul";
  return (
    <ListTag
      key={bkey}
      className={`space-y-1.5 text-sm leading-7 text-slate-700 ${
        block.type === "numbered" ? "list-decimal pr-5" : "list-none"
      }`}
    >
      {block.items.map((parts, i) => (
        <li key={i} className={block.type === "bullets" ? "flex gap-2" : undefined}>
          {block.type === "bullets" ? <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" /> : null}
          <span>
            {parts.map((p, j) => (
              <Inline key={j} part={p} tenantSlug={tenantSlug} />
            ))}
          </span>
        </li>
      ))}
    </ListTag>
  );
}

function SectionCard({ section, tenantSlug }: { section: NarrativeSection; tenantSlug: string | null }) {
  const { Icon, tone } = iconFor(section.title);
  const styles = TONE_STYLES[tone] || TONE_STYLES.slate;
  if (!section.blocks.length) return null;
  return (
    <article id={`audit-sec-${section.index ?? section.title}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm scroll-mt-24">
      <div className={`absolute inset-y-0 right-0 w-1 ${styles.bar}`} />
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.chip}`}>
          <Icon size={17} className={styles.icon} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {section.index !== null ? (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
              {section.index}
            </span>
          ) : null}
          <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
        </div>
      </div>
      <div className="space-y-2.5 px-5 py-4">
        {section.blocks.map((b, i) => (
          <Block key={i} block={b} tenantSlug={tenantSlug} bkey={i} />
        ))}
      </div>
    </article>
  );
}

export default function AuditNarrativeReport({ narrative, tenantSlug }: { narrative: string; tenantSlug: string | null }) {
  const parsed = parseAuditNarrative(narrative);
  const hasSections = parsed.sections.some((s) => s.blocks.length > 0);

  if (!hasSections && !parsed.intro.length) {
    return <p className="text-sm text-slate-500">لا يوجد تحليل نصي لعرضه.</p>;
  }

  return (
    <div className="space-y-4">
      {parsed.intro.length ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          {parsed.intro.map((b, i) => (
            <Block key={i} block={b} tenantSlug={tenantSlug} bkey={i} />
          ))}
        </div>
      ) : null}

      {parsed.sections.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {parsed.sections.filter((s) => s.blocks.length).map((s) => (
            <a
              key={`${s.index}-${s.title}`}
              href={`#audit-sec-${s.index ?? s.title}`}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            >
              {s.index !== null ? `${s.index}. ` : ""}
              {s.title}
            </a>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        {parsed.sections.map((s, i) => (
          <SectionCard key={i} section={s} tenantSlug={tenantSlug} />
        ))}
      </div>
    </div>
  );
}
