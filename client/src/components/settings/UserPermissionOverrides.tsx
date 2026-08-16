import { Fragment, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type EffectivePermissions,
  type PermissionAction,
  type PermissionModule,
} from "@shared/permissions";
import { SlidersHorizontal } from "lucide-react";

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "عرض",
  create: "إضافة",
  edit: "تعديل",
  delete: "حذف",
};

interface Props {
  userId: number;
  userName: string;
  open: boolean;
  onClose: () => void;
}

export default function UserPermissionOverrides({ userId, userName, open, onClose }: Props) {
  const [draft, setDraft] = useState<EffectivePermissions | null>(null);

  const overridesQuery = trpc.permissions.userOverrides.useQuery(
    { userId },
    { enabled: open && userId > 0 },
  );

  const saveMut = trpc.permissions.saveUserOverrides.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ صلاحيات المستخدم");
      overridesQuery.refetch();
      setDraft(null);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const permissions = draft ?? overridesQuery.data?.permissions;

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

  const save = () => {
    if (!permissions) return;
    const payload: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }> = {};
    for (const mod of PERMISSION_MODULES) {
      payload[mod.id] = { ...permissions[mod.id] };
    }
    saveMut.mutate({ userId, permissions: payload });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setDraft(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0" dir="rtl">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
            <span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
              <SlidersHorizontal size={15} />
            </span>
            صلاحيات مخصصة — {userName}
          </DialogTitle>
          <p className="text-xs font-semibold text-slate-500 pt-1">
            التعديلات هنا فوق صلاحيات الدور. احفظ بعد التغييرات.
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-1">
          {overridesQuery.isLoading || !permissions ? (
            <p className="text-sm text-slate-400 py-12 text-center font-semibold">جاري التحميل...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[640px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-white">
                    <th className="text-right px-4 py-2.5 font-extrabold text-xs">القسم</th>
                    {PERMISSION_ACTIONS.map((a) => (
                      <th key={a} className="text-center px-2 py-2.5 font-extrabold text-xs w-16">{ACTION_LABELS[a]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([group, mods]) => (
                    <Fragment key={group}>
                      <tr className="bg-slate-100">
                        <td colSpan={5} className="px-4 py-1.5 text-xs font-extrabold text-slate-600">{group}</td>
                      </tr>
                      {mods.map((mod, idx) => (
                        <tr key={mod.id} className={`border-t border-slate-100 ${idx % 2 ? "bg-slate-50/70" : "bg-white"}`}>
                          <td className="px-4 py-2.5 font-bold text-slate-800">{mod.labelAr}</td>
                          {PERMISSION_ACTIONS.map((action) => (
                            <td key={action} className="text-center px-2 py-2">
                              <input
                                type="checkbox"
                                checked={permissions[mod.id][action]}
                                onChange={(e) => toggle(mod.id, action, e.target.checked)}
                                className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <Button variant="outline" className="h-10" onClick={() => { setDraft(null); onClose(); }}>إلغاء</Button>
          <Button className="h-10 font-extrabold" onClick={save} disabled={saveMut.isPending || !draft}>
            {saveMut.isPending ? "جاري الحفظ..." : "حفظ الصلاحيات"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
