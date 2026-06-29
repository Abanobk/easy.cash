import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, User, Crown, Edit, Plus, Trash2, Key, Eye, EyeOff, Calculator, ShoppingCart, Warehouse } from "lucide-react";

type AppRole = "admin" | "user" | "accountant" | "sales_rep" | "warehouse_manager";

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: AppRole;
  jobTitle: string;
}

const defaultForm: UserForm = { name: "", email: "", password: "", role: "user", jobTitle: "" };

const ROLES: { value: AppRole; label: string; description: string; color: string; icon: React.ReactNode }[] = [
  { value: "admin",             label: "مدير",             description: "وصول كامل: إدارة المستخدمين، الإعدادات، جميع التقارير والعمليات",  color: "bg-purple-100 text-purple-700", icon: <Crown size={12} /> },
  { value: "accountant",        label: "محاسب",            description: "وصول للحسابات والفواتير والتقارير المالية",                          color: "bg-green-100 text-green-700",   icon: <Calculator size={12} /> },
  { value: "sales_rep",         label: "مندوب مبيعات",    description: "وصول لفواتير البيع والعملاء ومندوبي المبيعات",                       color: "bg-orange-100 text-orange-700", icon: <ShoppingCart size={12} /> },
  { value: "warehouse_manager", label: "مدير مخازن",      description: "وصول للمخازن والأصناف والتسويات والتحويلات",                         color: "bg-cyan-100 text-cyan-700",     icon: <Warehouse size={12} /> },
  { value: "user",              label: "مستخدم",           description: "وصول محدود: إدخال البيانات، عرض الفواتير والتقارير الأساسية",        color: "bg-blue-100 text-blue-700",     icon: <User size={12} /> },
];

function roleInfo(role: string) {
  return ROLES.find(r => r.value === role) ?? { label: role, color: "bg-slate-100 text-slate-600", icon: <User size={12} /> };
}

