import {
  int, mysqlEnum, mysqlTable, text, timestamp, varchar,
  decimal, boolean, date, tinyint, json, mediumtext, unique,
} from "drizzle-orm/mysql-core";

// ===================== USERS =====================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ===================== TENANTS (SaaS companies) =====================
export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerUserId: int("ownerUserId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== COMPANY SETTINGS =====================
export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  taxNumber: varchar("taxNumber", { length: 100 }),
  logo: text("logo"),
  currency: varchar("currency", { length: 10 }).default("EGP"),
  fiscalYearStart: date("fiscalYearStart"),
  alertEmailsEnabled: boolean("alertEmailsEnabled").default(false),
  alertEmailRecipients: text("alertEmailRecipients"),
  alertEmailsLastSent: timestamp("alertEmailsLastSent"),
  requireDocumentApproval: boolean("requireDocumentApproval").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== BRANCHES =====================
export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== CUSTOMER/SUPPLIER CATEGORIES =====================
export const contactCategories = mysqlTable("contact_categories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["customer", "supplier", "both"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== CUSTOMERS =====================
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: int("categoryId"),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  fax: varchar("fax", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  taxNumber: varchar("taxNumber", { length: 100 }),
  commercialRegister: varchar("commercialRegister", { length: 100 }),
  contactPerson: varchar("contactPerson", { length: 255 }),
  paymentTermDays: int("paymentTermDays"),
  discountPercent: decimal("discountPercent", { precision: 8, scale: 2 }).default("0"),
  /** Mega Cash opening AR balance (included in computed balance). */
  openingBalance: decimal("openingBalance", { precision: 15, scale: 2 }).default("0"),
  /** As-of date for the opening AR balance. */
  openingBalanceDate: date("openingBalanceDate"),
  creditLimit: decimal("creditLimit", { precision: 15, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  salesRepId: int("salesRepId"),
  branchId: int("branchId"),
  areaId: int("areaId"),
  mapUrl: varchar("mapUrl", { length: 500 }),
  /** When set, this customer is also registered as a supplier (Mega Cash dual-role). */
  linkedSupplierId: int("linkedSupplierId"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== SUPPLIERS =====================
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: int("categoryId"),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  fax: varchar("fax", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  taxNumber: varchar("taxNumber", { length: 100 }),
  commercialRegister: varchar("commercialRegister", { length: 100 }),
  contactPerson: varchar("contactPerson", { length: 255 }),
  paymentTermDays: int("paymentTermDays"),
  discountPercent: decimal("discountPercent", { precision: 8, scale: 2 }).default("0"),
  /** Mega Cash opening AP balance (included in computed balance). */
  openingBalance: decimal("openingBalance", { precision: 15, scale: 2 }).default("0"),
  /** As-of date for the opening AP balance. */
  openingBalanceDate: date("openingBalanceDate"),
  creditLimit: decimal("creditLimit", { precision: 15, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  branchId: int("branchId"),
  mapUrl: varchar("mapUrl", { length: 500 }),
  /** When set, this supplier is also registered as a customer (Mega Cash dual-role). */
  linkedCustomerId: int("linkedCustomerId"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Many sales reps per customer — each with optional commission override (Mega-style multi-rep). */
export const customerSalesReps = mysqlTable("customer_sales_reps", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  customerId: int("customerId").notNull(),
  salesRepId: int("salesRepId").notNull(),
  /** If null, use sales_reps.commissionRate — up to 4 decimal places (e.g. 0.0625). */
  commissionRate: decimal("commissionRate", { precision: 10, scale: 4 }),
  isPrimary: boolean("isPrimary").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== WAREHOUSES =====================
export const warehouses = mysqlTable("warehouses", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  /** الفرع التابع له المخزن — للتقارير والنطاق متعدد الفروع */
  branchId: int("branchId"),
  /** الموظف المسؤول عن المخزن — مطابقة ميجا Stores.aspx */
  employeeId: int("employeeId"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== ITEM CATEGORIES =====================
export const itemCategories = mysqlTable("item_categories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: int("parentId"),
  /** عرض فى فواتير البيع — مطابقة ميجا Categories.aspx */
  showInSalesInvoices: boolean("showInSalesInvoices").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== ITEMS =====================
export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  code: varchar("code", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: int("categoryId"),
  /** فئة بديلة — مطابقة ميجا Items.aspx */
  altCategoryId: int("altCategoryId"),
  /** نوع الصنف: وحدة مخزنية / خدمية / مادة خام / … */
  itemType: varchar("itemType", { length: 50 }).default("وحدة مخزنية"),
  unit: varchar("unit", { length: 50 }).default("قطعة"),
  purchasePrice: decimal("purchasePrice", { precision: 15, scale: 2 }).default("0"),
  averageCost: decimal("averageCost", { precision: 15, scale: 4 }).default("0"),
  salePrice: decimal("salePrice", { precision: 15, scale: 2 }).default("0"),
  minPrice: decimal("minPrice", { precision: 15, scale: 2 }).default("0"),
  maxPrice: decimal("maxPrice", { precision: 15, scale: 2 }).default("0"),
  /** خصم نسبة / خصم نقدي على بطاقة الصنف — مطابقة ميجا */
  percentDiscount: decimal("percentDiscount", { precision: 8, scale: 2 }).default("0"),
  cashDiscount: decimal("cashDiscount", { precision: 15, scale: 2 }).default("0"),
  minStock: decimal("minStock", { precision: 15, scale: 3 }).default("0"),
  currentStock: decimal("currentStock", { precision: 15, scale: 3 }).default("0"),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("0"),
  /** ضريبة (2) / (3) — مطابقة بطاقة الصنف في المصدر */
  taxRate2: decimal("taxRate2", { precision: 5, scale: 2 }).default("0"),
  taxRate3: decimal("taxRate3", { precision: 5, scale: 2 }).default("0"),
  taxId: int("taxId"),
  tax2Id: int("tax2Id"),
  tax3Id: int("tax3Id"),
  trackSerial: boolean("trackSerial").default(false),
  description: text("description"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** أسعار إضافية للصنف (نوع سعر + عملة) — تبويب «الأسعار الإضافية» في ميجا */
export const itemExtraPrices = mysqlTable("item_extra_prices", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  itemId: int("itemId").notNull(),
  priceName: varchar("priceName", { length: 100 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 10 }).default("EGP"),
  unit: varchar("unit", { length: 50 }),
  price: decimal("price", { precision: 15, scale: 2 }).notNull().default("0"),
  percentDiscount: decimal("percentDiscount", { precision: 8, scale: 2 }).default("0"),
  cashDiscount: decimal("cashDiscount", { precision: 15, scale: 2 }).default("0"),
});

/** وحدات قياس إضافية للصنف — تبويب «وحدات القياس الإضافية» في ميجا */
export const itemExtraUnits = mysqlTable("item_extra_units", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  itemId: int("itemId").notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  factorToBase: decimal("factorToBase", { precision: 15, scale: 6 }).notNull().default("1"),
  priceFactor: decimal("priceFactor", { precision: 15, scale: 6 }).default("1"),
});

// ===================== ITEM WAREHOUSE STOCK =====================
export const itemWarehouseStock = mysqlTable("item_warehouse_stock", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  itemId: int("itemId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).default("0"),
  /** متوسط تكلفة مرجّح خاص بهذا المخزن فقط — منفصل عن items.averageCost (المتوسط العام للصنف) */
  unitCost: decimal("unitCost", { precision: 15, scale: 4 }).default("0"),
  /** أقل كمية / المكان بالمخزن — تبويب المخازن في بطاقة الصنف */
  minQuantity: decimal("minQuantity", { precision: 15, scale: 3 }).default("0"),
  location: varchar("location", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== TAXES =====================
export const taxes = mysqlTable("taxes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true),
  /** الحساب الدائن الذي تترحّل إليه هذه الضريبة — لو فاضي يترحّل على حساب الضريبة الافتراضي */
  glAccountId: int("glAccountId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== ACCOUNTS (Chart of Accounts) =====================
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: int("parentId"),
  type: mysqlEnum("type", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  isParent: boolean("isParent").default(false),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== PURCHASE ORDERS =====================
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  supplierId: int("supplierId").notNull(),
  date: date("date").notNull(),
  expectedDate: date("expectedDate"),
  warehouseId: int("warehouseId"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "partial", "received", "cancelled"]).default("draft"),
  notes: text("notes"),
  /** آخر فاتورة اتحولت من الأمر ده — للعرض بس؛ المرجع الكامل هو purchaseInvoices.orderId (أمر ممكن يتحول لأكتر من فاتورة جزئية) */
  convertedInvoiceId: int("convertedInvoiceId"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseOrderItems = mysqlTable("purchase_order_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  orderId: int("orderId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 5, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  /** الكمية اللي اتحوّلت لفاتورة/فواتير فعلية لحد دلوقتي — الباقي = quantity - convertedQuantity */
  convertedQuantity: decimal("convertedQuantity", { precision: 15, scale: 3 }).default("0"),
});

// ===================== PURCHASE INVOICES =====================
export const purchaseInvoices = mysqlTable("purchase_invoices", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  supplierId: int("supplierId").notNull(),
  orderId: int("orderId"),
  date: date("date").notNull(),
  dueDate: date("dueDate"),
  warehouseId: int("warehouseId"),
  paymentType: mysqlEnum("paymentType", ["cash", "credit"]).default("cash"),
  /** جزء السداد النقدي وقت الإنشاء (فواتير نقدية أو دفعة مقدمة على الآجل) */
  cashAmount: decimal("cashAmount", { precision: 15, scale: 2 }).default("0"),
  /** جزء السداد عن طريق البنك المحدد في bankAccountId */
  bankAmount: decimal("bankAmount", { precision: 15, scale: 2 }).default("0"),
  bankAccountId: int("bankAccountId"),
  receiptType: mysqlEnum("receiptType", ["full", "partial"]).default("full"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  paid: decimal("paid", { precision: 15, scale: 2 }).default("0"),
  remaining: decimal("remaining", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "paid", "partial", "cancelled"]).default("draft"),
  branchId: int("branchId"),
  costCenterId: int("costCenterId"),
  currencyCode: varchar("currencyCode", { length: 10 }).default("EGP"),
  exchangeRate: decimal("exchangeRate", { precision: 15, scale: 6 }).default("1"),
  foreignTotal: decimal("foreignTotal", { precision: 15, scale: 2 }),
  /** رقم المرجع — زي ميجا في تقرير الشراء (رقم فاتورة المورد) */
  referenceNumber: varchar("referenceNumber", { length: 100 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseInvoiceItems = mysqlTable("purchase_invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  invoiceId: int("invoiceId").notNull(),
  itemId: int("itemId").notNull(),
  /** مخزن مختلف لهذا البند تحديدًا — لو فاضي يُستخدم مخزن رأس الفاتورة */
  warehouseId: int("warehouseId"),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 5, scale: 2 }).default("0"),
  taxId: int("taxId"),
  tax2: decimal("tax2", { precision: 5, scale: 2 }).default("0"),
  tax2Id: int("tax2Id"),
  tax3: decimal("tax3", { precision: 5, scale: 2 }).default("0"),
  tax3Id: int("tax3Id"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  batchId: int("batchId"),
});

export const purchaseInvoiceItemBatches = mysqlTable("purchase_invoice_item_batches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  invoiceItemId: int("invoiceItemId").notNull(),
  batchId: int("batchId"),
  batchNumber: varchar("batchNumber", { length: 100 }),
  expiryDate: date("expiryDate"),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
});

export const purchaseInvoiceTaxes = mysqlTable("purchase_invoice_taxes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  invoiceId: int("invoiceId").notNull(),
  taxId: int("taxId"),
  name: varchar("name", { length: 255 }),
  rate: decimal("rate", { precision: 5, scale: 2 }).default("0"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  /** لقطة من taxes.glAccountId وقت الإدخال — يترحّل عليه القيد حتى لو اتغيّر الحساب لاحقًا */
  glAccountId: int("glAccountId"),
});

export const purchaseInvoiceExpenses = mysqlTable("purchase_invoice_expenses", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  invoiceId: int("invoiceId").notNull(),
  currencyCode: varchar("currencyCode", { length: 10 }).default("EGP"),
  exchangeRate: decimal("exchangeRate", { precision: 15, scale: 6 }).default("1"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  creditAccountId: int("creditAccountId").notNull(),
  notes: text("notes"),
});

// ===================== PURCHASE RETURNS =====================
export const purchaseReturns = mysqlTable("purchase_returns", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  supplierId: int("supplierId").notNull(),
  invoiceId: int("invoiceId"),
  date: date("date").notNull(),
  warehouseId: int("warehouseId"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "cancelled"]).default("draft"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const purchaseReturnItems = mysqlTable("purchase_return_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  returnId: int("returnId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  batchId: int("batchId"),
});

// ===================== SALES ORDERS =====================
export const salesOrders = mysqlTable("sales_orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  customerId: int("customerId").notNull(),
  date: date("date").notNull(),
  expectedDate: date("expectedDate"),
  warehouseId: int("warehouseId"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "delivered", "cancelled"]).default("draft"),
  notes: text("notes"),
  convertedInvoiceId: int("convertedInvoiceId"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const salesOrderItems = mysqlTable("sales_order_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  orderId: int("orderId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 5, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
});

// ===================== SALES INVOICES =====================
export const salesInvoices = mysqlTable("sales_invoices", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  customerId: int("customerId").notNull(),
  orderId: int("orderId"),
  date: date("date").notNull(),
  dueDate: date("dueDate"),
  warehouseId: int("warehouseId"),
  paymentType: mysqlEnum("paymentType", ["cash", "credit"]).default("cash"),
  /** جزء السداد النقدي وقت الإنشاء */
  cashAmount: decimal("cashAmount", { precision: 15, scale: 2 }).default("0"),
  /** جزء السداد عن طريق البنك المحدد في bankAccountId */
  bankAmount: decimal("bankAmount", { precision: 15, scale: 2 }).default("0"),
  bankAccountId: int("bankAccountId"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  paid: decimal("paid", { precision: 15, scale: 2 }).default("0"),
  remaining: decimal("remaining", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "paid", "partial", "cancelled"]).default("draft"),
  salesRepId: int("salesRepId"),
  branchId: int("branchId"),
  costCenterId: int("costCenterId"),
  currencyCode: varchar("currencyCode", { length: 10 }).default("EGP"),
  exchangeRate: decimal("exchangeRate", { precision: 15, scale: 6 }).default("1"),
  foreignTotal: decimal("foreignTotal", { precision: 15, scale: 2 }),
  /** اضافات — زي عمود ميجا في تقرير البيع */
  additions: decimal("additions", { precision: 15, scale: 2 }).default("0"),
  etaUuid: varchar("etaUuid", { length: 64 }),
  etaStatus: varchar("etaStatus", { length: 32 }),
  etaSubmittedAt: timestamp("etaSubmittedAt"),
  etaSubmissionId: varchar("etaSubmissionId", { length: 128 }),
  etaLastError: text("etaLastError"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const salesInvoiceItems = mysqlTable("sales_invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  invoiceId: int("invoiceId").notNull(),
  itemId: int("itemId").notNull(),
  /** مخزن مختلف لهذا البند تحديدًا — لو فاضي يُستخدم مخزن رأس الفاتورة */
  warehouseId: int("warehouseId"),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 5, scale: 2 }).default("0"),
  taxId: int("taxId"),
  tax2: decimal("tax2", { precision: 5, scale: 2 }).default("0"),
  tax2Id: int("tax2Id"),
  tax3: decimal("tax3", { precision: 5, scale: 2 }).default("0"),
  tax3Id: int("tax3Id"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  batchId: int("batchId"),
});

export const salesInvoiceItemBatches = mysqlTable("sales_invoice_item_batches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  invoiceItemId: int("invoiceItemId").notNull(),
  batchId: int("batchId"),
  batchNumber: varchar("batchNumber", { length: 100 }),
  expiryDate: date("expiryDate"),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
});

export const salesInvoiceTaxes = mysqlTable("sales_invoice_taxes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  invoiceId: int("invoiceId").notNull(),
  taxId: int("taxId"),
  name: varchar("name", { length: 255 }),
  rate: decimal("rate", { precision: 5, scale: 2 }).default("0"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  /** لقطة من taxes.glAccountId وقت الإدخال — يترحّل عليه القيد حتى لو اتغيّر الحساب لاحقًا */
  glAccountId: int("glAccountId"),
});

export const salesInvoiceExpenses = mysqlTable("sales_invoice_expenses", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  invoiceId: int("invoiceId").notNull(),
  currencyCode: varchar("currencyCode", { length: 10 }).default("EGP"),
  exchangeRate: decimal("exchangeRate", { precision: 15, scale: 6 }).default("1"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  creditAccountId: int("creditAccountId").notNull(),
  notes: text("notes"),
});

// ===================== SALES RETURNS =====================
export const salesReturns = mysqlTable("sales_returns", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  customerId: int("customerId").notNull(),
  invoiceId: int("invoiceId"),
  date: date("date").notNull(),
  warehouseId: int("warehouseId"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "cancelled"]).default("draft"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const salesReturnItems = mysqlTable("sales_return_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  returnId: int("returnId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  batchId: int("batchId"),
});

// ===================== CASH TRANSACTIONS =====================
export const cashTransactions = mysqlTable("cash_transactions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  type: mysqlEnum("type", ["receive", "pay", "receive_customer", "pay_supplier", "pay_customer"]).notNull(),
  date: date("date").notNull(),
  customerId: int("customerId"),
  supplierId: int("supplierId"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  accountId: int("accountId"),
  description: text("description"),
  reference: varchar("reference", { length: 100 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== BANK ACCOUNTS =====================
export const bankAccounts = mysqlTable("bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  bankName: varchar("bankName", { length: 255 }),
  accountNumber: varchar("accountNumber", { length: 100 }),
  /** ربط بحساب الدليل المحاسبي تحت «البنوك» */
  glAccountId: int("glAccountId"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== BANK TRANSACTIONS =====================
export const bankTransactions = mysqlTable("bank_transactions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  type: mysqlEnum("type", ["deposit", "withdraw", "deposit_customer", "withdraw_supplier", "withdraw_customer"]).notNull(),
  bankAccountId: int("bankAccountId").notNull(),
  date: date("date").notNull(),
  customerId: int("customerId"),
  supplierId: int("supplierId"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  reference: varchar("reference", { length: 100 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== CHECKS =====================
export const checks = mysqlTable("checks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  checkNumber: varchar("checkNumber", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["incoming", "outgoing"]).notNull(),
  bankAccountId: int("bankAccountId"),
  customerId: int("customerId"),
  supplierId: int("supplierId"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  dueDate: date("dueDate").notNull(),
  date: date("date").notNull(),
  status: mysqlEnum("status", ["pending", "deposited", "cleared", "bounced", "cancelled"]).default("pending"),
  description: text("description"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** الحالة قبل التحصيل (pending/deposited) — تُستخدم لإرجاع الشيك لحالته الصحيحة عند فك اعتماد التحصيل */
  statusBeforeClear: mysqlEnum("statusBeforeClear", ["pending", "deposited"]),
});

/** سجل توزيع تحصيل الشيك على الفواتير (FIFO) — بدونه لا يمكن معرفة أي فاتورة تأثرت بتحصيل شيك معيّن لفك اعتماده لاحقاً */
export const checkPaymentAllocations = mysqlTable("check_payment_allocations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  checkId: int("checkId").notNull(),
  documentType: mysqlEnum("documentType", ["sales_invoice", "purchase_invoice"]).notNull(),
  documentId: int("documentId").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** دورة حيازة وتوجيه الشيكات الواردة — غير محاسبية بذاتها؛ الإيداع يطلق القيد */
export const checkRoutings = mysqlTable("check_routings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  checkId: int("checkId").notNull(),
  status: mysqlEnum("status", ["unrouted", "in_custody", "scheduled", "deposited", "cleared", "rejected"]).default("unrouted").notNull(),
  custodianUserId: int("custodianUserId"),
  targetBankAccountId: int("targetBankAccountId"),
  plannedDepositDate: date("plannedDepositDate"),
  depositedAt: date("depositedAt"),
  depositedBy: int("depositedBy"),
  closedAt: timestamp("closedAt"),
  closedBy: int("closedBy"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const checkRoutingEvents = mysqlTable("check_routing_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  routingId: int("routingId").notNull(),
  checkId: int("checkId").notNull(),
  eventType: mysqlEnum("eventType", [
    "created",
    "assign_custody",
    "transfer_custody",
    "route",
    "update_route",
    "deposit",
    "clear",
    "reject",
    "note",
  ]).notNull(),
  fromUserId: int("fromUserId"),
  toUserId: int("toUserId"),
  bankAccountId: int("bankAccountId"),
  plannedDepositDate: date("plannedDepositDate"),
  notes: text("notes"),
  performedBy: int("performedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== JOURNAL ENTRIES =====================
export const journalEntries = mysqlTable("journal_entries", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  date: date("date").notNull(),
  description: text("description"),
  reference: varchar("reference", { length: 100 }),
  status: mysqlEnum("status", ["draft", "posted", "cancelled"]).default("draft"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const journalEntryLines = mysqlTable("journal_entry_lines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  entryId: int("entryId").notNull(),
  accountId: int("accountId").notNull(),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  description: text("description"),
  costCenterId: int("costCenterId"),
});

// ===================== DEPARTMENTS =====================
export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: int("parentId"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== JOB TITLES =====================
export const jobTitles = mysqlTable("job_titles", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== EMPLOYEES =====================
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  nationalId: varchar("nationalId", { length: 50 }),
  departmentId: int("departmentId"),
  jobTitleId: int("jobTitleId"),
  hireDate: date("hireDate"),
  birthDate: date("birthDate"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  basicSalary: decimal("basicSalary", { precision: 15, scale: 2 }).default("0"),
  bankAccount: varchar("bankAccount", { length: 100 }),
  status: mysqlEnum("status", ["active", "inactive", "terminated"]).default("active"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== ATTENDANCE =====================
export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  employeeId: int("employeeId").notNull(),
  date: date("date").notNull(),
  checkIn: varchar("checkIn", { length: 10 }),
  checkOut: varchar("checkOut", { length: 10 }),
  overtime: int("overtime").default(0),
  status: mysqlEnum("status", ["present", "absent", "late", "half_day", "leave", "holiday"]).default("present"),
  source: varchar("source", { length: 30 }).default("manual"),
  machineId: int("machineId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== SALARY ADVANCES =====================
export const salaryAdvances = mysqlTable("salary_advances", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  employeeId: int("employeeId").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date").notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "paid", "rejected"]).default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== PAYROLL =====================
export const payroll = mysqlTable("payroll", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  employeeId: int("employeeId").notNull(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  basicSalary: decimal("basicSalary", { precision: 15, scale: 2 }).default("0"),
  allowances: decimal("allowances", { precision: 15, scale: 2 }).default("0"),
  deductions: decimal("deductions", { precision: 15, scale: 2 }).default("0"),
  advances: decimal("advances", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  netSalary: decimal("netSalary", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "approved", "paid"]).default("draft"),
  paidDate: date("paidDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== FIXED ASSETS =====================
export const fixedAssets = mysqlTable("fixed_assets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  purchaseDate: date("purchaseDate"),
  purchasePrice: decimal("purchasePrice", { precision: 15, scale: 2 }).default("0"),
  depreciationRate: decimal("depreciationRate", { precision: 5, scale: 2 }).default("0"),
  currentValue: decimal("currentValue", { precision: 15, scale: 2 }).default("0"),
  location: varchar("location", { length: 255 }),
  status: mysqlEnum("status", ["active", "disposed", "under_maintenance"]).default("active"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== COST CENTERS =====================
export const costCenters = mysqlTable("cost_centers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: int("parentId"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== LOANS =====================
export const loans = mysqlTable("loans", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  type: mysqlEnum("type", ["given", "received"]).notNull(),
  partyName: varchar("partyName", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interestRate", { precision: 5, scale: 2 }).default("0"),
  startDate: date("startDate").notNull(),
  endDate: date("endDate"),
  status: mysqlEnum("status", ["active", "paid", "cancelled"]).default("active"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== INSTALLMENTS =====================
export const installments = mysqlTable("installments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  loanId: int("loanId").notNull(),
  dueDate: date("dueDate").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paidAmount: decimal("paidAmount", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["pending", "paid", "overdue"]).default("pending"),
  paidDate: date("paidDate"),
  notes: text("notes"),
});

// ===================== NOTIFICATIONS =====================
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  type: mysqlEnum("type", ["info", "warning", "error", "success"]).default("info"),
  isRead: boolean("isRead").default(false),
  userId: int("userId"),
  referenceKey: varchar("referenceKey", { length: 120 }),
  href: varchar("href", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== INVENTORY ADJUSTMENTS =====================
export const inventoryAdjustments = mysqlTable("inventory_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  warehouseId: int("warehouseId").notNull(),
  date: date("date").notNull(),
  reason: text("reason"),
  /** الحساب المقابل / مركز التكلفة / العميل / رقم المرجع — مطابقة ميجا InventoryCorrection */
  oppositeAccountId: int("oppositeAccountId"),
  costCenterId: int("costCenterId"),
  customerId: int("customerId"),
  referenceNumber: varchar("referenceNumber", { length: 100 }),
  status: mysqlEnum("status", ["draft", "confirmed", "cancelled"]).default("draft"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventoryAdjustmentItems = mysqlTable("inventory_adjustment_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  adjustmentId: int("adjustmentId").notNull(),
  itemId: int("itemId").notNull(),
  currentQty: decimal("currentQty", { precision: 15, scale: 3 }).default("0"),
  newQty: decimal("newQty", { precision: 15, scale: 3 }).notNull(),
  difference: decimal("difference", { precision: 15, scale: 3 }).default("0"),
  batchId: int("batchId"),
});

// ===================== STOCK TRANSFERS =====================
export const stockTransfers = mysqlTable("stock_transfers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  fromWarehouseId: int("fromWarehouseId").notNull(),
  toWarehouseId: int("toWarehouseId").notNull(),
  date: date("date").notNull(),
  /** تحويل مباشر | تحويل بمرحلتين — مطابقة ميجا InventoryTransfer */
  transferType: varchar("transferType", { length: 20 }).default("direct"),
  referenceNumber: varchar("referenceNumber", { length: 100 }),
  /** حساب الأرباح / الخسائر — مدين مصروفات التحويل إن وُجد، وإلا يُرسمل على المخزون */
  plAccountId: int("plAccountId"),
  /** draft=معلق · in_transit=شُحن بمرحلتين · confirmed=معتمد · cancelled=ملغي */
  status: mysqlEnum("status", ["draft", "in_transit", "confirmed", "cancelled"]).default("draft"),
  receivedAt: date("receivedAt"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const stockTransferItems = mysqlTable("stock_transfer_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  transferId: int("transferId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  batchId: int("batchId"),
  /** نسبة المصروفات على السطر — مطابقة ميجا */
  expensePercent: decimal("expensePercent", { precision: 8, scale: 3 }).default("0"),
});

export const stockTransferExpenses = mysqlTable("stock_transfer_expenses", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  transferId: int("transferId").notNull(),
  currencyCode: varchar("currencyCode", { length: 10 }).default("EGP"),
  exchangeRate: decimal("exchangeRate", { precision: 15, scale: 6 }).default("1"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  creditAccountId: int("creditAccountId").notNull(),
  notes: text("notes"),
});

// ===================== SALES REPS =====================
export const salesReps = mysqlTable("sales_reps", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  commissionRate: decimal("commissionRate", { precision: 10, scale: 4 }).default("0"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== APP USERS (SaaS Auth) =====================
export const appUsers = mysqlTable("app_users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  role: varchar("role", { length: 64 }).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  companyName: varchar("companyName", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  ownerUserId: int("ownerUserId"),
  jobTitle: varchar("jobTitle", { length: 255 }),
  tenantId: int("tenantId"),
  scopeBranchIds: json("scopeBranchIds").$type<number[] | null>(),
  scopeWarehouseIds: json("scopeWarehouseIds").$type<number[] | null>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
});

// ===================== SUBSCRIPTION PLANS =====================
export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("nameAr", { length: 100 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 10 }).default("EGP").notNull(),
  durationDays: int("durationDays").notNull(),
  maxUsers: int("maxUsers").default(1),
  maxInvoices: int("maxInvoices").default(100),
  features: text("features"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== SUBSCRIPTIONS =====================
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId"),
  userId: int("userId").notNull(),
  planId: int("planId").notNull(),
  status: mysqlEnum("status", ["trial", "active", "expired", "cancelled", "suspended"]).default("trial").notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== DISCOUNT COUPONS =====================
export const discountCoupons = mysqlTable("discount_coupons", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  discountType: mysqlEnum("discountType", ["percentage", "fixed"]).default("percentage").notNull(),
  discountValue: decimal("discountValue", { precision: 10, scale: 2 }).notNull(),
  maxUses: int("maxUses"),
  usedCount: int("usedCount").default(0).notNull(),
  expiresAt: date("expiresAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== COMPANY PROFILE =====================
export const companyProfile = mysqlTable("company_profile", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull().default("شركتي"),
  nameEn: varchar("nameEn", { length: 255 }),
  logo: text("logo"),
  logoKey: text("logoKey"),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }).default("مصر"),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 255 }),
  taxNumber: varchar("taxNumber", { length: 100 }),
  commercialRegister: varchar("commercialRegister", { length: 100 }),
  currency: varchar("currency", { length: 10 }).default("EGP"),
  invoiceFooter: text("invoiceFooter"),
  defaultPrintTemplate: varchar("defaultPrintTemplate", { length: 32 }).default("standard-a4"),
  etaEnabled: boolean("etaEnabled").default(false),
  etaMode: varchar("etaMode", { length: 16 }).default("preprod"),
  etaClientId: varchar("etaClientId", { length: 255 }),
  etaClientSecretEnc: text("etaClientSecretEnc"),
  etaActivityCode: varchar("etaActivityCode", { length: 20 }),
  etaBranchCode: varchar("etaBranchCode", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== SUPPORT TICKETS =====================
export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }),
  userEmail: varchar("userEmail", { length: 255 }),
  subject: varchar("subject", { length: 500 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  adminReply: text("adminReply"),
  repliedAt: timestamp("repliedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== PAYMOB SETTINGS =====================
export const paymobSettings = mysqlTable("paymob_settings", {
  id: int("id").autoincrement().primaryKey(),
  mode: mysqlEnum("mode", ["test", "live"]).default("test").notNull(),
  publicConfig: text("publicConfig"),
  encryptedSecret: text("encryptedSecret"),
  isEnabled: boolean("isEnabled").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const paymobPaymentMethods = mysqlTable("paymob_payment_methods", {
  id: int("id").autoincrement().primaryKey(),
  methodType: mysqlEnum("methodType", ["card", "wallet"]).notNull(),
  integrationId: int("integrationId").default(0).notNull(),
  isEnabled: boolean("isEnabled").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== SUBSCRIPTION PAYMENTS =====================
export const subscriptionPayments = mysqlTable("subscription_payments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  planId: int("planId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("EGP").notNull(),
  status: mysqlEnum("status", ["pending", "paid", "failed"]).default("pending").notNull(),
  providerReference: varchar("providerReference", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== USER NOTIFICATIONS =====================
export const userNotifications = mysqlTable("user_notifications", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["info", "warning", "success", "error"]).default("info").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== MEGA CASH PARITY TABLES =====================
export const exchangeRates = mysqlTable("exchange_rates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  code: varchar("code", { length: 10 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  rate: decimal("rate", { precision: 15, scale: 6 }).notNull(),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const generalAttributes = mysqlTable("general_attributes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  attrKey: varchar("attrKey", { length: 100 }).notNull(),
  attrValue: text("attrValue"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** وحدات القياس المعتمدة للشركة — تُختار عند إدخال الأصناف (مرجع Mega: خصائص عامة) */
export const measureUnits = mysqlTable("measure_units", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 50 }).notNull(),
  code: varchar("code", { length: 20 }),
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  unique("measure_units_tenant_name").on(t.tenantId, t.name),
]);

export const fiscalYears = mysqlTable("fiscal_years", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 100 }).notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const userActivities = mysqlTable("user_activities", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  action: varchar("action", { length: 255 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const cities = mysqlTable("cities", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  governorate: varchar("governorate", { length: 100 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const companyAddresses = mysqlTable("company_addresses", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  label: varchar("label", { length: 255 }).notNull(),
  address: text("address"),
  cityId: int("cityId"),
  phone: varchar("phone", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const hrShifts = mysqlTable("hr_shifts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  startTime: varchar("startTime", { length: 10 }).notNull(),
  endTime: varchar("endTime", { length: 10 }).notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const hrVacations = mysqlTable("hr_vacations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  daysPerYear: int("daysPerYear").default(0),
  isPaid: boolean("isPaid").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const employeeShifts = mysqlTable("employee_shifts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  employeeId: int("employeeId").notNull(),
  shiftId: int("shiftId").notNull(),
  effectiveFrom: date("effectiveFrom"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const hrIncentives = mysqlTable("hr_incentives", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  employeeId: int("employeeId").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const underRequestEmployees = mysqlTable("under_request_employees", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  dailyRate: decimal("dailyRate", { precision: 15, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const fingerprintMachines = mysqlTable("fingerprint_machines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 50 }),
  port: int("port"),
  commKey: int("commKey").default(0),
  isActive: boolean("isActive").default(true),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const machinePunches = mysqlTable("machine_punches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  machineId: int("machineId"),
  enrollCode: varchar("enrollCode", { length: 50 }).notNull(),
  employeeId: int("employeeId"),
  punchedAt: timestamp("punchedAt").notNull(),
  processed: boolean("processed").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const mobileFpLocations = mysqlTable("mobile_fp_locations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  radiusMeters: int("radiusMeters").default(100),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const hrSystems = mysqlTable("hr_systems", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const hrDepEmpSystems = mysqlTable("hr_dep_emp_systems", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  systemId: int("systemId").notNull(),
  departmentId: int("departmentId"),
  employeeId: int("employeeId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const itemBatches = mysqlTable("item_batches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  itemId: int("itemId").notNull(),
  batchNumber: varchar("batchNumber", { length: 100 }).notNull(),
  productionDate: date("productionDate"),
  expiryDate: date("expiryDate"),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const itemOffers = mysqlTable("item_offers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  itemId: int("itemId"),
  categoryId: int("categoryId"),
  /** نوع السعر · فرع · منطقة · فئة عميل · عميل — فلاتر ميجا العروض */
  priceType: varchar("priceType", { length: 50 }),
  branchId: int("branchId"),
  areaId: int("areaId"),
  contactCategoryId: int("contactCategoryId"),
  customerId: int("customerId"),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  startDate: date("startDate"),
  endDate: date("endDate"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const itemPriceChanges = mysqlTable("item_price_changes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  itemId: int("itemId").notNull(),
  oldPrice: decimal("oldPrice", { precision: 15, scale: 2 }),
  newPrice: decimal("newPrice", { precision: 15, scale: 2 }).notNull(),
  priceType: mysqlEnum("priceType", ["sale", "purchase"]).default("sale").notNull(),
  date: date("date").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const beginningInventory = mysqlTable("beginning_inventory", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  warehouseId: int("warehouseId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 2 }).default("0"),
  date: date("date").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const assetCategories = mysqlTable("asset_categories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  depreciationRate: decimal("depreciationRate", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const assetCapitalMaintenance = mysqlTable("asset_capital_maintenance", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  assetId: int("assetId").notNull(),
  date: date("date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const assetSales = mysqlTable("asset_sales", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  assetId: int("assetId").notNull(),
  date: date("date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  buyer: varchar("buyer", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const salesAreas = mysqlTable("sales_areas", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const productionOrders = mysqlTable("production_orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 50 }).notNull(),
  productId: int("productId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  branchId: int("branchId"),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  date: date("date").notNull(),
  status: mysqlEnum("status", ["draft", "in_progress", "completed", "cancelled"]).default("draft").notNull(),
  /** رقم المرجع — زي Mega Cash */
  referenceNumber: varchar("referenceNumber", { length: 100 }),
  /** رقم التشغيلة — زي Mega Cash */
  batchNumber: varchar("batchNumber", { length: 100 }),
  notes: text("notes"),
  wipJournalId: int("wipJournalId"),
  completionJournalId: int("completionJournalId"),
  wipCostAmount: decimal("wipCostAmount", { precision: 15, scale: 2 }).default("0"),
  createdBy: int("createdBy"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const productionOrderMaterials = mysqlTable("production_order_materials", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  orderId: int("orderId").notNull(),
  itemId: int("itemId").notNull(),
  /** كمية مطلقة للأمر (زي Mega) — ليست لكل وحدة منتج */
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  scrapPercent: decimal("scrapPercent", { precision: 5, scale: 2 }).default("0"),
  warehouseId: int("warehouseId"),
  notes: text("notes"),
});

export const itemBomLines = mysqlTable("item_bom_lines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  productId: int("productId").notNull(),
  materialItemId: int("materialItemId").notNull(),
  quantityPerUnit: decimal("quantityPerUnit", { precision: 15, scale: 6 }).notNull(),
  scrapPercent: decimal("scrapPercent", { precision: 5, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const employeeVacationRecords = mysqlTable("employee_vacation_records", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  employeeId: int("employeeId").notNull(),
  vacationTypeId: int("vacationTypeId"),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  days: int("days").default(0),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("approved").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== DOCUMENT APPROVALS =====================
export const documentApprovals = mysqlTable("document_approvals", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  documentType: mysqlEnum("documentType", ["sales_invoice", "purchase_invoice", "journal_entry"]).notNull(),
  documentId: int("documentId").notNull(),
  documentNumber: varchar("documentNumber", { length: 50 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  requestedBy: int("requestedBy"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const depreciationRuns = mysqlTable("depreciation_runs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  period: varchar("period", { length: 7 }).notNull(),
  journalReference: varchar("journalReference", { length: 100 }),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).default("0"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const depreciationRunLines = mysqlTable("depreciation_run_lines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  runId: int("runId").notNull(),
  assetId: int("assetId").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== ROLE PERMISSIONS (RBAC) =====================
/** أدوار المستأجر — مدمجة + مخصصة (مثل مجموعات المستخدمين في Mega) */
export const tenantRoles = mysqlTable("tenant_roles", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  roleKey: varchar("roleKey", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isBuiltin: boolean("isBuiltin").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tenantRolePermissions = mysqlTable("tenant_role_permissions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  role: varchar("role", { length: 64 }).notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  canView: boolean("canView").default(false).notNull(),
  canCreate: boolean("canCreate").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const userPermissionOverrides = mysqlTable("user_permission_overrides", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  canView: boolean("canView"),
  canCreate: boolean("canCreate"),
  canEdit: boolean("canEdit"),
  canDelete: boolean("canDelete"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const itemSerials = mysqlTable("item_serials", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  itemId: int("itemId").notNull(),
  serialNumber: varchar("serialNumber", { length: 100 }).notNull(),
  warehouseId: int("warehouseId"),
  status: mysqlEnum("status", ["in_stock", "sold", "returned"]).default("in_stock").notNull(),
  purchaseInvoiceId: int("purchaseInvoiceId"),
  salesInvoiceId: int("salesInvoiceId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== IMPORT COSTING (isolated calculator — no GL/stock/invoice FKs) =====================
export const importCostShipments = mysqlTable("import_cost_shipments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  number: varchar("number", { length: 40 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  shipmentDate: date("shipmentDate"),
  notes: text("notes"),
  preset: varchar("preset", { length: 32 }).default("no_batteries"),
  currencyCode: varchar("currencyCode", { length: 10 }).default("USD"),
  costFxRate: decimal("costFxRate", { precision: 18, scale: 6 }).default("0"),
  customsFxRate: decimal("customsFxRate", { precision: 18, scale: 6 }).default("0"),
  customsAssessableUsd: decimal("customsAssessableUsd", { precision: 18, scale: 6 }).default("0"),
  customsRate: decimal("customsRate", { precision: 18, scale: 6 }).default("0"),
  vatRate: decimal("vatRate", { precision: 18, scale: 6 }).default("0"),
  withholdingRate: decimal("withholdingRate", { precision: 18, scale: 6 }).default("0"),
  shippingUsd: decimal("shippingUsd", { precision: 18, scale: 6 }).default("0"),
  agentFeeUsd: decimal("agentFeeUsd", { precision: 18, scale: 6 }).default("0"),
  ocaUsd: decimal("ocaUsd", { precision: 18, scale: 6 }).default("0"),
  yardFeesEgp: decimal("yardFeesEgp", { precision: 18, scale: 6 }).default("0"),
  brokerFeesEgp: decimal("brokerFeesEgp", { precision: 18, scale: 6 }).default("0"),
  batteriesEgp: decimal("batteriesEgp", { precision: 18, scale: 6 }).default("0"),
  freightLocalEgp: decimal("freightLocalEgp", { precision: 18, scale: 6 }).default("0"),
  shippingQuote: text("shippingQuote"),
  ocaAlloc: varchar("ocaAlloc", { length: 20 }).default("unit_cost"),
  shippingAlloc: varchar("shippingAlloc", { length: 20 }).default("unit_cost"),
  agentAlloc: varchar("agentAlloc", { length: 20 }).default("unit_cost"),
  localAlloc: varchar("localAlloc", { length: 20 }).default("weight"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const importCostLines = mysqlTable("import_cost_lines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  shipmentId: int("shipmentId").notNull(),
  lineNo: int("lineNo").notNull().default(1),
  category: varchar("category", { length: 120 }),
  barcode: varchar("barcode", { length: 80 }),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 18, scale: 4 }).default("0"),
  unitCostUsd: decimal("unitCostUsd", { precision: 18, scale: 6 }).default("0"),
  unitWeight: decimal("unitWeight", { precision: 18, scale: 6 }).default("0"),
});

export const tenantScreenPermissions = mysqlTable("tenant_screen_permissions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  role: varchar("role", { length: 64 }).notNull(),
  featureKey: varchar("featureKey", { length: 128 }).notNull(),
  canView: boolean("canView").default(true).notNull(),
  canCreate: boolean("canCreate").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * صلاحيات تفصيلية زي ميجا كاش — قسم رئيسي ← عنصر ← مجموعة أفعال محددة له (shared/permission-tree.ts).
 * صف واحد لكل (دور × عنصر) بمصفوفة JSON للأفعال المسموحة، بدل عمود منفصل لكل فعل —
 * لأن مجموعة الأفعال بتختلف من عنصر للتاني (فاتورة شراء ليها 22 فعل، بيانات بسيطة 4 بس).
 * طبقة إضافية فوق tenantRolePermissions الحالية — مرحلة الإدخال والتخزين، الربط بالتنفيذ
 * الفعلي في الـtRPC/الواجهة هيحصل تدريجيًا بعد كده.
 */
export const tenantEntityPermissions = mysqlTable("tenant_entity_permissions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  role: varchar("role", { length: 64 }).notNull(),
  moduleKey: varchar("moduleKey", { length: 64 }).notNull(),
  entityKey: varchar("entityKey", { length: 128 }).notNull(),
  allowedActions: json("allowedActions").$type<string[]>().default([]).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** سياسة مراجعة الشركة — أهداف وهوامش وتحمل فروقات للمراجع الذكي */
export const companyAuditPolicies = mysqlTable("company_audit_policies", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  targetGrossMarginPct: decimal("targetGrossMarginPct", { precision: 8, scale: 2 }).default("25").notNull(),
  targetNetMarginPct: decimal("targetNetMarginPct", { precision: 8, scale: 2 }).default("10").notNull(),
  maxArDays: int("maxArDays").default(90).notNull(),
  maxApDays: int("maxApDays").default(90).notNull(),
  minCashReserveEgp: decimal("minCashReserveEgp", { precision: 15, scale: 2 }).default("0").notNull(),
  debtProvisionAfterDays: int("debtProvisionAfterDays").default(120).notNull(),
  debtProvisionRate: decimal("debtProvisionRate", { precision: 8, scale: 4 }).default("0.05").notNull(),
  defaultDepreciationRate: decimal("defaultDepreciationRate", { precision: 8, scale: 4 }).default("0.1").notNull(),
  bankVarianceToleranceEgp: decimal("bankVarianceToleranceEgp", { precision: 15, scale: 2 }).default("50").notNull(),
  materialityEgp: decimal("materialityEgp", { precision: 15, scale: 2 }).default("1000").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** سجل تشغيلات المراجع — ذاكرة المراجعات السابقة */
export const auditReviewRuns = mysqlTable("audit_review_runs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  criticalCount: int("criticalCount").default(0).notNull(),
  warningCount: int("warningCount").default(0).notNull(),
  infoCount: int("infoCount").default(0).notNull(),
  tbBalanced: boolean("tbBalanced").default(false).notNull(),
  tbDifference: decimal("tbDifference", { precision: 15, scale: 2 }).default("0").notNull(),
  summaryJson: text("summaryJson"),
  findingsJson: text("findingsJson"),
  createdBy: int("createdBy"),
});

/** كشوف حساب بنكية مرفوعة للمطابقة */
export const bankStatementImports = mysqlTable("bank_statement_imports", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  bankAccountId: int("bankAccountId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  periodFrom: date("periodFrom"),
  periodTo: date("periodTo"),
  openingBalance: decimal("openingBalance", { precision: 15, scale: 2 }).default("0"),
  closingBalance: decimal("closingBalance", { precision: 15, scale: 2 }).default("0"),
  lineCount: int("lineCount").default(0).notNull(),
  matchedCount: int("matchedCount").default(0).notNull(),
  unmatchedCount: int("unmatchedCount").default(0).notNull(),
  status: varchar("status", { length: 32 }).default("imported").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const bankStatementLines = mysqlTable("bank_statement_lines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  importId: int("importId").notNull(),
  lineNo: int("lineNo").notNull().default(1),
  txnDate: date("txnDate").notNull(),
  valueDate: date("valueDate"),
  description: text("description"),
  reference: varchar("reference", { length: 120 }),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }),
  matchStatus: varchar("matchStatus", { length: 32 }).default("unmatched").notNull(),
  matchedBankTxnId: int("matchedBankTxnId"),
  matchNote: varchar("matchNote", { length: 255 }),
});

/**
 * كشوف مرفوعة للمراجع (عملاء/موردين/جمارك/عام).
 * عميل/مورد فقط: بيتقارن فعلياً مع دفتر أستاذ الطرف (فواتير + نقدية + بنك + مردودات) —
 * customerId/supplierId + matchedCount/unmatchedCount/reconcileStatus بتتملى وقتها.
 * جمارك/ضريبة/عام: تخزين مرجعي بس، بدون مطابقة آلية (شكل كل مستند مختلف جداً عن التاني).
 */
export const auditStatementUploads = mysqlTable("audit_statement_uploads", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  kind: varchar("kind", { length: 40 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  partyName: varchar("partyName", { length: 255 }),
  customerId: int("customerId"),
  supplierId: int("supplierId"),
  periodFrom: date("periodFrom"),
  periodTo: date("periodTo"),
  closingBalance: decimal("closingBalance", { precision: 15, scale: 2 }),
  lineCount: int("lineCount").default(0).notNull(),
  matchedCount: int("matchedCount").default(0).notNull(),
  unmatchedCount: int("unmatchedCount").default(0).notNull(),
  systemOnlyCount: int("systemOnlyCount").default(0).notNull(),
  reconcileStatus: varchar("reconcileStatus", { length: 32 }),
  rawText: text("rawText"),
  summaryJson: text("summaryJson"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** أسطر كشف العميل/المورد المرفوع + حالة مطابقتها بدفتر الطرف في البرنامج */
export const auditStatementLines = mysqlTable("audit_statement_lines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  importId: int("importId").notNull(),
  lineNo: int("lineNo").notNull().default(1),
  txnDate: date("txnDate").notNull(),
  description: text("description"),
  reference: varchar("reference", { length: 120 }),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }),
  matchStatus: varchar("matchStatus", { length: 32 }).default("unmatched").notNull(),
  matchedDocType: varchar("matchedDocType", { length: 40 }),
  matchedDocNumber: varchar("matchedDocNumber", { length: 50 }),
  matchNote: varchar("matchNote", { length: 255 }),
});

/** متابعة إغلاق ملاحظات المراجع */
export const auditFindingClosures = mysqlTable("audit_finding_closures", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  findingKey: varchar("findingKey", { length: 190 }).notNull(),
  findingTitle: varchar("findingTitle", { length: 500 }).notNull(),
  category: varchar("category", { length: 120 }),
  severity: varchar("severity", { length: 20 }),
  status: varchar("status", { length: 32 }).default("open").notNull(),
  resolutionNote: text("resolutionNote"),
  closedAt: timestamp("closedAt"),
  closedBy: int("closedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** مرفقات اختيارية للفواتير/الإيصالات + نتيجة المقارنة مع بيانات النظام */
export const documentAttachments = mysqlTable("document_attachments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  entityType: varchar("entityType", { length: 40 }).notNull(),
  entityId: int("entityId").notNull(),
  kind: varchar("kind", { length: 40 }).notNull().default("invoice_scan"),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull().default("application/octet-stream"),
  contentBase64: mediumtext("contentBase64"),
  storageKey: varchar("storageKey", { length: 500 }),
  storageUrl: varchar("storageUrl", { length: 500 }),
  extractedJson: text("extractedJson"),
  compareStatus: varchar("compareStatus", { length: 32 }).notNull().default("pending"),
  compareNotes: text("compareNotes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** وارد العمليات: واتساب (نص/صور) → مسودات للمراجعة */
export const opsInboxItems = mysqlTable("ops_inbox_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  source: varchar("source", { length: 32 }).notNull().default("whatsapp"),
  channelNote: varchar("channelNote", { length: 255 }),
  workDate: date("workDate"),
  rawText: text("rawText"),
  fileName: varchar("fileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 120 }),
  contentBase64: mediumtext("contentBase64"),
  suggestedType: varchar("suggestedType", { length: 40 }).notNull().default("other"),
  extractedJson: text("extractedJson"),
  draftJson: text("draftJson"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).default("0"),
  confirmedEntityType: varchar("confirmedEntityType", { length: 40 }),
  confirmedEntityId: int("confirmedEntityId"),
  confirmedRef: varchar("confirmedRef", { length: 120 }),
  reviewNote: text("reviewNote"),
  createdBy: int("createdBy"),
  reviewedBy: int("reviewedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** رفع شغل المصنع اليومي (PDF/صور) مع فلترة بالمدة */
export const factoryDailyUploads = mysqlTable("factory_daily_uploads", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  workDate: date("workDate").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull().default("application/octet-stream"),
  contentBase64: mediumtext("contentBase64"),
  notes: text("notes"),
  status: varchar("status", { length: 32 }).notNull().default("uploaded"),
  extractedJson: text("extractedJson"),
  linkedInboxItemId: int("linkedInboxItemId"),
  /** نوع البيان: شراء / مبيعات / خلاطات (مرجع الإنتاج) / عام */
  type: mysqlEnum("type", ["purchase", "sales", "mixing", "general"]).notNull().default("general"),
  /** المورد (شراء) أو العميل (مبيعات) — نص حر، بيان يومي سريع مش مربوط بكشف الحسابات الرسمي */
  partyName: varchar("partyName", { length: 255 }),
  /** بيان الصنف/المنتج — بيان شراء ومبيعات وخلاطات */
  itemDescription: varchar("itemDescription", { length: 255 }),
  quantity: decimal("quantity", { precision: 15, scale: 3 }),
  /** قيمة العملية — شراء ومبيعات فقط */
  amount: decimal("amount", { precision: 15, scale: 2 }),
  /** الخامات المستخدمة — خلاطات فقط */
  materialsUsed: text("materialsUsed"),
  /** المستند الرسمي اللي اتحوّل له البيان (فاتورة شراء/بيع/أمر إنتاج) بعد المراجعة والاعتماد */
  postedEntityType: varchar("postedEntityType", { length: 30 }),
  postedEntityId: int("postedEntityId"),
  postedRef: varchar("postedRef", { length: 100 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Item = typeof items.$inferSelect;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;
export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Account = typeof accounts.$inferSelect;
