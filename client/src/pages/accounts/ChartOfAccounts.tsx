import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ChevronDown, ChevronLeft, Folder, FileText } from "lucide-react";

const typeLabels: Record<string, { label: string; color: string }> = {
  asset: { label: "أصول", color: "bg-blue-100 text-blue-700" },
  liability: { label: "خصوم", color: "bg-red-100 text-red-700" },
  equity: { label: "حقوق ملكية", color: "bg-purple-100 text-purple-700" },
  revenue: { label: "إيرادات", color: "bg-green-100 text-green-700" },
  expense: { label: "مصروفات", color: "bg-orange-100 text-orange-700" },
};

const emptyForm = {
  code: "", name: "", type: "asset" as "asset" | "liability" | "equity" | "revenue" | "expense",
  parentId: undefined as number | undefined, isParent: false, notes: "",
};

export default function ChartOfAccounts() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: accounts, isLoading, refetch } = trpc.accounts.chart.useQuery();
  const createMut = trpc.accounts.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة الحساب"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error("الكود والاسم مطلوبان"); return; }
    createMut.mutate(form);
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build tree
  const roots = accounts?.filter(a => !a.parentId) || [];
  const children = (parentId: number) => accounts?.filter(a => a.parentId === parentId) || [];

  const renderAccount = (account: any, depth = 0) => {
    const hasChildren = children(account.id).length > 0;
    const isExpanded = expanded.has(account.id);
    const typeInfo = typeLabels[account.type] || { label: account.type, color: "bg-gray-100 text-gray-700" };

    return (
      <div key={account.id}>
        <div
          className={`flex items-center gap-2 px-4 py-2.5 hover:bg-blue-50/40 transition-colors border-b border-slate-50 cursor-pointer`}
          style={{ paddingRight: `${16 + depth * 20}px` }}
          onClick={() => hasChildren && toggleExpand(account.id)}
        >
          <div className="flex items-center gap-2 flex-1">
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronLeft size={14} className="text-slate-400" />
            ) : (
              <span className="w-3.5" />
            )}
            {account.isParent ? <Folder size={14} className="text-blue-500" /> : <FileText size={14} className="text-slate-400" />}
            <span className="font-mono text-xs text-slate-500 w-20">{account.code}</span>
            <span className="text-sm text-slate-800 font-medium">{account.name}</span>
          </div>
          <Badge variant="outline" className={`text-xs ${typeInfo.color} border-0`}>{typeInfo.label}</Badge>
          <Button
            variant="ghost" size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-blue-600 hover:bg-blue-100"
            onClick={(e) => { e.stopPropagation(); setForm({ ...emptyForm, parentId: account.id, type: account.type }); setOpen(true); }}
          >
            <Plus size={11} />
          </Button>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {children(account.id).map(child => renderAccount(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ERPLayout title="شجرة الحسابات">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">شجرة الحسابات</h2>
              <p className="text-xs text-slate-400 mt-0.5">{accounts?.length || 0} حساب</p>
            </div>
            <Button onClick={() => { setForm(emptyForm); setOpen(true); }} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1.5 text-xs">
              <Plus size={14} />
              حساب جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">جاري التحميل...</div>
          ) : roots.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">لا توجد حسابات. ابدأ بإضافة حسابات رئيسية.</div>
          ) : (
            <div className="group">
              {roots.map(a => renderAccount(a))}
            </div>
          )}
        </CardContent>
      </Card>

      <FormModal open={open} onClose={() => { setOpen(false); setForm(emptyForm); }} title="إضافة حساب جديد" onSubmit={handleSubmit} isLoading={createMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">كود الحساب *</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="مثال: 1001" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم الحساب *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="اسم الحساب" className="h-9 text-sm" /></div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع الحساب</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as any }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">أصول</SelectItem>
                <SelectItem value="liability">خصوم</SelectItem>
                <SelectItem value="equity">حقوق ملكية</SelectItem>
                <SelectItem value="revenue">إيرادات</SelectItem>
                <SelectItem value="expense">مصروفات</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الحساب الأب</Label>
            <Select value={form.parentId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, parentId: v ? Number(v) : undefined }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="حساب رئيسي" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">بدون (حساب رئيسي)</SelectItem>
                {accounts?.filter(a => a.isParent).map((a: any) => <SelectItem key={a.id} value={a.id.toString()}>{a.code} - {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع الحساب</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={!form.isParent} onChange={() => setForm(p => ({ ...p, isParent: false }))} className="accent-blue-600" />
                حساب تفصيلي
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={form.isParent} onChange={() => setForm(p => ({ ...p, isParent: true }))} className="accent-blue-600" />
                حساب مجمّع
              </label>
            </div>
          </div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
