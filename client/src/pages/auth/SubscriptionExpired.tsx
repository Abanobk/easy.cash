import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, Phone, Mail, ArrowLeft, Clock, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function SubscriptionExpired() {
  const [, navigate] = useLocation();
  const meQuery = trpc.saas.me.useQuery(undefined, { retry: false });
  const plansQuery = trpc.saas.listPublicPlans.useQuery();
  const checkoutMutation = trpc.saas.createPlanCheckout.useMutation({
    onSuccess: (data) => { window.location.href = data.checkoutUrl; },
    onError: (e) => toast.error(e.message),
  });
  const logoutMutation = trpc.saas.logout.useMutation({
    onSuccess: () => navigate("/login"),
  });

  const user = meQuery.data;
  const sub = user?.subscription;
  const paidPlans = (plansQuery.data || []).filter((p) => Number(p.price) > 0 && p.name !== "trial");

  const handleRenew = (planId: number) => {
    checkoutMutation.mutate({ planId });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
          {/* Icon */}
          <div className="w-24 h-24 bg-red-500/20 border border-red-500/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={44} className="text-red-400" />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-white mb-2">انتهى اشتراكك</h1>
          <p className="text-slate-400 mb-6 text-sm leading-relaxed">
            لقد انتهت صلاحية اشتراكك في Easy Cash. لمواصلة استخدام النظام، يرجى تجديد اشتراكك أو التواصل معنا.
          </p>

          {/* Subscription info */}
          {sub && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-right">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">الخطة</span>
                <span className="text-white font-semibold">{sub.planName || "—"}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">تاريخ الانتهاء</span>
                <span className="text-red-400 font-semibold flex items-center gap-1">
                  <Clock size={13} />
                  {sub.endDate ? new Date(sub.endDate).toLocaleDateString("ar-EG") : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">الحالة</span>
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">منتهي</Badge>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 mb-6">
            {paidPlans.length > 0 ? (
              <div className="space-y-2">
                {paidPlans.map((plan) => (
                  <Button
                    key={plan.id}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-base"
                    disabled={checkoutMutation.isPending}
                    onClick={() => handleRenew(plan.id)}
                  >
                    {checkoutMutation.isPending ? (
                      <><Loader2 size={18} className="ml-2 animate-spin" /> جاري التحويل...</>
                    ) : (
                      <><RefreshCw size={18} className="ml-2" /> {plan.nameAr} — {Number(plan.price).toLocaleString("ar-EG")} ج.م</>
                    )}
                  </Button>
                ))}
              </div>
            ) : (
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-base"
                onClick={() => navigate("/pricing")}
              >
                <RefreshCw size={18} className="ml-2" />
                تجديد الاشتراك الآن
              </Button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <a href="tel:+201000000000">
                <Button
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10 rounded-xl"
                >
                  <Phone size={15} className="ml-2" />
                  اتصل بنا
                </Button>
              </a>
              <a href="mailto:support@easycash.app">
                <Button
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10 rounded-xl"
                >
                  <Mail size={15} className="ml-2" />
                  راسلنا
                </Button>
              </a>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={() => logoutMutation.mutate()}
            className="text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1 mx-auto transition-colors"
          >
            <ArrowLeft size={13} />
            تسجيل الخروج
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          © Easy Cash 2024 — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