export default function UsersPermissions() {
  const { data: users, isLoading, refetch } = trpc.settings.users.list.useQuery();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState<{ userId: number; name: string } | null>(null);
  const [form, setForm] = useState<UserForm>(defaultForm);
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [editRoleUser, setEditRoleUser] = useState<{ userId: number; name: string; currentRole: AppRole } | null>(null);
  const [editRole, setEditRole] = useState<AppRole>("user");

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

  return (
    <ERPLayout title="المستخدمون والصلاحيات">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Card className="border-0 shadow-sm bg-blue-50 flex-1 ml-4">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Shield size={18} className="text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">نظام الصلاحيات</p>
                  <p className="text-xs text-blue-600 mt-0.5">يمكنك إضافة مستخدمين بأدوار مختلفة: مدير، محاسب، مندوب مبيعات، مدير مخازن، أو مستخدم عادي. كل دور له صلاحيات محددة.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Button onClick={() => setShowAddDialog(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shrink-0">
            <Plus size={15} /> إضافة مستخدم
          </Button>
        </div>

        {/* Roles Legend */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ROLES.map(r => (
            <Card key={r.value} className="border-0 shadow-sm">
              <CardContent className="p-3 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${r.color}`}>
                  {r.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{r.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Users Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-800">
              المستخدمون ({users?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-10 text-center text-slate-400 text-sm">جاري التحميل...</div>
            ) : !users?.length ? (
              <div className="py-10 text-center text-slate-400 text-sm">لا يوجد مستخدمون</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">المستخدم</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">البريد الإلكتروني</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">المسمى الوظيفي</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">تاريخ الانضمام</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الصلاحية</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map((user: any) => {
                    const info = roleInfo(user.role);
                    return (
                      <tr key={user.id} className="border-b border-slate-50 hover:bg-blue-50/30">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                              {user.name?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <span className="font-medium text-slate-700">{user.name || "غير محدد"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{user.email || "-"}</td>
                        <td className="px-4 py-2.5 text-slate-500">{(user as any).jobTitle || "-"}</td>
                        <td className="px-4 py-2.5 text-slate-500">{user.createdAt ? new Date(user.createdAt).toLocaleDateString("ar-EG") : "-"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${info.color}`}>
                            {info.icon} {info.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 text-xs gap-1 text-blue-600 hover:bg-blue-50"
                              onClick={() => { setEditRoleUser({ userId: user.id, name: user.name, currentRole: user.role }); setEditRole(user.role); }}
                            >
                              <Edit size={11} /> تغيير الدور
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 text-xs gap-1 text-amber-600 hover:bg-amber-50"
                              onClick={() => setShowResetDialog({ userId: user.id, name: user.name })}
                            >
                              <Key size={11} /> كلمة المرور
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 text-xs gap-1 text-red-500 hover:bg-red-50"
                              onClick={() => {
                                if (confirm(`هل تريد حذف المستخدم "${user.name}"؟`))
                                  deleteMut.mutate(user.id);
                              }}
                            >
                              <Trash2 size={11} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={16} className="text-blue-600" /> إضافة مستخدم جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">الاسم الكامل *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="أحمد محمد" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">المسمى الوظيفي</Label>
                <Input value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))} placeholder="محاسب / مبيعات..." className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">البريد الإلكتروني *</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@company.com" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور *</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="6 أحرف على الأقل"
                  className="h-9 text-sm pl-10"
                />
                <button type="button" onClick={() => setShowPass(p => !p)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الصلاحية / الدور</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as AppRole }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير - وصول كامل</SelectItem>
                  <SelectItem value="accountant">محاسب - الحسابات والفواتير</SelectItem>
                  <SelectItem value="sales_rep">مندوب مبيعات - البيع والعملاء</SelectItem>
                  <SelectItem value="warehouse_manager">مدير مخازن - المخازن والأصناف</SelectItem>
                  <SelectItem value="user">مستخدم - وصول محدود</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => createMut.mutate(form)}
                disabled={!form.name || !form.email || !form.password || createMut.isPending}
              >
                {createMut.isPending ? "جاري الإنشاء..." : "إنشاء المستخدم"}
              </Button>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editRoleUser} onOpenChange={() => setEditRoleUser(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit size={16} className="text-blue-600" /> تغيير دور المستخدم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-600">تغيير دور: <strong>{editRoleUser?.name}</strong></p>
            <div className="space-y-1.5">
              <Label className="text-xs">الدور الجديد</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v as AppRole)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير - وصول كامل</SelectItem>
                  <SelectItem value="accountant">محاسب - الحسابات والفواتير</SelectItem>
                  <SelectItem value="sales_rep">مندوب مبيعات - البيع والعملاء</SelectItem>
                  <SelectItem value="warehouse_manager">مدير مخازن - المخازن والأصناف</SelectItem>
                  <SelectItem value="user">مستخدم - وصول محدود</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => editRoleUser && updateRoleMut.mutate({ userId: editRoleUser.userId, role: editRole })}
                disabled={updateRoleMut.isPending}
              >
                {updateRoleMut.isPending ? "جاري التحديث..." : "تحديث الدور"}
              </Button>
              <Button variant="outline" onClick={() => setEditRoleUser(null)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showResetDialog} onOpenChange={() => setShowResetDialog(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key size={16} className="text-amber-600" /> تغيير كلمة المرور
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-600">تغيير كلمة مرور: <strong>{showResetDialog?.name}</strong></p>
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="6 أحرف على الأقل"
                  className="h-9 text-sm pl-10"
                />
                <button type="button" onClick={() => setShowNewPass(p => !p)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => showResetDialog && resetPassMut.mutate({ userId: showResetDialog.userId, newPassword })}
                disabled={newPassword.length < 6 || resetPassMut.isPending}
              >
                {resetPassMut.isPending ? "جاري التغيير..." : "تغيير كلمة المرور"}
              </Button>
              <Button variant="outline" onClick={() => setShowResetDialog(null)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
