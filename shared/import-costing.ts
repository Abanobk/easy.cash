/**
 * تكليف شحنة قبل الاستيراد — حاسبة تكلفة وصول فقط.
 * لا ترتبط بفواتير أو مخزن أو قيود يومية.
 */

export type AllocKey = "unit_cost" | "weight" | "line_total" | "equal";

export type ImportCostLineInput = {
  category?: string;
  barcode?: string;
  itemName: string;
  quantity: number;
  unitCostUsd: number;
  unitWeight: number;
};

export type ShippingQuote = {
  enabled: boolean;
  pol: string;
  pod: string;
  volumeCbm: number;
  expectedWeeks: number;
  ofRateUsd: number;
  thcRateEgp: number;
  storageWeek1Egp: number;
  extraDayRateEgp: number;
  minCbmLocal: number;
  vatOnThcStorage: boolean;
  vatOnExtraDays: boolean;
};

export type ShippingQuoteResult = {
  chargeableCbm: number;
  localCbm: number;
  extraDays: number;
  ofUsd: number;
  thcEgp: number;
  thcVatEgp: number;
  storageEgp: number;
  storageVatEgp: number;
  extraEgp: number;
  extraVatEgp: number;
  localEgp: number;
};

export type ImportCostHeader = {
  costFxRate: number;
  customsFxRate: number;
  customsAssessableUsd: number;
  customsRate: number;
  vatRate: number;
  withholdingRate: number;
  shippingUsd: number;
  agentFeeUsd: number;
  ocaUsd: number;
  yardFeesEgp: number;
  brokerFeesEgp: number;
  batteriesEgp: number;
  freightLocalEgp: number;
  ocaAlloc: AllocKey;
  shippingAlloc: AllocKey;
  agentAlloc: AllocKey;
  localAlloc: AllocKey;
  shippingQuote: ShippingQuote;
};

export type ImportCostPresetId = "no_batteries" | "with_batteries";

export function presetKind(preset: string | null | undefined): ImportCostPresetId | "custom" {
  if (preset === "no_batteries" || preset === "with_batteries") return preset;
  return "custom";
}

export function customPresetName(preset: string | null | undefined): string {
  if (!preset || preset === "custom" || preset === "no_batteries" || preset === "with_batteries") return "";
  return preset;
}

export type ComputedImportCostLine = ImportCostLineInput & {
  lineTotalUsd: number;
  totalWeight: number;
  ocaShare: number;
  ocaUsd: number;
  shippingUsd: number;
  agentUsd: number;
  totalUsd: number;
  unitUsd: number;
  unitEgp: number;
  customsEgp: number;
  customsUnitEgp: number;
  vatEgp: number;
  vatUnitEgp: number;
  withholdingEgp: number;
  withholdingUnitEgp: number;
  yardEgp: number;
  yardUnitEgp: number;
  brokerEgp: number;
  brokerUnitEgp: number;
  batteriesEgp: number;
  batteriesUnitEgp: number;
  freightLocalEgp: number;
  freightLocalUnitEgp: number;
  landedUnitEgp: number;
};

export type ImportCostResult = {
  lines: ComputedImportCostLine[];
  totals: {
    quantity: number;
    unitCostSum: number;
    lineTotalUsd: number;
    totalWeight: number;
    ocaUsd: number;
    shippingUsd: number;
    agentUsd: number;
    totalUsd: number;
    customsEgp: number;
    vatEgp: number;
    withholdingEgp: number;
    yardEgp: number;
    brokerEgp: number;
    batteriesEgp: number;
    freightLocalEgp: number;
    dueUsd: number;
    dueLocalEgp: number;
    landedEgp: number;
    avgLandedUnitEgp: number;
  };
  pools: {
    customsEgp: number;
    vatEgp: number;
    withholdingEgp: number;
  };
};

