import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PermissionGate from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PERM_ACTION_LABELS, type PermActionKey } from "@shared/permission-tree";
import { AlertCircle, ChevronDown, ChevronLeft, Save, Search } from "lucide-react";

type TreeEntity = {
  key: string;
  label: string;
  availableActions: PermActionKey[];
  allowedActions: PermActionKey[];
};
type TreeModule = { key: string; label: string; entities: TreeEntity[] };

/** خريطة entityKey -> Set(الأفعال المفعّلة) للمسودة الحالية */
type DraftMap = Record<string, PermActionKey[]>;

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
    <Card className="erp-data-card border-0 overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-200 bg-white space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-extrabold text-slate-900">الصلاحيات التفصيلية</CardTitle>
            <p className="text-sm font-semibold text-slate-600 mt-1 max-w-2xl leading-relaxed">
              تحكم دقيق في كل عنصر بأفعاله الخاصة (إضافة، اعتماد، طباعة، فك اعتماد...) — نفس منطق ميجا كاش.
              <span className="text-amber-700 font-extrabold"> ملاحظة: </span>
              هذه الشجرة مرحلة إدارة وتخزين حاليًا؛ التفعيل الفعلي شاشة بشاشة سيتم تدريجيًا لاحقًا.
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

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث عن قسم أو عنصر..."
              className="h-10 pr-9 text-sm font-semibold"
            />
          </div>
          <span className="text-xs font-bold text-slate-500">
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

      <CardContent className="p-0">
        {treeQuery.isLoading || !tree.length ? (
          <p className="text-sm font-bold text-slate-500 py-16 text-center">جاري التحميل...</p>
        ) : !filteredTree.length ? (
          <p className="text-sm font-bold text-slate-500 py-16 text-center">لا نتائج مطابقة للبحث</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTree.map((m) => {
              const isOpen = openModules.has(m.key);
              const moduleAllowedCount = m.entities.reduce(
                (sum, e) => sum + (current[`${m.key}::${e.key}`]?.length || 0),
                0,
              );
              const moduleTotalCount = m.entities.reduce((sum, e) => sum + e.availableActions.length, 0);
              const allOn = moduleTotalCount > 0 && moduleAllowedCount === moduleTotalCount;
              return (
                <div key={m.key}>
                  <button
                    type="button"
                    onClick={() => toggleModuleOpen(m.key)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-right"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? <ChevronDown size={16} className="text-slate-500 shrink-0" /> : <ChevronLeft size={16} className="text-slate-500 shrink-0" />}
                      <span className="font-extrabold text-slate-900 truncate">{m.label}</span>
                      <span className="text-xs font-bold text-slate-500 shrink-0">
                        ({m.entities.length} عنصر — {moduleAllowedCount}/{moduleTotalCount})
                      </span>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(ev) => { ev.stopPropagation(); setModuleAll(m, !allOn); }}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.stopPropagation(); setModuleAll(m, !allOn); } }}
                      className={`text-xs font-extrabold px-2.5 py-1 rounded-full shrink-0 ${
                        allOn ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {allOn ? "إلغاء الكل" : "تفعيل الكل"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse min-w-[640px]">
                        <tbody>
                          {m.entities.map((e, idx) => {
                            const allowed = current[`${m.key}::${e.key}`] || [];
                            const entityAllOn = e.availableActions.length > 0 && allowed.length === e.availableActions.length;
                            return (
                              <tr
                                key={e.key}
                                className={`border-t border-slate-100 ${idx % 2 ? "bg-slate-50/60" : "bg-white"} hover:bg-sky-50/70`}
                              >
                                <td className="px-4 py-2.5 align-top w-56 shrink-0">
                                  <div className="font-bold text-slate-800">{e.label}</div>
                                  <button
                                    type="button"
                                    onClick={() => setEntityAll(m.key, e, !entityAllOn)}
                                    className={`mt-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                                      entityAllOn ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                    }`}
                                  >
                                    {entityAllOn ? "إلغاء الكل" : "تفعيل الكل"}
                                  </button>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                                    {e.availableActions.map((a) => (
                                      <label key={a} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer whitespace-nowrap">
                                        <input
                                          type="checkbox"
                                          checked={allowed.includes(a)}
                                          onChange={() => toggleAction(m.key, e.key, a)}
                                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                                        />
                                        {PERM_ACTION_LABELS[a]}
                                      </label>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
