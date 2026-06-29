import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Eye, EyeOff, BookOpen, Lock, Mail, User, Building2, Phone, CheckCircle, Tag, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Register() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    phone: "",
    couponCode: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState<any>(null);
  const [couponError, setCouponError] = useState("");

  const validateCouponQuery = trpc.saas.validateCoupon.useQuery(
    { code: couponInput },
    { enabled: false }
  );

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponError("");
    const result = await validateCouponQuery.refetch();
    if (result.data) {
      setCouponApplied(result.data);
      setForm(f => ({ ...f, couponCode: result.data!.code }));
      toast.success(`تم تطبيق الكوبون: خصم ${result.data.discountType === "percentage" ? `${parseFloat(result.data.discountValue)}%` : `${parseFloat(result.data.discountValue)} ج.م`}`);
    } else {
      setCouponApplied(null);
      setForm(f => ({ ...f, couponCode: "" }));
      setCouponError("كود الخصم غير صحيح أو منتهي");
    }
  };

  const removeCoupon = () => {
    setCouponApplied(null);
    setCouponInput("");
    setCouponError("");
    setForm(f => ({ ...f, couponCode: "" }));
  };

  const registerMutation = trpc.saas.register.useMutation({
    onSuccess: (data) => {
      setSuccess(true);
      toast.success(data.message);
    },
    onError: (err) => {
      toast.error(err.message || "خطأ في إنشاء الحساب");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    if (form.password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    registerMutation.mutate({
      name: form.name,
      email: form.email,
      password: form.password,
      companyName: form.companyName || undefined,
      phone: form.phone || undefined,
      couponCode: form.couponCode || undefined,
    });
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">تم إنشاء حسابك بنجاح!</h2>
          <p className="text-slate-500 mb-2">لديك <strong className="text-blue-600">14 يوم تجريبي</strong> مجاناً</p>
          <p className="text-slate-400 text-sm mb-8">يمكنك الآن تسجيل الدخول والبدء في استخدام Easy Cash</p>
          <Button
            onClick={() => navigate("/login")}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
          >
            تسجيل الدخول الآن
          </Button>
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

      <div className="relative w-full max-w-lg">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-center">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
              <BookOpen size={28} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Easy Cash</h1>
            <p className="text-blue-200 text-xs">ابدأ تجربتك المجانية لمدة 14 يوم</p>
          </div>

          {/* Form */}
          <div className="p-8">
            <h2 className="text-lg font-bold text-slate-800 mb-5 text-center">إنشاء حساب جديد</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-slate-700 font-medium mb-1.5 block text-sm">الاسم الكامل *</Label>
                  <div className="relative">
                    <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="محمد أحمد"
                      className="pr-9 h-10 border-slate-200 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div className="col-span-2">
                  <Label className="text-slate-700 font-medium mb-1.5 block text-sm">البريد الإلكتروني *</Label>
                  <div className="relative">
                    <Mail size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="example@company.com"
                      className="pr-9 h-10 border-slate-200 focus:border-blue-500 text-sm"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 font-medium mb-1.5 block text-sm">كلمة المرور *</Label>
                  <div className="relative">
                    <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                      className="pr-9 pl-9 h-10 border-slate-200 focus:border-blue-500 text-sm"
                      dir="ltr"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 font-medium mb-1.5 block text-sm">تأكيد كلمة المرور *</Label>
                  <div className="relative">
                    <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      placeholder="••••••••"
                      className="pr-9 h-10 border-slate-200 focus:border-blue-500 text-sm"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 font-medium mb-1.5 block text-sm">اسم الشركة</Label>
                  <div className="relative">
                    <Building2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                      placeholder="شركة المثال"
                      className="pr-9 h-10 border-slate-200 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 font-medium mb-1.5 block text-sm">رقم الهاتف</Label>
                  <div className="relative">
                    <Phone size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="01xxxxxxxxx"
                      className="pr-9 h-10 border-slate-200 focus:border-blue-500 text-sm"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* Coupon Field */}
              <div>
                <Label className="text-slate-700 font-medium mb-1.5 block text-sm">كود الخصم (اختياري)</Label>
                {couponApplied ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <Check size={14} className="text-green-600" />
                    <span className="text-green-700 text-sm font-mono font-bold flex-1">{couponApplied.code}</span>
                    <span className="text-green-600 text-xs">
                      {couponApplied.discountType === "percentage" ? `خصم ${parseFloat(couponApplied.discountValue)}%` : `خصم ${parseFloat(couponApplied.discountValue)} ج.م`}
                    </span>
                    <button type="button" onClick={removeCoupon} className="text-slate-400 hover:text-red-500">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={couponInput}
                        onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleApplyCoupon())}
                        placeholder="SUMMER20"
                        className={`pr-9 h-10 border-slate-200 font-mono uppercase text-sm ${couponError ? "border-red-300" : ""}`}
                        dir="ltr"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 px-4 text-sm border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={handleApplyCoupon}
                      disabled={!couponInput.trim() || validateCouponQuery.isFetching}
                    >
                      {validateCouponQuery.isFetching ? "..." : "تطبيق"}
                    </Button>
                  </div>
                )}
                {couponError && <p className="text-red-500 text-xs mt-1">{couponError}</p>}
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                <p className="text-blue-700 text-xs font-medium">🎉 تجربة مجانية 14 يوم — لا يلزم بطاقة ائتمان</p>
              </div>

              <Button
                type="submit"
                disabled={registerMutation.isPending}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
              >
                {registerMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري إنشاء الحساب...
                  </div>
                ) : "إنشاء الحساب"}
              </Button>
            </form>

            <div className="mt-5 pt-5 border-t border-slate-100 text-center">
              <p className="text-slate-500 text-sm">
                لديك حساب بالفعل؟{" "}
                <button onClick={() => navigate("/login")} className="text-blue-600 hover:text-blue-700 font-semibold">
                  تسجيل الدخول
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