export const ALLOC_LABELS: Record<AllocKey, string> = {
  unit_cost: "حسب سعر الوحدة",
  weight: "حسب الوزن",
  line_total: "حسب قيمة السطر",
  equal: "التوزيع بالتساوي",
};

/** عرض Shenzhen → Alex Old (EXW 1 CBM stackable non-IMO) */
export function defaultShippingQuote(overrides: Partial<ShippingQuote> = {}): ShippingQuote {
  return {
    enabled: false,
    pol: "SHENZHEN",
    pod: "ALEX OLD",
    volumeCbm: 1,
    expectedWeeks: 2,
    ofRateUsd: 150,
    thcRateEgp: 600,
    storageWeek1Egp: 600,
    extraDayRateEgp: 40,
    minCbmLocal: 2,
    vatOnThcStorage: true,
    vatOnExtraDays: false,
    ...overrides,
  };
}

export function parseShippingQuote(raw: unknown): ShippingQuote {
  if (!raw) return defaultShippingQuote();
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return defaultShippingQuote();
    }
  }
  if (!value || typeof value !== "object") return defaultShippingQuote();
  const q = value as Partial<ShippingQuote>;
  return defaultShippingQuote({
    enabled: Boolean(q.enabled),
    pol: typeof q.pol === "string" ? q.pol : undefined,
    pod: typeof q.pod === "string" ? q.pod : undefined,
    volumeCbm: n(q.volumeCbm) || 0,
    expectedWeeks: n(q.expectedWeeks) || 0,
    ofRateUsd: n(q.ofRateUsd),
    thcRateEgp: n(q.thcRateEgp),
    storageWeek1Egp: n(q.storageWeek1Egp),
    extraDayRateEgp: n(q.extraDayRateEgp),
    minCbmLocal: n(q.minCbmLocal),
    vatOnThcStorage: q.vatOnThcStorage !== false,
    vatOnExtraDays: Boolean(q.vatOnExtraDays),
  });
}

export function computeShippingQuote(quote: ShippingQuote, vatRate: number): ShippingQuoteResult {
  const cbm = Math.max(0, n(quote.volumeCbm));
  const weeks = Math.max(0, n(quote.expectedWeeks));
  const localCbm = cbm > 0 ? Math.max(cbm, Math.max(0, n(quote.minCbmLocal))) : 0;
  const extraDays = Math.max(0, Math.round(weeks * 7) - 7);
  const ofUsd = n(quote.ofRateUsd) * cbm;
  const thcEgp = n(quote.thcRateEgp) * localCbm;
  const storageEgp = n(quote.storageWeek1Egp) * localCbm;
  const extraEgp = n(quote.extraDayRateEgp) * localCbm * extraDays;
  const vat = n(vatRate);
  const thcVatEgp = quote.vatOnThcStorage ? thcEgp * vat : 0;
  const storageVatEgp = quote.vatOnThcStorage ? storageEgp * vat : 0;
  const extraVatEgp = quote.vatOnExtraDays ? extraEgp * vat : 0;
  return {
    chargeableCbm: cbm,
    localCbm,
    extraDays,
    ofUsd,
    thcEgp,
    thcVatEgp,
    storageEgp,
    storageVatEgp,
    extraEgp,
    extraVatEgp,
    localEgp: thcEgp + thcVatEgp + storageEgp + storageVatEgp + extraEgp + extraVatEgp,
  };
}

export function resolvedFreight(header: ImportCostHeader): { shippingUsd: number; freightLocalEgp: number; quote: ShippingQuoteResult } {
  const quote = computeShippingQuote(header.shippingQuote || defaultShippingQuote(), header.vatRate);
  if (header.shippingQuote?.enabled) {
    return { shippingUsd: quote.ofUsd, freightLocalEgp: quote.localEgp, quote };
  }
  return { shippingUsd: n(header.shippingUsd), freightLocalEgp: n(header.freightLocalEgp), quote };
}

