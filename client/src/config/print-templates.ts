export type PrintTemplateId =
  | "standard-a4"
  | "professional-a4"
  | "bilingual-a4"
  | "compact-a5"
  | "thermal"
  | "thermal-58";

export type PrintTemplateMeta = {
  label: string;
  pageSize: string;
  fontSize: string;
  showLogo: boolean;
  showBarcode: boolean;
  bilingual: boolean;
  signatures: boolean;
  compact: boolean;
};

export const PRINT_TEMPLATES: Record<PrintTemplateId, PrintTemplateMeta> = {
  "standard-a4": {
    label: "فاتورة A4 قياسية",
    pageSize: "A4",
    fontSize: "14px",
    showLogo: true,
    showBarcode: true,
    bilingual: false,
    signatures: false,
    compact: false,
  },
  "professional-a4": {
    label: "فاتورة A4 احترافية (شعار + توقيع)",
    pageSize: "A4",
    fontSize: "13px",
    showLogo: true,
    showBarcode: true,
    bilingual: false,
    signatures: true,
    compact: false,
  },
  "bilingual-a4": {
    label: "فاتورة A4 ثنائية اللغة (عربي / إنجليزي)",
    pageSize: "A4",
    fontSize: "12px",
    showLogo: true,
    showBarcode: true,
    bilingual: true,
    signatures: true,
    compact: false,
  },
  "compact-a5": {
    label: "فاتورة A5 مدمجة",
    pageSize: "A5",
    fontSize: "12px",
    showLogo: true,
    showBarcode: false,
    bilingual: false,
    signatures: false,
    compact: true,
  },
  thermal: {
    label: "إيصال حراري 80mm",
    pageSize: "80mm",
    fontSize: "11px",
    showLogo: false,
    showBarcode: true,
    bilingual: false,
    signatures: false,
    compact: true,
  },
  "thermal-58": {
    label: "إيصال حراري 58mm",
    pageSize: "58mm",
    fontSize: "10px",
    showLogo: false,
    showBarcode: true,
    bilingual: false,
    signatures: false,
    compact: true,
  },
};

export const DEFAULT_PRINT_TEMPLATE: PrintTemplateId = "standard-a4";

export const PRINT_TEMPLATE_IDS = Object.keys(PRINT_TEMPLATES) as PrintTemplateId[];

export function isPrintTemplateId(v: unknown): v is PrintTemplateId {
  return typeof v === "string" && v in PRINT_TEMPLATES;
}
