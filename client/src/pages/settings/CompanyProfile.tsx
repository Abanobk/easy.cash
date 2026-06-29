import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import ERPLayout from "@/components/ERPLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Building2, Phone, Mail, Globe, FileText, MapPin,
  Save, Upload, X, Hash, CreditCard, Download, Database
} from "lucide-react";


function BackupButton() {
  const [isExporting, setIsExporting] = useState(false);
  const backupQuery = trpc.settings.backup.export.useQuery(undefined, { enabled: false });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await backupQuery.refetch();
      if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const date = new Date().toISOString().split("T")[0];
        a.href = url;
        a.download = `easycash-backup-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
        const s = result.data.summary;
        toast.success(`تم تصدير النسخة بنجاح | ${s.customers + s.suppliers} جهة اتصال | ${s.salesInvoices + s.purchaseInvoices} فاتورة`);
      }
    } catch (e: any) {
      toast.error("خطأ في تصدير النسخة");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100"
      onClick={handleExport}
      disabled={isExporting}
    >
      <Download size={15} />
      {isExporting ? "جاري التصدير..." : "تنزيل نسخة احتياطية (JSON)"}
    </Button>
  );
}

export default function CompanyProfile() {
  const profileQuery = trpc.saas.getCompanyProfile.useQuery();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    logo: "",
    address: "",
    city: "",
    country: "مصر",
    phone: "",
    phone2: "",
    email: "",
    website: "",
    taxNumber: "",
    commercialRegister: "",
    currency: "EGP",
    invoiceFooter: "",
  });

  const [initialized, setInitialized] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialize form when data loads - using useEffect to avoid setState in render
  useEffect(() => {
    if (profileQuery.data && !initialized) {
      const p = profileQuery.data;
      setForm({
        name: p.name || "",
        nameEn: p.nameEn || "",
        logo: p.logo || "",
        address: p.address || "",
        city: p.city || "",
        country: p.country || "مصر",
        phone: p.phone || "",
        phone2: p.phone2 || "",
        email: p.email || "",
        website: p.website || "",
        taxNumber: p.taxNumber || "",
        commercialRegister: p.commercialRegister || "",
        currency: p.currency || "EGP",
        invoiceFooter: p.invoiceFooter || "",
      });
      setInitialized(true);
    }
  }, [profileQuery.data, initialized]);

  const saveMutation = trpc.saas.saveCompanyProfile.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ بيانات الشركة بنجاح");
      utils.saas.getCompanyProfile.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("حجم الشعار يجب أن يكون أقل من 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      // Extract base64 data
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type;
      setUploadingLogo(true);
      try {
        const resp = await fetch("/api/upload/logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: base64, mimeType, fileName: file.name }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || "خطأ في الرفع");
        setForm(f => ({ ...f, logo: result.url }));
        toast.success("تم رفع الشعار بنجاح");
        utils.saas.getCompanyProfile.invalidate();
      } catch (err: any) {
        toast.error(err.message || "خطأ في رفع الشعار");
      } finally {
        setUploadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("اسم الشركة مطلوب");
      return;
    }
    saveMutation.mutate(form);
  };

  const field = (key: keyof typeof form, value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  return (
    <ERPLayout title="ملف الشركة">
      <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">بيانات الشركة</h2>
            <p className="text-slate-500 text-sm mt-0.5">تظهر هذه البيانات على الفواتير والتقارير المطبوعة</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Save size={16} />
            {saveMutation.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Logo Card */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 size={15} className="text-blue-500" />
                شعار الشركة
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {/* Logo preview */}
              <div className="w-32 h-32 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden bg-slate-50">
                {form.logo ? (
                  <img src={form.logo} alt="شعار الشركة" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center">
                    <Building2 size={32} className="text-slate-300 mx-auto mb-1" />
                    <span className="text-xs text-slate-400">لا يوجد شعار</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  <Upload size={13} />
                  {uploadingLogo ? "جاري الرفع..." : "رفع شعار"}
                </Button>
                {form.logo && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => setForm(f => ({ ...f, logo: "" }))}
                  >
                    <X size={13} />
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <p className="text-xs text-slate-400 text-center">PNG, JPG حتى 2MB</p>
            </CardContent>
          </Card>

          {/* Basic Info */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText size={15} className="text-blue-500" />
                المعلومات الأساسية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-600 mb-1.5 block">اسم الشركة (عربي) *</Label>
                  <Input
                    value={form.name}
                    onChange={e => field("name", e.target.value)}
                    placeholder="شركة..."
                    className="text-right"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-600 mb-1.5 block">اسم الشركة (إنجليزي)</Label>
                  <Input
                    value={form.nameEn}
                    onChange={e => field("nameEn", e.target.value)}
                    placeholder="Company Name"
                    className="text-left"
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">العنوان</Label>
                <Input
                  value={form.address}
                  onChange={e => field("address", e.target.value)}
                  placeholder="العنوان الكامل"
                  className="text-right"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-600 mb-1.5 block">المدينة</Label>
                  <Input
                    value={form.city}
                    onChange={e => field("city", e.target.value)}
                    placeholder="القاهرة"
                    className="text-right"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-600 mb-1.5 block">الدولة</Label>
                  <Input
                    value={form.country}
                    onChange={e => field("country", e.target.value)}
                    placeholder="مصر"
                    className="text-right"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Phone size={15} className="text-blue-500" />
              بيانات التواصل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block flex items-center gap-1">
                  <Phone size={11} /> رقم الهاتف الرئيسي
                </Label>
                <Input
                  value={form.phone}
                  onChange={e => field("phone", e.target.value)}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block flex items-center gap-1">
                  <Phone size={11} /> رقم هاتف إضافي
                </Label>
                <Input
                  value={form.phone2}
                  onChange={e => field("phone2", e.target.value)}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block flex items-center gap-1">
                  <Mail size={11} /> البريد الإلكتروني
                </Label>
                <Input
                  value={form.email}
                  onChange={e => field("email", e.target.value)}
                  placeholder="info@company.com"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block flex items-center gap-1">
                  <Globe size={11} /> الموقع الإلكتروني
                </Label>
                <Input
                  value={form.website}
                  onChange={e => field("website", e.target.value)}
                  placeholder="www.company.com"
                  dir="ltr"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tax & Legal */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Hash size={15} className="text-blue-500" />
              البيانات الضريبية والقانونية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">الرقم الضريبي</Label>
                <Input
                  value={form.taxNumber}
                  onChange={e => field("taxNumber", e.target.value)}
                  placeholder="000-000-000"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">السجل التجاري</Label>
                <Input
                  value={form.commercialRegister}
                  onChange={e => field("commercialRegister", e.target.value)}
                  placeholder="رقم السجل التجاري"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block flex items-center gap-1">
                  <CreditCard size={11} /> العملة الافتراضية
                </Label>
                <select
                  value={form.currency}
                  onChange={e => field("currency", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="EGP">جنيه مصري (EGP)</option>
                  <option value="USD">دولار أمريكي (USD)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="AED">درهم إماراتي (AED)</option>
                  <option value="KWD">دينار كويتي (KWD)</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Footer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FileText size={15} className="text-blue-500" />
              تذييل الفاتورة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="text-xs text-slate-600 mb-1.5 block">
              النص الذي يظهر أسفل كل فاتورة مطبوعة
            </Label>
            <Textarea
              value={form.invoiceFooter}
              onChange={e => field("invoiceFooter", e.target.value)}
              placeholder="مثال: شكراً لتعاملكم معنا — جميع الأسعار شاملة ضريبة القيمة المضافة"
              className="text-right resize-none"
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Backup Section */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <Database size={15} className="text-amber-600" />
              النسخ الاحتياطي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-amber-700 mb-4">تصدير نسخة احتياطية كاملة من جميع بيانات النظام (عملاء، موردين، فواتير، مخزون، موظفين، قيود محاسبية) بصيغة JSON.</p>
            <BackupButton />
          </CardContent>
        </Card>

        {/* Save button bottom */}
        <div className="flex justify-end pb-6">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-8"
          >
            <Save size={16} />
            {saveMutation.isPending ? "جاري الحفظ..." : "حفظ جميع التغييرات"}
          </Button>
        </div>
      </div>
    </ERPLayout>
  );
}
