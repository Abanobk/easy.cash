import {
  int, mysqlEnum, mysqlTable, text, timestamp, varchar,
  decimal, boolean, date, tinyint
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

// ===================== COMPANY SETTINGS =====================
export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  taxNumber: varchar("taxNumber", { length: 100 }),
  logo: text("logo"),
  currency: varchar("currency", { length: 10 }).default("EGP"),
  fiscalYearStart: date("fiscalYearStart"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== BRANCHES =====================
export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== CUSTOMER/SUPPLIER CATEGORIES =====================
export const contactCategories = mysqlTable("contact_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["customer", "supplier", "both"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== CUSTOMERS =====================
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: int("categoryId"),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  taxNumber: varchar("taxNumber", { length: 100 }),
  creditLimit: decimal("creditLimit", { precision: 15, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== SUPPLIERS =====================
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: int("categoryId"),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  taxNumber: varchar("taxNumber", { length: 100 }),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== WAREHOUSES =====================
export const warehouses = mysqlTable("warehouses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== ITEM CATEGORIES =====================
export const itemCategories = mysqlTable("item_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: int("parentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== ITEMS =====================
export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: int("categoryId"),
  unit: varchar("unit", { length: 50 }).default("قطعة"),
  purchasePrice: decimal("purchasePrice", { precision: 15, scale: 2 }).default("0"),
  salePrice: decimal("salePrice", { precision: 15, scale: 2 }).default("0"),
  minStock: decimal("minStock", { precision: 15, scale: 3 }).default("0"),
  currentStock: decimal("currentStock", { precision: 15, scale: 3 }).default("0"),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("0"),
  description: text("description"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== ITEM WAREHOUSE STOCK =====================
export const itemWarehouseStock = mysqlTable("item_warehouse_stock", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).default("0"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== TAXES =====================
export const taxes = mysqlTable("taxes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== ACCOUNTS (Chart of Accounts) =====================
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
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
  number: varchar("number", { length: 50 }).notNull(),
  supplierId: int("supplierId").notNull(),
  date: date("date").notNull(),
  expectedDate: date("expectedDate"),
  warehouseId: int("warehouseId"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "received", "cancelled"]).default("draft"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseOrderItems = mysqlTable("purchase_order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 5, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
});

// ===================== PURCHASE INVOICES =====================
export const purchaseInvoices = mysqlTable("purchase_invoices", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 50 }).notNull(),
  supplierId: int("supplierId").notNull(),
  orderId: int("orderId"),
  date: date("date").notNull(),
  dueDate: date("dueDate"),
  warehouseId: int("warehouseId"),
  paymentType: mysqlEnum("paymentType", ["cash", "credit"]).default("cash"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  paid: decimal("paid", { precision: 15, scale: 2 }).default("0"),
  remaining: decimal("remaining", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "paid", "partial", "cancelled"]).default("draft"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseInvoiceItems = mysqlTable("purchase_invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 5, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
});

// ===================== PURCHASE RETURNS =====================
export const purchaseReturns = mysqlTable("purchase_returns", {
  id: int("id").autoincrement().primaryKey(),
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
  returnId: int("returnId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
});

// ===================== SALES ORDERS =====================
export const salesOrders = mysqlTable("sales_orders", {
  id: int("id").autoincrement().primaryKey(),
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
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const salesOrderItems = mysqlTable("sales_order_items", {
  id: int("id").autoincrement().primaryKey(),
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
  number: varchar("number", { length: 50 }).notNull(),
  customerId: int("customerId").notNull(),
  orderId: int("orderId"),
  date: date("date").notNull(),
  dueDate: date("dueDate"),
  warehouseId: int("warehouseId"),
  paymentType: mysqlEnum("paymentType", ["cash", "credit"]).default("cash"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  paid: decimal("paid", { precision: 15, scale: 2 }).default("0"),
  remaining: decimal("remaining", { precision: 15, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["draft", "confirmed", "paid", "partial", "cancelled"]).default("draft"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const salesInvoiceItems = mysqlTable("sales_invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 5, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
});

// ===================== SALES RETURNS =====================
export const salesReturns = mysqlTable("sales_returns", {
  id: int("id").autoincrement().primaryKey(),
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
  returnId: int("returnId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
});

// ===================== CASH TRANSACTIONS =====================
export const cashTransactions = mysqlTable("cash_transactions", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 50 }).notNull(),
  type: mysqlEnum("type", ["receive", "pay", "receive_customer", "pay_supplier"]).notNull(),
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
  name: varchar("name", { length: 255 }).notNull(),
  bankName: varchar("bankName", { length: 255 }),
  accountNumber: varchar("accountNumber", { length: 100 }),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== BANK TRANSACTIONS =====================
export const bankTransactions = mysqlTable("bank_transactions", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 50 }).notNull(),
  type: mysqlEnum("type", ["deposit", "withdraw", "deposit_customer", "withdraw_supplier"]).notNull(),
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
});

// ===================== JOURNAL ENTRIES =====================
export const journalEntries = mysqlTable("journal_entries", {
  id: int("id").autoincrement().primaryKey(),
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
  entryId: int("entryId").notNull(),
  accountId: int("accountId").notNull(),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  description: text("description"),
});

// ===================== DEPARTMENTS =====================
export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: int("parentId"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== JOB TITLES =====================
export const jobTitles = mysqlTable("job_titles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== EMPLOYEES =====================
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
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
  employeeId: int("employeeId").notNull(),
  date: date("date").notNull(),
  checkIn: varchar("checkIn", { length: 10 }),
  checkOut: varchar("checkOut", { length: 10 }),
  overtime: int("overtime").default(0),
  status: mysqlEnum("status", ["present", "absent", "late", "half_day", "leave", "holiday"]).default("present"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== SALARY ADVANCES =====================
export const salaryAdvances = mysqlTable("salary_advances", {
  id: int("id").autoincrement().primaryKey(),
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
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: int("parentId"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== LOANS =====================
export const loans = mysqlTable("loans", {
  id: int("id").autoincrement().primaryKey(),
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
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  type: mysqlEnum("type", ["info", "warning", "error", "success"]).default("info"),
  isRead: boolean("isRead").default(false),
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== INVENTORY ADJUSTMENTS =====================
export const inventoryAdjustments = mysqlTable("inventory_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 50 }).notNull(),
  warehouseId: int("warehouseId").notNull(),
  date: date("date").notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["draft", "confirmed", "cancelled"]).default("draft"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventoryAdjustmentItems = mysqlTable("inventory_adjustment_items", {
  id: int("id").autoincrement().primaryKey(),
  adjustmentId: int("adjustmentId").notNull(),
  itemId: int("itemId").notNull(),
  currentQty: decimal("currentQty", { precision: 15, scale: 3 }).default("0"),
  newQty: decimal("newQty", { precision: 15, scale: 3 }).notNull(),
  difference: decimal("difference", { precision: 15, scale: 3 }).default("0"),
});

// ===================== STOCK TRANSFERS =====================
export const stockTransfers = mysqlTable("stock_transfers", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 50 }).notNull(),
  fromWarehouseId: int("fromWarehouseId").notNull(),
  toWarehouseId: int("toWarehouseId").notNull(),
  date: date("date").notNull(),
  status: mysqlEnum("status", ["draft", "confirmed", "cancelled"]).default("draft"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const stockTransferItems = mysqlTable("stock_transfer_items", {
  id: int("id").autoincrement().primaryKey(),
  transferId: int("transferId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
});

// ===================== SALES REPS =====================
export const salesReps = mysqlTable("sales_reps", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  commissionRate: decimal("commissionRate", { precision: 5, scale: 2 }).default("0"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===================== APP USERS (SaaS Auth) =====================
export const appUsers = mysqlTable("app_users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  role: mysqlEnum("role", ["superadmin", "admin", "user", "accountant", "sales_rep", "warehouse_manager"]).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  companyName: varchar("companyName", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===================== SUPPORT TICKETS =====================
export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
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

// ===================== USER NOTIFICATIONS =====================
export const userNotifications = mysqlTable("user_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["info", "warning", "success", "error"]).default("info").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
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
