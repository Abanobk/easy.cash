import { useMemo } from "react";
import { Download, Link2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildTenantLoginUrl, copyTenantLoginLink } from "@/lib/tenant-login";
import { buildTenantLoginQrDataUrl, downloadTenantLoginQrPng } from "@/lib/tenant-qr";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  companyName: string;
};

export default function TenantLoginQrDialog({ open, onOpenChange, slug, companyName }: Props) {
  const loginUrl = buildTenantLoginUrl(slug);
  const qrDataUrl = useMemo(() => buildTenantLoginQrDataUrl(loginUrl), [loginUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode size={18} className="text-blue-600" />
            QR دخول — {companyName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <img
              src={qrDataUrl}
              alt={`QR code for ${companyName}`}
              width={260}
              height={260}
              className="block"
            />
          </div>

          <p className="text-center text-xs text-slate-500 leading-relaxed">
            امسح الكود من الموبايل للوصول لصفحة دخول <span className="font-semibold text-slate-700">{companyName}</span>
            <br />
            <span className="text-slate-400">للموظفين فقط — بدون إنشاء حساب جديد</span>
          </p>

          <p className="text-[11px] font-mono text-blue-700 bg-blue-50 px-3 py-2 rounded-lg w-full text-center break-all" dir="ltr">
            {loginUrl}
          </p>

          <div className="flex flex-wrap gap-2 w-full justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                try {
                  await copyTenantLoginLink(slug, companyName);
                  toast.success(`تم نسخ رابط ${companyName}`);
                } catch {
                  toast.error("تعذر نسخ الرابط");
                }
              }}
            >
              <Link2 size={14} />
              نسخ الرابط
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700"
              onClick={async () => {
                try {
                  await downloadTenantLoginQrPng(slug, companyName);
                  toast.success("تم تحميل QR كصورة PNG");
                } catch {
                  toast.error("تعذر تحميل الصورة");
                }
              }}
            >
              <Download size={14} />
              تحميل PNG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
