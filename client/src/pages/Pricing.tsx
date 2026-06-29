import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check, Star, Zap, Shield, Users, FileText,
  Phone, Mail, ArrowLeft, BookOpen, ChevronDown
} from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";

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

const plans = [
  {
    id: "trial",
    name: "تجريبي مجاني",
    price: "0",
    period: "14 يوم",
    description: "جرّب جميع الميزات مجاناً بدون بطاقة ائتمان",
    color: "from-slate-600 to-slate-700",
    badge: null,
    features: features.slice(0, 6),
    cta: "ابدأ مجاناً",
    ctaClass: "bg-slate-700 hover:bg-slate-800 text-white",
    maxUsers: 2,
    maxInvoices: 50,
  },
  {
    id: "monthly",
    name: "الخطة الشهرية",
    price: "299",
    period: "شهر",
    description: "مثالية للشركات الصغيرة والمتوسطة",
    color: "from-blue-600 to-blue-700",
    badge: "الأكثر شيوعاً",
    features: features.slice(0, 8),
    cta: "اشترك الآن",
    ctaClass: "bg-blue-600 hover:bg-blue-700 text-white",
    maxUsers: 5,
    maxInvoices: 500,
  },
  {
    id: "yearly",
    name: "الخطة السنوية",
    price: "2499",
    period: "سنة",
    description: "وفّر 30% مقارنة بالخطة الشهرية",
    color: "from-violet-600 to-violet-700",
    badge: "الأوفر",
    features: features,
    cta: "اشترك الآن",
    ctaClass: "bg-violet-600 hover:bg-violet-700 text-white",
    maxUsers: 20,
    maxInvoices: 99999,
  },
];

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

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Navbar */}
      <nav className="border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <BookOpen size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-800">Easy Cash</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/login")}
              className="text-slate-600"
            >
              تسجيل الدخول
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/register")}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              ابدأ مجاناً
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
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
          نظام محاسبة متكامل بأسعار مناسبة لجميع أحجام الأعمال. ابدأ مجاناً لمدة 14 يوم.
        </p>
        <p className="text-slate-400 text-sm">لا يلزم بطاقة ائتمان — لا التزامات</p>
      </section>

      {/* Plans */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border ${plan.badge === "الأكثر شيوعاً" ? "border-blue-400 shadow-xl shadow-blue-100" : "border-slate-200 shadow-sm"} overflow-hidden`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className={`absolute top-4 left-4`}>
                  <Badge className={`text-xs px-2 py-0.5 ${plan.badge === "الأكثر شيوعاً" ? "bg-blue-600 text-white" : "bg-violet-600 text-white"}`}>
                    {plan.badge}
                  </Badge>
                </div>
              )}

              {/* Header */}
              <div className={`bg-gradient-to-br ${plan.color} p-6 text-white`}>
                <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                <p className="text-white/70 text-xs mb-4">{plan.description}</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold">{parseInt(plan.price).toLocaleString("ar-EG")}</span>
                  {plan.price !== "0" && <span className="text-white/70 text-sm mb-1">ج.م</span>}
                  <span className="text-white/60 text-sm mb-1">/ {plan.period}</span>
                </div>
              </div>

              {/* Body */}
              <div className="p-6">
                {/* Limits */}
                <div className="flex gap-4 mb-5 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Users size={13} className="text-slate-400" />
                    <span>حتى {plan.maxUsers} مستخدمين</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <FileText size={13} className="text-slate-400" />
                    <span>{plan.maxInvoices === 99999 ? "غير محدود" : `${plan.maxInvoices} فاتورة`}</span>
                  </div>
                </div>

                {/* Features */}
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
                  onClick={() => navigate("/register")}
                >
                  {plan.cta}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
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

      {/* FAQ */}
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

      {/* CTA */}
      <section className="py-16 px-4 bg-gradient-to-br from-blue-600 to-blue-800 text-white text-center">
        <h2 className="text-3xl font-bold mb-3">جاهز للبدء؟</h2>
        <p className="text-blue-200 mb-8 text-sm">انضم لآلاف الشركات التي تثق في Easy Cash</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            size="lg"
            className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-8"
            onClick={() => navigate("/register")}
          >
            ابدأ تجربتك المجانية
          </Button>
          <a href="tel:+201000000000">
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 text-white hover:bg-white/10 px-8"
            >
              <Phone size={16} className="ml-2" />
              تواصل معنا
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
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
