import { FormEvent, ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const SIZE_CLASS: Record<NonNullable<FormModalProps["size"]>, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
  "2xl": "sm:max-w-6xl",
};

export function FormModal({
  open,
  onClose,
  title,
  description,
  children,
  onSubmit,
  isLoading,
  submitLabel = "حفظ",
  size = "lg",
}: FormModalProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "entry-modal w-[calc(100%-1.5rem)] max-h-[92vh] overflow-hidden p-0 gap-0 border-slate-200/80 shadow-2xl rounded-2xl",
          SIZE_CLASS[size],
        )}
        dir="rtl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[92vh]">
          <DialogHeader className="entry-modal-header px-7 pt-6 pb-5 shrink-0 text-right space-y-2">
            <DialogTitle className="entry-modal-title">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="entry-modal-desc">
                {description}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">نموذج إدخال بيانات</DialogDescription>
            )}
          </DialogHeader>

          <div className="entry-modal-body px-7 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
            {children}
          </div>

          <DialogFooter className="entry-modal-footer px-7 py-5 shrink-0 flex flex-row gap-3 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="entry-btn-cancel flex-1"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="entry-btn-save flex-1"
            >
              {isLoading && <Loader2 size={17} className="animate-spin ml-2" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
