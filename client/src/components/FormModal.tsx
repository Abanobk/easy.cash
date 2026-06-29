import { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export function FormModal({
  open, onClose, title, children, onSubmit, isLoading, submitLabel = "حفظ", size = "md"
}: FormModalProps) {
  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className={`${sizeClass} w-full`} dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800">{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-4 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
        <DialogFooter className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">إلغاء</Button>
          <Button
            onClick={onSubmit}
            disabled={isLoading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading && <Loader2 size={14} className="animate-spin ml-2" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
