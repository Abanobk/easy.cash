import { useState, ReactNode } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { FieldLabel, FormSection, entryControlClass, entrySelectTriggerClass, entryTextareaClass } from "@/components/form/EntryForm";
import { DateField } from "@/components/form/DateField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Edit, Trash2 } from "lucide-react";
import { useEntityAllowed } from "@/hooks/useEntityPermission";
import type { DataTableEntity } from "@/components/DataTable";

export type EntityField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "textarea" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  /** قيمة افتراضية عند الإضافة (مفيدة للـ checkbox) */
  defaultValue?: string;
};

export type EntityColumn = {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => ReactNode;
};

type SimpleEntityPageProps = {
  title: string;
  tableTitle: string;
  columns: EntityColumn[];
  fields: EntityField[];
  data?: Record<string, unknown>[] | null;
  isLoading?: boolean;
  onRefresh: () => void;
  onCreate: (values: Record<string, string>) => Promise<unknown> | void;
  onUpdate: (id: number, values: Record<string, string>) => Promise<unknown> | void;
  onDelete: (id: number) => Promise<unknown> | void;
  addLabel?: string;
  /** الشجرة التفصيلية الجديدة — لإظهار زرار الإضافة وتعديل/حذف الصف */
  entity?: DataTableEntity;
  canEdit?: boolean;
  canDelete?: boolean;
  extraActions?: ReactNode;
  rowExtraActions?: (row: Record<string, unknown>) => ReactNode;
  /** بدون ERPLayout — لدمج أكثر من جدول في شاشة واحدة (مثل خصائص عامة) */
  embedded?: boolean;
};

export function SimpleEntityPage({
  title,
  tableTitle,
  columns,
  fields,
  data,
  isLoading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  addLabel = "إضافة",
  entity,
  canEdit: canEditProp,
  canDelete: canDeleteProp,
  extraActions,
  rowExtraActions,
  embedded = false,
}: SimpleEntityPageProps) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const addAllowed = useEntityAllowed(entity?.moduleKey ?? "", entity?.entityKey ?? "", "add");
  const editAllowed = useEntityAllowed(entity?.moduleKey ?? "", entity?.entityKey ?? "", "edit");
  const deleteAllowed = useEntityAllowed(entity?.moduleKey ?? "", entity?.entityKey ?? "", "deleteCancel");
  const showAdd = !entity || addAllowed;
  const canEdit = canEditProp ?? (entity ? editAllowed : true);
  const canDelete = canDeleteProp ?? (entity ? deleteAllowed : true);

  const filteredData = (() => {
    const rows = data || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      Object.values(row).some((v) => {
        if (v == null) return false;
        if (typeof v === "object") return false;
        return String(v).toLowerCase().includes(q);
      }),
    );
  })();

  const resetForm = () => {
    const empty: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "checkbox") empty[f.key] = f.defaultValue ?? "true";
      else empty[f.key] = f.defaultValue ?? "";
    }
    setForm(empty);
  };

  const openCreate = () => {
    setEditId(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (row: Record<string, unknown>) => {
    setEditId(Number(row.id));
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = row[f.key];
      if (f.type === "checkbox") {
        next[f.key] = v === true || v === 1 || v === "1" || v === "true" ? "true" : "false";
      } else {
        next[f.key] = v == null ? "" : String(v).slice(0, f.type === "date" ? 10 : undefined);
      }
    }
    setForm(next);
    setOpen(true);
  };

  const handleSubmit = async () => {
    for (const f of fields) {
      if (f.type === "checkbox") continue;
      if (f.required && !form[f.key]?.trim()) {
        toast.error(`${f.label} مطلوب`);
        return;
      }
    }
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      const field = fields.find((f) => f.key === k);
      if (field?.type === "checkbox") {
        cleaned[k] = v === "true" ? "true" : "false";
        continue;
      }
      const t = (v ?? "").trim();
      if (t) cleaned[k] = t;
    }
    for (const f of fields) {
      if (f.type === "checkbox") continue;
      if (f.required && form[f.key]?.trim()) cleaned[f.key] = form[f.key].trim();
    }
    setSaving(true);
    try {
      if (editId) await onUpdate(editId, cleaned);
      else await onCreate(cleaned);
      toast.success(editId ? "تم التحديث" : "تمت الإضافة");
      setOpen(false);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
      {extraActions && <div className="mb-4">{extraActions}</div>}
      <DataTable
        title={tableTitle}
        data={filteredData}
        isLoading={isLoading}
        total={filteredData.length}
        search={search}
        onSearch={setSearch}
        onAdd={showAdd ? openCreate : undefined}
        addLabel={addLabel}
        addEntity={entity}
        emptyMessage={search.trim() ? "لا نتائج مطابقة للبحث" : "لا توجد بيانات"}
        columns={columns.map((c) => ({
          key: c.key,
          label: c.label,
          render: c.render as any,
        }))}
        actions={(row: Record<string, unknown>) => (
          <>
            {rowExtraActions?.(row)}
            {canEdit && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(row)}>
              <Edit size={13} />
            </Button>
            )}
            {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-600"
              onClick={async () => {
                if (confirm("حذف السجل؟")) {
                  try {
                    await onDelete(Number(row.id));
                    toast.success("تم الحذف");
                    onRefresh();
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : "فشل الحذف");
                  }
                }
              }}
            >
              <Trash2 size={13} />
            </Button>
            )}
          </>
        )}
      />
      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? `تعديل — ${tableTitle}` : `إضافة — ${tableTitle}`}
        description="املأ الحقول أدناه ثم احفظ — الحقول المطلوبة مميزة بوضوح."
        onSubmit={handleSubmit}
        isLoading={saving}
        size={fields.length > 4 ? "xl" : "lg"}
      >
        <FormSection title="بيانات السجل" accent="blue">
          {fields.map((f) => (
            <div key={f.key} className={f.type === "textarea" || f.type === "checkbox" ? "sm:col-span-2" : ""}>
              {f.type === "checkbox" ? (
                <label className="flex items-center gap-3 cursor-pointer py-2">
                  <Checkbox
                    checked={form[f.key] === "true"}
                    onCheckedChange={(v) => setForm({ ...form, [f.key]: v === true ? "true" : "false" })}
                    className="size-5"
                  />
                  <span className="text-sm font-bold text-slate-800">{f.label}</span>
                </label>
              ) : (
                <>
              <FieldLabel required={!!f.required}>{f.label}</FieldLabel>
              {f.type === "textarea" ? (
                <Textarea
                  value={form[f.key] || ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className={entryTextareaClass}
                  rows={3}
                />
              ) : f.type === "select" && f.options ? (
                <Select
                  value={form[f.key] ? form[f.key] : (f.options.some((o) => !o.value) ? "__empty__" : "")}
                  onValueChange={(v) => setForm({ ...form, [f.key]: v === "__empty__" ? "" : v })}
                >
                  <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={`${f.key}-${o.value || "empty"}-${o.label}`} value={o.value || "__empty__"}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "date" ? (
                <DateField
                  value={form[f.key] || ""}
                  onChange={(iso) => setForm({ ...form, [f.key]: iso })}
                />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "time" ? "time" : "text"}
                  value={form[f.key] || ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className={entryControlClass}
                />
              )}
                </>
              )}
            </div>
          ))}
        </FormSection>
      </FormModal>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <ERPLayout title={title}>
      {body}
    </ERPLayout>
  );
}
