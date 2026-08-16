export function toDateOnly(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
}

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** الحالة المعروضة حسب تاريخ الانتهاء والحالة المخزّنة */
export function effectiveSubscriptionStatus(status: string, endDate: string, today = todayDateOnly()): string {
  if (status === "cancelled" || status === "suspended") return status;
  if (!endDate) return status;
  if (endDate < today) return status === "trial" ? "expired_trial" : "expired";
  if (status === "expired") return "trial";
  return status;
}

/** عند الحفظ: لا نبقي «منتهي» إذا تاريخ الانتهاء في المستقبل */
export function normalizeSubscriptionStatusForSave(status: string, endDate: string, today = todayDateOnly()): string {
  if (endDate >= today && status === "expired") return "trial";
  return status;
}

export type SubscriptionBannerInfo = {
  kind: "trial" | "active_info" | "expiry_warning";
  daysRemaining: number;
  renewalDate: string;
  showCountdown: boolean;
  title: string;
  message: string;
  urgency: "info" | "warning" | "critical";
  planDurationDays: number | null;
};

const MONTHLY_MAX_DAYS = 35;
const YEARLY_MIN_DAYS = 300;
const MONTHLY_WARNING_DAYS = 7;
const YEARLY_WARNING_DAYS = 30;

function formatArDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
}

function daysUntil(endDate: string | Date): number {
  const end = new Date(endDate);
  const today = new Date();
  end.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildSubscriptionBanner(input: {
  status: string;
  endDate: string | Date;
  durationDays?: number | null;
  planName?: string | null;
}): SubscriptionBannerInfo | null {
  const daysRemaining = daysUntil(input.endDate);
  if (daysRemaining < 0) return null;

  const renewalDate =
    typeof input.endDate === "string"
      ? input.endDate.slice(0, 10)
      : input.endDate.toISOString().split("T")[0];
  const fmt = formatArDate(input.endDate);
  const duration = input.durationDays ?? null;
  const isMonthly = duration != null && duration <= MONTHLY_MAX_DAYS;
  const isYearly = duration != null && duration >= YEARLY_MIN_DAYS;

  if (input.status === "trial") {
    const urgency =
      daysRemaining <= 1 ? "critical" : daysRemaining <= 3 ? "warning" : "info";
    const dayWord =
      daysRemaining === 1 ? "يوم واحد" : daysRemaining === 2 ? "يومان" : `${daysRemaining} يوم`;
    return {
      kind: "trial",
      daysRemaining,
      renewalDate,
      showCountdown: true,
      title: "النظام التجريبي",
      message: `متبقي ${dayWord} على انتهاء التجربة`,
      urgency,
      planDurationDays: duration,
    };
  }

  if (input.status === "active") {
    let showCountdown = false;
    if (isMonthly && daysRemaining <= MONTHLY_WARNING_DAYS) showCountdown = true;
    if (isYearly && daysRemaining <= YEARLY_WARNING_DAYS) showCountdown = true;
    if (!isMonthly && !isYearly && duration != null && daysRemaining <= MONTHLY_WARNING_DAYS) {
      showCountdown = true;
    }

    if (showCountdown) {
      const urgency =
        daysRemaining <= 1 ? "critical" : daysRemaining <= 3 ? "warning" : "info";
      const dayWord =
        daysRemaining === 1 ? "يوم واحد" : daysRemaining === 2 ? "يومان" : `${daysRemaining} يوم`;
      return {
        kind: "expiry_warning",
        daysRemaining,
        renewalDate,
        showCountdown: true,
        title: "تنبيه التجديد",
        message: `يتبقى ${dayWord} — موعد التجديد ${fmt}`,
        urgency,
        planDurationDays: duration,
      };
    }

    return {
      kind: "active_info",
      daysRemaining,
      renewalDate,
      showCountdown: false,
      title: input.planName ? `خطة ${input.planName}` : "الاشتراك",
      message: `موعد التجديد: ${fmt}`,
      urgency: "info",
      planDurationDays: duration,
    };
  }

  return null;
}
