import { useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileImage, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

type EntityType = "sales_invoice" | "purchase_invoice";
type Kind = "invoice_scan" | "payment_receipt" | "other";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

const statusLabel: Record<string, { text: string; className: string }> = {
  matched: { text: "متوافق", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  mismatch: { text: "فرق مع النظام", className: "bg-amber-50 text-amber-800 border-amber-200" },
  no_extract: { text: "محفوظ بدون استخراج", className: "bg-slate-50 text-slate-600 border-slate-200" },
  pending: { text: "قيد المراجعة", className: "bg-sky-50 text-sky-700 border-sky-200" },
};

const kindLabel: Record<string, string> = {
  invoice_scan: "صورة/ملف فاتورة",
  payment_receipt: "إيصال تحصيل/سداد",
  other: "مرفق آخر",
};

export function DocumentAttachmentsPanel({
  entityType,
  entityId,
  defaultKind = "invoice_scan",
}: {
  entityType: EntityType;
  entityId: number;
  defaultKind?: Kind;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const listQuery = trpc.documentAttachments.list.useQuery(
    { entityType, entityId },
    { enabled: entityId > 0 },
  );

  const uploadMut = trpc.documentAttachments.upload.useMutation({
    onSuccess: (r) => {
      if (r.compareStatus === "matched") toast.success("تم الرفع — المستند متوافق مع البيانات");
      else if (r.compareStatus === "mismatch") toast.warning(`تم الرفع مع فروقات: ${r.compareNotes}`);
      else toast.success("تم حفظ المرفق (اختياري)");
      void utils.documentAttachments.list.invalidate({ entityType, entityId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.documentAttachments.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المرفق");
      void utils.documentAttachments.list.invalidate({ entityType, entityId });
    },
    onError: (e) => toast.error(e.message),
  });

  const recompareMut = trpc.documentAttachments.recompare.useMutation({
    onSuccess: (r) => {
      toast.success(r.compareNotes || "تمت إعادة المقارنة");
      void utils.documentAttachments.list.invalidate({ entityType, entityId });
    },
    onError: (e) => toast.error(e.message),
  });

  const onFile = async (file?: File | null, kind: Kind = defaultKind) => {
    if (!file || !entityId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحد الأقصى 5 ميجابايت");
      return;
    }
    const contentBase64 = await readFileAsBase64(file);
    uploadMut.mutate({
      entityType,
      entityId,
      kind,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64,
    });
  };

  return (
    <div className="mt-6 print:hidden rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <FileImage size={16} />
            مرفقات المستند (اختياري)
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            ارفع صورة أو PDF الفاتورة/الإيصال للمقارنة مع البيانات. غير مطلوب لإدخال أو تأكيد الفاتورة.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={uploadMut.isPending}
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.dataset.kind = "invoice_scan";
                fileRef.current.click();
              }
            }}
          >
            {uploadMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            فاتورة
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={uploadMut.isPending}
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.dataset.kind = "payment_receipt";
                fileRef.current.click();
              }
            }}
          >
            <Upload size={14} />
            إيصال
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,image/*,application/pdf"
            onChange={(e) => {
              const kind = (e.target.dataset.kind as Kind) || defaultKind;
              void onFile(e.target.files?.[0], kind);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {(listQuery.data || []).map((att) => {
          const st = statusLabel[att.compareStatus] || statusLabel.pending;
          return (
            <div key={att.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{att.fileName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{kindLabel[att.kind] || att.kind}</p>
                  <span className={`inline-flex mt-2 text-[11px] px-2 py-0.5 rounded border ${st.className}`}>
                    {st.text}
                  </span>
                  {att.compareNotes ? (
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">{att.compareNotes}</p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="إعادة المقارنة"
                    disabled={recompareMut.isPending}
                    onClick={() => recompareMut.mutate({ id: att.id })}
                  >
                    <RefreshCw size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-600"
                    title="حذف"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate({ id: att.id })}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {!listQuery.data?.length && !listQuery.isLoading ? (
          <p className="text-xs text-slate-500">لا مرفقات بعد — يمكنك الإضافة في أي وقت.</p>
        ) : null}
      </div>
      <Label className="sr-only">مرفقات</Label>
    </div>
  );
}

export async function uploadOptionalReceiptFile(opts: {
  file: File;
  entityType: EntityType;
  entityId: number;
  upload: (input: {
    entityType: EntityType;
    entityId: number;
    kind: Kind;
    fileName: string;
    mimeType: string;
    contentBase64: string;
  }) => Promise<unknown>;
}) {
  if (opts.file.size > 5 * 1024 * 1024) throw new Error("الحد الأقصى 5 ميجابايت");
  const contentBase64 = await readFileAsBase64(opts.file);
  return opts.upload({
    entityType: opts.entityType,
    entityId: opts.entityId,
    kind: "payment_receipt",
    fileName: opts.file.name,
    mimeType: opts.file.type || "application/octet-stream",
    contentBase64,
  });
}
