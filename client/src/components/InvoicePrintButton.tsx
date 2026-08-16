import { trpc } from "@/lib/trpc";
import { PrintInvoice } from "@/components/PrintInvoice";
import { isPrintTemplateId, type PrintTemplateId } from "@/config/print-templates";

type InvoicePrintButtonProps = {
  invoiceId: number;
  type: "sale" | "purchase";
  fallback: {
    number: string;
    date: string | Date;
    partyName?: string;
    total: number;
    foreignTotal?: number | null;
    currencyCode?: string;
    exchangeRate?: number | string;
    status?: string;
    paymentType?: string;
  };
};

export function InvoicePrintButton({ invoiceId, type, fallback }: InvoicePrintButtonProps) {
  const utils = trpc.useUtils();
  const { data: company } = trpc.saas.getCompanyProfile.useQuery();
  const template: PrintTemplateId | undefined = isPrintTemplateId(company?.defaultPrintTemplate)
    ? company.defaultPrintTemplate
    : undefined;

  const loadFullInvoice = async () => {
    const inv = type === "sale"
      ? await utils.sales.invoices.byId.fetch(invoiceId)
      : await utils.purchases.invoices.byId.fetch(invoiceId);

    const partyName = type === "sale"
      ? (inv as { customerName?: string }).customerName
      : (inv as { supplierName?: string }).supplierName;

    return {
      number: inv.number,
      date: inv.date,
      type,
      partyName: partyName ?? undefined,
      items: ((inv as { items?: Array<Record<string, unknown>> }).items || []).map((row) => ({
        itemName: String(row.itemName || ""),
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.price) || 0,
        total: Number(row.total) || 0,
        discount: Number(row.discount) || 0,
        tax: Number(row.tax) || 0,
      })),
      subtotal: Number(inv.subtotal) || Number(inv.total) || 0,
      discount: Number(inv.discount) || 0,
      tax: Number(inv.tax) || 0,
      total: Number(inv.total) || 0,
      foreignTotal: inv.foreignTotal != null ? Number(inv.foreignTotal) : null,
      currencyCode: inv.currencyCode ?? "EGP",
      exchangeRate: inv.exchangeRate ?? 1,
      notes: inv.notes ?? undefined,
      status: inv.status ?? undefined,
      paymentType: inv.paymentType ?? undefined,
      etaUuid: (inv as { etaUuid?: string | null }).etaUuid,
      etaStatus: (inv as { etaStatus?: string | null }).etaStatus,
    };
  };

  return (
    <PrintInvoice
      invoice={{
        number: fallback.number,
        date: fallback.date,
        type,
        partyName: fallback.partyName,
        items: [],
        subtotal: fallback.total,
        total: fallback.total,
        foreignTotal: fallback.foreignTotal,
        currencyCode: fallback.currencyCode ?? "EGP",
        exchangeRate: fallback.exchangeRate ?? 1,
        status: fallback.status,
        paymentType: fallback.paymentType,
      }}
      companyName={company?.name}
      companyAddress={company?.address ?? undefined}
      companyPhone={company?.phone ?? undefined}
      companyTaxNumber={company?.taxNumber ?? undefined}
      companyLogo={company?.logo}
      invoiceFooter={company?.invoiceFooter}
      defaultTemplate={template}
      onBeforePrint={loadFullInvoice}
    />
  );
}
