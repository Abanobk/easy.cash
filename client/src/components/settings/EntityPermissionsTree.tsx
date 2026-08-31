import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PermissionGate from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  PERM_ACTION_LABELS,
  PERM_ACTION_CATEGORY,
  PERM_ACTION_CATEGORY_LABELS,
  PERM_ACTION_CATEGORY_ORDER,
  type PermActionKey,
  type PermActionCategory,
} from "@shared/permission-tree";
import {
  AlertCircle, Check, ChevronDown, ChevronLeft, Save, Search, Maximize2, Minimize2,
  Settings2, Users, Briefcase, Warehouse, ShoppingBag, ShoppingCart, MapPin, Banknote,
  Landmark, Calculator, Building2, Factory, Target, HandCoins, CalendarClock, Receipt,
  BarChart3, ShieldCheck, Layers,
} from "lucide-react";

type TreeEntity = {
  key: string;
  label: string;
  availableActions: PermActionKey[];
  allowedActions: PermActionKey[];
};
type TreeModule = { key: string; label: string; entities: TreeEntity[] };

/** خريطة entityKey -> Set(الأفعال المفعّلة) للمسودة الحالية */
type DraftMap = Record<string, PermActionKey[]>;

/** أيقونة مميزة لكل قسم رئيسي — تسهّل التعرف السريع بالعين بدل قراءة كل اسم */
const MODULE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  settings: Settings2,
  contacts: Users,
  hr: Briefcase,
  inventory: Warehouse,
  purchases: ShoppingBag,
  sales: ShoppingCart,
  sales_reps: MapPin,
  cash: Banknote,
  bank: Landmark,
  accounts: Calculator,
  assets: Building2,
  production: Factory,
  cost_centers: Target,
  loans: HandCoins,
  installments: CalendarClock,
  receivables: Receipt,
  reports: BarChart3,
  security: ShieldCheck,
};

/** ألوان كل فئة أفعال — نفس اللون بيتكرر على الشِب النشط والنقطة في الدليل */
const CATEGORY_STYLES: Record<PermActionCategory, { dot: string; active: string }> = {
  core: { dot: "bg-blue-500", active: "bg-blue-50 text-blue-800 border-blue-300" },
  destructive: { dot: "bg-rose-500", active: "bg-rose-50 text-rose-700 border-rose-300" },
  approval: { dot: "bg-amber-500", active: "bg-amber-50 text-amber-800 border-amber-300" },
  scope: { dot: "bg-teal-500", active: "bg-teal-50 text-teal-800 border-teal-300" },
  finance: { dot: "bg-emerald-500", active: "bg-emerald-50 text-emerald-800 border-emerald-300" },
  sensitive: { dot: "bg-violet-500", active: "bg-violet-50 text-violet-800 border-violet-300" },
  print: { dot: "bg-slate-500", active: "bg-slate-100 text-slate-700 border-slate-300" },
};

