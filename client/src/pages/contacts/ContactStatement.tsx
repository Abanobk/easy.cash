import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Search, FileText, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

type ContactType = "customer" | "supplier";

export default function ContactStatement() {
  const [contactType, setContactType] = useState<ContactType>("customer");
  const [contactId, setContactId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: customers } = trpc.customers.list.useQuery({ search: searchQuery, limit: 100 });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ search: searchQuery, limit: 100 });

  const { data: customerStatement, isLoading: loadingCustomer } = trpc.statement.customer.useQuery(
    { customerId: contactId!, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
    { enabled: submitted && contactType === "customer" && !!contactId }
  );

  const { data: supplierStatement, isLoading: loadingSupplier } = trpc.statement.supplier.useQuery(
    { supplierId: contactId!, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
    { enabled: submitted && contactType === "supplier" && !!contactId }
  );

  const statement = contactType === "customer" ? customerStatement : supplierStatement;
  const isLoading = contactType === "customer" ? loadingCustomer : loadingSupplier;

  const contactList = contactType === "customer"
    ? (customers?.rows || [])
    : (suppliers?.rows || []);

  const handleSearch = () => {
    if (!contactId) return;
    setSubmitted(true);
  };

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
        <title>كشف حساب</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; color: #1a1a1a; direction: rtl; }
          .wrapper { max-width: 900px; margin: 20px auto; padding: 24px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #1d4ed8; }
          .company { font-size: 20px; font-weight: bold; color: #1d4ed8; }
          .title { font-size: 16px; font-weight: bold; color: #1d4ed8; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
          .summary-box { background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; text-align: center; }
          .summary-label { font-size: 10px; color: #64748b; }
          .summary-value { font-size: 14px; font-weight: bold; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background: #1d4ed8; color: white; padding: 8px; text-align: right; font-size: 11px; }
          td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
          tr:nth-child(even) td { background: #f8fafc; }
          .section-title { font-size: 13px; font-weight: bold; color: #1d4ed8; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body><div class="wrapper">${printContent.innerHTML}</div></body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const contact = (statement as any)?.customer || (statement as any)?.supplier;
  const summary = (statement as any)?.summary;
  const invoices = (statement as any)?.invoices || [];
  const cashTxns = (statement as any)?.cashTransactions || [];
  const bankTxns = (statement as any)?.bankTransactions || [];
  const returns = (statement as any)?.returns || [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          كشف حساب عميل / مورد
        </h1>
        {submitted && statement && (
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Printer className="h-4 w-4" /> طباعة الكشف
          </Button>
        )}
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">نوع الجهة</Label>
            <Select value={contactType} onValueChange={(v) => { setContactType(v as ContactType); setContactId(null); setSubmitted(false); }}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">عميل</SelectItem>
                <SelectItem value="supplier">مورد</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">{contactType === "customer" ? "العميل" : "المورد"}</Label>
            <Select value={contactId?.toString() || ""} onValueChange={(v) => { setContactId(parseInt(v)); setSubmitted(false); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={`اختر ${contactType === "customer" ? "عميل" : "مورد"}`} />
              </SelectTrigger>
              <SelectContent>
                {contactList.map((c: any) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">من تاريخ</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">إلى تاريخ</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSearch} disabled={!contactId} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Search className="h-4 w-4" /> عرض الكشف
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {/* No data */}
      {!isLoading && submitted && !statement && (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
          <AlertCircle className="h-10 w-10" />
          <p>لا توجد بيانات للعرض</p>
        </div>
      )}

      {/* Statement Content */}
      {!isLoading && statement && (
        <div ref={printRef} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start pb-4 border-b-2 border-blue-600">
            <div>
              <div className="text-2xl font-bold text-blue-700">Easy Cash</div>
              <div className="text-sm text-gray-500">نظام المحاسبة والإدارة المتكامل</div>
            </div>
            <div className="text-left">
              <div className="text-xl font-bold text-blue-700">كشف حساب {contactType === "customer" ? "عميل" : "مورد"}</div>
              <div className="text-sm text-gray-600 mt-1">الاسم: {contact?.name}</div>
              {contact?.phone && <div className="text-sm text-gray-600">الهاتف: {contact.phone}</div>}
              {(dateFrom || dateTo) && (
                <div className="text-sm text-gray-600">
                  الفترة: {dateFrom || "البداية"} - {dateTo || "الآن"}
                </div>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-center">
                <div className="text-xs text-blue-500 mb-1">إجمالي الفواتير</div>
                <div className="text-lg font-bold text-blue-700">
                  {summary.totalInvoices.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-blue-400">ج.م</div>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-center">
                <div className="text-xs text-green-500 mb-1">إجمالي المدفوع</div>
                <div className="text-lg font-bold text-green-700">
                  {summary.totalPaid.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-green-400">ج.م</div>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-lg p-4 text-center">
                <div className="text-xs text-red-500 mb-1">إجمالي المتبقي</div>
                <div className="text-lg font-bold text-red-700">
                  {summary.totalRemaining.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-red-400">ج.م</div>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 text-center">
                <div className="text-xs text-orange-500 mb-1">إجمالي المردودات</div>
                <div className="text-lg font-bold text-orange-700">
                  {summary.totalReturns.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-orange-400">ج.م</div>
              </div>
            </div>
          )}

          {/* Invoices Table */}
          <div>
            <h3 className="font-semibold text-blue-700 mb-3 flex items-center gap-2 text-sm border-b border-gray-100 pb-2">
              <TrendingUp className="h-4 w-4" />
              {contactType === "customer" ? "فواتير البيع" : "فواتير الشراء"} ({invoices.length})
            </h3>
            {invoices.length > 0 ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-blue-600 text-white">
                    <th className="p-2 text-right text-xs">رقم الفاتورة</th>
                    <th className="p-2 text-right text-xs">التاريخ</th>
                    <th className="p-2 text-right text-xs">نوع الدفع</th>
                    <th className="p-2 text-right text-xs">الإجمالي</th>
                    <th className="p-2 text-right text-xs">المدفوع</th>
                    <th className="p-2 text-right text-xs">المتبقي</th>
                    <th className="p-2 text-right text-xs">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any, idx: number) => (
                    <tr key={inv.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="p-2 border-b border-gray-100 font-medium text-blue-600">{inv.number}</td>
                      <td className="p-2 border-b border-gray-100 text-xs">{inv.date ? new Date(inv.date).toLocaleDateString("ar-EG") : "-"}</td>
                      <td className="p-2 border-b border-gray-100 text-xs">{inv.paymentType === "cash" ? "نقدي" : "آجل"}</td>
                      <td className="p-2 border-b border-gray-100 font-medium">{parseFloat(inv.total || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 border-b border-gray-100 text-green-600">{parseFloat(inv.paid || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 border-b border-gray-100 text-red-600">{parseFloat(inv.remaining || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 border-b border-gray-100">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "paid" ? "bg-green-100 text-green-700" :
                          inv.status === "partial" ? "bg-yellow-100 text-yellow-700" :
                          inv.status === "confirmed" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {inv.status === "paid" ? "مدفوعة" : inv.status === "partial" ? "جزئي" : inv.status === "confirmed" ? "مؤكدة" : inv.status === "draft" ? "مسودة" : inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">لا توجد فواتير</p>
            )}
          </div>

          {/* Cash Transactions */}
          {cashTxns.length > 0 && (
            <div>
              <h3 className="font-semibold text-green-700 mb-3 flex items-center gap-2 text-sm border-b border-gray-100 pb-2">
                <TrendingDown className="h-4 w-4" />
                المعاملات النقدية ({cashTxns.length})
              </h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-green-600 text-white">
                    <th className="p-2 text-right text-xs">التاريخ</th>
                    <th className="p-2 text-right text-xs">النوع</th>
                    <th className="p-2 text-right text-xs">المبلغ</th>
                    <th className="p-2 text-right text-xs">البيان</th>
                  </tr>
                </thead>
                <tbody>
                  {cashTxns.map((tx: any, idx: number) => (
                    <tr key={tx.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="p-2 border-b border-gray-100 text-xs">{tx.date ? new Date(tx.date).toLocaleDateString("ar-EG") : "-"}</td>
                      <td className="p-2 border-b border-gray-100 text-xs">{tx.type === "receipt" ? "قبض" : tx.type === "payment" ? "صرف" : tx.type}</td>
                      <td className="p-2 border-b border-gray-100 font-medium">{parseFloat(tx.amount || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</td>
                      <td className="p-2 border-b border-gray-100 text-xs text-gray-500">{tx.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bank Transactions */}
          {bankTxns.length > 0 && (
            <div>
              <h3 className="font-semibold text-indigo-700 mb-3 flex items-center gap-2 text-sm border-b border-gray-100 pb-2">
                <TrendingDown className="h-4 w-4" />
                المعاملات البنكية ({bankTxns.length})
              </h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-indigo-600 text-white">
                    <th className="p-2 text-right text-xs">التاريخ</th>
                    <th className="p-2 text-right text-xs">النوع</th>
                    <th className="p-2 text-right text-xs">المبلغ</th>
                    <th className="p-2 text-right text-xs">البيان</th>
                  </tr>
                </thead>
                <tbody>
                  {bankTxns.map((tx: any, idx: number) => (
                    <tr key={tx.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="p-2 border-b border-gray-100 text-xs">{tx.date ? new Date(tx.date).toLocaleDateString("ar-EG") : "-"}</td>
                      <td className="p-2 border-b border-gray-100 text-xs">{tx.type === "deposit" ? "إيداع" : tx.type === "withdrawal" ? "سحب" : tx.type}</td>
                      <td className="p-2 border-b border-gray-100 font-medium">{parseFloat(tx.amount || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</td>
                      <td className="p-2 border-b border-gray-100 text-xs text-gray-500">{tx.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Returns */}
          {returns.length > 0 && (
            <div>
              <h3 className="font-semibold text-orange-700 mb-3 flex items-center gap-2 text-sm border-b border-gray-100 pb-2">
                <AlertCircle className="h-4 w-4" />
                المردودات ({returns.length})
              </h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-orange-500 text-white">
                    <th className="p-2 text-right text-xs">رقم المردود</th>
                    <th className="p-2 text-right text-xs">التاريخ</th>
                    <th className="p-2 text-right text-xs">الإجمالي</th>
                    <th className="p-2 text-right text-xs">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((ret: any, idx: number) => (
                    <tr key={ret.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="p-2 border-b border-gray-100 font-medium text-orange-600">{ret.number}</td>
                      <td className="p-2 border-b border-gray-100 text-xs">{ret.date ? new Date(ret.date).toLocaleDateString("ar-EG") : "-"}</td>
                      <td className="p-2 border-b border-gray-100 font-medium">{parseFloat(ret.total || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</td>
                      <td className="p-2 border-b border-gray-100 text-xs text-gray-500">{ret.reason || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
            Easy Cash - نظام المحاسبة والإدارة المتكامل | تم إنشاء هذا الكشف بتاريخ {new Date().toLocaleDateString("ar-EG")}
          </div>
        </div>
      )}
    </div>
  );
}
