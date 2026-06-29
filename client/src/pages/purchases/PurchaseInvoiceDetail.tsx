import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowRight, Printer, FileText } from "lucide-react";
import { useRef } from "react";

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
  confirmed: { label: "مؤكدة", color: "bg-blue-100 text-blue-700" },
  paid: { label: "مدفوعة", color: "bg-green-100 text-green-700" },
  partial: { label: "جزئي", color: "bg-yellow-100 text-yellow-700" },
  cancelled: { label: "ملغية", color: "bg-red-100 text-red-700" },
};

const paymentTypeMap: Record<string, string> = {
  cash: "نقدي",
  credit: "آجل",
};

export default function PurchaseInvoiceDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const printRef = useRef<HTMLDivElement>(null);
  const id = parseInt(params.id || "0");

  const { data: invoice, isLoading } = trpc.purchases.invoices.byId.useQuery(id, { enabled: !!id });
  const { data: company } = trpc.saas.getCompanyProfile.useQuery();

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>فاتورة شراء - ${(invoice as any)?.number || ""}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 13px; color: #1a1a1a; direction: rtl; }
          .invoice-wrapper { max-width: 800px; margin: 20px auto; padding: 30px; border: 1px solid #e0e0e0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1d4ed8; }
          .company-name { font-size: 22px; font-weight: bold; color: #1d4ed8; }
          .invoice-title { font-size: 18px; font-weight: bold; color: #1d4ed8; text-align: left; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
          .info-box { background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
          .info-label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
          .info-value { font-size: 13px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #1d4ed8; color: white; padding: 10px 8px; text-align: right; font-size: 12px; }
          td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
          tr:nth-child(even) td { background: #f8fafc; }
          .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
          .total-row.grand { font-weight: bold; font-size: 15px; color: #1d4ed8; border-top: 2px solid #1d4ed8; padding-top: 8px; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="invoice-wrapper">
          ${printContent.innerHTML}
        </div>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <FileText className="h-12 w-12 text-gray-300" />
        <p className="text-gray-500">لم يتم العثور على الفاتورة</p>
        <Button variant="outline" onClick={() => navigate("/purchases/invoices")}>
          <ArrowRight className="h-4 w-4 ml-2" /> العودة للقائمة
        </Button>
      </div>
    );
  }

  const inv = invoice as any;
  const statusInfo = statusMap[inv.status] || { label: inv.status, color: "bg-gray-100 text-gray-700" };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/purchases/invoices")}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
          <h1 className="text-xl font-bold text-gray-800">فاتورة شراء - {inv.number}</h1>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
        <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Printer className="h-4 w-4" /> طباعة الفاتورة
        </Button>
      </div>

      {/* Printable Content */}
      <div ref={printRef} className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        {/* Invoice Header */}
        <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-blue-600">
          <div>
            {company?.logo && (
              <img src={company.logo} alt="شعار الشركة" className="h-12 w-auto object-contain mb-2" />
            )}
            <div className="text-2xl font-bold text-blue-700">{company?.name || "Easy Cash"}</div>
            {company?.nameEn && <div className="text-sm text-blue-500">{company.nameEn}</div>}
            <div className="text-sm text-gray-500 mt-1">{company?.address || "نظام المحاسبة والإدارة المتكامل"}</div>
            {company?.phone && <div className="text-xs text-gray-400">هاتف: {company.phone}</div>}
            {company?.taxNumber && <div className="text-xs text-gray-400">الرقم الضريبي: {company.taxNumber}</div>}
          </div>
          <div className="text-left">
            <div className="text-xl font-bold text-blue-700">فاتورة مشتريات</div>
            <div className="text-sm text-gray-600 mt-1">رقم: {inv.number}</div>
            <div className="text-sm text-gray-600">التاريخ: {inv.date ? new Date(inv.date).toLocaleDateString("ar-EG") : "-"}</div>
            {inv.dueDate && (
              <div className="text-sm text-gray-600">تاريخ الاستحقاق: {new Date(inv.dueDate).toLocaleDateString("ar-EG")}</div>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <div className="text-xs text-blue-500 mb-1">المورد</div>
            <div className="font-semibold text-gray-800">{inv.supplierName || `مورد #${inv.supplierId}`}</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">طريقة الدفع</div>
            <div className="font-semibold text-gray-800">{paymentTypeMap[inv.paymentType] || inv.paymentType}</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">المبلغ المدفوع</div>
            <div className="font-semibold text-green-700">{parseFloat(inv.paid || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">المبلغ المتبقي</div>
            <div className={`font-semibold ${parseFloat(inv.remaining || "0") > 0 ? "text-red-600" : "text-green-600"}`}>
              {parseFloat(inv.remaining || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">بنود الفاتورة</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="p-3 text-right text-xs rounded-tr-lg">#</th>
                <th className="p-3 text-right text-xs">الصنف</th>
                <th className="p-3 text-right text-xs">الوحدة</th>
                <th className="p-3 text-right text-xs">الكمية</th>
                <th className="p-3 text-right text-xs">السعر</th>
                <th className="p-3 text-right text-xs">الخصم %</th>
                <th className="p-3 text-right text-xs">الضريبة %</th>
                <th className="p-3 text-right text-xs rounded-tl-lg">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {(inv.items || []).map((item: any, idx: number) => (
                <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="p-3 text-xs text-gray-500 border-b border-gray-100">{idx + 1}</td>
                  <td className="p-3 text-sm font-medium border-b border-gray-100">{item.itemName || `صنف #${item.itemId}`}</td>
                  <td className="p-3 text-xs text-gray-600 border-b border-gray-100">{item.itemUnit || "-"}</td>
                  <td className="p-3 text-sm border-b border-gray-100">{parseFloat(item.quantity).toLocaleString("ar-EG")}</td>
                  <td className="p-3 text-sm border-b border-gray-100">{parseFloat(item.price).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-sm border-b border-gray-100">{parseFloat(item.discount || "0")}%</td>
                  <td className="p-3 text-sm border-b border-gray-100">{parseFloat(item.tax || "0")}%</td>
                  <td className="p-3 text-sm font-semibold text-blue-700 border-b border-gray-100">
                    {parseFloat(item.total).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {(!inv.items || inv.items.length === 0) && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-400 text-sm">لا توجد بنود</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-start">
          <div className="w-72 space-y-2">
            <div className="flex justify-between text-sm py-1 border-b border-gray-100">
              <span className="text-gray-600">المجموع الفرعي</span>
              <span className="font-medium">{parseFloat(inv.subtotal || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span>
            </div>
            {parseFloat(inv.discount || "0") > 0 && (
              <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                <span className="text-gray-600">الخصم</span>
                <span className="font-medium text-red-600">- {parseFloat(inv.discount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span>
              </div>
            )}
            {parseFloat(inv.tax || "0") > 0 && (
              <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                <span className="text-gray-600">الضريبة</span>
                <span className="font-medium text-orange-600">+ {parseFloat(inv.tax).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-t-2 border-blue-600">
              <span className="font-bold text-blue-700 text-base">الإجمالي</span>
              <span className="font-bold text-blue-700 text-base">{parseFloat(inv.total || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="text-xs text-amber-600 mb-1 font-medium">ملاحظات</div>
            <div className="text-sm text-gray-700">{inv.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          {company?.invoiceFooter || (company?.name || "Easy Cash") + " - نظام المحاسبة والإدارة المتكامل"} | تم إنشاء هذه الفاتورة بتاريخ {new Date().toLocaleDateString("ar-EG")}
        </div>
      </div>
    </div>
  );
}
