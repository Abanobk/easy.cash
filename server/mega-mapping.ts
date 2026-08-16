/**
 * خريطة أسماء جداول/ملفات Mega Cash الشائعة → كيانات Easy Cash
 * تُحدَّث بعد فحص باكب حقيقي بـ scripts/inspect-mega-backup.mjs
 */
export const MEGA_ENTITY_ALIASES: Record<string, string[]> = {
  customers: [
    "customers", "customer", " العملاء", "عملاء", "Cust", "Customers",
    "TblCustomers", "tbl_Customers", "Client", "Clients",
  ],
  suppliers: [
    "suppliers", "supplier", "الموردين", "موردين", "Vendors", "Vendor",
    "TblSuppliers", "tbl_Suppliers", "Supplier",
  ],
  items: [
    "items", "item", "الأصناف", "اصناف", "Products", "Product",
    "TblItems", "tbl_Items", "StockItems", "Inventory",
  ],
  accounts: [
    "accounts", "account", "الحسابات", "شجرة الحسابات", "ChartOfAccounts",
    "TblAccounts", "tbl_Accounts", "COA", "AccountTree",
  ],
  employees: [
    "employees", "employee", "الموظفين", "موظفين", "TblEmployees", "HR_Employees",
  ],
  warehouses: [
    "warehouses", "warehouse", "المخازن", "مخازن", "Stores", "TblWarehouses",
  ],
  itemCategories: [
    "itemcategories", "item_categories", "تصنيفات الأصناف", "ItemGroups", "Categories",
  ],
  measureUnits: [
    "measureunits", "measure_units", "units", "Units", "وحدات القياس", "UnitNames",
    "TblUnits", "ItemUnits",
  ],
  departments: [
    "departments", "department", "الإدارات", "ادارات", "TblDepartments",
  ],
  salesInvoices: [
    "salesinvoices", "sales_invoices", "فواتير البيع", "SalesInvoice", "TblSales",
    "InvoiceSales", "SI",
  ],
  salesInvoiceItems: [
    "salesinvoiceitems", "sales_invoice_items", "بنود فواتير البيع", "SalesInvoiceDetails",
    "TblSalesDetails", "SalesDetails", "SalesInvoiceDetail",
  ],
  purchaseInvoices: [
    "purchaseinvoices", "purchase_invoices", "فواتير الشراء", "PurchaseInvoice",
    "TblPurchases", "PI",
  ],
  purchaseInvoiceItems: [
    "purchaseinvoiceitems", "purchase_invoice_items", "بنود فواتير الشراء",
    "PurchaseInvoiceDetails", "TblPurchaseDetails", "PurchaseInvoiceDetail",
  ],
  cashTransactions: [
    "cashtransactions", "cash_transactions", "حركات نقدية", "Cash", "TblCash",
    "Receipts", "Payments",
  ],
  bankAccounts: [
    "bankaccounts", "bank_accounts", "حسابات بنكية", "Banks", "TblBanks", "Bank",
  ],
  bankTransactions: [
    "banktransactions", "bank_transactions", "حركات بنكية", "BankTrans", "TblBankTrans",
  ],
  checks: [
    "checks", "cheques", "الشيكات", "شيكات", "TblChecks", "Cheques",
  ],
  journalEntries: [
    "journalentries", "journal_entries", "قيود اليومية", "Journal", "TblJournal",
    "GlEntries",
  ],
  journalEntryLines: [
    "journalentrylines", "journal_entry_lines", "بنود القيود", "JournalDetails",
    "TblJournalDetails", "GlLines", "JournalDetail",
  ],
  companySettings: [
    "companysettings", "company_settings", "إعدادات الشركة", "Company", "TblCompany",
  ],
};

/** تطبيع اسم ملف/جدول للمطابقة */
export function normalizeEntityKey(name: string): string {
  return name
    .replace(/\.(csv|json|xml|xlsx|xls|txt)$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "")
    .replace(/[^\w\u0600-\u06FF]/g, "");
}

export function resolveMegaEntity(fileOrTableName: string): string | null {
  const key = normalizeEntityKey(fileOrTableName);
  for (const [entity, aliases] of Object.entries(MEGA_ENTITY_ALIASES)) {
    for (const a of aliases) {
      if (normalizeEntityKey(a) === key) return entity;
    }
  }
  // تطابق جزئي
  for (const [entity, aliases] of Object.entries(MEGA_ENTITY_ALIASES)) {
    for (const a of aliases) {
      const na = normalizeEntityKey(a);
      if (key.includes(na) || na.includes(key)) return entity;
    }
  }
  return null;
}

