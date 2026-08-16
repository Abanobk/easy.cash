import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PermissionGate from "@/components/PermissionGate";
import { FEATURE_REGISTRY } from "@/config/erp-navigation";
import type { ModulePermission, PermissionAction } from "@shared/permissions";
import {
  ChevronDown, ChevronLeft, CheckSquare, Square, Search,
  ChevronsDownUp, ChevronsUpDown, Save, AlertCircle,
} from "lucide-react";

const ACTIONS: Array<{ key: PermissionAction; label: string }> = [
  { key: "view", label: "عرض" },
  { key: "create", label: "إضافة" },
  { key: "edit", label: "تعديل" },
  { key: "delete", label: "حذف" },
];

const FEATURE_ENTRIES = Object.entries(FEATURE_REGISTRY).map(([key, meta]) => ({
  key,
  label: meta.label,
  module: meta.module,
  status: meta.status,
}));

function emptyPerm(): ModulePermission {
  return { view: false, create: false, edit: false, delete: false };
}

function allPerm(): ModulePermission {
  return { view: true, create: true, edit: true, delete: true };
}

function PermCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex flex-col items-center gap-0.5 cursor-pointer select-none min-w-[3rem]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-[1.15rem] h-[1.15rem] rounded border-slate-400 text-blue-600 accent-blue-600 cursor-pointer"
        aria-label={label}
      />
    </label>
  );
}

