import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Users, CreditCard, Package, BarChart3, LogOut, BookOpen,
  Plus, Edit2, Trash2, Check, X, Eye, EyeOff, RefreshCw,
  TrendingUp, UserCheck, AlertCircle, Calendar, Shield,
  Tag, PieChart, DollarSign, ToggleLeft, ToggleRight,
  Download, MessageSquare, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, LifeBuoy
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, Legend
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Tab = "dashboard" | "users" | "subscriptions" | "plans" | "coupons" | "reports" | "support" | "paymob";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trial: "bg-blue-100 text-blue-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
  suspended: "bg-orange-100 text-orange-700",
};
const statusLabels: Record<string, string> = {
  active: "نشط", trial: "تجريبي", expired: "منتهي", cancelled: "ملغي", suspended: "موقوف",
};
const roleColors: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-blue-700",
  user: "bg-gray-100 text-gray-600",
};
const roleLabels: Record<string, string> = {
  superadmin: "سوبر أدمن", admin: "مدير", user: "مستخدم",
};

export default function SuperAdmin() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [userPage, setUserPage] = useState(1);
  const [subPage, setSubPage] = useState(1);

  // Modals
  const [editUserModal, setEditUserModal] = useState<any>(null);
  const [addSubModal, setAddSubModal] = useState(false);
  const [editSubModal, setEditSubModal] = useState<any>(null);
  const [planModal, setPlanModal] = useState<any>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [couponModal, setCouponModal] = useState<any>(null);

  const utils = trpc.useUtils();

  // Queries
  const meQuery = trpc.saas.me.useQuery();
  const statsQuery = trpc.saas.adminStats.useQuery();
  const impersonateMut = trpc.saas.impersonateTenant.useMutation({
    onSuccess: (data) => {
      toast.success(`فتح برنامج ${data.companyName}`);
      window.location.href = data.redirectUrl;
    },
    onError: (e) => toast.error(e.message),
  });
  const usersQuery = trpc.saas.listUsers.useQuery({ page: userPage, limit: 15 });
  const subsQuery = trpc.saas.listSubscriptions.useQuery({ page: subPage, limit: 15 });
  const plansQuery = trpc.saas.listPlans.useQuery();
  const couponsQuery = trpc.saas.listCoupons.useQuery(undefined, { enabled: tab === "coupons" });
  const reportQuery = trpc.saas.subscriptionReport.useQuery(undefined, { enabled: tab === "reports" });
  const ticketsQuery = trpc.saas.listTickets.useQuery({ status: "all" }, { enabled: tab === "support" });
  const paymobQuery = trpc.saas.getPaymobSettings.useQuery(undefined, { enabled: tab === "paymob" });
  const savePaymobMutation = trpc.saas.savePaymobSettings.useMutation({
    onSuccess: () => { toast.success("تم حفظ إعدادات Paymob"); paymobQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const testPaymobMutation = trpc.saas.testPaymobConnection.useMutation({
    onSuccess: () => toast.success("الاتصال بـ Paymob ناجح"),
    onError: (e) => toast.error(e.message),
  });
  const [paymobForm, setPaymobForm] = useState({
    mode: "test" as "test" | "live",
    publicKey: "",
    secretKey: "",
    hmacSecret: "",
    cardIntegrationId: "",
    currency: "EGP",
    isEnabled: false,
  });

  useEffect(() => {
    if (!paymobQuery.data) return;
    setPaymobForm((prev) => ({
      ...prev,
      mode: paymobQuery.data.mode as "test" | "live",
      publicKey: paymobQuery.data.publicKey || "",
      cardIntegrationId: paymobQuery.data.cardIntegrationId ? String(paymobQuery.data.cardIntegrationId) : "",
      currency: paymobQuery.data.currency || "EGP",
      isEnabled: paymobQuery.data.isEnabled,
      secretKey: "",
      hmacSecret: "",
    }));
  }, [paymobQuery.data]);
  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "in_progress" | "resolved" | "closed">("all");
  const [replyModal, setReplyModal] = useState<any>(null);
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);

  // Mutations
  const logoutMutation = trpc.saas.logout.useMutation({
    onSuccess: () => { navigate("/login"); },
  });
  const updateUserMutation = trpc.saas.updateUser.useMutation({
    onSuccess: () => { toast.success("تم تحديث المستخدم"); setEditUserModal(null); utils.saas.listUsers.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteUserMutation = trpc.saas.deleteUser.useMutation({
    onSuccess: () => { toast.success("تم حذف المستخدم"); utils.saas.listUsers.invalidate(); utils.saas.adminStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const upsertSubMutation = trpc.saas.upsertSubscription.useMutation({
    onSuccess: () => { toast.success("تم حفظ الاشتراك"); setAddSubModal(false); setEditSubModal(null); utils.saas.listSubscriptions.invalidate(); utils.saas.adminStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const upsertPlanMutation = trpc.saas.upsertPlan.useMutation({
    onSuccess: () => { toast.success("تم حفظ الخطة"); setPlanModal(null); utils.saas.listPlans.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteSubMutation = trpc.saas.deleteSubscription.useMutation({
    onSuccess: () => { toast.success("تم حذف الاشتراك"); utils.saas.listSubscriptions.invalidate(); utils.saas.adminStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deletePlanMutation = trpc.saas.deletePlan.useMutation({
    onSuccess: () => { toast.success("تم حذف الخطة"); utils.saas.listPlans.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createCouponMutation = trpc.saas.createCoupon.useMutation({
    onSuccess: () => { toast.success("تم إنشاء الكوبون"); setCouponModal(null); utils.saas.listCoupons.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateCouponMutation = trpc.saas.updateCoupon.useMutation({
    onSuccess: () => { toast.success("تم تحديث الكوبون"); utils.saas.listCoupons.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCouponMutation = trpc.saas.deleteCoupon.useMutation({
    onSuccess: () => { toast.success("تم حذف الكوبون"); utils.saas.listCoupons.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const replyTicketMutation = trpc.saas.replyTicket.useMutation({
    onSuccess: () => { toast.success("تم إرسال الرد بنجاح"); setReplyModal(null); utils.saas.listTickets.invalidate(); utils.saas.adminStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const exportAllQuery = trpc.saas.exportAllSubscriptions.useQuery(undefined, { enabled: false });

  const exportSubscriptionsExcel = async () => {
    toast.info("جاري تحميل البيانات...");
    const result = await exportAllQuery.refetch();
    const rows = result.data || [];
    const data = rows.map((s: any) => ({
      "اسم المستخدم": s.userName || s.userId,
      "البريد": s.userEmail || "",
      "الخطة": s.planNameAr || s.planId,
      "الحالة": { active: "نشط", trial: "تجريبي", expired: "منتهي", cancelled: "ملغي", suspended: "موقوف" }[s.status as string] || s.status,
      "تاريخ البداية": s.startDate,
      "تاريخ الانتهاء": s.endDate,
      "السعر": s.price || "0",
      "ملاحظات": s.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الاشتراكات");
    XLSX.writeFile(wb, `easy-cash-subscriptions-${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("تم تصدير ملف Excel بنجاح");
  };

  // Redirect if not superadmin
  if (meQuery.data && meQuery.data.role !== "superadmin") {
    navigate("/");
    return null;
  }
  if (!meQuery.isLoading && !meQuery.data) {
    navigate("/login");
    return null;
  }

  const stats = statsQuery.data;

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Top Bar */}
      <header className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <BookOpen size={18} />
          </div>
          <div>
            <div className="font-bold text-base">Easy Cash</div>
            <div className="text-blue-200 text-xs">لوحة تحكم السوبر أدمن</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
            <Shield size={14} className="text-purple-300" />
            <span className="text-sm font-medium">{meQuery.data?.name}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            className="text-white hover:bg-white/10 gap-2"
          >
            <LogOut size={15} />
            خروج
          </Button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-l border-slate-200 flex flex-col shadow-sm flex-shrink-0">
          <nav className="flex-1 p-3 space-y-1">
            {[
              { id: "dashboard", label: "لوحة التحكم", icon: <BarChart3 size={16} /> },
              { id: "users", label: "المستخدمون", icon: <Users size={16} /> },
              { id: "subscriptions", label: "الاشتراكات", icon: <CreditCard size={16} /> },
              { id: "plans", label: "خطط الاشتراك", icon: <Package size={16} /> },
              { id: "coupons", label: "كوبونات الخصم", icon: <Tag size={16} /> },
              { id: "paymob", label: "Paymob", icon: <DollarSign size={16} /> },
              { id: "reports", label: "تقرير الاشتراكات", icon: <PieChart size={16} /> },
              { id: "support", label: "طلبات الدعم", icon: <LifeBuoy size={16} /> },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id as Tab)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === item.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={() => navigate("/")}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100"
            >
              <BookOpen size={15} />
              الذهاب للنظام
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6">

          {/* ===== DASHBOARD TAB ===== */}
          {tab === "dashboard" && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-6">نظرة عامة</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                {[
                  { label: "إجمالي المستخدمين", value: stats?.totalUsers ?? "—", icon: <Users size={20} />, color: "blue" },
                  { label: "مستخدمون نشطون", value: stats?.activeUsers ?? "—", icon: <UserCheck size={20} />, color: "green" },
                  { label: "اشتراكات نشطة", value: stats?.activeSubscriptions ?? "—", icon: <CreditCard size={20} />, color: "indigo" },
                  { label: "اشتراكات تجريبية", value: stats?.trialSubscriptions ?? "—", icon: <Calendar size={20} />, color: "orange" },
                  { label: "خطط متاحة", value: stats?.totalPlans ?? "—", icon: <Package size={20} />, color: "purple" },
                ].map((stat, i) => (
                  <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-${stat.color}-100 text-${stat.color}-600`}>
                      {stat.icon}
                    </div>
                    <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
                    <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <h3 className="font-semibold text-slate-700 mb-4">إجراءات سريعة</h3>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => setTab("users")} variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
                    <Users size={15} /> إدارة المستخدمين
                  </Button>
                  <Button onClick={() => { setTab("subscriptions"); setAddSubModal(true); }} variant="outline" className="gap-2 border-green-200 text-green-700 hover:bg-green-50">
                    <Plus size={15} /> إضافة اشتراك
                  </Button>
                  <Button onClick={() => { setTab("plans"); setPlanModal({}); }} variant="outline" className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50">
                    <Package size={15} /> إضافة خطة
                  </Button>
                  <Button onClick={() => { statsQuery.refetch(); usersQuery.refetch(); subsQuery.refetch(); }} variant="outline" className="gap-2 text-slate-600">
                    <RefreshCw size={15} /> تحديث البيانات
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ===== USERS TAB ===== */}
          {tab === "users" && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-slate-800">المستخدمون ({usersQuery.data?.total ?? 0})</h2>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">الاسم</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">البريد</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">الشركة</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">رابط الشركة</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">الدور</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">الحالة</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">آخر دخول</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersQuery.data?.rows.map((user: any) => (
                      <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="p-3 font-medium text-slate-800">{user.name}</td>
                        <td className="p-3 text-slate-500 text-xs" dir="ltr">{user.email}</td>
                        <td className="p-3 text-slate-500 text-xs">{user.companyName || user.tenantName || "—"}</td>
                        <td className="p-3 text-xs text-blue-600 font-mono" dir="ltr">/{user.tenantSlug || "—"}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[user.role] || "bg-gray-100 text-gray-600"}`}>
                            {roleLabels[user.role] || user.role}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {user.isActive ? "نشط" : "موقوف"}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-slate-400">
                          {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("ar-EG") : "لم يدخل"}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {user.tenantSlug && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs gap-1 text-green-700 hover:bg-green-50"
                                disabled={impersonateMut.isPending}
                                onClick={() => impersonateMut.mutate({ userId: user.id })}
                              >
                                <Eye size={12} /> فتح
                              </Button>
                            )}
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                              onClick={() => setEditUserModal({ ...user, newPassword: "" })}
                            >
                              <Edit2 size={13} />
                            </Button>
                            {user.role !== "superadmin" && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                                onClick={() => {
                                  if (confirm(`هل تريد حذف المستخدم "${user.name}"؟`)) {
                                    deleteUserMutation.mutate({ id: user.id });
                                  }
                                }}
                              >
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {usersQuery.isLoading && (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                  </div>
                )}
                {/* Pagination */}
                <div className="flex items-center justify-between p-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">
                    صفحة {userPage} من {Math.ceil((usersQuery.data?.total || 0) / 15)}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={userPage === 1} onClick={() => setUserPage(p => p - 1)}>السابق</Button>
                    <Button variant="outline" size="sm" disabled={(usersQuery.data?.total || 0) <= userPage * 15} onClick={() => setUserPage(p => p + 1)}>التالي</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== SUBSCRIPTIONS TAB ===== */}
          {tab === "subscriptions" && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-slate-800">الاشتراكات ({subsQuery.data?.total ?? 0})</h2>
                <div className="flex gap-2">
                  <Button onClick={exportSubscriptionsExcel} variant="outline" className="gap-2 h-9 border-green-200 text-green-700 hover:bg-green-50">
                    <Download size={14} /> تصدير Excel
                  </Button>
                  <Button onClick={() => setAddSubModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-9">
                    <Plus size={15} /> اشتراك جديد
                  </Button>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">المستخدم</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">الخطة</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">الحالة</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">من</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">إلى</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">السعر</th>
                      <th className="p-3 text-right text-xs text-slate-500 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subsQuery.data?.rows.map((sub: any) => (
                      <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="p-3">
                          <div className="font-medium text-slate-800 text-sm">{sub.userName}</div>
                          <div className="text-xs text-slate-400" dir="ltr">{sub.userEmail}</div>
                        </td>
                        <td className="p-3 text-slate-600 text-sm">{sub.planName}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[sub.status] || "bg-gray-100 text-gray-600"}`}>
                            {statusLabels[sub.status] || sub.status}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-slate-500">{sub.startDate}</td>
                        <td className="p-3 text-xs text-slate-500">{sub.endDate}</td>
                        <td className="p-3 text-sm font-medium text-slate-700">{parseFloat(sub.planPrice || "0").toLocaleString("ar-EG")} ج.م</td>
                        <td className="p-3">
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                            onClick={() => setEditSubModal(sub)}
                          >
                            <Edit2 size={13} />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                            onClick={() => { if (confirm("حذف هذا الاشتراك؟")) deleteSubMutation.mutate({ id: sub.id }); }}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {subsQuery.isLoading && (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                  </div>
                )}
                <div className="flex items-center justify-between p-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">صفحة {subPage} من {Math.ceil((subsQuery.data?.total || 0) / 15)}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={subPage === 1} onClick={() => setSubPage(p => p - 1)}>السابق</Button>
                    <Button variant="outline" size="sm" disabled={(subsQuery.data?.total || 0) <= subPage * 15} onClick={() => setSubPage(p => p + 1)}>التالي</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== PLANS TAB ===== */}
          {tab === "plans" && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-slate-800">خطط الاشتراك</h2>
                <Button onClick={() => setPlanModal({})} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-9">
                  <Plus size={15} /> خطة جديدة
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plansQuery.data?.map((plan: any) => (
                  <div key={plan.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-slate-800 text-lg">{plan.nameAr}</h3>
                        <p className="text-slate-400 text-xs">{plan.name}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600" onClick={() => setPlanModal(plan)}>
                          <Edit2 size={13} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => { if (confirm("حذف هذه الخطة؟")) deletePlanMutation.mutate({ id: plan.id }); }}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-blue-600 mb-1">
                      {parseFloat(plan.price).toLocaleString("ar-EG")}
                      <span className="text-sm font-normal text-slate-400 mr-1">{plan.currency}</span>
                    </div>
                    <p className="text-slate-500 text-sm mb-4">{plan.durationDays} يوم</p>
                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2"><Check size={12} className="text-green-500" /> حتى {plan.maxUsers} مستخدم</div>
                      <div className="flex items-center gap-2"><Check size={12} className="text-green-500" /> حتى {plan.maxInvoices} فاتورة</div>
                      {plan.features && <div className="flex items-center gap-2"><Check size={12} className="text-green-500" /> {plan.features}</div>}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${plan.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {plan.isActive ? "نشطة" : "غير نشطة"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ===== EDIT USER MODAL ===== */}
      <Dialog open={!!editUserModal} onOpenChange={() => setEditUserModal(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المستخدم</DialogTitle>
          </DialogHeader>
          {editUserModal && (
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-sm mb-1.5 block">الاسم</Label>
                <Input value={editUserModal.name} onChange={(e) => setEditUserModal({ ...editUserModal, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={editUserModal.email || ""}
                  onChange={(e) => setEditUserModal({ ...editUserModal, email: e.target.value })}
                  dir="ltr"
                  autoComplete="email"
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">اسم الشركة</Label>
                <Input value={editUserModal.companyName || ""} onChange={(e) => setEditUserModal({ ...editUserModal, companyName: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">الدور</Label>
                <Select value={editUserModal.role} onValueChange={(v) => setEditUserModal({ ...editUserModal, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">مستخدم</SelectItem>
                    <SelectItem value="admin">مدير</SelectItem>
                    <SelectItem value="superadmin">سوبر أدمن</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-sm">الحساب نشط</Label>
                <button
                  onClick={() => setEditUserModal({ ...editUserModal, isActive: !editUserModal.isActive })}
                  className={`w-10 h-5 rounded-full transition-colors ${editUserModal.isActive ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${editUserModal.isActive ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">كلمة مرور جديدة (اختياري)</Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={editUserModal.newPassword || ""}
                    onChange={(e) => setEditUserModal({ ...editUserModal, newPassword: e.target.value })}
                    placeholder="اتركه فارغاً للإبقاء على الحالية"
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={updateUserMutation.isPending}
                  onClick={() => updateUserMutation.mutate({
                    id: editUserModal.id,
                    name: editUserModal.name,
                    email: editUserModal.email,
                    role: editUserModal.role,
                    isActive: editUserModal.isActive,
                    companyName: editUserModal.companyName,
                    newPassword: editUserModal.newPassword || undefined,
                  })}
                >
                  {updateUserMutation.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
                </Button>
                <Button variant="outline" onClick={() => setEditUserModal(null)}>إلغاء</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

          {/* ===== COUPONS TAB ===== */}
          {tab === "coupons" && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-slate-800">كوبونات الخصم</h2>
                <Button onClick={() => setCouponModal({})} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                  <Plus size={15} /> إضافة كوبون
                </Button>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-right px-4 py-3 text-slate-600 font-medium">كود الخصم</th>
                      <th className="text-right px-4 py-3 text-slate-600 font-medium">نوع الخصم</th>
                      <th className="text-right px-4 py-3 text-slate-600 font-medium">قيمة الخصم</th>
                      <th className="text-right px-4 py-3 text-slate-600 font-medium">الاستخدام</th>
                      <th className="text-right px-4 py-3 text-slate-600 font-medium">انتهاء</th>
                      <th className="text-right px-4 py-3 text-slate-600 font-medium">الحالة</th>
                      <th className="text-right px-4 py-3 text-slate-600 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {couponsQuery.isLoading ? (
                      <tr><td colSpan={7} className="text-center py-8 text-slate-400">جاري التحميل...</td></tr>
                    ) : couponsQuery.data?.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-8 text-slate-400">لا توجد كوبونات حتى الآن</td></tr>
                    ) : couponsQuery.data?.map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-blue-700">{c.code}</td>
                        <td className="px-4 py-3 text-slate-600">{c.discountType === "percentage" ? "نسبة %" : "مبلغ ثابت"}</td>
                        <td className="px-4 py-3 font-semibold text-green-700">
                          {c.discountType === "percentage" ? `${parseFloat(c.discountValue)}%` : `${parseFloat(c.discountValue).toLocaleString("ar-EG")} ج.م`}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{c.usedCount} / {c.maxUses ?? "غير محدود"}</td>
                        <td className="px-4 py-3 text-slate-600">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("ar-EG") : "دائم"}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => updateCouponMutation.mutate({ id: c.id, isActive: !c.isActive })}
                            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                              c.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-600 hover:bg-red-200"
                            }`}
                          >
                            {c.isActive ? <><ToggleRight size={13} /> نشط</> : <><ToggleLeft size={13} /> موقوف</>}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => deleteCouponMutation.mutate({ id: c.id })}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== REPORTS TAB ===== */}
          {tab === "reports" && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-6">تقرير الاشتراكات</h2>
              {reportQuery.isLoading ? (
                <div className="text-center py-16 text-slate-400">جاري تحميل التقرير...</div>
              ) : (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-3">
                        <CreditCard size={20} />
                      </div>
                      <div className="text-2xl font-bold text-slate-800">{reportQuery.data?.totalSubscriptions ?? 0}</div>
                      <div className="text-xs text-slate-500 mt-1">إجمالي الاشتراكات</div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                      <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mb-3">
                        <DollarSign size={20} />
                      </div>
                      <div className="text-2xl font-bold text-slate-800">{(reportQuery.data?.totalRevenue ?? 0).toLocaleString("ar-EG")} ج.م</div>
                      <div className="text-xs text-slate-500 mt-1">إجمالي الإيرادات</div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                      <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-3">
                        <TrendingUp size={20} />
                      </div>
                      <div className="text-2xl font-bold text-slate-800">
                        {reportQuery.data?.statusBreakdown?.active ?? 0}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">اشتراكات نشطة</div>
                    </div>
                  </div>

                  {/* Monthly Chart */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-semibold text-slate-700 mb-4">الاشتراكات الجديدة (آخر 6 أشهر)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={reportQuery.data?.monthly ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => [v, "عدد"]} />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="اشتراكات" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Revenue Chart */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-semibold text-slate-700 mb-4">الإيرادات الشهرية (ج.م)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={reportQuery.data?.monthly ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => [`${v} ج.م`, "إيرادات"]} />
                        <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="إيرادات" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* By Plan & Status */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                      <h3 className="font-semibold text-slate-700 mb-4">توزيع حسب الخطة</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <RechartsPie>
                          <Pie
                            data={reportQuery.data?.byPlan ?? []}
                            dataKey="count"
                            nameKey="name"
                            cx="50%" cy="50%"
                            outerRadius={70}
                            label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {(reportQuery.data?.byPlan ?? []).map((_: any, i: number) => (
                              <Cell key={i} fill={["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"][i % 4]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </RechartsPie>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                      <h3 className="font-semibold text-slate-700 mb-4">توزيع حسب الحالة</h3>
                      <div className="space-y-3 mt-2">
                        {Object.entries(reportQuery.data?.statusBreakdown ?? {}).map(([status, count]: any) => (
                          <div key={status} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || "bg-gray-100 text-gray-600"}`}>
                                {statusLabels[status] || status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-32 bg-slate-100 rounded-full h-2">
                                <div
                                  className="bg-blue-500 h-2 rounded-full"
                                  style={{ width: `${(count / (reportQuery.data?.totalSubscriptions || 1)) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold text-slate-700 w-6 text-left">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== PAYMOB TAB ===== */}
          {tab === "paymob" && (
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold text-slate-800 mb-2">إعدادات Paymob</h2>
              <p className="text-sm text-slate-500 mb-6">
                اربط حساب Paymob لتفعيل الدفع المباشر عند اختيار العميل لخطة مدفوعة.
              </p>

              {paymobQuery.isLoading ? (
                <div className="text-center py-16 text-slate-400">جاري التحميل...</div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>الوضع</Label>
                      <Select
                        value={paymobForm.mode}
                        onValueChange={(v) => setPaymobForm((f) => ({ ...f, mode: v as "test" | "live" }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="test">تجريبي (Test)</SelectItem>
                          <SelectItem value="live">مباشر (Live)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>العملة</Label>
                      <Input
                        value={paymobForm.currency}
                        onChange={(e) => setPaymobForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                        maxLength={3}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Public Key</Label>
                    <Input
                      value={paymobForm.publicKey}
                      onChange={(e) => setPaymobForm((f) => ({ ...f, publicKey: e.target.value }))}
                      placeholder="pk_test_... أو egy_pk_..."
                      dir="ltr"
                      className="font-mono text-sm"
                    />
                    {paymobQuery.data?.publicKeyLast8 && (
                      <p className="text-xs text-slate-400 mt-1">المحفوظ ينتهي بـ: ...{paymobQuery.data.publicKeyLast8}</p>
                    )}
                  </div>

                  <div>
                    <Label>Secret Key (API Token)</Label>
                    <Input
                      type="password"
                      value={paymobForm.secretKey}
                      onChange={(e) => setPaymobForm((f) => ({ ...f, secretKey: e.target.value }))}
                      placeholder={paymobQuery.data?.hasSecretKey ? "اتركه فارغاً للإبقاء على المفتاح الحالي" : "أدخل Secret Key"}
                      dir="ltr"
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>HMAC Secret (للـ Webhook)</Label>
                    <Input
                      type="password"
                      value={paymobForm.hmacSecret}
                      onChange={(e) => setPaymobForm((f) => ({ ...f, hmacSecret: e.target.value }))}
                      placeholder={paymobQuery.data?.hasHmacSecret ? "اتركه فارغاً للإبقاء على القيمة الحالية" : "من Paymob > Developers > Webhooks"}
                      dir="ltr"
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Card Integration ID</Label>
                    <Input
                      value={paymobForm.cardIntegrationId}
                      onChange={(e) => setPaymobForm((f) => ({ ...f, cardIntegrationId: e.target.value }))}
                      placeholder="مثال: 123456"
                      dir="ltr"
                    />
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={paymobForm.isEnabled}
                      onChange={(e) => setPaymobForm((f) => ({ ...f, isEnabled: e.target.checked }))}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700">تفعيل الدفع عبر Paymob</span>
                  </label>

                  {paymobQuery.data?.webhookUrl && (
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                      <p className="font-medium text-slate-700">روابط Paymob</p>
                      <div>
                        <span className="text-slate-500 text-xs">Webhook URL (ضعه في Paymob):</span>
                        <p className="font-mono text-xs break-all text-blue-700 mt-1" dir="ltr">{paymobQuery.data.webhookUrl}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs">Return URL:</span>
                        <p className="font-mono text-xs break-all text-slate-600 mt-1" dir="ltr">{paymobQuery.data.returnUrl}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      onClick={() => savePaymobMutation.mutate({
                        mode: paymobForm.mode,
                        publicKey: paymobForm.publicKey || undefined,
                        secretKey: paymobForm.secretKey || undefined,
                        hmacSecret: paymobForm.hmacSecret || undefined,
                        cardIntegrationId: paymobForm.cardIntegrationId ? Number(paymobForm.cardIntegrationId) : undefined,
                        currency: paymobForm.currency,
                        isEnabled: paymobForm.isEnabled,
                      })}
                      disabled={savePaymobMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {savePaymobMutation.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => testPaymobMutation.mutate()}
                      disabled={testPaymobMutation.isPending || !paymobQuery.data?.configured}
                    >
                      {testPaymobMutation.isPending ? "جاري الاختبار..." : "اختبار الاتصال"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== SUPPORT TAB ===== */}
          {tab === "support" && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-slate-800">طلبات الدعم ({ticketsQuery.data?.total ?? 0})</h2>
                <div className="flex gap-2">
                  {["all", "open", "in_progress", "resolved", "closed"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setTicketFilter(s as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        ticketFilter === s ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {{ all: "الكل", open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلقة" }[s]}
                    </button>
                  ))}
                </div>
              </div>
              {ticketsQuery.isLoading ? (
                <div className="text-center py-16 text-slate-400">جاري تحميل الطلبات...</div>
              ) : (
                <div className="space-y-3">
                  {(ticketsQuery.data?.rows || [])
                    .filter((t: any) => ticketFilter === "all" || t.status === ticketFilter)
                    .map((ticket: any) => {
                      const isExpanded = expandedTicket === ticket.id;
                      const statusCfg: Record<string, { label: string; color: string }> = {
                        open: { label: "مفتوحة", color: "bg-blue-100 text-blue-700" },
                        in_progress: { label: "قيد المعالجة", color: "bg-yellow-100 text-yellow-700" },
                        resolved: { label: "تم الحل", color: "bg-green-100 text-green-700" },
                        closed: { label: "مغلقة", color: "bg-gray-100 text-gray-600" },
                      };
                      const priorityCfg: Record<string, { label: string; color: string }> = {
                        low: { label: "منخفضة", color: "bg-gray-100 text-gray-600" },
                        medium: { label: "متوسطة", color: "bg-blue-100 text-blue-700" },
                        high: { label: "عالية", color: "bg-orange-100 text-orange-700" },
                        urgent: { label: "عاجلة", color: "bg-red-100 text-red-700" },
                      };
                      const sc = statusCfg[ticket.status] || statusCfg.open;
                      const pc = priorityCfg[ticket.priority] || priorityCfg.medium;
                      return (
                        <div key={ticket.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                          <div
                            className="p-4 cursor-pointer"
                            onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-slate-800 text-sm">{ticket.subject}</div>
                                <div className="text-xs text-slate-400 mt-0.5">
                                  {ticket.userName || ticket.userEmail} • {new Date(ticket.createdAt).toLocaleDateString("ar-EG")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pc.color}`}>{pc.label}</span>
                                {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                              <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{ticket.message}</div>
                              {ticket.adminReply && (
                                <div className="text-sm text-slate-700 bg-blue-50 border border-blue-100 rounded-lg p-3">
                                  <div className="text-xs text-blue-600 mb-1 font-medium">ردك السابق:</div>
                                  {ticket.adminReply}
                                </div>
                              )}
                              <Button
                                size="sm"
                                onClick={() => setReplyModal(ticket)}
                                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-8"
                              >
                                <MessageSquare size={13} />
                                {ticket.adminReply ? "تعديل الرد" : "رد على الطلب"}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {(ticketsQuery.data?.rows || []).filter((t: any) => ticketFilter === "all" || t.status === ticketFilter).length === 0 && (
                    <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <LifeBuoy size={36} className="mx-auto text-slate-300 mb-3" />
                      <p className="text-slate-400">لا توجد طلبات دعم بهذه الحالة</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

      {/* ===== ADD/EDIT SUBSCRIPTION MODAL ===== */}
      <Dialog open={addSubModal || !!editSubModal} onOpenChange={() => { setAddSubModal(false); setEditSubModal(null); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editSubModal ? "تعديل اشتراك" : "إضافة اشتراك جديد"}</DialogTitle>
          </DialogHeader>
          <SubForm
            initial={editSubModal}
            users={usersQuery.data?.rows || []}
            plans={plansQuery.data || []}
            onSubmit={(data: any) => upsertSubMutation.mutate(data)}
            isPending={upsertSubMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* ===== PLAN MODAL ===== */}
      <Dialog open={!!planModal} onOpenChange={() => setPlanModal(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{planModal?.id ? "تعديل خطة" : "إضافة خطة جديدة"}</DialogTitle>
          </DialogHeader>
          <PlanForm
            initial={planModal}
            onSubmit={(data: any) => upsertPlanMutation.mutate(data)}
            isPending={upsertPlanMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* ===== COUPON MODAL ===== */}
      <Dialog open={!!couponModal} onOpenChange={() => setCouponModal(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة كوبون جديد</DialogTitle>
          </DialogHeader>
          <CouponForm
            onSubmit={(data: any) => createCouponMutation.mutate(data)}
            isPending={createCouponMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* ===== REPLY TICKET MODAL ===== */}
      <Dialog open={!!replyModal} onOpenChange={() => setReplyModal(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>رد على طلب الدعم</DialogTitle>
          </DialogHeader>
          {replyModal && (
            <ReplyForm
              ticket={replyModal}
              onSubmit={(data: any) => replyTicketMutation.mutate(data)}
              isPending={replyTicketMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Sub-components =====

function SubForm({ initial, users, plans, onSubmit, isPending }: any) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    id: initial?.id,
    userId: initial?.userId?.toString() || "",
    planId: initial?.planId?.toString() || "",
    status: initial?.status || "active",
    startDate: initial?.startDate || today,
    endDate: initial?.endDate || "",
    notes: initial?.notes || "",
  });

  return (
    <div className="space-y-4 pt-2">
      <div>
        <Label className="text-sm mb-1.5 block">المستخدم</Label>
        <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
          <SelectTrigger><SelectValue placeholder="اختر مستخدم" /></SelectTrigger>
          <SelectContent>
            {users.map((u: any) => (
              <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.email})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm mb-1.5 block">خطة الاشتراك</Label>
        <Select value={form.planId} onValueChange={(v) => setForm({ ...form, planId: v })}>
          <SelectTrigger><SelectValue placeholder="اختر خطة" /></SelectTrigger>
          <SelectContent>
            {plans.map((p: any) => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.nameAr} - {parseFloat(p.price).toLocaleString("ar-EG")} ج.م</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm mb-1.5 block">الحالة</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="trial">تجريبي</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="expired">منتهي</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
            <SelectItem value="suspended">موقوف</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm mb-1.5 block">تاريخ البداية</Label>
          <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">تاريخ الانتهاء</Label>
          <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </div>
      </div>
      <div>
        <Label className="text-sm mb-1.5 block">ملاحظات</Label>
        <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات اختيارية" />
      </div>
      <Button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        disabled={isPending || !form.userId || !form.planId || !form.startDate || !form.endDate}
        onClick={() => onSubmit({
          id: form.id,
          userId: parseInt(form.userId),
          planId: parseInt(form.planId),
          status: form.status as any,
          startDate: form.startDate,
          endDate: form.endDate,
          notes: form.notes || undefined,
        })}
      >
        {isPending ? "جاري الحفظ..." : "حفظ الاشتراك"}
      </Button>
    </div>
  );
}

function PlanForm({ initial, onSubmit, isPending }: any) {
  const [form, setForm] = useState({
    id: initial?.id,
    name: initial?.name || "",
    nameAr: initial?.nameAr || "",
    price: initial?.price || "0",
    currency: initial?.currency || "EGP",
    durationDays: initial?.durationDays || 30,
    maxUsers: initial?.maxUsers || 5,
    maxInvoices: initial?.maxInvoices || 500,
    features: initial?.features || "",
    isActive: initial?.isActive !== false,
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm mb-1.5 block">اسم الخطة (عربي)</Label>
          <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="الخطة الشهرية" />
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">اسم الخطة (إنجليزي)</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="monthly" dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm mb-1.5 block">السعر</Label>
          <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} dir="ltr" />
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">المدة (أيام)</Label>
          <Input type="number" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: parseInt(e.target.value) })} dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm mb-1.5 block">أقصى مستخدمين</Label>
          <Input type="number" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: parseInt(e.target.value) })} dir="ltr" />
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">أقصى فواتير</Label>
          <Input type="number" value={form.maxInvoices} onChange={(e) => setForm({ ...form, maxInvoices: parseInt(e.target.value) })} dir="ltr" />
        </div>
      </div>
      <div>
        <Label className="text-sm mb-1.5 block">المميزات</Label>
        <Input value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder="جميع الميزات مفتوحة" />
      </div>
      <div className="flex items-center gap-3">
        <Label className="text-sm">الخطة نشطة</Label>
        <button
          onClick={() => setForm({ ...form, isActive: !form.isActive })}
          className={`w-10 h-5 rounded-full transition-colors ${form.isActive ? "bg-green-500" : "bg-gray-300"}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${form.isActive ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      <Button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        disabled={isPending || !form.name || !form.nameAr}
        onClick={() => onSubmit({ ...form })}
      >
        {isPending ? "جاري الحفظ..." : "حفظ الخطة"}
      </Button>
    </div>
  );
}

function CouponForm({ onSubmit, isPending }: any) {
  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: 10,
    maxUses: "" as string | number,
    expiresAt: "",
  });

  return (
    <div className="space-y-4 pt-2">
      <div>
        <Label className="text-sm mb-1.5 block">كود الخصم *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="SUMMER20"
          dir="ltr"
          className="font-mono uppercase"
        />
      </div>
      <div>
        <Label className="text-sm mb-1.5 block">الوصف</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="خصم الصيف..."
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm mb-1.5 block">نوع الخصم</Label>
          <Select value={form.discountType} onValueChange={(v: any) => setForm({ ...form, discountType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">نسبة مئوية %</SelectItem>
              <SelectItem value="fixed">مبلغ ثابت ج.م</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">
            قيمة الخصم {form.discountType === "percentage" ? "(%)" : "(ج.م)"}
          </Label>
          <Input
            type="number"
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: parseFloat(e.target.value) || 0 })}
            min={1}
            max={form.discountType === "percentage" ? 100 : undefined}
            dir="ltr"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm mb-1.5 block">أقصى استخدامات (اختياري)</Label>
          <Input
            type="number"
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
            placeholder="غير محدود"
            dir="ltr"
          />
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">تاريخ الانتهاء (اختياري)</Label>
          <Input
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />
        </div>
      </div>
      <Button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        disabled={isPending || !form.code || !form.discountValue}
        onClick={() => onSubmit({
          code: form.code,
          description: form.description || undefined,
          discountType: form.discountType,
          discountValue: form.discountValue,
          maxUses: form.maxUses ? Number(form.maxUses) : undefined,
          expiresAt: form.expiresAt || undefined,
        })}
      >
        {isPending ? "جاري الحفظ..." : "إنشاء الكوبون"}
      </Button>
    </div>
  );
}

function ReplyForm({ ticket, onSubmit, isPending }: any) {
  const [form, setForm] = useState({
    ticketId: ticket.id,
    reply: ticket.adminReply || "",
    status: ticket.status || "open",
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="bg-slate-50 rounded-lg p-3">
        <div className="text-xs text-slate-500 mb-1">الطلب:</div>
        <div className="text-sm font-medium text-slate-800">{ticket.subject}</div>
        <div className="text-xs text-slate-600 mt-1">{ticket.message}</div>
      </div>
      <div>
        <Label className="text-sm mb-1.5 block">ردك على الطلب</Label>
        <textarea
          className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={4}
          value={form.reply}
          onChange={(e) => setForm({ ...form, reply: e.target.value })}
          placeholder="اكتب ردك هنا..."
        />
      </div>
      <div>
        <Label className="text-sm mb-1.5 block">تحديث حالة الطلب</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">مفتوحة</SelectItem>
            <SelectItem value="in_progress">قيد المعالجة</SelectItem>
            <SelectItem value="resolved">تم الحل</SelectItem>
            <SelectItem value="closed">مغلقة</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        disabled={isPending || !form.reply.trim()}
        onClick={() => onSubmit({
          ticketId: form.ticketId,
          reply: form.reply,
          status: form.status as any,
        })}
      >
        {isPending ? "جاري الإرسال..." : "إرسال الرد"}
      </Button>
    </div>
  );
}