export const PRESETS: Record<ImportCostPresetId, { label: string; header: ImportCostHeader }> = {
  no_batteries: {
    label: "سوتيحات",
    header: {
      costFxRate: 51,
      customsFxRate: 55,
      customsAssessableUsd: 0,
      customsRate: 0.2,
      vatRate: 0.14,
      withholdingRate: 0.01,
      shippingUsd: 0,
      agentFeeUsd: 0,
      ocaUsd: 0,
      yardFeesEgp: 0,
      brokerFeesEgp: 0,
      batteriesEgp: 0,
      freightLocalEgp: 0,
      ocaAlloc: "unit_cost",
      shippingAlloc: "unit_cost",
      agentAlloc: "unit_cost",
      localAlloc: "weight",
      shippingQuote: defaultShippingQuote(),
    },
  },
  with_batteries: {
    label: "لوكات",
    header: {
      costFxRate: 55,
      customsFxRate: 55,
      customsAssessableUsd: 0,
      customsRate: 0.4,
      vatRate: 0.14,
      withholdingRate: 0.01,
      shippingUsd: 0,
      agentFeeUsd: 0,
      ocaUsd: 0,
      yardFeesEgp: 0,
      brokerFeesEgp: 0,
      batteriesEgp: 0,
      freightLocalEgp: 0,
      ocaAlloc: "unit_cost",
      shippingAlloc: "weight",
      agentAlloc: "line_total",
      localAlloc: "weight",
      shippingQuote: defaultShippingQuote(),
    },
  },
};

export function emptyImportCostHeader(): ImportCostHeader {
  return { ...PRESETS.no_batteries.header, shippingQuote: defaultShippingQuote() };
}

export function emptyImportCostLine(): ImportCostLineInput {
  return {
    category: "",
    barcode: "",
    itemName: "",
    quantity: 0,
    unitCostUsd: 0,
    unitWeight: 0,
  };
}

function n(value: unknown): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function shareBase(line: { unitCostUsd: number; totalWeight: number; lineTotalUsd: number }, key: AllocKey): number {
  if (key === "equal") return 1;
  if (key === "unit_cost") return line.unitCostUsd;
  if (key === "weight") return line.totalWeight;
  return line.lineTotalUsd;
}

function shares(bases: number[]): number[] {
  const sum = bases.reduce((a, b) => a + b, 0);
  if (sum === 0) return bases.map(() => 0);
  return bases.map((b) => b / sum);
}

