import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check, Star, Zap, Shield, Users, FileText,
  Phone, Mail, BookOpen, ChevronDown, Loader2, CheckCircle2, XCircle
} from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const features = [
  "فواتير البيع والشراء",
  "إدارة المخزون والمستودعات",
  "المحاسبة وقيود اليومية",
  "إدارة الموظفين والرواتب",
  "كشف حساب العملاء والموردين",
  "تقارير مالية شاملة",
  "إدارة الشيكات والبنوك",
  "مراكز التكلفة",
  "إدارة الأصول الثابتة",
  "نظام القروض والأقساط",
];

const planMeta: Record<string, { color: string; badge: string | null; cta: string; ctaClass: string }> = {
  trial: {
    color: "from-slate-600 to-slate-700",
    badge: null,
    cta: "ابدأ مجاناً",
    ctaClass: "bg-slate-700 hover:bg-slate-800 text-white",
  },
  monthly: {
    color: "from-blue-600 to-blue-700",
    badge: "الأكثر شيوعاً",
    cta: "ادفع الآن",
    ctaClass: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  yearly: {
    color: "from-violet-600 to-violet-700",
    badge: "الأوفر",
    cta: "ادفع الآن",
    ctaClass: "bg-violet-600 hover:bg-violet-700 text-white",
  },
};

const faqs = [
  {
    q: "هل يمكنني إلغاء الاشتراك في أي وقت؟",
    a: "نعم، يمكنك إلغاء اشتراكك في أي وقت. لن يتم تجديد الاشتراك تلقائياً بعد الإلغاء.",
  },
  {
    q: "هل بياناتي آمنة؟",
    a: "نعم، نستخدم أحدث تقنيات التشفير لحماية بياناتك. يتم نسخ البيانات احتياطياً يومياً.",
  },
  {
    q: "هل يمكنني الترقية من خطة لأخرى؟",
    a: "نعم، يمكنك الترقية في أي وقت. سيتم احتساب الفرق في السعر تلقائياً.",
  },
  {
    q: "هل يوجد دعم فني؟",
    a: "نعم، نوفر دعماً فنياً عبر الهاتف والبريد الإلكتروني لجميع المشتركين.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 text-right hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-semibold text-slate-800 text-sm">{q}</span>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform flex-shrink-0 mr-2 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

export default function Pricing() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const returnPaymentId = params.get("paymentId");
  const isReturn = params.get("payment") === "return";

  const meQuery = trpc.saas.me.useQuery(undefined, { retry: false });
  const plansQuery = trpc.saas.listPublicPlans.useQuery();
  const checkoutMutation = trpc.saas.createPlanCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (e) => toast.error(e.message),
  });

  const paymentStatusQuery = trpc.saas.getPaymentStatus.useQuery(
    { paymentId: Number(returnPaymentId) },
    { enabled: isReturn && !!returnPaymentId && !!meQuery.data, refetchInterval: (q) => (q.state.data?.status === "pending" ? 3000 : false) }
  );

  const startCheckout = useCallback((plan: { id: number; name: string; price: string }) => {
    if (Number(plan.price) <= 0 || plan.name === "trial") {
      navigate("/register");
      return;
    }
    if (!meQuery.data) {
      navigate(`/login?redirect=${encodeURIComponent(`/pricing?plan=${plan.name}`)}`);
      return;
    }
    checkoutMutation.mutate({ planId: plan.id });
  }, [meQuery.data, navigate, checkoutMutation]);

  useEffect(() => {
    const planName = params.get("plan");
    if (!planName || !meQuery.data || !plansQuery.data?.length) return;
    const plan = plansQuery.data.find((p) => p.name === planName);
    if (plan && Number(plan.price) > 0 && !checkoutMutation.isPending && !checkoutMutation.isSuccess) {
      startCheckout(plan);
    }
  }, [params, meQuery.data, plansQuery.data, startCheckout, checkoutMutation.isPending, checkoutMutation.isSuccess]);

  const plans = (plansQuery.data || []).map((plan) => {
    const meta = planMeta[plan.name] || planMeta.monthly;
    const priceNum = Number(plan.price);
    const period = plan.durationDays >= 365 ? "سنة" : plan.durationDays >= 30 ? "شهر" : `${plan.durationDays} يوم`;
    const featureCount = plan.name === "trial" ? 6 : plan.name === "monthly" ? 8 : features.length;
    return {
      ...plan,
      priceDisplay: priceNum.toLocaleString("ar-EG"),
      period,
      features: features.slice(0, featureCount),
      ...meta,
    };
  });

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {isReturn && (
        <div className="bg-slate-900 text-white py-4 px-4 text-center">
          {paymentStatusQuery.data?.status === "paid" ? (
            <p className="flex items-center justify-center gap-2 text-green-300">
              <CheckCircle2 size={18} /> تم الدفع بنجاح! جاري تفعيل اشتراكك...
            </p>
          ) : paymentStatusQuery.data?.status === "failed" ? (
            <p className="flex items-center justify-center gap-2 text-red-300">
              <XCircle size={18} /> فشل الدفع. حاول مرة أخرى أو تواصل معنا.
            </p>
          ) : (
            <p className="flex items-center justify-center gap-2 text-blue-200">
              <Loader2 size={18} className="animate-spin" /> جاري تأكيد الدفع...
            </p>
          )}
        </div>
      )}

      <nav className="border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <BookOpen size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-800">Easy Cash</span>
          </div>
          <div className="flex items-center gap-3">
            {meQuery.data ? (
              <Button size="sm" variant="ghost" onClick={() => navigate("/")} className="text-slate-600">
                لوحة التحكم
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="text-slate-600">
                  تسجيل الدخول
                </Button>
                <Button size="sm" onClick={() => navigate("/register")} className="bg-blue-600 hover:bg-blue-700 text-white">
                  ابدأ مجاناً
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="py-16 px-4 text-center bg-gradient-to-b from-slate-50 to-white">
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 mb-4 px-4 py-1">
          <Star size={12} className="ml-1" />
          خطط مرنة لكل الأحجام
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">
          اختر الخطة المناسبة<br />
          <span className="text-blue-600">لعملك</span>
        </h1>
        <p className="text-slate-500 text-lg max-w-xl mx-auto mb-2">
          نظام محاسبة متكامل بأسعار مناسبة. ادفع مباشرة عبر Paymob عند اختيار خطتك.
        </p>
      </section>

      <section className="py-12 px-4">
        {plansQuery.isLoading ? (
          <div className="text-center py-16 text-slate-400">جاري تحميل الخطط...</div>
        ) : (
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border ${plan.badge === "الأكثر شيوعاً" ? "border-blue-400 shadow-xl shadow-blue-100" : "border-slate-200 shadow-sm"} overflow-hidden`}
              >
                {plan.badge && (
                  <div className="absolute top-4 left-4">
                    <Badge className={`text-xs px-2 py-0.5 ${plan.badge === "الأكثر شيوعاً" ? "bg-blue-600 text-white" : "bg-violet-600 text-white"}`}>
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <div className={`bg-gradient-to-br ${plan.color} p-6 text-white`}>
                  <h3 className="font-bold text-lg mb-1">{plan.nameAr}</h3>
                  <div className="flex items-end gap-1 mt-4">
                    <span className="text-4xl font-bold">{plan.priceDisplay}</span>
                    {Number(plan.price) > 0 && <span className="text-white/70 text-sm mb-1">ج.م</span>}
                    <span className="text-white/60 text-sm mb-1">/ {plan.period}</span>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex gap-4 mb-5 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Users size={13} className="text-slate-400" />
                      <span>حتى {plan.maxUsers} مستخدمين</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <FileText size={13} className="text-slate-400" />
                      <span>{(plan.maxInvoices ?? 0) >= 99999 ? "غير محدود" : `${plan.maxInvoices} فاتورة`}</span>
                    </div>
                  </div>

                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                        <Check size={14} className="text-green-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full py-2.5 rounded-xl font-semibold ${plan.ctaClass}`}
                    disabled={checkoutMutation.isPending}
                    onClick={() => startCheckout(plan)}
                  >
                    {checkoutMutation.isPending ? (
                      <><Loader2 size={16} className="ml-2 animate-spin" /> جاري التحويل للدفع...</>
                    ) : plan.cta}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="py-16 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">كل ما تحتاجه في مكان واحد</h2>
          <p className="text-slate-500 text-sm">Easy Cash يغطي جميع احتياجاتك المحاسبية والإدارية</p>
        </div>
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { icon: <Zap size={20} />, title: "سريع وسهل", desc: "واجهة عربية بديهية" },
            { icon: <Shield size={20} />, title: "آمن وموثوق", desc: "تشفير كامل للبيانات" },
            { icon: <Users size={20} />, title: "متعدد المستخدمين", desc: "صلاحيات مرنة" },
            { icon: <FileText size={20} />, title: "تقارير شاملة", desc: "تحليلات مالية دقيقة" },
            { icon: <Phone size={20} />, title: "دعم فني", desc: "متاح على مدار الساعة" },
            { icon: <Star size={20} />, title: "تحديثات مستمرة", desc: "ميزات جديدة دائماً" },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-slate-200 text-center">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3 text-blue-600">
                {item.icon}
              </div>
              <h4 className="font-semibold text-slate-800 text-sm mb-1">{item.title}</h4>
              <p className="text-slate-500 text-xs">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">أسئلة شائعة</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FAQItem key={i} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 bg-gradient-to-br from-blue-600 to-blue-800 text-white text-center">
        <h2 className="text-3xl font-bold mb-3">جاهز للبدء؟</h2>
        <p className="text-blue-200 mb-8 text-sm">انضم لآلاف الشركات التي تثق في Easy Cash</p>
        <Button
          size="lg"
          className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-8"
          onClick={() => navigate("/register")}
        >
          ابدأ تجربتك المجانية
        </Button>
      </section>

      <footer className="py-6 px-4 border-t border-slate-100 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
            <BookOpen size={12} className="text-white" />
          </div>
          <span className="font-bold text-slate-700 text-sm">Easy Cash</span>
        </div>
        <p className="text-slate-400 text-xs">© Easy Cash 2024 — جميع الحقوق محفوظة</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <a href="mailto:support@easycash.app" className="text-slate-400 hover:text-slate-600 text-xs flex items-center gap-1">
            <Mail size={11} /> support@easycash.app
          </a>
          <a href="tel:+201000000000" className="text-slate-400 hover:text-slate-600 text-xs flex items-center gap-1">
            <Phone size={11} /> 01000000000
          </a>
        </div>
      </footer>
    </div>
  );
}
