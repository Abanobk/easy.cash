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
import { Building2, GitBranch, Save, Bell, RefreshCw } from "lucide-react";
import PermissionGate from "@/components/PermissionGate";
import { AddActionButton } from "@/components/AddActionButton";
import { Switch } from "@/components/ui/switch";

export default function CompanySettings() {
  const [form, setForm] = useState({
    name: "", address: "", phone: "", email: "", taxNumber: "", currency: "EGP",
    alertEmailsEnabled: false,
    alertEmailRecipients: "",
    requireDocumentApproval: false,
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
  const sendDigestMut = trpc.notifications.sendAlertDigest.useMutation({
    onSuccess: (res) => {
      if (res.sent) toast.success(`تم إرسال الملخص إلى ${res.recipients} بريد`);
      else toast.info(res.reason === "RESEND_API_KEY not configured" ? "البريد غير مُعد — أضف RESEND_API_KEY على السيرفر" : `لم يُرسل: ${res.reason}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const reconcileMut = trpc.settings.contacts.reconcileBalances.useMutation({
    onSuccess: (res) => toast.success(`تم تحديث أرصدة ${res.customers} عميل و ${res.suppliers} مورد`),
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
        alertEmailsEnabled: !!company.alertEmailsEnabled,
        alertEmailRecipients: company.alertEmailRecipients || "",
        requireDocumentApproval: !!(company as any).requireDocumentApproval,
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
          <TabsTrigger value="alerts" className="text-xs data-[state=active]:bg-white gap-1.5">
            <Bell size={13} /> التنبيهات والأرصدة
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
                  <PermissionGate module="settings" action="edit">
                    <Button
                      onClick={() => { if (!form.name.trim()) { toast.error("اسم الشركة مطلوب"); return; } saveMut.mutate(form); }}
                      disabled={saveMut.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white h-9 gap-1.5 text-sm"
                    >
                      <Save size={14} />
                      {saveMut.isPending ? "جاري الحفظ..." : "حفظ البيانات"}
                    </Button>
                  </PermissionGate>
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
                    <AddActionButton
                      module="settings"
                      onClick={() => { if (!branchForm.name.trim()) { toast.error("اسم الفرع مطلوب"); return; } createBranchMut.mutate(branchForm); }}
                      disabled={createBranchMut.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white h-9 gap-1.5 text-sm"
                    >
                      <GitBranch size={14} /> إضافة فرع
                    </AddActionButton>
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

        <TabsContent value="alerts">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">تنبيهات البريد الإلكتروني</CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4 max-w-xl">
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <p className="text-sm font-medium text-slate-700">اعتماد المستندات قبل الترحيل</p>
                    <p className="text-xs text-slate-500">فواتير الآجل تحتاج موافقة المدير قبل القيود والمخزون</p>
                  </div>
                  <Switch
                    checked={form.requireDocumentApproval}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, requireDocumentApproval: v }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">إرسال ملخص يومي</p>
                    <p className="text-xs text-slate-500">يُرسل تلقائياً عند وجود تنبيهات (مرة كل ٢٠ ساعة)</p>
                  </div>
                  <Switch
                    checked={form.alertEmailsEnabled}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, alertEmailsEnabled: v }))}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">مستلمو البريد</Label>
                  <Textarea
                    value={form.alertEmailRecipients}
                    onChange={(e) => setForm((p) => ({ ...p, alertEmailRecipients: e.target.value }))}
                    placeholder="admin@company.com, accountant@company.com"
                    className="text-sm resize-none"
                    rows={2}
                  />
                  <p className="text-xs text-slate-400 mt-1">افصل بين العناوين بفاصلة</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <PermissionGate module="settings" action="edit">
                    <Button
                      onClick={() => {
                        if (!form.name.trim()) { toast.error("احفظ اسم الشركة أولاً من تبويب بيانات الشركة"); return; }
                        saveMut.mutate(form);
                      }}
                      disabled={saveMut.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm"
                    >
                      حفظ إعدادات البريد
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => sendDigestMut.mutate({ force: true })}
                      disabled={sendDigestMut.isPending}
                      className="h-9 text-sm gap-1"
                    >
                      <Bell size={14} /> إرسال ملخص الآن
                    </Button>
                  </PermissionGate>
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-2">
                  يتطلب إعداد <code className="text-[11px]">RESEND_API_KEY</code> و <code className="text-[11px]">ALERT_EMAIL_FROM</code> في متغيرات السيرفر.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">أرصدة العملاء والموردين</CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-3">
                <p className="text-sm text-slate-600">
                  يتم تحديث الرصيد تلقائياً عند إنشاء فواتير آجلة، التحصيل، والمردودات.
                  استخدم هذا الزر لإعادة حساب كل الأرصدة من الفواتير المفتوحة.
                </p>
                <PermissionGate module="settings" action="edit">
                  <Button
                    variant="outline"
                    onClick={() => reconcileMut.mutate()}
                    disabled={reconcileMut.isPending}
                    className="gap-1.5"
                  >
                    <RefreshCw size={14} className={reconcileMut.isPending ? "animate-spin" : ""} />
                    {reconcileMut.isPending ? "جاري التحديث..." : "إعادة حساب كل الأرصدة"}
                  </Button>
                </PermissionGate>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </ERPLayout>
  );
}