export function computeImportCost(header: ImportCostHeader, rawLines: ImportCostLineInput[]): ImportCostResult {
  const prelim = rawLines.map((line) => {
    const quantity = n(line.quantity);
    const unitCostUsd = n(line.unitCostUsd);
    const unitWeight = n(line.unitWeight);
    return {
      category: line.category || "",
      barcode: line.barcode || "",
      itemName: line.itemName || "",
      quantity,
      unitCostUsd,
      unitWeight,
      lineTotalUsd: quantity * unitCostUsd,
      totalWeight: quantity * unitWeight,
    };
  });

  const freight = resolvedFreight(header);
  const ocaShares = shares(prelim.map((l) => shareBase(l, header.ocaAlloc)));
  const shippingShares = shares(prelim.map((l) => shareBase(l, header.shippingAlloc)));
  const agentShares = shares(prelim.map((l) => shareBase(l, header.agentAlloc)));
  const localShares = shares(prelim.map((l) => shareBase(l, header.localAlloc)));

  const assessableEgp = n(header.customsAssessableUsd) * n(header.customsFxRate);
  const customsPool = assessableEgp * n(header.customsRate);
  const vatPool = assessableEgp * n(header.vatRate);
  const withholdingPool = assessableEgp * n(header.withholdingRate);

  const lines: ComputedImportCostLine[] = prelim.map((line, i) => {
    const ocaUsd = ocaShares[i] * n(header.ocaUsd);
    const shippingUsd = shippingShares[i] * freight.shippingUsd;
    const agentUsd = agentShares[i] * n(header.agentFeeUsd);
    const totalUsd = line.lineTotalUsd + ocaUsd + shippingUsd + agentUsd;
    const unitUsd = line.quantity ? totalUsd / line.quantity : 0;
    const unitEgp = unitUsd * n(header.costFxRate);

    const w = localShares[i];
    const customsEgp = w * customsPool;
    const vatEgp = w * vatPool;
    const withholdingEgp = w * withholdingPool;
    const yardEgp = w * n(header.yardFeesEgp);
    const brokerEgp = w * n(header.brokerFeesEgp);
    const batteriesEgp = w * n(header.batteriesEgp);
    const freightLocalEgp = w * freight.freightLocalEgp;

    const qty = line.quantity || 0;
    const customsUnitEgp = qty ? customsEgp / qty : 0;
    const vatUnitEgp = qty ? vatEgp / qty : 0;
    const withholdingUnitEgp = qty ? withholdingEgp / qty : 0;
    const yardUnitEgp = qty ? yardEgp / qty : 0;
    const brokerUnitEgp = qty ? brokerEgp / qty : 0;
    const batteriesUnitEgp = qty ? batteriesEgp / qty : 0;
    const freightLocalUnitEgp = qty ? freightLocalEgp / qty : 0;

    return {
      ...line,
      ocaShare: ocaShares[i],
      ocaUsd,
      shippingUsd,
      agentUsd,
      totalUsd,
      unitUsd,
      unitEgp,
      customsEgp,
      customsUnitEgp,
      vatEgp,
      vatUnitEgp,
      withholdingEgp,
      withholdingUnitEgp,
      yardEgp,
      yardUnitEgp,
      brokerEgp,
      brokerUnitEgp,
      batteriesEgp,
      batteriesUnitEgp,
      freightLocalEgp,
      freightLocalUnitEgp,
      landedUnitEgp:
        unitEgp + customsUnitEgp + vatUnitEgp + withholdingUnitEgp + yardUnitEgp + brokerUnitEgp + batteriesUnitEgp + freightLocalUnitEgp,
    };
  });

  const sum = (pick: (l: ComputedImportCostLine) => number) => lines.reduce((a, l) => a + pick(l), 0);
  const quantity = sum((l) => l.quantity);
  const dueUsd = sum((l) => l.totalUsd);
  const dueLocalEgp =
    sum((l) => l.customsEgp) +
    sum((l) => l.vatEgp) +
    sum((l) => l.withholdingEgp) +
    sum((l) => l.yardEgp) +
    sum((l) => l.brokerEgp) +
    sum((l) => l.batteriesEgp) +
    sum((l) => l.freightLocalEgp);
  const landedEgp = sum((l) => l.landedUnitEgp * l.quantity);

  return {
    lines,
    totals: {
      quantity,
      unitCostSum: sum((l) => l.unitCostUsd),
      lineTotalUsd: sum((l) => l.lineTotalUsd),
      totalWeight: sum((l) => l.totalWeight),
      ocaUsd: sum((l) => l.ocaUsd),
      shippingUsd: sum((l) => l.shippingUsd),
      agentUsd: sum((l) => l.agentUsd),
      totalUsd: dueUsd,
      customsEgp: sum((l) => l.customsEgp),
      vatEgp: sum((l) => l.vatEgp),
      withholdingEgp: sum((l) => l.withholdingEgp),
      yardEgp: sum((l) => l.yardEgp),
      brokerEgp: sum((l) => l.brokerEgp),
      batteriesEgp: sum((l) => l.batteriesEgp),
      freightLocalEgp: sum((l) => l.freightLocalEgp),
      dueUsd,
      dueLocalEgp,
      landedEgp,
      avgLandedUnitEgp: quantity ? landedEgp / quantity : 0,
    },
    pools: {
      customsEgp: customsPool,
      vatEgp: vatPool,
      withholdingEgp: withholdingPool,
    },
  };
}
