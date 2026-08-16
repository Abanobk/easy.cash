import { useState } from "react";
import { Crown, Loader2, CreditCard, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import SubscriptionStatusBar, { type SubscriptionBanner } from "@/components/SubscriptionStatusBar";
import { toast } from "sonner";

type Props = {
  tenantSlug: string;
  banner: SubscriptionBanner | null | undefined;
};

function formatPlanPeriod(days: number) {
  if (days >= 365) return "سنة";
  if (days >= 30) return "شهر";
  return `${days} يوم`;
}

export default function SubscriptionHubButton({ tenantSlug, banner }: Props) {
  const [open, setOpen] = useState(false);
  const [payingPlanId, setPayingPlanId] = useState<number | null>(null);

  const meQuery = trpc.saas.me.useQuery(undefined, { enabled: open });
  const plansQuery = trpc.saas.listPublicPlans.useQuery(undefined, { enabled: open });

  const checkoutMutation = trpc.saas.createPlanCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (e) => {
      setPayingPlanId(null);
      toast.error(e.message);
    },
  });

  const paidPlans = (plansQuery.data || []).filter(
    (p) => Number(p.price) > 0 && p.name !== "trial",
  );

  const urgency = banner?.urgency || "info";
  const dotClass =
    urgency === "critical"
      ? "bg-red-500"
      : urgency === "warning"
        ? "bg-amber-500"
        : "bg-blue-500";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative p-2 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
          aria-label="الاشتراك والباقات"
          title="الاشتراك والباقات"
        >
          <Crown size={18} />
          <span className={`absolute top-1.5 left-1.5 w-2 h-2 rounded-full ${dotClass}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="end" dir="rtl">
        <div className="p-4 border-b bg-gradient-to-l from-violet-50 to-blue-50">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Crown size={16} className="text-violet-600" />
            الاشتراك والباقات
          </h3>
          <p className="text-xs text-slate-500 mt-1">متابعة التجربة، التجديد، والدفع</p>
        </div>

        <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
          {banner && (
            <SubscriptionStatusBar banner={banner} tenantSlug={tenantSlug} />
          )}

          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">الباقات المتاحة</p>
            {plansQuery.isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="animate-spin text-slate-400" size={20} />
              </div>
            ) : (
              <div className="space-y-2">
                {paidPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-lg border border-slate-200 p-3 space-y-2"
                  >
                    <p className="text-sm font-semibold text-slate-800">{plan.nameAr}</p>
                    <div className="flex items-end justify-between gap-4 pt-1">
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-violet-700 tabular-nums leading-none">
                          {Number(plan.price).toLocaleString("en-US")}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">{plan.currency}</p>
                        <p className="text-xs text-slate-400 mt-1">لمدة {formatPlanPeriod(plan.durationDays)}</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        disabled={payingPlanId !== null}
                        onClick={() => {
                          setPayingPlanId(plan.id);
                          checkoutMutation.mutate({ planId: plan.id });
                        }}
                      >
                        {payingPlanId === plan.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <CreditCard size={13} className="ml-1" />
                            ادفع
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {meQuery.data?.hasActiveSubscription && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg p-2">
              <Check size={14} />
              الاشتراك نشط
            </div>
          )}

          {banner?.kind === "trial" && (
            <Badge variant="outline" className="w-full justify-center text-[10px]">
              العداد يتناقص يومياً حتى انتهاء التجربة
            </Badge>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
