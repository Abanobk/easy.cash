import { useState, useEffect, useMemo } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Shield, User, Crown, Edit, Plus, Trash2, Key, Eye, EyeOff, Calculator, ShoppingCart,
  Warehouse, Link2, SlidersHorizontal, MapPin, LayoutGrid, Layers, Users, Search,
} from "lucide-react";
import TenantLoginShareActions from "@/components/TenantLoginShareActions";
import { useTenantSlug } from "@/lib/tenant";
import { buildTenantLoginUrl } from "@/lib/tenant-login";

import RolePermissionsMatrix from "@/components/settings/RolePermissionsMatrix";
import ScreenPermissionsMatrix from "@/components/settings/ScreenPermissionsMatrix";
import UserPermissionOverrides from "@/components/settings/UserPermissionOverrides";
import PermissionGate from "@/components/PermissionGate";
import { AddActionButton } from "@/components/AddActionButton";

type AppRole = string;

type Tab = "screens" | "roles" | "users";

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: AppRole;
  jobTitle: string;
}

const defaultForm: UserForm = { name: "", email: "", password: "", role: "user", jobTitle: "" };

const BUILTIN_ROLE_STYLE: Record<string, { color: string; icon: React.ReactNode; description: string }> = {
  admin: { description: "وصول كامل لكل الشاشات والإعدادات", color: "bg-violet-100 text-violet-900 ring-1 ring-violet-200", icon: <Crown size={14} /> },
  accountant: { description: "الحسابات والفواتير والتقارير", color: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200", icon: <Calculator size={14} /> },
  sales_rep: { description: "البيع والعملاء والمندوبين", color: "bg-orange-100 text-orange-950 ring-1 ring-orange-200", icon: <ShoppingCart size={14} /> },
  warehouse_manager: { description: "المخازن والأصناف والتحويلات", color: "bg-cyan-100 text-cyan-950 ring-1 ring-cyan-200", icon: <Warehouse size={14} /> },
  user: { description: "إدخال وعرض أساسي", color: "bg-blue-100 text-blue-900 ring-1 ring-blue-200", icon: <User size={14} /> },
};

function ActionIconBtn({
  label,
  className,
  onClick,
  disabled,
  children,
}: {
  label: string;
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={`h-9 w-9 p-0 rounded-lg ${className || ""}`}
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function UsersPermissions() {
  const tenantSlug = useTenantSlug();
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const { data: me } = trpc.saas.me.useQuery();
  const tenantInfo = trpc.saas.resolveTenant.useQuery(
    { slug: tenantSlug || "" },
    { enabled: Boolean(tenantSlug) },
  );
  const { data: users, isLoading, refetch } = trpc.settings.users.list.useQuery();
  const rolesQuery = trpc.permissions.listRoles.useQuery();
  const allRoles = rolesQuery.data?.roles || [];

  const roleInfo = (role: string) => {
    const fromApi = allRoles.find((r) => r.roleKey === role);
    const style = BUILTIN_ROLE_STYLE[role] || {
      description: fromApi?.description || "دور مخصص",
      color: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
      icon: <Shield size={14} />,
    };
    return {
      label: fromApi?.name || role,
      description: fromApi?.description || style.description,
      color: style.color,
      icon: style.icon,
      isBuiltin: fromApi?.isBuiltin ?? Boolean(BUILTIN_ROLE_STYLE[role]),
    };
  };
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState<{ userId: number; name: string } | null>(null);
  const [form, setForm] = useState<UserForm>(defaultForm);
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [editRoleUser, setEditRoleUser] = useState<{ userId: number; name: string; currentRole: AppRole } | null>(null);
  const [editRole, setEditRole] = useState<AppRole>("user");
  const [overrideUser, setOverrideUser] = useState<{ userId: number; name: string } | null>(null);
  const [scopeUser, setScopeUser] = useState<{ userId: number; name: string } | null>(null);
  const [scopeBranches, setScopeBranches] = useState<number[] | null>(null);
  const [scopeWarehouses, setScopeWarehouses] = useState<number[] | null>(null);
  const [scopeAllBranches, setScopeAllBranches] = useState(true);
  const [scopeAllWarehouses, setScopeAllWarehouses] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const branchesQ = trpc.settings.branches.list.useQuery(undefined, { enabled: !!scopeUser });
  const warehousesQ = trpc.warehouses.list.useQuery(undefined, { enabled: !!scopeUser });
  const scopesQ = trpc.settings.users.getScopes.useQuery(scopeUser?.userId ?? 0, {
    enabled: !!scopeUser,
  });
  const updateScopesMut = trpc.settings.users.updateScopes.useMutation({
    onSuccess: () => { toast.success("تم حفظ نطاق الفروع والمخازن"); setScopeUser(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    if (!scopesQ.data) return;
    const b = scopesQ.data.branchIds;
    const w = scopesQ.data.warehouseIds;
    setScopeAllBranches(b == null);
    setScopeAllWarehouses(w == null);
    setScopeBranches(b ?? []);
    setScopeWarehouses(w ?? []);
  }, [scopesQ.data]);

  const createMut = trpc.settings.users.create.useMutation({
    onSuccess: () => { toast.success("تم إنشاء المستخدم بنجاح"); refetch(); setShowAddDialog(false); setForm(defaultForm); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateRoleMut = trpc.settings.users.updateRole.useMutation({
    onSuccess: () => { toast.success("تم تحديث الصلاحية"); refetch(); setEditRoleUser(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = trpc.settings.users.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف المستخدم"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const resetPassMut = trpc.settings.users.resetPassword.useMutation({
    onSuccess: () => { toast.success("تم تغيير كلمة المرور"); setShowResetDialog(null); setNewPassword(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return (users || []).filter((u: any) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        String(u.name || "").toLowerCase().includes(q) ||
        String(u.email || "").toLowerCase().includes(q) ||
        String(u.jobTitle || "").toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, roleFilter]);

  const tabs = [
    { id: "users" as const, label: "المستخدمون", hint: "الحسابات والأدوار", icon: Users, count: users?.length },
    { id: "screens" as const, label: "تفصيل الشاشات", hint: "صلاحية كل شاشة", icon: LayoutGrid },
    { id: "roles" as const, label: "أقسام عامة", hint: "اختصار لكل قسم", icon: Layers },
  ];

  return (
    <ERPLayout title="المستخدمون والصلاحيات">
      <div className="space-y-4">
        {/* Intro */}
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 md:px-5 shadow-sm">
          <div className="flex flex-wrap items-start gap-3 justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Shield size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-slate-900">إدارة الوصول</h2>
                <p className="text-sm font-semibold text-slate-600 mt-1 leading-relaxed max-w-2xl">
                  أضف المستخدمين وعيّن الأدوار، ثم اضبط الصلاحيات على مستوى القسم أو كل شاشة على حدة.
                  التفصيل يغلّب على الأقسام العامة عند التعارض.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-slate-100/90 border border-slate-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[9.5rem] flex items-center gap-3 rounded-xl px-3.5 py-3 text-right transition-all ${
                  active
                    ? "bg-white text-blue-800 shadow-sm ring-1 ring-blue-200"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  active ? "bg-blue-600 text-white" : "bg-slate-200/80 text-slate-600"
                }`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold leading-tight">
                    {tab.label}
                    {tab.count != null ? (
                      <span className={`ms-1.5 text-xs font-bold ${active ? "text-blue-600" : "text-slate-500"}`}>
                        ({tab.count})
                      </span>
                    ) : null}
                  </span>
                  <span className={`block text-xs font-semibold mt-0.5 ${active ? "text-blue-600/80" : "text-slate-500"}`}>
                    {tab.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {activeTab === "screens" ? (
          <ScreenPermissionsMatrix />
        ) : activeTab === "roles" ? (
          <RolePermissionsMatrix />
        ) : (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="بحث بالاسم أو البريد..."
                    className="h-11 pr-9 text-[15px] font-semibold"
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-11 w-44 text-[15px] font-bold">
                    <SelectValue placeholder="كل الأدوار" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأدوار</SelectItem>
                    {allRoles.map((r) => (
                      <SelectItem key={r.roleKey} value={r.roleKey}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <AddActionButton
                module="security"
                onClick={() => setShowAddDialog(true)}
                className="h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white gap-2 shrink-0 font-extrabold"
              >
                إضافة مستخدم
              </AddActionButton>
            </div>

            {/* Login link + roles strip */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3">
              {tenantSlug && (
                <Card className="erp-data-card border-0 overflow-hidden">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <Link2 size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-extrabold text-slate-900">رابط دخول الموظفين</p>
                        <p className="text-xs font-mono text-slate-600 mt-1 truncate" dir="ltr" title={buildTenantLoginUrl(tenantSlug)}>
                          {buildTenantLoginUrl(tenantSlug)}
                        </p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">شارك الرابط — دخول فقط بدون تسجيل جديد</p>
                      </div>
                    </div>
                    <TenantLoginShareActions
                      slug={tenantSlug}
                      companyName={tenantInfo.data?.name || me?.companyName || tenantSlug}
                      copyVariant="outline"
                      copyClassName="border-indigo-200 text-indigo-800 hover:bg-indigo-50 shrink-0"
                      layout="column"
                    />
                  </CardContent>
                </Card>
              )}

              <Card className="erp-data-card border-0">
                <CardContent className="p-4">
                  <p className="text-xs font-extrabold text-slate-500 mb-2.5 uppercase tracking-wide">الأدوار المتاحة</p>
                  <div className="flex flex-wrap gap-2">
                    {allRoles.map((r) => {
                      const info = roleInfo(r.roleKey);
                      return (
                      <Tooltip key={r.roleKey}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setRoleFilter(roleFilter === r.roleKey ? "all" : r.roleKey)}
                            className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full transition-shadow ${info.color} ${
                              roleFilter === r.roleKey ? "ring-2 ring-offset-1 ring-blue-500" : ""
                            }`}
                          >
                            {info.icon} {r.name}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{info.description}</TooltipContent>
                      </Tooltip>
                    );})}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Users table */}
            <Card className="erp-data-card border-0 overflow-hidden">
              <CardHeader className="py-3.5 px-4 border-b border-slate-200 bg-slate-50/80">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-extrabold text-slate-900">
                    قائمة المستخدمين
                    <span className="text-slate-500 font-bold text-sm ms-2">
                      {filteredUsers.length}
                      {filteredUsers.length !== (users?.length || 0) ? ` من ${users?.length || 0}` : ""}
                    </span>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="py-14 text-center text-slate-500 text-sm font-semibold">جاري التحميل...</div>
                ) : !filteredUsers.length ? (
                  <div className="py-14 text-center space-y-2">
                    <p className="text-slate-500 text-sm font-semibold">
                      {users?.length ? "لا نتائج مطابقة للبحث" : "لا يوجد مستخدمون بعد"}
                    </p>
                    {!users?.length && (
                      <PermissionGate module="security" action="create">
                        <Button className="mt-1" onClick={() => setShowAddDialog(true)}>
                          <Plus size={16} className="ms-1" /> إضافة أول مستخدم
                        </Button>
                      </PermissionGate>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="px-4 py-3 text-right text-xs font-extrabold">المستخدم</th>
                          <th className="px-4 py-3 text-right text-xs font-extrabold">البريد</th>
                          <th className="px-4 py-3 text-right text-xs font-extrabold">المسمى</th>
                          <th className="px-4 py-3 text-right text-xs font-extrabold">الانضمام</th>
                          <th className="px-4 py-3 text-right text-xs font-extrabold">الدور</th>
                          <th className="px-4 py-3 text-center text-xs font-extrabold w-[200px]">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((user: any, idx: number) => {
                          const info = roleInfo(user.role);
                          return (
                            <tr
                              key={user.id}
                              className={`border-b border-slate-100 ${idx % 2 ? "bg-slate-50/60" : "bg-white"} hover:bg-sky-50/90`}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shrink-0">
                                    {user.name?.charAt(0)?.toUpperCase() || "U"}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-extrabold text-slate-900 truncate">{user.name || "غير محدد"}</div>
                                    {user.isTenantOwner && (
                                      <span className="inline-flex mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                        مالك الشركة
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600 font-medium" dir="ltr">{user.email || "—"}</td>
                              <td className="px-4 py-3 text-slate-600 font-medium">{(user as any).jobTitle || "—"}</td>
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                                {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB") : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-1 rounded-full ${info.color}`}>
                                  {info.icon} {info.label}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-0.5">
                                  <PermissionGate module="security" action="edit">
                                    <ActionIconBtn
                                      label="تغيير الدور"
                                      className="text-blue-700 hover:bg-blue-100"
                                      disabled={user.isTenantOwner}
                                      onClick={() => {
                                        setEditRoleUser({ userId: user.id, name: user.name, currentRole: user.role });
                                        setEditRole(user.role);
                                      }}
                                    >
                                      <Edit size={16} />
                                    </ActionIconBtn>
                                    <ActionIconBtn
                                      label="نطاق الفروع والمخازن"
                                      className="text-teal-700 hover:bg-teal-100"
                                      disabled={user.role === "admin"}
                                      onClick={() => setScopeUser({ userId: user.id, name: user.name })}
                                    >
                                      <MapPin size={16} />
                                    </ActionIconBtn>
                                    <ActionIconBtn
                                      label="صلاحيات مخصصة"
                                      className="text-violet-700 hover:bg-violet-100"
                                      disabled={user.role === "admin"}
                                      onClick={() => setOverrideUser({ userId: user.id, name: user.name })}
                                    >
                                      <SlidersHorizontal size={16} />
                                    </ActionIconBtn>
                                    <ActionIconBtn
                                      label="تغيير كلمة المرور"
                                      className="text-amber-700 hover:bg-amber-100"
                                      onClick={() => setShowResetDialog({ userId: user.id, name: user.name })}
                                    >
                                      <Key size={16} />
                                    </ActionIconBtn>
                                  </PermissionGate>
                                  <PermissionGate module="security" action="delete">
                                    {!user.isTenantOwner && (
                                      <ActionIconBtn
                                        label="حذف المستخدم"
                                        className="text-red-600 hover:bg-red-100"
                                        onClick={() => {
                                          if (confirm(`هل تريد حذف المستخدم "${user.name}"؟`)) {
                                            deleteMut.mutate(user.id);
                                          }
                                        }}
                                      >
                                        <Trash2 size={16} />
                                      </ActionIconBtn>
                                    )}
                                  </PermissionGate>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Plus size={16} />
              </span>
              إضافة مستخدم جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">الاسم الكامل *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="أحمد محمد" className="h-10 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">المسمى الوظيفي</Label>
                <Input value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))} placeholder="محاسب / مبيعات..." className="h-10 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">البريد الإلكتروني *</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@company.com" className="h-10 text-sm" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">كلمة المرور *</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="6 أحرف على الأقل"
                  className="h-10 text-sm pl-10"
                />
                <button type="button" onClick={() => setShowPass(p => !p)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">الدور</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as AppRole }))}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map((r) => (
                    <SelectItem key={r.roleKey} value={r.roleKey}>
                      {r.name}{r.description ? ` — ${r.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white font-extrabold"
                onClick={() => createMut.mutate(form)}
                disabled={!form.name || !form.email || !form.password || createMut.isPending}
              >
                {createMut.isPending ? "جاري الإنشاء..." : "إنشاء المستخدم"}
              </Button>
              <Button variant="outline" className="h-10" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRoleUser} onOpenChange={() => setEditRoleUser(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <Edit size={16} className="text-blue-600" /> تغيير الدور
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-slate-600 font-semibold">المستخدم: <strong className="text-slate-900">{editRoleUser?.name}</strong></p>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">الدور الجديد</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v as AppRole)}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map((r) => (
                    <SelectItem key={r.roleKey} value={r.roleKey}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white font-extrabold"
                onClick={() => editRoleUser && updateRoleMut.mutate({ userId: editRoleUser.userId, role: editRole })}
                disabled={updateRoleMut.isPending}
              >
                {updateRoleMut.isPending ? "جاري التحديث..." : "حفظ الدور"}
              </Button>
              <Button variant="outline" className="h-10" onClick={() => setEditRoleUser(null)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showResetDialog} onOpenChange={() => setShowResetDialog(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <Key size={16} className="text-amber-600" /> تغيير كلمة المرور
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-slate-600 font-semibold">المستخدم: <strong className="text-slate-900">{showResetDialog?.name}</strong></p>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="6 أحرف على الأقل"
                  className="h-10 text-sm pl-10"
                />
                <button type="button" onClick={() => setShowNewPass(p => !p)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 text-white font-extrabold"
                onClick={() => showResetDialog && resetPassMut.mutate({ userId: showResetDialog.userId, newPassword })}
                disabled={newPassword.length < 6 || resetPassMut.isPending}
              >
                {resetPassMut.isPending ? "جاري التغيير..." : "حفظ كلمة المرور"}
              </Button>
              <Button variant="outline" className="h-10" onClick={() => setShowResetDialog(null)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <UserPermissionOverrides
        userId={overrideUser?.userId ?? 0}
        userName={overrideUser?.name ?? ""}
        open={!!overrideUser}
        onClose={() => setOverrideUser(null)}
      />

      <Dialog open={!!scopeUser} onOpenChange={() => setScopeUser(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <MapPin size={16} className="text-teal-600" />
              نطاق الفروع والمخازن — {scopeUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1 text-sm">
            <p className="text-slate-600 text-xs font-semibold leading-relaxed bg-teal-50 border border-teal-100 rounded-xl p-3">
              يحدّ من: فواتير البيع/الشراء، العملاء، قوائم الفروع والمخازن، التسويات والتحويلات، وتقارير الحسابات والمخازن.
              المدير يرى الكل دائمًا.
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 font-extrabold text-slate-800">
                <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={scopeAllBranches} onChange={(e) => setScopeAllBranches(e.target.checked)} />
                كل الفروع
              </label>
              {!scopeAllBranches && (
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                  {(branchesQ.data || []).map((b: { id: number; name: string }) => (
                    <label key={b.id} className="flex items-center gap-2 text-xs font-semibold">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-teal-600"
                        checked={scopeBranches?.includes(b.id) ?? false}
                        onChange={(e) => {
                          setScopeBranches((prev) => {
                            const cur = prev ?? [];
                            return e.target.checked ? [...cur, b.id] : cur.filter((id) => id !== b.id);
                          });
                        }}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 font-extrabold text-slate-800">
                <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={scopeAllWarehouses} onChange={(e) => setScopeAllWarehouses(e.target.checked)} />
                كل المخازن
              </label>
              {!scopeAllWarehouses && (
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                  {(warehousesQ.data || []).map((w: { id: number; name: string }) => (
                    <label key={w.id} className="flex items-center gap-2 text-xs font-semibold">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-teal-600"
                        checked={scopeWarehouses?.includes(w.id) ?? false}
                        onChange={(e) => {
                          setScopeWarehouses((prev) => {
                            const cur = prev ?? [];
                            return e.target.checked ? [...cur, w.id] : cur.filter((id) => id !== w.id);
                          });
                        }}
                      />
                      {w.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white font-extrabold"
                disabled={updateScopesMut.isPending}
                onClick={() => {
                  if (!scopeUser) return;
                  updateScopesMut.mutate({
                    userId: scopeUser.userId,
                    branchIds: scopeAllBranches ? null : (scopeBranches?.length ? scopeBranches : []),
                    warehouseIds: scopeAllWarehouses ? null : (scopeWarehouses?.length ? scopeWarehouses : []),
                  });
                }}
              >
                {updateScopesMut.isPending ? "جاري الحفظ..." : "حفظ النطاق"}
              </Button>
              <Button variant="outline" className="h-10" onClick={() => setScopeUser(null)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
