import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Shared desktop-first entry form primitives — bold, high-contrast, polished */

export function FieldLabel({
  children,
  required,
  hint,
  className,
}: {
  children: ReactNode;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <Label className={cn("entry-field-label mb-2.5 flex items-center gap-2 flex-wrap", className)}>
      <span className="entry-field-name">{children}</span>
      {required ? (
        <span className="entry-badge entry-badge-required">مطلوب</span>
      ) : (
        <span className="entry-badge entry-badge-optional">اختياري</span>
      )}
      {hint && <span className="entry-field-hint w-full">{hint}</span>}
    </Label>
  );
}

export function FormSection({
  title,
  accent = "blue",
  children,
  className,
}: {
  title: string;
  accent?: "blue" | "emerald" | "amber" | "violet" | "slate";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("entry-section", `entry-section-${accent}`, className)}>
      <div className="entry-section-head">
        <span className="entry-section-accent" aria-hidden />
        <h3 className="entry-section-title">{title}</h3>
      </div>
      <div className="entry-section-grid">{children}</div>
    </section>
  );
}

export function FormBanner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warn";
}) {
  return <div className={cn("entry-banner", `entry-banner-${tone}`)}>{children}</div>;
}

export const entryControlClass =
  "entry-control h-12 text-[15px] font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-medium border-slate-300 bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500/25 focus-visible:border-blue-600";

export const entrySelectTriggerClass =
  "entry-control h-12 text-[15px] font-semibold text-slate-900 border-slate-300 bg-white shadow-sm w-full data-[placeholder]:text-slate-400 data-[placeholder]:font-medium";

export const entryTextareaClass =
  "entry-control text-[15px] font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-medium border-slate-300 bg-white shadow-sm min-h-[96px] resize-none focus-visible:ring-2 focus-visible:ring-blue-500/25 focus-visible:border-blue-600";
