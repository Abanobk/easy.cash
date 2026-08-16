import { Fragment, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PermissionGate from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type EffectivePermissions,
  type PermissionAction,
  type PermissionModule,
} from "@shared/permissions";
import { AlertCircle, Plus, Save, Trash2 } from "lucide-react";

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "عرض",
  create: "إضافة",
  edit: "تعديل",
  delete: "حذف",
};

export default function RolePermissionsMatrix() {
  const [role, setRole] = useState<string>("accountant");
  const [draft, setDraft] = useState<EffectivePermissions | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [copyFrom, setCopyFrom] = useState("user");

  const rolesQuery = trpc.permissions.listRoles.useQuery();
  const editableRoles = rolesQuery.data?.editableRoles || [];

  useEffect(() => {
    if (!editableRoles.length) return;
    if (!editableRoles.some((r) => r.roleKey === role)) {
      setRole(editableRoles[0].roleKey);
      setDraft(null);
    }
  }, [editableRoles, role]);

  const matrixQuery = trpc.permissions.roleMatrix.useQuery(
    { role },
    { enabled: !!role && editableRoles.some((r) => r.roleKey === role) },
  );
  const utils = trpc.useUtils();

  const saveMut = trpc.permissions.saveRole.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ صلاحيات الأقسام");
      matrixQuery.refetch();
      setDraft(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const createMut = trpc.permissions.createRole.useMutation({
    onSuccess: async (res) => {
      toast.success("تم إنشاء الدور");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      await rolesQuery.refetch();
      await utils.permissions.listRoles.invalidate();
      setRole(res.roleKey);
      setDraft(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.permissions.deleteRole.useMutation({
    onSuccess: async () => {
      toast.success("تم حذف الدور");
      await rolesQuery.refetch();
      setRole("user");
      setDraft(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const permissions = draft ?? matrixQuery.data?.permissions;
  const selectedMeta = editableRoles.find((r) => r.roleKey === role);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_MODULES>();
    for (const mod of PERMISSION_MODULES) {
      const list = map.get(mod.group) ?? [];
      list.push(mod);
      map.set(mod.group, list);
    }
    return [...map.entries()];
  }, []);

  const toggle = (module: PermissionModule, action: PermissionAction, value: boolean) => {
    if (!permissions) return;
    const row = { ...permissions[module], [action]: value };
    if (action === "view" && !value) {
      row.create = false;
      row.edit = false;
      row.delete = false;
    }
    if (action !== "view" && value) row.view = true;
    setDraft({
      ...permissions,
      [module]: row,
    });
  };

  const setModuleAll = (module: PermissionModule, on: boolean) => {
    if (!permissions) return;
    setDraft({
      ...permissions,
      [module]: on
        ? { view: true, create: true, edit: true, delete: true }
        : { view: false, create: false, edit: false, delete: false },
    });
  };

  const save = () => {
    if (!permissions || !role) return;
    const payload: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }> = {};
    for (const mod of PERMISSION_MODULES) {
      payload[mod.id] = { ...permissions[mod.id] };
    }
    saveMut.mutate({ role, permissions: payload });
  };

  const dirty = !!draft;

  return (
    <>
      <Card className="erp-data-card border-0 overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-200 bg-white space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-extrabold text-slate-900">صلاحيات الأقسام العامة</CardTitle>
              <p className="text-sm font-semibold text-slate-600 mt-1 max-w-2xl leading-relaxed">
                أنشئ دوراً جديداً ثم حدّد صلاحياته. للتحكم شاشةً بشاشة استخدم تبويب{" "}
                <span className="text-blue-700 font-extrabold">تفصيل الشاشات</span>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={role} onValueChange={(v) => { setRole(v); setDraft(null); }}>
                <SelectTrigger className="w-52 h-11 text-[15px] font-bold">
                  <SelectValue placeholder="اختر الدور" />
                </SelectTrigger>
                <SelectContent>
                  {editableRoles.map((r) => (
                    <SelectItem key={r.roleKey} value={r.roleKey}>
                      {r.name}{r.isBuiltin ? "" : " (مخصص)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <PermissionGate module="security" action="create">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-4 font-extrabold gap-2"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus size={16} /> دور جديد
                </Button>
              </PermissionGate>
              {selectedMeta && !selectedMeta.isBuiltin && (
                <PermissionGate module="security" action="delete">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-3 font-extrabold text-red-700 border-red-200 hover:bg-red-50 gap-1"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (!confirm(`حذف الدور «${selectedMeta.name}»؟`)) return;
                      deleteMut.mutate({ roleKey: selectedMeta.roleKey });
                    }}
                  >
                    <Trash2 size={15} /> حذف
                  </Button>
                </PermissionGate>
              )}
              <PermissionGate module="security" action="edit">
                <Button
                  className="h-11 px-5 font-extrabold text-[15px] gap-2"
                  onClick={save}
                  disabled={saveMut.isPending || !draft}
                >
                  <Save size={16} />
                  {saveMut.isPending ? "جاري الحفظ..." : "حفظ الأقسام"}
                </Button>
              </PermissionGate>
            </div>
          </div>

          {dirty && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              لديك تعديلات غير محفوظة على دور «{selectedMeta?.name || role}».
              <PermissionGate module="security" action="edit">
                <Button size="sm" className="h-8 ms-auto font-extrabold gap-1" onClick={save} disabled={saveMut.isPending}>
                  <Save size={14} /> حفظ الآن
                </Button>
              </PermissionGate>
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {matrixQuery.isLoading || !permissions ? (
            <p className="text-sm font-bold text-slate-500 py-16 text-center">جاري التحميل...</p>
          ) : (
            <table className="w-full text-[15px] border-collapse min-w-[680px]">
              <thead className="sticky top-0 bg-slate-800 text-white z-10">
                <tr>
                  <th className="text-right px-4 py-3 font-extrabold text-xs">القسم</th>
                  {PERMISSION_ACTIONS.map((a) => (
                    <th key={a} className="text-center px-2 py-3 font-extrabold text-xs w-20">{ACTION_LABELS[a]}</th>
                  ))}
                  <th className="text-center px-2 py-3 font-extrabold text-xs w-24">الكل</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([group, mods]) => (
                  <Fragment key={group}>
                    <tr className="bg-slate-100">
                      <td colSpan={6} className="px-4 py-2 text-xs font-extrabold text-slate-700 tracking-wide">
                        {group}
                      </td>
                    </tr>
                    {mods.map((mod, idx) => {
                      const row = permissions[mod.id];
                      const full = row.view && row.create && row.edit && row.delete;
                      return (
                        <tr
                          key={mod.id}
                          className={`border-t border-slate-100 ${idx % 2 ? "bg-slate-50/70" : "bg-white"} hover:bg-sky-50`}
                        >
                          <td className="px-4 py-3 font-extrabold text-slate-900">{mod.labelAr}</td>
                          {PERMISSION_ACTIONS.map((a) => (
                            <td key={a} className="text-center px-2 py-2.5">
                              <input
                                type="checkbox"
                                checked={row[a]}
                                onChange={(e) => toggle(mod.id, a, e.target.checked)}
                                className="w-[1.15rem] h-[1.15rem] rounded accent-blue-600 cursor-pointer"
                                aria-label={`${mod.labelAr} ${ACTION_LABELS[a]}`}
                              />
                            </td>
                          ))}
                          <td className="text-center px-2 py-2.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={full ? "secondary" : "outline"}
                              className="h-8 text-xs font-extrabold"
                              onClick={() => setModuleAll(mod.id, !full)}
                            >
                              {full ? "إلغاء" : "تفعيل"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">إضافة دور جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-sm font-bold">اسم الدور</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: مراجع مخازن"
                className="mt-1 h-11 font-semibold"
              />
            </div>
            <div>
              <Label className="text-sm font-bold">الوصف (اختياري)</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="صلاحيات خاصة بهذا الدور"
                className="mt-1 font-semibold"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-sm font-bold">انسخ الصلاحيات من</Label>
              <Select value={copyFrom} onValueChange={setCopyFrom}>
                <SelectTrigger className="mt-1 h-11 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editableRoles.filter((r) => r.isBuiltin).map((r) => (
                    <SelectItem key={r.roleKey} value={r.roleKey}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1.5 font-semibold">
                بعدها تقدر تعدّل الصلاحيات من الجدول أو من تفصيل الشاشات.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
              <Button
                disabled={!newName.trim() || createMut.isPending}
                onClick={() => createMut.mutate({
                  name: newName.trim(),
                  description: newDesc.trim() || undefined,
                  copyFrom,
                })}
              >
                {createMut.isPending ? "جاري الإنشاء..." : "إنشاء الدور"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