/** أعمدة Mega الشائعة → حقول Easy Cash */
export const MEGA_FIELD_ALIASES: Record<string, string[]> = {
  code: ["code", "Code", "الكود", "كود", "ItemCode", "CustCode", "AccountCode", "AccCode"],
  name: ["name", "Name", "الاسم", "اسم", "ItemName", "CustName", "AccountName", "AccName"],
  phone: ["phone", "Phone", "الهاتف", "تليفون", "Mobile", "Tel"],
  phone2: ["phone2", "Phone2", "Mobile2", "موبايل", "تليفون2"],
  fax: ["fax", "Fax", "فاكس"],
  email: ["email", "Email", "البريد"],
  address: ["address", "Address", "العنوان"],
  city: ["city", "City", "المدينة"],
  balance: ["balance", "Balance", "الرصيد", "CurrentBalance"],
  openingBalance: ["openingbalance", "OpeningBalance", "رصيد أول المدة", "رصيدافتتاحي", "InitialBalance"],
  openingBalanceDate: ["openingbalancedate", "OpeningBalanceDate", "تاريخ الرصيد", "تاريخ أول المدة", "AsOfDate"],
  creditLimit: ["creditlimit", "CreditLimit", "حد الائتمان", "Credit"],
  taxNumber: ["taxnumber", "TaxNumber", "الرقم الضريبي", "TaxNo", "VAT"],
  commercialRegister: ["commercialregister", "CommercialRegister", "السجل التجاري", "CR"],
  contactPerson: ["contactperson", "ContactPerson", "شخص الاتصال", "المسؤول"],
  paymentTermDays: ["paymenttermdays", "PaymentTermDays", "أيام الائتمان", "CreditDays"],
  discountPercent: ["discountpercent", "DiscountPercent", "نسبة الخصم", "DefaultDiscount"],
  mapUrl: ["mapurl", "MapUrl", "GoogleMaps", "موقع الخريطة"],
  quantity: ["quantity", "Quantity", "الكمية", "Qty", "Qnt"],
  price: ["price", "Price", "السعر", "UnitPrice", "SalePrice"],
  salePrice: ["saleprice", "SalePrice", "سعر البيع", "SellingPrice"],
  purchasePrice: ["purchaseprice", "PurchasePrice", "سعر الشراء", "BuyPrice", "Cost"],
  amount: ["amount", "Amount", "المبلغ", "Value", "Total"],
  total: ["total", "Total", "الإجمالي", "NetTotal", "GrandTotal"],
  subtotal: ["subtotal", "SubTotal", "المجموع"],
  discount: ["discount", "Discount", "الخصم"],
  tax: ["tax", "Tax", "الضريبة", "VATAmount"],
  notes: ["notes", "Notes", "ملاحظات", "Remark", "Description"],
  date: ["date", "Date", "التاريخ", "InvoiceDate", "TransDate", "DocDate"],
  dueDate: ["duedate", "DueDate", "تاريخ الاستحقاق"],
  number: ["number", "Number", "الرقم", "InvoiceNo", "DocNo", "BillNo", "Serial"],
  description: ["description", "Description", "البيان", "Desc"],
  type: ["type", "Type", "النوع", "AccountType", "AccType"],
  parentId: ["parentid", "ParentId", "Parent", "الأب"],
  parentCode: ["parentcode", "ParentCode", "ParentAccountCode"],
  barcode: ["barcode", "Barcode", "الباركود"],
  unit: ["unit", "Unit", "الوحدة", "UnitName"],
  currentStock: ["currentstock", "CurrentStock", "المخزون", "QtyOnHand", "Stock"],
  customerId: ["customerid", "CustomerId", "CustId", "ClientId"],
  customerCode: ["customercode", "CustomerCode", "CustCode"],
  supplierId: ["supplierid", "SupplierId", "VendorId"],
  supplierCode: ["suppliercode", "SupplierCode", "VendorCode"],
  itemId: ["itemid", "ItemId", "ProductId"],
  itemCode: ["itemcode", "ItemCode", "ProductCode"],
  invoiceId: ["invoiceid", "InvoiceId", "BillId", "SalesInvoiceId"],
  invoiceNumber: ["invoicenumber", "InvoiceNumber", "InvoiceNo"],
  entryId: ["entryid", "EntryId", "JournalId"],
  journalId: ["journalid", "JournalId", "EntryId"],
  entryNumber: ["entrynumber", "EntryNumber", "JournalNo"],
  accountCode: ["accountcode", "AccountCode", "AccCode"],
  accountId: ["accountid", "AccountId", "AccId"],
  debit: ["debit", "Debit", "مدين", "Dr"],
  credit: ["credit", "Credit", "دائن", "Cr"],
  warehouseId: ["warehouseid", "WarehouseId", "StoreId"],
  bankAccountId: ["bankaccountid", "BankAccountId", "BankId"],
  accountNumber: ["accountnumber", "AccountNumber", "IBAN", "AccNo"],
  bankName: ["bankname", "BankName", "اسم البنك"],
  checkNumber: ["checknumber", "CheckNumber", "ChequeNo", "رقم الشيك"],
  status: ["status", "Status", "الحالة"],
  isParent: ["isparent", "IsParent", "IsGroup", "HasChildren"],
  basicSalary: ["basicsalary", "BasicSalary", "الراتب", "Salary"],
  paid: ["paid", "Paid", "المدفوع", "PaidAmount"],
  paidAmount: ["paidamount", "PaidAmount", "المدفوع"],
  remaining: ["remaining", "Remaining", "المتبقي"],
};

export function mapRowFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lowerEntries = Object.entries(row).map(([k, v]) => [k.toLowerCase().replace(/[\s_]+/g, ""), v] as const);

  for (const [canonical, aliases] of Object.entries(MEGA_FIELD_ALIASES)) {
    for (const alias of aliases) {
      const na = alias.toLowerCase().replace(/[\s_]+/g, "");
      const hit = lowerEntries.find(([k]) => k === na);
      if (hit && hit[1] != null && hit[1] !== "") {
        out[canonical] = hit[1];
        break;
      }
    }
  }

  // احتفظ بالحقول غير المعروفة كما هي (مفاتيح أصلية)
  for (const [k, v] of Object.entries(row)) {
    if (!(k in out) && v != null && v !== "") out[k] = v;
  }
  return out;
}
