import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";
import { DEFAULT_PRINT_TEMPLATE, PRINT_TEMPLATES, type PrintTemplateId } from "@/config/print-templates";
import { currencyLabel, isForeignCurrency } from "@shared/currency";

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
    currencyCode?: string;
    exchangeRate?: number | string;
    foreignTotal?: number | null;
    etaUuid?: string | null;
    etaStatus?: string | null;
  };
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
  companyLogo?: string | null;
  invoiceFooter?: string | null;
  defaultTemplate?: PrintTemplateId;
  onBeforePrint?: () => Promise<PrintInvoiceProps["invoice"] | void>;
  loading?: boolean;
}

function pageCssFor(templateId: PrintTemplateId) {
  if (templateId === "thermal") return "@page { size: 80mm auto; margin: 3mm; } .page { max-width: 74mm; padding: 6px; }";
  if (templateId === "thermal-58") return "@page { size: 58mm auto; margin: 2mm; } .page { max-width: 54mm; padding: 4px; }";
  if (templateId === "compact-a5") return "@page { size: A5; margin: 8mm; } .page { max-width: 148mm; }";
  return "@page { size: A4; margin: 12mm; } .page { max-width: 800px; }";
}

function statusLabel(status?: string) {
  if (status === "paid") return "مدفوعة / Paid";
  if (status === "partial") return "مدفوعة جزئياً / Partial";
  if (status === "confirmed") return "مؤكدة / Confirmed";
  return status || "—";
}

