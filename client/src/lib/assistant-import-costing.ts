import {
  ALLOC_LABELS,
  resolvedFreight,
  type ImportCostHeader,
  type ImportCostResult,
  type ShippingQuote,
} from "@shared/import-costing";

function money(n: number, digits = 2) {
  return Number(n || 0).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function pct(rate: number) {
  return Math.round((Number(rate) || 0) * 10000) / 100;
}

export type ImportCostingScreenInput = {
  name: string;
  number?: string;
  shipmentDate: string;
  typeLabel: string;
  notes: string;
  locked: boolean;
  header: ImportCostHeader;
  quote: ShippingQuote;
  computed: ImportCostResult;
};

/** نص عربي مضغوط يقرأه المساعد لمراجعة أرقام التقرير الحالي */
export function buildImportCostingAssistantSummary(input: ImportCostingScreenInput): string {
  const { header, quote, computed } = input;
  const freight = resolvedFreight(header);
  const t = computed.totals;
  const lines = computed.lines.filter((l) => (l.itemName || "").trim());
  const mode = input.locked ? "معاينة تقرير" : "تعديل";

  const linesBlock = lines.slice(0, 40).map((l, i) => {
    return `${i + 1}) ${l.itemName} | كمية ${money(l.quantity)} | سعر$ ${money(l.unitCostUsd, 3)} | وزن ${money(l.unitWeight, 3)} | وصول/وحدة ${money(l.landedUnitEgp)} ج | وصول السطر ${money(l.landedUnitEgp * l.quantity)} ج`;
  }).join("\n");

  const more = lines.length > 40 ? `\n… و${lines.length - 40} صنف إضافي غير معروض بالكامل` : "";

  const quoteBlock = quote.enabled
    ? `
عرض شركة الشحن: مفعّل
المسار: ${quote.pol} → ${quote.pod}
الحجم: ${money(quote.volumeCbm)} CBM (محسوب ${money(freight.quote.chargeableCbm)})
المدة: ${quote.expectedWeeks} أسبوع · أيام إضافية ${money(freight.quote.extraDays)}
نتيجة العرض: OF ${money(freight.quote.ofUsd)} $ + محلي ${money(freight.quote.localEgp)} ج
`
    : `عرض شركة الشحن: غير مفعّل (قيم يدوية)\nشحن $: ${money(header.shippingUsd)} · شحن محلي ج: ${money(header.freightLocalEgp)}`;

  return `تقرير تكليف شحنة مفتوح الآن (${mode})
الاسم: ${input.name || "بدون اسم"}
الرقم: ${input.number || "مسودة"}
التاريخ: ${input.shipmentDate || "—"}
النوع: ${input.typeLabel}
ملاحظات: ${input.notes || "—"}

المدخلات:
- فاتورة جمركية $: ${money(header.customsAssessableUsd)}
- صرف الجمرك: ${money(header.customsFxRate)} · صرف التكلفة: ${money(header.costFxRate)}
- جمارك ${money(pct(header.customsRate))}% = ${money(computed.pools.customsEgp)} ج
- ضريبة ${money(pct(header.vatRate))}% = ${money(computed.pools.vatEgp)} ج
- أ.ت.ص ${money(pct(header.withholdingRate))}% = ${money(computed.pools.withholdingEgp)} ج
- شحن $ المستخدم: ${money(freight.shippingUsd)} · عمولة الصين $: ${money(header.agentFeeUsd)} · OCA $: ${money(header.ocaUsd)}
- أرضيات ج: ${money(header.yardFeesEgp)} · مخلص ج: ${money(header.brokerFeesEgp)} · بطاريات ج: ${money(header.batteriesEgp)} · شحن محلي ج: ${money(freight.freightLocalEgp)}
- توزيع: OCA=${ALLOC_LABELS[header.ocaAlloc]} · شحن=${ALLOC_LABELS[header.shippingAlloc]} · عمولة=${ALLOC_LABELS[header.agentAlloc]} · محلي=${ALLOC_LABELS[header.localAlloc]}

${quoteBlock.trim()}

النتائج المحسوبة على الشاشة:
- مطلوب $: ${money(t.dueUsd)}
- مطلوب ج: ${money(t.dueLocalEgp)}
- دولار محوّل بسعر التكلفة: ${money(t.dueUsd * header.costFxRate)} ج
- تكلفة وصول إجمالية: ${money(t.landedEgp)} ج
- متوسط القطعة: ${money(t.avgLandedUnitEgp)} ج
- الكمية: ${money(t.quantity)} · عدد الأصناف: ${lines.length} · إجمالي الوزن: ${money(t.totalWeight)}

الأصناف:
${linesBlock || "(لا أصناف)"}
${more}`.trim();
}