export default function ScreenPermissionsMatrix() {
  const [role, setRole] = useState<string>("accountant");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, ModulePermission> | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const rolesQuery = trpc.permissions.listRoles.useQuery();
  const editableRoles = rolesQuery.data?.editableRoles || [];

  useEffect(() => {
    if (!editableRoles.length) return;
    if (!editableRoles.some((r) => r.roleKey === role)) {
      setRole(editableRoles[0].roleKey);
      setDraft(null);
    }
  }, [editableRoles, role]);

  const featureKeys = useMemo(() => FEATURE_ENTRIES.map((f) => f.key), []);
  const matrixQuery = trpc.permissions.screenMatrix.useQuery(
    { role, featureKeys },
    { enabled: !!role && editableRoles.some((r) => r.roleKey === role) },
  );
  const saveMut = trpc.permissions.saveScreens.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ صلاحيات الشاشات التفصيلية");
      matrixQuery.refetch();
      setDraft(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const screens = draft ?? matrixQuery.data?.screens ?? {};

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = FEATURE_ENTRIES.filter(
      (f) => !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q) || f.module.includes(q),
    );
    const map = new Map<string, typeof FEATURE_ENTRIES>();
    for (const row of filtered) {
      const list = map.get(row.module) ?? [];
      list.push(row);
      map.set(row.module, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ar"));
  }, [search]);

  const moduleNames = useMemo(() => grouped.map(([name]) => name), [grouped]);
  const allCollapsed = moduleNames.length > 0 && moduleNames.every((n) => collapsed[n] === true);

  const togglePerm = (featureKey: string, field: keyof ModulePermission, value: boolean) => {
    const current = screens[featureKey] ?? emptyPerm();
    const next = { ...current, [field]: value };
    if (field === "view" && !value) {
      next.create = false;
      next.edit = false;
      next.delete = false;
    }
    if (field !== "view" && value) next.view = true;
    setDraft({ ...screens, [featureKey]: next });
  };

  const setRowAll = (featureKey: string, on: boolean) => {
    setDraft({ ...screens, [featureKey]: on ? allPerm() : emptyPerm() });
  };

  const setGroupAction = (keys: string[], action: PermissionAction, on: boolean) => {
    const next = { ...screens };
    for (const key of keys) {
      const cur = next[key] ?? emptyPerm();
      const row = { ...cur, [action]: on };
      if (action === "view" && !on) {
        row.create = false;
        row.edit = false;
        row.delete = false;
      }
      if (action !== "view" && on) row.view = true;
      next[key] = row;
    }
    setDraft(next);
  };

  const setGroupAll = (keys: string[], on: boolean) => {
    const next = { ...screens };
    for (const key of keys) next[key] = on ? allPerm() : emptyPerm();
    setDraft(next);
  };

  const save = () => {
    const payload: Record<string, ModulePermission> = {};
    for (const { key } of FEATURE_ENTRIES) {
      const row = screens[key];
      if (!row) continue;
      payload[key] = { ...row };
    }
    saveMut.mutate({ role, screens: payload });
  };

  const totalScreens = FEATURE_ENTRIES.length;
  const dirty = !!draft;
  const visibleCount = grouped.reduce((n, [, rows]) => n + rows.length, 0);

  return (
    <Card className="erp-data-card border-0 overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-200 bg-white space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-extrabold text-slate-900">
              صلاحيات الشاشات التفصيلية
            </CardTitle>
            <p className="text-sm font-semibold text-slate-600 mt-1 leading-relaxed max-w-2xl">
              تحكم بكل شاشة على حدة ({totalScreens} شاشة): عرض · إضافة · تعديل · حذف.
              التفصيل هنا يغلّب على الأقسام العامة.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v);
                setDraft(null);
              }}
            >
              <SelectTrigger className="w-52 h-11 text-[15px] font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editableRoles.map((r) => (
                  <SelectItem key={r.roleKey} value={r.roleKey}>
                    {r.name}{r.isBuiltin ? "" : " (مخصص)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PermissionGate module="security" action="edit">
              <Button
                className="h-11 px-5 font-extrabold text-[15px] gap-2"
                onClick={save}
                disabled={saveMut.isPending || !dirty}
              >
                <Save size={16} />
                {saveMut.isPending ? "جاري الحفظ..." : "حفظ التفصيل"}
              </Button>
            </PermissionGate>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث: شاشة أو قسم..."
              className="h-10 text-[15px] font-semibold pr-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 font-bold"
            onClick={() => {
              if (allCollapsed) {
                setCollapsed({});
              } else {
                const next: Record<string, boolean> = {};
                for (const name of moduleNames) next[name] = true;
                setCollapsed(next);
              }
            }}
          >
            {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
            {allCollapsed ? "توسيع الكل" : "طي الكل"}
          </Button>
          <span className="text-xs font-bold text-slate-500 ms-auto">
            يظهر {visibleCount} بند
          </span>
        </div>

        {dirty && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            لديك تعديلات غير محفوظة على دور «{editableRoles.find((r) => r.roleKey === role)?.name || role}».
            <PermissionGate module="security" action="edit">
              <Button size="sm" className="h-8 ms-auto font-extrabold gap-1" onClick={save} disabled={saveMut.isPending}>
                <Save size={14} /> حفظ الآن
              </Button>
            </PermissionGate>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_repeat(4,3.25rem)_3.75rem] gap-1 items-center px-4 py-2.5 bg-slate-800 text-white text-xs font-extrabold">
          <div>الشاشة</div>
          {ACTIONS.map((a) => (
            <div key={a.key} className="text-center">{a.label}</div>
          ))}
          <div className="text-center">الكل</div>
        </div>

        {matrixQuery.isLoading ? (
          <p className="text-sm font-bold text-slate-500 py-16 text-center">جاري تحميل الشاشات...</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm font-bold text-slate-500 py-16 text-center">لا نتائج للبحث</p>
        ) : (
          <div className="max-h-[62vh] overflow-y-auto divide-y divide-slate-200">
            {grouped.map(([moduleName, rows]) => {
              const keys = rows.map((r) => r.key);
              const isClosed = collapsed[moduleName] === true;
              const fullGroup = keys.every((k) => {
                const p = screens[k];
                return p?.view && p?.create && p?.edit && p?.delete;
              });
              return (
                <section key={moduleName} className="bg-white">
                  <div className="sticky top-[2.35rem] z-10 flex flex-wrap items-center gap-2 px-3 py-2.5 bg-slate-100/95 border-b border-slate-200 backdrop-blur-sm">
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 min-w-[10rem] text-right"
                      onClick={() => setCollapsed((c) => ({ ...c, [moduleName]: !isClosed }))}
                    >
                      {isClosed ? <ChevronLeft size={17} className="text-slate-500" /> : <ChevronDown size={17} className="text-slate-500" />}
                      <span className="text-[15px] font-extrabold text-slate-900">{moduleName}</span>
                      <span className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                        {rows.length}
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-1">
                      {ACTIONS.map((a) => (
                        <Button
                          key={a.key}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] font-bold border-slate-300 bg-white"
                          onClick={() => setGroupAction(keys, a.key, !keys.every((k) => screens[k]?.[a.key]))}
                        >
                          {a.label}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2.5 text-[11px] font-extrabold"
                        variant={fullGroup ? "secondary" : "default"}
                        onClick={() => setGroupAll(keys, !fullGroup)}
                      >
                        {fullGroup ? "إلغاء الكل" : "تفعيل الكل"}
                      </Button>
                    </div>
                  </div>

                  {!isClosed && (
                    <ul className="divide-y divide-slate-100">
                      {rows.map((row, idx) => {
                        const perm = screens[row.key] ?? emptyPerm();
                        const full = perm.view && perm.create && perm.edit && perm.delete;
                        return (
                          <li
                            key={row.key}
                            title={row.key}
                            className={`grid grid-cols-[minmax(0,1fr)_repeat(4,3.25rem)_3.75rem] gap-1 items-center px-4 py-2.5 ${
                              idx % 2 ? "bg-slate-50/70" : "bg-white"
                            } hover:bg-sky-50 transition-colors`}
                          >
                            <div className="min-w-0 pr-1">
                              <div className="text-[14px] font-extrabold text-slate-900 truncate">{row.label}</div>
                            </div>
                            {ACTIONS.map((a) => (
                              <div key={a.key} className="flex justify-center">
                                <PermCheck
                                  label={a.label}
                                  checked={Boolean(perm[a.key])}
                                  onChange={(v) => togglePerm(row.key, a.key, v)}
                                />
                              </div>
                            ))}
                            <div className="flex justify-center">
                              <button
                                type="button"
                                title={full ? "إلغاء كل صلاحيات الشاشة" : "تفعيل كل صلاحيات الشاشة"}
                                className={`p-1.5 rounded-lg ${full ? "text-emerald-700 bg-emerald-50" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                                onClick={() => setRowAll(row.key, !full)}
                              >
                                {full ? <CheckSquare size={18} /> : <Square size={18} />}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
