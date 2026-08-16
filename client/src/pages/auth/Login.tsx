import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useSearch } from "wouter";
import { getTenantSlugFromPath, tenantPath } from "@/lib/tenant";
import { buildTenantLoginUrl } from "@/lib/tenant-login";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const redirect = new URLSearchParams(search).get("redirect") || tenantPath(getTenantSlugFromPath(), "/");
  const tenantSlug = getTenantSlugFromPath() || "";
  const isTenantLogin = Boolean(tenantSlug);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const tenantQuery = trpc.saas.resolveTenant.useQuery(
    { slug: tenantSlug },
    { enabled: isTenantLogin, retry: false },
  );
  const companyName = tenantQuery.data?.name;

  const loginMutation = trpc.saas.login.useMutation({
    onSuccess: (data) => {
      toast.success(`مرحباً ${data.user.name}! تم تسجيل الدخول بنجاح`);
      if (data.user.role === "superadmin") {
        navigate("/super-admin");
      } else {
        const dest = data.tenantSlug ? tenantPath(data.tenantSlug, "/") : redirect;
        navigate(dest.startsWith("/") ? dest : "/");
      }
    },
    onError: (err) => {
      toast.error(err.message || "خطأ في تسجيل الدخول");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("يرجى إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }
    if (isTenantLogin && tenantQuery.isFetched && !tenantQuery.data) {
      toast.error("رابط الشركة غير صالح");
      return;
    }
    loginMutation.mutate({
      email,
      password,
      tenantSlug: isTenantLogin ? tenantSlug : undefined,
    });
  };

  if (isTenantLogin && tenantQuery.isFetched && !tenantQuery.data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800 mb-2">رابط غير صالح</h1>
          <p className="text-slate-500 text-sm mb-6">لم نجد شركة بهذا الرابط. تأكد من الرابط الذي أرسله لك مدير الشركة.</p>
          <Button variant="outline" onClick={() => navigate("/login")}>دخول الإدارة</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-blue-700/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-8 text-center">
            <img
              src="/easy-cash-brand.png"
              alt="Easy Cash"
              className="w-24 h-24 object-contain mx-auto mb-3 rounded-2xl bg-white p-1.5 shadow-lg"
            />
            <h1 className="text-2xl font-bold text-white mb-1">
              {isTenantLogin ? (companyName || "جاري التحميل...") : "Easy Cash"}
            </h1>
            <p className="text-blue-200 text-sm">
              {isTenantLogin
                ? "تسجيل دخول الموظفين — حسابات هذه الشركة فقط"
                : "حساباتك .. أسهل معانا"}
            </p>
          </div>

          <div className="p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">تسجيل الدخول</h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label className="text-slate-700 font-medium mb-2 block">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@company.com"
                    className="pr-10 h-11 border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                    dir="ltr"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-700 font-medium mb-2 block">كلمة المرور</Label>
                <div className="relative">
                  <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10 pl-10 h-11 border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                    dir="ltr"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loginMutation.isPending || (isTenantLogin && tenantQuery.isLoading)}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 active:scale-[0.98]"
              >
                {loginMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري تسجيل الدخول...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>دخول</span>
                    <ArrowLeft size={16} />
                  </div>
                )}
              </Button>
            </form>

            {isTenantLogin ? (
              <p className="mt-6 pt-6 border-t border-slate-100 text-center text-slate-500 text-xs">
                هذا الرابط خاص بـ <span className="font-semibold text-slate-700">{companyName}</span> فقط.
                <br />
                لا يمكن إنشاء حساب جديد من هنا — اطلب من مدير الشركة إضافتك.
              </p>
            ) : (
              <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                <p className="text-slate-500 text-sm">
                  شركة جديدة؟{" "}
                  <button
                    onClick={() => navigate("/register")}
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    إنشاء حساب واشتراك
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>

        {isTenantLogin && tenantSlug && (
          <p className="text-center text-slate-500 text-[11px] mt-4 font-mono" dir="ltr">
            {buildTenantLoginUrl(tenantSlug)}
          </p>
        )}

        <p className="text-center text-slate-400 text-xs mt-4">
          © 2024 Easy Cash - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
