import { Link } from "wouter";
import { CalendarClock, Clock, Sparkles } from "lucide-react";
import { tenantPath } from "@/lib/tenant";

export type SubscriptionBanner = {
  kind: "trial" | "active_info" | "expiry_warning";
  daysRemaining: number;
  renewalDate: string;
  showCountdown: boolean;
  title: string;
  message: string;
  urgency: "info" | "warning" | "critical";
};

type Props = {
  banner: SubscriptionBanner;
  tenantSlug: string | null;
  compact?: boolean;
};

const styles = {
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-300 text-amber-800",
  critical: "bg-red-50 border-red-300 text-red-800",
};

const badgeStyles = {
  info: "bg-blue-600 text-white",
  warning: "bg-amber-500 text-white",
  critical: "bg-red-600 text-white",
};

export default function SubscriptionStatusBar({ banner, tenantSlug, compact }: Props) {
  const renewHref = tenantSlug
    ? tenantPath(tenantSlug, "/subscription-expired")
    : "/pricing";

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 text-xs font-medium ${styles[banner.urgency]}`}
      >
        {banner.showCountdown ? <Clock size={14} className="shrink-0" /> : <CalendarClock size={14} className="shrink-0" />}
        <span className="truncate">{banner.message}</span>
        {banner.showCountdown && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeStyles[banner.urgency]}`}>
            {banner.daysRemaining}
          </span>
        )}
        {(banner.kind === "trial" || banner.kind === "expiry_warning") && (
          <Link href={renewHref} className="shrink-0 underline hover:opacity-80">
            تجديد
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${styles[banner.urgency]}`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          {banner.kind === "trial" ? (
            <Sparkles size={16} />
          ) : banner.showCountdown ? (
            <Clock size={16} />
          ) : (
            <CalendarClock size={16} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold">{banner.title}</p>
            {banner.showCountdown && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeStyles[banner.urgency]}`}>
                {banner.daysRemaining} يوم
              </span>
            )}
          </div>
          <p className="text-[11px] mt-1 leading-relaxed opacity-90">{banner.message}</p>
          {(banner.kind === "trial" || banner.kind === "expiry_warning") && (
            <Link href={renewHref} className="inline-block text-[11px] font-semibold underline mt-1.5">
              تجديد الاشتراك
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
