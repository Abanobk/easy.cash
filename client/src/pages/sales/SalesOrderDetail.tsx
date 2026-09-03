import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowRight, ClipboardList, CheckCircle, FileText, XCircle } from "lucide-react";
import ERPLayout from "@/components/ERPLayout";
import PermissionGate from "@/components/PermissionGate";
import { toast } from "sonner";
import { toDateStr } from "@/lib/date";

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
  confirmed: { label: "معتمد", color: "bg-blue-100 text-blue-700" },
  delivered: { label: "مُحوَّل لفاتورة", color: "bg-green-100 text-green-700" },
  cancelled: { label: "ملغي", color: "bg-red-100 text-red-700" },
};

export default function SalesOrderDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id || "0");

  const { data: order, isLoading, refetch } = trpc.sales.orders.byId.useQuery(id, { enabled: !!id });
  const approveMut = trpc.sales.orders.approve.useMutation({
    onSuccess: () => { toast.success("تم اعتماد الطلب"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const convertMut = trpc.sales.orders.convertToInvoice.useMutation({
    onSuccess: (res) => {
      toast.success(`تم إنشاء الفاتورة ${res.number}`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.sales.orders.cancel.useMutation({
    onSuccess: () => { toast.success("تم إلغاء الطلب"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <ClipboardList className="h-12 w-12 text-gray-300" />
        <p className="text-gray-500">لم يتم العثور على الطلب</p>
        <Button variant="outline" onClick={() => navigate("/sales/orders")}>
          <ArrowRight className="h-4 w-4 ml-2" /> العودة للقائمة
        </Button>
      </div>
    );
  }

  const o = order as any;
  const statusInfo = statusMap[o.status] || { label: o.status, color: "bg-gray-100 text-gray-700" };
  const canApprove = o.status === "draft";
  const canConvert = o.status !== "delivered" && o.status !== "cancelled" && !o.convertedInvoiceId;
  const canCancel = o.status !== "delivered" && o.status !== "cancelled" && !o.convertedInvoiceId;

  return (
    <ERPLayout title={`طلب بيع - ${o.number}`}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate("/sales/orders")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
            <h1 className="text-xl font-bold text-gray-800">طلب بيع — {o.number}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canApprove && (
              <PermissionGate module="sales" action="edit">
                <Button size="sm" className="bg-green-600 gap-1" onClick={() => approveMut.mutate(id)} disabled={approveMut.isPending}>
                  <CheckCircle size={14} /> اعتماد
                </Button>
              </PermissionGate>
            )}
            {canConvert && (
              <PermissionGate module="sales" action="create">
                <Button size="sm" className="bg-blue-600 gap-1" onClick={() => convertMut.mutate({ orderId: id })} disabled={convertMut.isPending}>
                  <FileText size={14} /> تحويل لفاتورة
                </Button>
              </PermissionGate>
            )}
            {canCancel && (
              <PermissionGate module="sales" action="delete">
                <Button size="sm" variant="outline" className="text-red-600 gap-1" onClick={() => cancelMut.mutate(id)} disabled={cancelMut.isPending}>
                  <XCircle size={14} /> إلغاء
                </Button>
              </PermissionGate>
            )}
            {o.convertedInvoice && (
              <Link href={`/sales/invoices/${o.convertedInvoice.id}`}>
                <Button size="sm" variant="outline" className="gap-1">
                  <FileText size={14} /> الفاتورة {o.convertedInvoice.number}
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">بيانات العميل</h3>
            <p className="text-sm"><span className="text-slate-500">الاسم:</span> {o.customerName}</p>
            {o.customerPhone && <p className="text-sm"><span className="text-slate-500">الهاتف:</span> {o.customerPhone}</p>}
          </div>
          <div className="bg-white rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">بيانات الطلب</h3>
            <p className="text-sm"><span className="text-slate-500">التاريخ:</span> {o.date ? toDateStr(o.date) : "—"}</p>
            <p className="text-sm"><span className="text-slate-500">التسليم المتوقع:</span> {o.expectedDate ? toDateStr(o.expectedDate) : "—"}</p>
            {o.warehouseName && <p className="text-sm"><span className="text-slate-500">المخزن:</span> {o.warehouseName}</p>}
          </div>
        </div>

        {o.notes && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-6 text-sm text-amber-900">
            <span className="font-medium">ملاحظات:</span> {o.notes}
          </div>
        )}

        <div className="bg-white rounded-lg border overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-2 text-right">الكود</th>
                <th className="px-3 py-2 text-right">الصنف</th>
                <th className="px-3 py-2 text-right">الكمية</th>
                <th className="px-3 py-2 text-right">السعر</th>
                <th className="px-3 py-2 text-right">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {(o.items || []).map((it: any) => (
                <tr key={it.id} className="border-b hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-500">{it.itemCode || "—"}</td>
                  <td className="px-3 py-2">{it.itemName}</td>
                  <td className="px-3 py-2">{Number(it.quantity).toLocaleString("en-US")} {it.itemUnit || ""}</td>
                  <td className="px-3 py-2">{Number(it.price).toLocaleString("en-US")} ج.م</td>
                  <td className="px-3 py-2 font-medium">{Number(it.total).toLocaleString("en-US")} ج.م</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg border p-4 flex justify-end">
          <div className="text-left space-y-1 min-w-[200px]">
            <div className="flex justify-between text-lg font-bold text-green-700">
              <span>الإجمالي</span>
              <span>{Number(o.total || 0).toLocaleString("en-US")} ج.م</span>
            </div>
          </div>
        </div>
      </div>
    </ERPLayout>
  );
}