function sortActions(actions: PermActionKey[]): PermActionKey[] {
  return [...actions].sort((a, b) => {
    const diff = PERM_ACTION_CATEGORY_ORDER.indexOf(PERM_ACTION_CATEGORY[a]) - PERM_ACTION_CATEGORY_ORDER.indexOf(PERM_ACTION_CATEGORY[b]);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

/** شِب فعل واحد — رمادي وباهت لو مطفي، ملوّن حسب فئته + علامة صح لو مفعّل */
function ActionChip({ action, checked, onToggle }: { action: PermActionKey; checked: boolean; onToggle: () => void }) {
  const style = CATEGORY_STYLES[PERM_ACTION_CATEGORY[action]];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
        checked ? style.active : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      }`}
    >
      {checked && <Check size={11} className="shrink-0" />}
      {PERM_ACTION_LABELS[action]}
    </button>
  );
}

/** مفتاح "تفعيل الكل" الصغير المستخدم في العنصر والقسم — يوضح الحالة الحالية بدل زرار غامض */
function AllToggle({
  allOn,
  onClick,
  size = "sm",
  stopPropagation,
}: {
  allOn: boolean;
  onClick: () => void;
  size?: "sm" | "xs";
  stopPropagation?: boolean;
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  return (
    <button
      type="button"
      onClick={(ev) => {
        if (stopPropagation) ev.stopPropagation();
        onClick();
      }}
      className={`shrink-0 rounded-full font-extrabold ${pad} ${
        allOn ? "bg-blue-100 text-blue-800 hover:bg-blue-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}
    >
      {allOn ? "إلغاء الكل" : "تفعيل الكل"}
    </button>
  );
}

export default function EntityPermissionsTree() {
  const [role, setRole] = useState<string>("accountant");
  const [draft, setDraft] = useState<DraftMap | null>(null);
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const rolesQuery = trpc.permissions.listRoles.useQuery();
  const editableRoles = rolesQuery.data?.editableRoles || [];

  useEffect(() => {
    if (!editableRoles.length) return;
    if (!editableRoles.some((r) => r.roleKey === role)) {
      setRole(editableRoles[0].roleKey);
      setDraft(null);
    }
  }, [editableRoles, role]);

  const treeQuery = trpc.permissions.entityTree.useQuery(
    { role },
    { enabled: !!role && editableRoles.some((r) => r.roleKey === role) },
  );

  const saveMut = trpc.permissions.saveEntityTree.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ الصلاحيات التفصيلية");
      treeQuery.refetch();
      setDraft(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const tree = (treeQuery.data?.tree || []) as unknown as TreeModule[];

  const baseMap: DraftMap = useMemo(() => {
    const map: DraftMap = {};
    for (const m of tree) {
      for (const e of m.entities) {
        map[`${m.key}::${e.key}`] = [...e.allowedActions];
      }
    }
    return map;
  }, [tree]);

  const current = draft ?? baseMap;
  const dirty = !!draft;

  const filteredTree = useMemo(() => {
    const q = search.trim();
    if (!q) return tree;
    return tree
      .map((m) => ({
        ...m,
        entities: m.entities.filter((e) => e.label.includes(q) || m.label.includes(q)),
      }))
      .filter((m) => m.entities.length > 0);
  }, [tree, search]);

  useEffect(() => {
    // لما يبقى فيه بحث، افتح كل الأقسام اللي فيها نتيجة تلقائيًا
    if (search.trim()) {
      setOpenModules(new Set(filteredTree.map((m) => m.key)));
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleModuleOpen = (key: string) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setOpenModules(new Set(filteredTree.map((m) => m.key)));
  const collapseAll = () => setOpenModules(new Set());

  const toggleAction = (moduleKey: string, entityKey: string, action: PermActionKey) => {
    const id = `${moduleKey}::${entityKey}`;
    const cur = current[id] || [];
    const has = cur.includes(action);
    const next = has ? cur.filter((a) => a !== action) : [...cur, action];
    setDraft({ ...current, [id]: next });
  };

  const setEntityAll = (moduleKey: string, entity: TreeEntity, on: boolean) => {
    const id = `${moduleKey}::${entity.key}`;
    setDraft({ ...current, [id]: on ? [...entity.availableActions] : [] });
  };

  const setModuleAll = (m: TreeModule, on: boolean) => {
    const next = { ...current };
    for (const e of m.entities) {
      next[`${m.key}::${e.key}`] = on ? [...e.availableActions] : [];
    }
    setDraft(next);
  };

  const totalAllowed = useMemo(
    () => Object.values(current).reduce((sum, arr) => sum + arr.length, 0),
    [current],
  );

  const save = () => {
    if (!role) return;
    const entities: { moduleKey: string; entityKey: string; allowedActions: string[] }[] = [];
    for (const m of tree) {
      for (const e of m.entities) {
        const allowed = current[`${m.key}::${e.key}`] || [];
        entities.push({ moduleKey: m.key, entityKey: e.key, allowedActions: allowed });
      }
    }
    saveMut.mutate({ role, entities });
  };

  const selectedMeta = editableRoles.find((r) => r.roleKey === role);

  return (
    <>
      <Card className="erp-data-card border-0 overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-200 bg-white space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-extrabold text-slate-900">الصلاحيات التفصيلية</CardTitle>
              <p className="text-sm font-semibold text-slate-600 mt-1 max-w-2xl leading-relaxed">
                تحكم دقيق في كل عنصر بأفعاله الخاصة — نفس منطق ميجا كاش. الشِب الملوّن = مفعّل، الرمادي = مطفي.
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
              <PermissionGate module="security" action="edit">
                <Button
                  className="h-11 px-5 font-extrabold text-[15px] gap-2"
                  onClick={save}
                  disabled={saveMut.isPending || !dirty}
                >
                  <Save size={16} />
                  {saveMut.isPending ? "جاري الحفظ..." : "حفظ الشجرة"}
                </Button>
              </PermissionGate>
            </div>
          </div>

          {/* دليل ألوان الفئات — يفهّم العين معنى كل لون قبل ما تدخل في التفاصيل */}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
            <span className="text-[11px] font-extrabold text-slate-400 shrink-0">دليل الألوان:</span>
            {PERM_ACTION_CATEGORY_ORDER.map((cat) => (
              <span key={cat} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_STYLES[cat].dot}`} />
                {PERM_ACTION_CATEGORY_LABELS[cat]}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث عن قسم أو عنصر..."
                  className="h-10 pr-9 text-sm font-semibold"
                />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5 font-bold text-xs" onClick={expandAll}>
                <Maximize2 size={13} /> فتح الكل
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5 font-bold text-xs" onClick={collapseAll}>
                <Minimize2 size={13} /> طي الكل
              </Button>
            </div>
            <span className="text-xs font-bold text-slate-500 shrink-0">
              {totalAllowed} صلاحية مفعّلة لدور «{selectedMeta?.name || role}»
            </span>
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

        <CardContent className="p-3 bg-slate-100/60">
          {treeQuery.isLoading || !tree.length ? (
            <p className="text-sm font-bold text-slate-500 py-16 text-center">جاري التحميل...</p>
          ) : !filteredTree.length ? (
            <p className="text-sm font-bold text-slate-500 py-16 text-center">لا نتائج مطابقة للبحث</p>
          ) : (
            <div className="space-y-2.5">
              {filteredTree.map((m) => {
                const isOpen = openModules.has(m.key);
                const moduleAllowedCount = m.entities.reduce(
                  (sum, e) => sum + (current[`${m.key}::${e.key}`]?.length || 0),
                  0,
                );
                const moduleTotalCount = m.entities.reduce((sum, e) => sum + e.availableActions.length, 0);
                const allOn = moduleTotalCount > 0 && moduleAllowedCount === moduleTotalCount;
                const pct = moduleTotalCount > 0 ? Math.round((moduleAllowedCount / moduleTotalCount) * 100) : 0;
                const Icon = MODULE_ICONS[m.key] || Layers;
                return (
                  <div
                    key={m.key}
                    className={`rounded-2xl border overflow-hidden transition-all ${
                      isOpen
                        ? "border-blue-300 shadow-md ring-1 ring-blue-100"
                        : "border-slate-200 bg-white shadow-sm hover:border-slate-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleModuleOpen(m.key)}
                      className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 text-right transition-colors ${
                        isOpen ? "bg-blue-50/80 hover:bg-blue-50" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          moduleAllowedCount > 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                        }`}>
                          <Icon size={17} />
                        </span>
                        <div className="min-w-0 text-right">
                          <div className="flex items-center gap-2">
                            <span className={`font-extrabold truncate ${isOpen ? "text-blue-900" : "text-slate-900"}`}>{m.label}</span>
                            <span className="text-[11px] font-bold text-slate-400 shrink-0">{m.entities.length} عنصر</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 w-40 max-w-full">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${moduleAllowedCount > 0 ? "bg-blue-500" : "bg-slate-200"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 shrink-0 tabular-nums">
                              {moduleAllowedCount}/{moduleTotalCount}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <AllToggle allOn={allOn} onClick={() => setModuleAll(m, !allOn)} stopPropagation />
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                          isOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                        }`}>
                          {isOpen ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-blue-100 bg-slate-50/70 p-3">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                          {m.entities.map((e) => {
                            const allowed = current[`${m.key}::${e.key}`] || [];
                            const entityAllOn = e.availableActions.length > 0 && allowed.length === e.availableActions.length;
                            const hasAny = allowed.length > 0;
                            return (
                              <div
                                key={e.key}
                                className={`rounded-xl border p-2.5 transition-colors ${
                                  hasAny ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="font-extrabold text-slate-800 text-sm truncate">{e.label}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                                      {allowed.length}/{e.availableActions.length}
                                    </span>
                                    <AllToggle allOn={entityAllOn} onClick={() => setEntityAll(m.key, e, !entityAllOn)} size="xs" />
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {sortActions(e.availableActions).map((a) => (
                                    <ActionChip
                                      key={a}
                                      action={a}
                                      checked={allowed.includes(a)}
                                      onToggle={() => toggleAction(m.key, e.key, a)}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* زر حفظ عائم — يفضل متاح لو المستخدم نزل جوه قائمة طويلة، عشان مايضطرش يرجع لفوق */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center pointer-events-none">
          <PermissionGate module="security" action="edit">
            <Button
              className="pointer-events-auto h-12 px-6 rounded-full shadow-lg font-extrabold text-[15px] gap-2 bg-slate-900 hover:bg-slate-800 text-white"
              onClick={save}
              disabled={saveMut.isPending}
            >
              <Save size={17} />
              {saveMut.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </PermissionGate>
        </div>
      )}
    </>
  );
}
