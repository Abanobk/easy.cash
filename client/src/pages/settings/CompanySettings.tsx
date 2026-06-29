import { useState, useEffect } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Building2, Users, GitBranch, Save } from "lucide-react";

export default function CompanySettings() {
  const [form, setForm] = useState({
    name: "", address: "", phone: "", email: "", taxNumber: "", currency: "EGP",
  });
  const [branchForm, setBranchForm] = useState({ name: "", address: "", phone: "" });

  const { data: company, refetch: refetchCompany } = trpc.settings.company.get.useQuery();
  const { data: branches, refetch: refetchBranches } = trpc.settings.branches.list.useQuery();
  const saveMut = trpc.settings.company.save.useMutation({
    onSuccess: () => { toast.success("تم حفظ بيانات الشركة"); refetchCompany(); },
    onError: (e) => toast.error(e.message),
  });
  const createBranchMut = trpc.settings.branches.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة الفرع"); refetchBranches(); setBranchForm({ name: "", address: "", phone: "" }); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || "",
        address: company.address || "",
        phone: company.phone || "",
        email: company.email || "",
        taxNumber: company.taxNumber || "",
        currency: company.currency || "EGP",
      });
    }
  }, [company]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="الإعدادات العامة">
      <Tabs defaultValue="company">
        <TabsList className="bg-slate-100 h-9 mb-4">
          <TabsTrigger value="company" className="text-xs data-[state=active]:bg-white gap-1.5">
            <Building2 size={13} /> بيانات الشركة
          </TabsTrigger>
          <TabsTrigger value="branches" className="text-xs data-[state=active]:bg-white gap-1.5">
            <GitBranch size={13} /> الفروع
          </TabsTrigger>
        </TabsList>

        {/* Company Settings */}
        <TabsContent value="company">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-800">بيانات الشركة</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 gap-4 max-w-2xl">
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم الشركة *</Label>
                  <Input value={form.name} onChange={f("name")} placeholder="اسم الشركة أو المنشأة" className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">رقم الهاتف</Label>
                  <Input value={form.phone} onChange={f("phone")} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">البريد الإلكتروني</Label>
                  <Input value={form.email} onChange={f("email")} type="email" className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الرقم الضريبي</Label>
                  <Input value={form.taxNumber} onChange={f("taxNumber")} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العملة الافتراضية</Label>
                  <Input value={form.currency} onChange={f("currency")} placeholder="EGP" className="h-9 text-sm" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العنوان</Label>
                  <Textarea value={form.address} onChange={f("address")} className="text-sm resize-none" rows={2} />
                </div>
                <div className="col-span-2">
                  <Button
                    onClick={() => { if (!form.name.trim()) { toast.error("اسم الشركة مطلوب"); return; } saveMut.mutate(form); }}
                    disabled={saveMut.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white h-9 gap-1.5 text-sm"
                  >
                    <Save size={14} />
                    {saveMut.isPending ? "جاري الحفظ..." : "حفظ البيانات"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branches */}
        <TabsContent value="branches">
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">إضافة فرع جديد</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-3 gap-4 max-w-2xl">
                  <div>
                    <Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم الفرع *</Label>
                    <Input value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الهاتف</Label>
                    <Input value={branchForm.phone} onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العنوان</Label>
                    <Input value={branchForm.address} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <Button
                      onClick={() => { if (!branchForm.name.trim()) { toast.error("اسم الفرع مطلوب"); return; } createBranchMut.mutate(branchForm); }}
                      disabled={createBranchMut.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white h-9 gap-1.5 text-sm"
                    >
                      <GitBranch size={14} /> إضافة فرع
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">الفروع ({branches?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {branches?.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">لا توجد فروع</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">اسم الفرع</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الهاتف</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">العنوان</th>
                    </tr></thead>
                    <tbody>
                      {branches?.map((b: any) => (
                        <tr key={b.id} className="border-b border-slate-50 hover:bg-blue-50/30">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{b.name}</td>
                          <td className="px-4 py-2.5 text-slate-500">{b.phone || "-"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{b.address || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </ERPLayout>
  );
}
