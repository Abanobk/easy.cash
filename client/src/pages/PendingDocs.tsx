import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { toast } from "sonner";

export default function PendingDocs() {
  const tenantSlug = useTenantSlug();
  const salesQ = trpc.sales.invoices.list.useQuery({ status: "draft", limit: 50 });
  const purchasesQ = trpc.purchases.invoices.list.useQuery({ status: "draft", limit: 50 });
  const journalQ = trpc.accounts.journal.list.useQuery({ limit: 50 });
  const approvalsQ = trpc.settings.approvals.list.useQuery();
  const { data: alerts } = trpc.dashboard.alerts.useQuery();
  const approveMut = trpc.settings.approvals.approve.useMutation({
    onSuccess: () => { toast.success("تم اعتماد المستند"); salesQ.refetch(); purchasesQ.refetch(); approvalsQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const docs = [
    ...(approvalsQ.data || []).map((r: any) => ({
      type: r.documentType === "sales_invoice" ? "فاتورة بيع — بانتظار الاعتماد" : r.documentType === "purchase_invoice" ? "فاتورة شراء — بانتظار الاعتماد" : "مستند — بانتظار الاعتماد",
      number: r.documentNumber || `#${r.documentId}`,
      date: r.createdAt,
      party: "",
      total: null,
      href: r.documentType === "sales_invoice" ? tenantPath(tenantSlug, `/sales/invoices/${r.documentId}`) : "#",
      kind: "approval" as const,
      approvalId: r.id,
    })),
    ...(salesQ.data?.rows || []).map((r: any) => ({
      type: "فاتورة بيع",
      number: r.number,
      date: r.date,
      party: r.customerName,
      total: r.total,
      href: tenantPath(tenantSlug, `/sales/invoices/${r.id}`),
      kind: "draft" as const,
    })),
    ...(purchasesQ.data?.rows || []).map((r: any) => ({
      type: "فاتورة شراء",
      number: r.number,
      date: r.date,
      party: r.supplierName,
      total: r.total,
      href: tenantPath(tenantSlug, `/purchases/invoices/${r.id}`),
      kind: "draft" as const,
    })),
    ...(journalQ.data?.rows || []).filter((r: any) => r.status === "draft").map((r: any) => ({
      type: "قيد يومية",
      number: r.number,
      date: r.date,
      party: r.description || "",
      total: null,
      href: tenantPath(tenantSlug, `/accounts/journal/${r.id}`),
      kind: "draft" as const,
    })),
    ...(alerts?.unpaidSales || []).map((r: any) => ({
      type: "فاتورة بيع — متبقي",
      number: r.number,
      date: r.date,
      party: r.customerName,
      total: r.remaining,
      href: tenantPath(tenantSlug, `/sales/invoices/${r.id}`),
      kind: "due" as const,
    })),
    ...(alerts?.unpaidPurchases || []).map((r: any) => ({
      type: "فاتورة شراء — متبقي",
      number: r.number,
      date: r.date,
      party: r.supplierName,
      total: r.remaining,
      href: tenantPath(tenantSlug, `/purchases/invoices/${r.id}`),
      kind: "due" as const,
    })),
  ];

  return (
    <ERPLayout title="المستندات المعلقة">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <p className="p-10 text-center text-slate-500">لا توجد مستندات معلقة</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-4 py-2 text-right">النوع</th>
                  <th className="px-4 py-2 text-right">الرقم</th>
                  <th className="px-4 py-2 text-right">التاريخ</th>
                  <th className="px-4 py-2 text-right">الطرف</th>
                  <th className="px-4 py-2 text-right">المبلغ</th>
                  <th className="px-4 py-2 text-right">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d: any, i) => (
                  <tr key={i} className={`hover:bg-slate-50 ${d.kind === "due" ? "bg-red-50/40" : d.kind === "approval" ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-2 border-b">
                      {d.kind === "due" ? <AlertCircle size={14} className="inline ml-1 text-red-500" /> : d.kind === "approval" ? <CheckCircle size={14} className="inline ml-1 text-amber-600" /> : <FileText size={14} className="inline ml-1" />}
                      {d.type}
                    </td>
                    <td className="px-4 py-2 border-b"><Link href={d.href} className="text-blue-600 hover:underline">{d.number}</Link></td>
                    <td className="px-4 py-2 border-b">{String(d.date).slice(0, 10)}</td>
                    <td className="px-4 py-2 border-b">{d.party}</td>
                    <td className="px-4 py-2 border-b">{d.total != null ? Number(d.total).toLocaleString("en-US") : "—"}</td>
                    <td className="px-4 py-2 border-b">
                      {d.kind === "approval" && d.approvalId ? (
                        <Button size="sm" className="h-7 text-xs" onClick={() => approveMut.mutate(d.approvalId)} disabled={approveMut.isPending}>
                          اعتماد
                        </Button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ERPLayout>
  );
}
