export type ReportEntityFilter =
  | "customer"
  | "supplier"
  | "account"
  | "rep"
  | "costCenter"
  | "branch"
  | "item"
  | "warehouse"
  | "area"
  | "category"
  | "paymentType"
  | "currency"
  | "dueDate"
  | "paymentStatus"
  | "taxFilter"
  | "discountFilter";

const ACCOUNTING_FILTERS: Record<string, ReportEntityFilter[]> = {
  // ميجا كشف حساب (AccountStatment.aspx): الفرع، العملة، من/الى، اسم الحساب، مركز التكلفة
  // (الحساب المقابل / نوع القيد / اعتمد بواسطة / ملاحظات / checkboxes — لاحقاً بعد تأكيد السلوك)
  "accountingreports-accountstatment": ["branch", "account", "costCenter", "currency"],
  "accountingreports-accountstatment-cash": ["branch", "account"],
  "accountingreports-customerstatment": ["customer"],
  "accountingreports-vendorstatment": ["supplier"],
  "accountingreports-costcenterstatment": ["costCenter"],
  "accountingreports-customeraccountstatementbyitems": ["branch", "customer", "currency", "item"],
  "accountingreports-vendoraccountstatementbyitems": ["supplier", "item"],
  "accountingreports-sales": ["customer", "branch", "warehouse", "rep", "area", "paymentType", "currency", "dueDate", "paymentStatus", "taxFilter", "discountFilter"],
  "accountingreports-purchases": ["supplier", "branch", "warehouse", "paymentType", "currency", "dueDate", "paymentStatus", "taxFilter", "discountFilter"],
  "accountingreports-customerssales": ["customer", "branch", "area", "rep", "paymentType"],
  "accountingreports-vendorspurchases": ["supplier", "branch", "paymentType"],
  "accountingreports-payments": ["customer", "supplier", "branch"],
  "accountingreports-checks-checkin": ["customer"],
  "accountingreports-checks-checkout": ["supplier"],
  "accountingreports-matureinvoices": ["customer", "branch"],
  "accountingreports-maturereceipts": ["supplier", "branch"],
  "accountingreports-grossrepsalesbyitems": ["rep", "branch", "warehouse", "item", "category"],
  "accountingreports-repscollectings": ["rep"],
  "accountingreports-repdaily": ["rep", "branch"],
  "accountingreports-repdebit": ["rep"],
  "accountingreports-branchessummary": ["branch"],
  "accountingreports-areassummary": ["branch", "area"],
  "accountingreports-grosscustomersalesbyitems": ["item", "category", "rep", "branch", "warehouse", "customer"],
  "accountingreports-grossvendorpurchasesbyitems": ["item", "category", "branch", "warehouse", "supplier"],
  "accountingreports-monthlysalesbyitems": ["item", "category", "branch", "warehouse", "rep"],
  "accountingreports-monthlysalesbyitemstotals": ["branch", "warehouse", "rep"],
  "accountingreports-itemsprofits": ["item", "category", "branch"],
  "accountingreports-customersprofits": ["customer", "branch"],
  "accountingreports-invoiceprofits": ["customer", "branch", "rep"],
  "accountingreports-customerssummary": ["branch", "area", "rep"],
  "accountingreports-vendorssummary": ["branch"],
  "accountingreports-customerslist": ["branch", "area", "rep"],
  "accountingreports-vendorslist": ["branch"],
  "accountingreports-dashboard": ["branch", "paymentType"],
  "accountingreports-lastprices": ["item", "customer", "supplier"],
  "accountingreports-monthlyexpenses": ["account", "costCenter"],
  "accountingreports-productionorders": ["warehouse", "branch", "item"],
  "accountingreports-productionmaterials": ["item", "warehouse", "branch"],
};

const FINAL_FILTERS: Record<string, ReportEntityFilter[]> = {
  "accounting-generaljournallist": ["account", "costCenter"],
  // ميجا (الاستاذ العام): الفرع + الحساب الرئيسي + مركز التكلفة + من/الى تاريخ
  "finalreports-generalledger": ["branch", "account", "costCenter"],
  "finalreports-subledger": ["account", "costCenter"],
  // ميجا (ميزان المراجعة): الفرع + الحساب الرئيسي + من/الى تاريخ (+ خيارات تجميع إضافية لاحقاً)
  "finalreports-trialbalance": ["branch", "account"],
  "finalreports-incomestatment": [],
  "finalreports-balancesheet": [],
  "finalreports-cashflow": [],
  "finalreports-salescost": [],
  "finalreports-financialstatment": [],
};

const ASSETS_FILTERS: Record<string, ReportEntityFilter[]> = {
  "fixedassetsreports-dep": [],
  "fixedassetsreports-depruns": [],
  "fixedassetsreports-soldfixedassets": [],
};

export function getReportEntityFilters(section: string, slug: string): ReportEntityFilter[] {
  if (section === "accounting") return ACCOUNTING_FILTERS[slug] || [];
  if (section === "final") return FINAL_FILTERS[slug] || [];
  if (section === "assets") return ASSETS_FILTERS[slug] || [];
  return [];
}
