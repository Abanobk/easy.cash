import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

/** زر «اضافة تعليق» — مطابقة شريط أدوات ميجا على مستندات المخازن */
export function DocumentCommentsButton({
  documentType,
  documentId,
  documentNumber,
  disabled,
}: {
  documentType: string;
  documentId?: number | null;
  documentNumber?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const enabled = !!documentId && documentId > 0;
  const list = trpc.inventory.comments.list.useQuery(
    { documentType, documentId: documentId || 0 },
    { enabled: open && enabled },
  );
  const add = trpc.inventory.comments.add.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة التعليق");
      setBody("");
      list.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1 text-xs"
        disabled={disabled || !enabled}
        title={!enabled ? "احفظ المستند أولاً لإضافة تعليق" : "اضافة تعليق"}
        onClick={() => setOpen(true)}
      >
        <MessageSquarePlus size={14} /> اضافة تعليق
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              تعليقات المستند{documentNumber ? ` — ${documentNumber}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {(list.data || []).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">لا تعليقات بعد</p>
            )}
            {(list.data || []).map((c: any) => (
              <div key={c.id} className="rounded border bg-slate-50 p-2 text-sm">
                <div className="text-[11px] text-slate-500 mb-1">
                  {c.createdByName || "—"} · {c.createdAt ? new Date(c.createdAt).toLocaleString("en-GB") : ""}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="اكتب تعليقاً..."
            className="min-h-[80px] text-sm"
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>إغلاق</Button>
            <Button
              type="button"
              size="sm"
              disabled={!body.trim() || add.isPending}
              onClick={() => add.mutate({
                documentType,
                documentId: documentId!,
                documentNumber,
                body: body.trim(),
              })}
            >
              حفظ التعليق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
