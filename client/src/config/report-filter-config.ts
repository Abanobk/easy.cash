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
  "accountingreports-customerstatment": ["customer", "branch", "area", "currency"],
  "accountingreports-vendorstatment": ["supplier", "branch", "currency"],
  "accountingreports-costcenterstatment": ["costCenter"],
  "accountingreports-customeraccountstatementbyitems": ["branch", "customer", "currency", "item"],
  "accountingreports-vendoraccountstatementbyitems": ["supplier", "item"],
  // ميجا Sales.aspx: فرع، عملة، تواريخ، استحقاق، مخزن، فئة، صنف، مندوب، منطقة، عميل، ضريبة، خصم، دفع، تحصيل…
  "accountingreports-sales": ["customer", "branch", "warehouse", "rep", "area", "item", "category", "paymentType", "currency", "dueDate", "paymentStatus", "taxFilter", "discountFilter"],
  // ميجا Purchases.aspx: نفس روح فلاتر البيع للمشتريات (+ مورد بدل عميل)
  "accountingreports-purchases": ["supplier", "branch", "warehouse", "item", "category", "paymentType", "currency", "dueDate", "paymentStatus", "taxFilter", "discountFilter"],
  "accountingreports-customerssales": ["customer", "branch", "area", "rep", "paymentType"],
  "accountingreports-vendorspurchases": ["supplier", "branch", "paymentType"],
  "accountingreports-payments": ["customer", "supplier", "branch"],
  // ميجا Dues.aspx: الفرع، العملة، من/الى، اسم الحساب، رقم المرجع، حالة السداد
  "accountingreports-dues": ["branch", "currency", "account", "paymentStatus"],
  "accountingreports-checks-checkin": ["customer"],
  "accountingreports-checks-checkout": ["supplier"],
  "accountingreports-debitsages": ["customer", "branch", "area", "rep"],
  "accountingreports-debitsagesbyyear": ["customer", "branch", "area", "rep"],
  "accountingreports-debitsagesbyhalfyear": ["customer", "branch", "area", "rep"],
  "accountingreports-salesorders": ["customer", "branch", "area", "rep", "warehouse", "item", "category"],
  "accountingreports-purchaseorders": ["supplier", "branch", "warehouse", "item", "category"],
  "accountingreports-matureinvoices": ["customer", "branch", "currency"],
  "accountingreports-maturereceipts": ["supplier", "branch", "currency"],
  "accountingreports-grossrepsalesbyitems": ["rep", "branch", "warehouse", "item", "category"],
  "accountingreports-repscollectings": ["rep"],
  "accountingreports-repdaily": ["rep", "branch"],
  "accountingreports-repdebit": ["rep"],
  "accountingreports-branchessummary": ["branch"],
  "accountingreports-areassummary": ["branch", "area", "currency"],
  "accountingreports-grosscustomersalesbyitems": ["item", "category", "rep", "branch", "warehouse", "customer"],
  "accountingreports-grossvendorpurchasesbyitems": ["item", "category", "branch", "warehouse", "supplier"],
  "accountingreports-monthlysalesbyitems": ["item", "category", "branch", "warehouse", "rep"],
  "accountingreports-monthlysalesbyitemstotals": ["branch", "warehouse", "rep"],
  "accountingreports-itemsprofits": ["item", "category", "branch"],
  "accountingreports-customersprofits": ["customer", "branch"],
  "accountingreports-invoiceprofits": ["customer", "branch", "rep"],
  "accountingreports-customerssummary": ["branch", "area", "rep", "currency"],
  "accountingreports-vendorssummary": ["branch", "currency"],
  "accountingreports-customerslist": ["branch", "area", "rep", "currency"],
  "accountingreports-vendorslist": ["branch", "currency"],
  "accountingreports-dashboard": ["branch", "paymentType"],
  "accountingreports-lastprices": ["item", "customer", "supplier", "branch", "category"],
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
