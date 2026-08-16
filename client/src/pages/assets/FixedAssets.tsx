import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const emptyForm = {
  name: "", code: "", category: "", purchaseDate: "", purchasePrice: "",
  depreciationRate: "", location: "", notes: "",
};

export default function FixedAssets() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [depPeriod, setDepPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data, isLoading, refetch } = trpc.assets.list.useQuery({ page, limit: 20 });
  const categoriesQ = trpc.parity.assets.categories.list.useQuery();
  const runDep = trpc.settings.approvals.runDepreciation.useMutation({
    onSuccess: (res) => {
      if (res.skipped) {
        const msg = res.reason === "already_posted" ? "تم ترحيل إهلاك هذه الفترة مسبقاً" : "لا يوجد إهلاك للترحيل";
        toast.info(msg);
        return;
      }
      toast.success(`تم ترحيل قيد الإهلاك — إجمالي ${Number(res.totalDepreciation ?? 0).toLocaleString("en-US")} ج.م`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const createMut = trpc.assets.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة الأصل"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="الأصول الثابتة">
      <div className="space-y-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800">ترحيل الإهلاك الشهري</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3 pb-4">
            <div>
              <Label className="text-xs mb-1.5 block">الفترة (سنة-شهر)</Label>
              <Input type="month" value={depPeriod} onChange={(e) => setDepPeriod(e.target.value)} className="h-9 w-44" />
            </div>
            <Button
              size="sm"
              className="h-9 bg-blue-600 hover:bg-blue-700 gap-1.5"
              disabled={runDep.isPending}
              onClick={() => runDep.mutate({ period: depPeriod })}
            >
              <RefreshCw size={14} className={runDep.isPending ? "animate-spin" : ""} />
              ترحيل قيود الإهلاك
            </Button>
          </CardContent>
        </Card>

        <DataTable
          title="الأصول الثابتة"
          data={data?.rows}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          onPageChange={setPage}
          onAdd={() => { setForm(emptyForm); setOpen(true); }}
          addLabel="أصل جديد"
          permissionModule="assets"
          columns={[
            { key: "code", label: "الكود", className: "w-24" },
            { key: "name", label: "اسم الأصل" },
            { key: "category", label: "الفئة" },
            { key: "purchaseDate", label: "تاريخ الشراء", render: (row: any) => row.purchaseDate ? new Date(row.purchaseDate).toLocaleDateString("en-GB") : "-" },
            { key: "purchasePrice", label: "سعر الشراء", render: (row: any) => row.purchasePrice ? `${Number(row.purchasePrice).toLocaleString("en-US")} ج.م` : "-" },
            { key: "currentValue", label: "القيمة الحالية", render: (row: any) => row.currentValue ? `${Number(row.currentValue).toLocaleString("en-US")} ج.م` : "-" },
            { key: "depreciationRate", label: "نسبة الإهلاك", render: (row: any) => row.depreciationRate ? `${row.depreciationRate}%` : "-" },
            { key: "location", label: "الموقع" },
          ]}
        />
      </div>

      <FormModal open={open} onClose={() => { setOpen(false); setForm(emptyForm); }} title="إضافة أصل ثابت" onSubmit={() => { if (!form.name.trim()) { toast.error("اسم الأصل مطلوب"); return; } createMut.mutate(form); }} isLoading={createMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم الأصل *</Label><Input value={form.name} onChange={f("name")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الكود</Label><Input value={form.code} onChange={f("code")} className="h-9 text-sm" /></div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الفئة</Label>
            <Select
              value={form.category || undefined}
              onValueChange={(v) => {
                const cat = (categoriesQ.data || []).find((c: any) => c.name === v);
                setForm((p) => ({
                  ...p,
                  category: v,
                  depreciationRate: cat?.depreciationRate != null ? String(cat.depreciationRate) : p.depreciationRate,
                }));
              }}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر من فئات الأصول" /></SelectTrigger>
              <SelectContent>
                {(categoriesQ.data || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}{c.depreciationRate != null ? ` (${c.depreciationRate}%)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={form.category} onChange={f("category")} placeholder="أو اكتب اسم الفئة يدوياً" className="h-9 text-sm mt-2" />
          </div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الموقع</Label><Input value={form.location} onChange={f("location")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الشراء</Label><Input type="date" value={form.purchaseDate} onChange={f("purchaseDate")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">سعر الشراء</Label><Input value={form.purchasePrice} onChange={f("purchasePrice")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">نسبة الإهلاك السنوي (%)</Label><Input value={form.depreciationRate} onChange={f("depreciationRate")} type="number" placeholder="0" className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
