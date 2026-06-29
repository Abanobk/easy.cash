import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface InvoiceItem {
  itemName?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  discount?: number;
  tax?: number;
}

interface PrintInvoiceProps {
  invoice: {
    number: string;
    date: string | Date;
    dueDate?: string | Date;
    type: "sale" | "purchase";
    partyName?: string;
    partyPhone?: string;
    partyAddress?: string;
    items: InvoiceItem[];
    subtotal: number;
    discount?: number;
    tax?: number;
    total: number;
    notes?: string;
    status?: string;
    paymentType?: string;
  };
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
}

export function PrintInvoice({ invoice, companyName = "Easy Cash", companyAddress, companyPhone, companyTaxNumber }: PrintInvoiceProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8" />
        <title>${invoice.type === "sale" ? "فاتورة بيع" : "فاتورة شراء"} - ${invoice.number}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Cairo', sans-serif; font-size: 13px; color: #1e293b; background: white; direction: rtl; }
          .page { padding: 24px; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1d4ed8; }
          .company-info h1 { font-size: 22px; font-weight: 800; color: #1d4ed8; margin-bottom: 4px; }
          .company-info p { font-size: 11px; color: #64748b; line-height: 1.6; }
          .invoice-title { text-align: left; }
          .invoice-title h2 { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
          .invoice-title .badge { display: inline-block; background: #dbeafe; color: #1d4ed8; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-bottom: 6px; }
          .invoice-title p { font-size: 11px; color: #64748b; }
          .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
          .party-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .party-box h3 { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
          .party-box p { font-size: 12px; color: #1e293b; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          thead tr { background: #1d4ed8; color: white; }
          thead th { padding: 8px 10px; text-align: right; font-size: 11px; font-weight: 600; }
          tbody tr { border-bottom: 1px solid #f1f5f9; }
          tbody tr:nth-child(even) { background: #f8fafc; }
          tbody td { padding: 8px 10px; font-size: 12px; }
          .totals { display: flex; justify-content: flex-start; margin-bottom: 16px; }
          .totals-box { width: 260px; }
          .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
          .totals-row.total { font-weight: 700; font-size: 14px; color: #1d4ed8; border-top: 2px solid #1d4ed8; border-bottom: none; padding-top: 8px; margin-top: 4px; }
          .notes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
          .notes h3 { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
          .notes p { font-size: 12px; color: #475569; }
          .footer { text-align: center; font-size: 10px; color: #94a3b8; padding-top: 12px; border-top: 1px solid #e2e8f0; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .page { padding: 12px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="company-info">
              <h1>${companyName}</h1>
              <p>نظام المحاسبة والإدارة المتكامل</p>
              ${companyAddress ? `<p>${companyAddress}</p>` : ""}
              ${companyPhone ? `<p>هاتف: ${companyPhone}</p>` : ""}
              ${companyTaxNumber ? `<p>الرقم الضريبي: ${companyTaxNumber}</p>` : ""}
            </div>
            <div class="invoice-title">
              <div class="badge">${invoice.type === "sale" ? "فاتورة بيع" : "فاتورة شراء"}</div>
              <h2>${invoice.number}</h2>
              <p>التاريخ: ${new Date(invoice.date).toLocaleDateString("ar-EG")}</p>
              ${invoice.dueDate ? `<p>تاريخ الاستحقاق: ${new Date(invoice.dueDate).toLocaleDateString("ar-EG")}</p>` : ""}
              ${invoice.paymentType ? `<p>طريقة الدفع: ${invoice.paymentType === "cash" ? "نقدي" : "آجل"}</p>` : ""}
            </div>
          </div>

          <div class="parties">
            <div class="party-box">
              <h3>${invoice.type === "sale" ? "العميل" : "المورد"}</h3>
              <p><strong>${invoice.partyName || "غير محدد"}</strong></p>
              ${invoice.partyPhone ? `<p>هاتف: ${invoice.partyPhone}</p>` : ""}
              ${invoice.partyAddress ? `<p>${invoice.partyAddress}</p>` : ""}
            </div>
            <div class="party-box">
              <h3>تفاصيل الفاتورة</h3>
              <p>رقم الفاتورة: <strong>${invoice.number}</strong></p>
              <p>الحالة: ${invoice.status === "paid" ? "مدفوعة" : invoice.status === "partial" ? "مدفوعة جزئياً" : "غير مدفوعة"}</p>
              <p>عدد الأصناف: ${invoice.items.length}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الصنف / الوصف</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الخصم</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map((item, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${item.itemName || item.description || "-"}</td>
                  <td>${item.quantity}</td>
                  <td>${Number(item.unitPrice).toLocaleString("ar-EG")} ج.م</td>
                  <td>${item.discount ? Number(item.discount).toLocaleString("ar-EG") + " ج.م" : "-"}</td>
                  <td><strong>${Number(item.total).toLocaleString("ar-EG")} ج.م</strong></td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-box">
              <div class="totals-row"><span>المجموع الفرعي:</span><span>${Number(invoice.subtotal).toLocaleString("ar-EG")} ج.م</span></div>
              ${invoice.discount ? `<div class="totals-row"><span>الخصم:</span><span>- ${Number(invoice.discount).toLocaleString("ar-EG")} ج.م</span></div>` : ""}
              ${invoice.tax ? `<div class="totals-row"><span>الضريبة:</span><span>${Number(invoice.tax).toLocaleString("ar-EG")} ج.م</span></div>` : ""}
              <div class="totals-row total"><span>الإجمالي النهائي:</span><span>${Number(invoice.total).toLocaleString("ar-EG")} ج.م</span></div>
            </div>
          </div>

          ${invoice.notes ? `<div class="notes"><h3>ملاحظات</h3><p>${invoice.notes}</p></div>` : ""}

          <div class="footer">
            <p>تم إنشاء هذه الفاتورة بواسطة نظام Easy Cash للمحاسبة والإدارة المتكاملة</p>
          </div>
        </div>
        <script>window.onload = () => { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePrint}
      className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 h-8 text-xs"
    >
      <Printer size={13} />
      طباعة / PDF
    </Button>
  );
}
