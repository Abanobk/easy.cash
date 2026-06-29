import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";

export default function Installments() {
  const [page, setPage] = useState(1);

  const { data: allInstallments, isLoading, refetch } = trpc.loans.installments.listAll.useQuery();
  const payMut = trpc.loans.installments.pay.useMutation({
    onSuccess: () => { toast.success("تم تسجيل دفع القسط"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const installments = allInstallments || [];

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      pending: { label: "معلق", color: "text-orange-600 bg-orange-100" },
      paid: { label: "مدفوع", color: "text-green-600 bg-green-100" },
      overdue: { label: "متأخر", color: "text-red-600 bg-red-100" },
    };
    const info = map[status] || { label: status, color: "text-slate-600 bg-slate-100" };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>;
  };

  return (
    <ERPLayout title="الأقساط">
      <DataTable
        title="جدول الأقساط"
        data={installments}
        isLoading={isLoading}
        total={installments.length}
        page={page}
        onPageChange={setPage}
        columns={[
          { key: "loanPartyName", label: "الجهة" },
          { key: "loanType", label: "نوع القرض", render: (row: any) => (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.loanType === "received" ? "text-blue-600 bg-blue-100" : "text-green-600 bg-green-100"}`}>
              {row.loanType === "received" ? "مستلم" : "ممنوح"}
            </span>
          )},
          { key: "dueDate", label: "تاريخ الاستحقاق", render: (row: any) => row.dueDate ? new Date(row.dueDate).toLocaleDateString("ar-EG") : "-" },
          { key: "amount", label: "مبلغ القسط", render: (row: any) => `${Number(row.amount).toLocaleString("ar-EG")} ج.م` },
          { key: "status", label: "الحالة", render: (row: any) => statusBadge(row.status) },
        ]}
        actions={(row: any) => row.status !== "paid" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-green-600 hover:bg-green-50"
            onClick={() => payMut.mutate({ installmentId: row.id })}
          >
            <CheckCircle size={11} /> دفع
          </Button>
        ) : null}
        emptyMessage="لا توجد أقساط. أضف قروضاً أولاً من صفحة القروض."
      />
    </ERPLayout>
  );
}