export function PrintInvoice({
  invoice,
  companyName = "Easy Cash",
  companyAddress,
  companyPhone,
  companyTaxNumber,
  companyLogo,
  invoiceFooter,
  defaultTemplate = DEFAULT_PRINT_TEMPLATE,
  onBeforePrint,
  loading = false,
}: PrintInvoiceProps) {
  const [templateId, setTemplateId] = useState<PrintTemplateId>(defaultTemplate);
  const [printing, setPrinting] = useState(false);
  const template = PRINT_TEMPLATES[templateId] || PRINT_TEMPLATES[DEFAULT_PRINT_TEMPLATE];

  const handlePrint = async () => {
    let doc = invoice;
    if (onBeforePrint) {
      setPrinting(true);
      try {
        const loaded = await onBeforePrint();
        if (loaded) doc = loaded;
      } finally {
        setPrinting(false);
      }
    }

    const code = (doc.currencyCode || "EGP").toUpperCase();
    const foreign = isForeignCurrency(code);
    const unitLabel = currencyLabel(code);
    const rate = Number(doc.exchangeRate || 1) || 1;
    const displaySubtotal = foreign && doc.foreignTotal != null ? Number(doc.subtotal) / rate : doc.subtotal;
    const displayTotal = foreign && doc.foreignTotal != null ? Number(doc.foreignTotal) : doc.total;
    const displayDiscount = foreign && doc.discount ? Number(doc.discount) / rate : doc.discount;
    const displayTax = foreign && doc.tax ? Number(doc.tax) / rate : doc.tax;
    const fmt = (n: number) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const isThermal = templateId === "thermal" || templateId === "thermal-58";
    const titleAr = doc.type === "sale" ? "فاتورة بيع" : "فاتورة شراء";
    const titleEn = doc.type === "sale" ? "Sales Invoice" : "Purchase Invoice";
    const partyAr = doc.type === "sale" ? "العميل" : "المورد";
    const partyEn = doc.type === "sale" ? "Customer" : "Supplier";
    const accent = templateId === "professional-a4" || templateId === "bilingual-a4" ? "#0f766e" : "#1d4ed8";
    const footerText = invoiceFooter?.trim()
      || "تم إنشاء هذه الفاتورة بواسطة نظام Easy Cash للمحاسبة والإدارة المتكاملة";

    const logoHtml = template.showLogo && companyLogo
      ? `<img src="${companyLogo}" alt="logo" style="max-height:64px;max-width:120px;object-fit:contain;margin-bottom:6px" />`
      : "";

    const etaBlock = doc.etaUuid
      ? `<div class="eta-box">
          <p><strong>ETA UUID</strong></p>
          <p class="mono">${doc.etaUuid}</p>
          ${doc.etaStatus ? `<p>الحالة: ${doc.etaStatus}</p>` : ""}
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(doc.etaUuid)}" alt="ETA QR" width="90" height="90" />
        </div>`
      : "";

    const signatures = template.signatures
      ? `<div class="signatures">
          <div class="sig"><div class="line"></div><p>${template.bilingual ? "توقيع المستلم / Receiver" : "توقيع المستلم"}</p></div>
          <div class="sig"><div class="line"></div><p>${template.bilingual ? "توقيع المحاسب / Accountant" : "توقيع المحاسب"}</p></div>
          <div class="sig"><div class="line"></div><p>${template.bilingual ? "ختم الشركة / Stamp" : "ختم الشركة"}</p></div>
        </div>`
      : "";

    const itemsRows = doc.items.map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${item.itemName || item.description || "-"}</td>
        <td>${item.quantity}</td>
        <td>${fmt(Number(item.unitPrice))} ${unitLabel}</td>
        ${!isThermal ? `<td>${item.discount ? fmt(Number(item.discount)) + " " + unitLabel : "-"}</td>` : ""}
        <td><strong>${fmt(Number(item.total))} ${unitLabel}</strong></td>
      </tr>
    `).join("");

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8" />
        <title>${titleAr} - ${doc.number}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Cairo', sans-serif; font-size: ${template.fontSize}; color: #1e293b; background: white; direction: rtl; }
          ${pageCssFor(templateId)}
          .page { padding: ${isThermal ? "6px" : "24px"}; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid ${accent}; gap: 12px; }
          .company-info h1 { font-size: ${isThermal ? "14px" : "22px"}; font-weight: 800; color: ${accent}; margin-bottom: 4px; }
          .company-info p { font-size: ${isThermal ? "9px" : "11px"}; color: #64748b; line-height: 1.5; }
          .invoice-title { text-align: left; }
          .invoice-title h2 { font-size: ${isThermal ? "12px" : "18px"}; font-weight: 700; }
          .badge { display: inline-block; background: ${accent}22; color: ${accent}; padding: 2px 8px; border-radius: 16px; font-size: 10px; font-weight: 600; margin-bottom: 4px; }
          .parties { display: ${isThermal ? "block" : "grid"}; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
          .party-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: ${isThermal ? "6px" : "12px"}; margin-bottom: ${isThermal ? "8px" : "0"}; }
          .party-box h3 { font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          thead tr { background: ${accent}; color: white; }
          thead th { padding: ${isThermal ? "4px" : "8px"}; text-align: right; font-size: ${isThermal ? "9px" : "11px"}; }
          tbody td { padding: ${isThermal ? "4px" : "8px"}; font-size: ${isThermal ? "9px" : "12px"}; border-bottom: 1px solid #f1f5f9; }
          tbody tr:nth-child(even) { background: #f8fafc; }
          .totals { display: flex; justify-content: flex-start; margin-bottom: 12px; }
          .totals-box { width: ${isThermal ? "100%" : "260px"}; }
          .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: ${isThermal ? "10px" : "12px"}; border-bottom: 1px solid #f1f5f9; }
          .totals-row.total { font-weight: 700; font-size: ${isThermal ? "12px" : "14px"}; color: ${accent}; border-top: 2px solid ${accent}; border-bottom: none; padding-top: 6px; }
          .notes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 11px; }
          .footer { text-align: center; font-size: 10px; color: #94a3b8; padding-top: 10px; border-top: 1px solid #e2e8f0; }
          .eta-box { text-align: center; margin: 12px 0; font-size: 10px; }
          .eta-box .mono { font-family: monospace; font-size: 9px; word-break: break-all; margin: 4px 0; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 28px; }
          .sig { text-align: center; font-size: 11px; color: #64748b; }
          .sig .line { border-top: 1px solid #94a3b8; margin: 36px 8px 8px; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="company-info">
              ${logoHtml}
              <h1>${companyName}</h1>
              ${companyAddress ? `<p>${companyAddress}</p>` : ""}
              ${companyPhone ? `<p>${template.bilingual ? "Phone / هاتف" : "هاتف"}: ${companyPhone}</p>` : ""}
              ${companyTaxNumber ? `<p>${template.bilingual ? "Tax ID / الرقم الضريبي" : "الرقم الضريبي"}: ${companyTaxNumber}</p>` : ""}
            </div>
            <div class="invoice-title">
              <div class="badge">${template.bilingual ? `${titleAr} / ${titleEn}` : titleAr}</div>
              <h2>${doc.number}</h2>
              <p>${template.bilingual ? "Date / التاريخ" : "التاريخ"}: ${new Date(doc.date).toLocaleDateString("en-GB")}</p>
              ${doc.dueDate ? `<p>${template.bilingual ? "Due / الاستحقاق" : "تاريخ الاستحقاق"}: ${new Date(doc.dueDate).toLocaleDateString("en-GB")}</p>` : ""}
              ${doc.paymentType ? `<p>${template.bilingual ? "Payment / الدفع" : "طريقة الدفع"}: ${doc.paymentType === "cash" ? "نقدي" : "آجل"}</p>` : ""}
              ${foreign ? `<p>${code} — ${rate.toLocaleString("en-US")}</p>` : ""}
            </div>
          </div>

          <div class="parties">
            <div class="party-box">
              <h3>${template.bilingual ? `${partyAr} / ${partyEn}` : partyAr}</h3>
              <p><strong>${doc.partyName || "غير محدد"}</strong></p>
              ${doc.partyPhone ? `<p>${doc.partyPhone}</p>` : ""}
              ${doc.partyAddress ? `<p>${doc.partyAddress}</p>` : ""}
            </div>
            ${!isThermal ? `<div class="party-box">
              <h3>${template.bilingual ? "Invoice details / تفاصيل الفاتورة" : "تفاصيل الفاتورة"}</h3>
              <p>${doc.number}</p>
              <p>${statusLabel(doc.status)}</p>
              <p>${template.bilingual ? "Lines / الأصناف" : "عدد الأصناف"}: ${doc.items.length}</p>
            </div>` : ""}
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>${template.bilingual ? "Item / الصنف" : "الصنف"}</th>
                <th>${template.bilingual ? "Qty / الكمية" : "الكمية"}</th>
                <th>${template.bilingual ? "Price / السعر" : "سعر الوحدة"}</th>
                ${!isThermal ? `<th>${template.bilingual ? "Disc / الخصم" : "الخصم"}</th>` : ""}
                <th>${template.bilingual ? "Total / الإجمالي" : "الإجمالي"}</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>

          <div class="totals">
            <div class="totals-box">
              <div class="totals-row"><span>${template.bilingual ? "Subtotal / المجموع" : "المجموع الفرعي"}:</span><span>${fmt(Number(displaySubtotal))} ${unitLabel}</span></div>
              ${displayDiscount ? `<div class="totals-row"><span>${template.bilingual ? "Discount / الخصم" : "الخصم"}:</span><span>- ${fmt(Number(displayDiscount))} ${unitLabel}</span></div>` : ""}
              ${displayTax ? `<div class="totals-row"><span>${template.bilingual ? "Tax / الضريبة" : "الضريبة"}:</span><span>${fmt(Number(displayTax))} ${unitLabel}</span></div>` : ""}
              <div class="totals-row total"><span>${template.bilingual ? "Grand total / الإجمالي" : "الإجمالي النهائي"}:</span><span>${fmt(Number(displayTotal))} ${unitLabel}</span></div>
              ${foreign ? `<div class="totals-row" style="font-size:11px;color:#64748b"><span>ما يعادل بالجنيه:</span><span>${fmt(Number(doc.total))} ج.م</span></div>` : ""}
            </div>
          </div>

          ${doc.notes ? `<div class="notes"><strong>${template.bilingual ? "Notes / ملاحظات" : "ملاحظات"}</strong><p>${doc.notes}</p></div>` : ""}
          ${etaBlock}
          ${signatures}
          <div class="footer"><p>${footerText}</p></div>
        </div>
        <script>window.onload = () => { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={templateId} onValueChange={(v) => setTemplateId(v as PrintTemplateId)}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(PRINT_TEMPLATES).map(([id, t]) => (
            <SelectItem key={id} value={id}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handlePrint()}
        disabled={loading || printing}
        className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 h-8 text-xs"
      >
        <Printer size={13} />
        {loading || printing ? "جاري التحميل..." : "طباعة / PDF"}
      </Button>
    </div>
  );
}
