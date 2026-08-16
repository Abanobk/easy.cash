/**
 * استعادة كاملة لحمولة Easy Cash JSON داخل مستأجر (فواتير + قيود + حركات).
 * لا يعتمد على الاستيراد الجزئي القديم في import-service.
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import {
  accounts,
  customers,
  suppliers,
  items,
  employees,
  warehouses,
  itemCategories,
  departments,
  salesInvoices,
  salesInvoiceItems,
  purchaseInvoices,
  purchaseInvoiceItems,
  cashTransactions,
  bankAccounts,
  bankTransactions,
  checks,
  journalEntries,
  journalEntryLines,
  companySettings,
} from "../drizzle/schema";
import { withTenantId } from "./tenant-scope";
import { compactRow } from "./db-utils";
import { mapRowFields } from "./mega-mapping";

export type FullRestorePayload = {
  version?: string;
  data: Record<string, Record<string, unknown>[] | undefined>;
};

export type FullRestoreReport = {
  imported: Record<string, number>;
  idMaps: Record<string, Record<string, number>>;
  errors: { entity: string; row: number; message: string }[];
};

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function money(v: unknown, fallback = "0"): string {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : fallback;
}

function dateStr(v: unknown): string {
  if (!v) return new Date().toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10);
}

async function insertReturningId(
  db: MySql2Database<any>,
  table: any,
  values: Record<string, unknown>,
): Promise<number> {
  const [res] = await db.insert(table).values(values as any);
  return Number((res as { insertId?: number }).insertId ?? 0);
}

async function upsertByCode(
  db: MySql2Database<any>,
  table: any,
  tenantId: number,
  codeField: string,
  code: string,
  values: Record<string, unknown>,
): Promise<number> {
  const rows = await db.select().from(table).where(eq(table.tenantId, tenantId)).limit(50000);
  const hit = (rows as any[]).find((r) => String(r[codeField] ?? "") === code);
  if (hit) {
    await db.update(table).set(values as any).where(eq(table.id, hit.id));
    return hit.id as number;
  }
  return insertReturningId(db, table, withTenantId(tenantId, values));
}

export async function fullRestoreToTenant(
  db: MySql2Database<any>,
  tenantId: number,
  payload: FullRestorePayload,
): Promise<FullRestoreReport> {
  const data = payload.data || {};
  const report: FullRestoreReport = { imported: {}, idMaps: {}, errors: [] };
  const map = (entity: string) => {
    if (!report.idMaps[entity]) report.idMaps[entity] = {};
    return report.idMaps[entity];
  };
  const bump = (entity: string) => {
    report.imported[entity] = (report.imported[entity] || 0) + 1;
  };

  // --- Masters ---
  for (const [entity, table, codeField] of [
    ["departments", departments, "name"],
    ["itemCategories", itemCategories, "name"],
    ["warehouses", warehouses, "name"],
  ] as const) {
    const rows = data[entity] || [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapRowFields(rows[i]);
        const key = str(r[codeField]) || str(r.name) || `row-${i}`;
        const id = await upsertByCode(db, table, tenantId, codeField, key, compactRow({
          name: str(r.name) || key,
          ...(entity === "warehouses" ? { address: str(r.address) } : {}),
          isActive: true,
        }));
        const oldId = num(rows[i].id);
        if (oldId != null) map(entity)[String(oldId)] = id;
        map(entity)[`code:${key}`] = id;
        bump(entity);
      } catch (e: any) {
        report.errors.push({ entity, row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  // Accounts — parent by code after first pass
  {
    const rows = (data.accounts || []).map(mapRowFields);
    const byOld: Record<string, number> = map("accounts");
    // first insert without parent
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = rows[i];
        const code = str(r.code);
        if (!code) {
          report.errors.push({ entity: "accounts", row: i + 1, message: "كود الحساب مطلوب" });
          continue;
        }
        const typeRaw = String(r.type || "asset").toLowerCase();
        const type = ["asset", "liability", "equity", "revenue", "expense"].includes(typeRaw)
          ? typeRaw
          : "asset";
        const id = await upsertByCode(db, accounts, tenantId, "code", code, compactRow({
          code,
          name: str(r.name) || code,
          type,
          isParent: Boolean(r.isParent === true || r.isParent === 1 || r.isParent === "1"),
          balance: money(r.balance),
          notes: str(r.notes),
          isActive: true,
        }));
        const oldId = num((data.accounts || [])[i]?.id);
        if (oldId != null) byOld[String(oldId)] = id;
        byOld[`code:${code}`] = id;
        bump("accounts");
      } catch (e: any) {
        report.errors.push({ entity: "accounts", row: i + 1, message: e?.message || String(e) });
      }
    }
    // link parents
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const code = str(r.code);
      if (!code) continue;
      const selfId = byOld[`code:${code}`];
      if (!selfId) continue;
      let parentId: number | undefined;
      const pCode = str(r.parentCode) || str(r.ParentCode);
      const pId = num(r.parentId);
      if (pCode && byOld[`code:${pCode}`]) parentId = byOld[`code:${pCode}`];
      else if (pId != null && byOld[String(pId)]) parentId = byOld[String(pId)];
      if (parentId) {
        await db.update(accounts).set({ parentId } as any).where(eq(accounts.id, selfId));
      }
    }
  }

  for (const [entity, table] of [
    ["customers", customers],
    ["suppliers", suppliers],
    ["employees", employees],
  ] as const) {
    const rows = data[entity] || [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapRowFields(rows[i]);
        const code = str(r.code) || `AUTO-${entity}-${i + 1}`;
        const base: Record<string, unknown> = {
          code,
          name: str(r.name) || code,
          phone: str(r.phone),
          email: str(r.email),
          address: str(r.address),
          notes: str(r.notes),
          isActive: true,
        };
        if (entity === "customers") {
          Object.assign(base, {
            phone2: str(r.phone2),
            city: str(r.city),
            taxNumber: str(r.taxNumber),
            creditLimit: money(r.creditLimit),
            balance: money(r.balance),
          });
        } else if (entity === "suppliers") {
          Object.assign(base, {
            phone2: str(r.phone2),
            city: str(r.city),
            taxNumber: str(r.taxNumber),
            balance: money(r.balance),
          });
        } else {
          Object.assign(base, {
            nationalId: str(r.nationalId),
            basicSalary: money(r.basicSalary, "0"),
            status: str(r.status) || "active",
          });
        }
        const id = await upsertByCode(db, table, tenantId, "code", code, compactRow(base));
        const oldId = num(rows[i].id);
        if (oldId != null) map(entity)[String(oldId)] = id;
        map(entity)[`code:${code}`] = id;
        bump(entity);
      } catch (e: any) {
        report.errors.push({ entity, row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  {
    const rows = data.items || [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapRowFields(rows[i]);
        const code = str(r.code) || `ITEM-${i + 1}`;
        const id = await upsertByCode(db, items, tenantId, "code", code, compactRow({
          code,
          name: str(r.name) || code,
          barcode: str(r.barcode),
          unit: str(r.unit) || "قطعة",
          purchasePrice: money(r.purchasePrice),
          salePrice: money(r.salePrice || r.price),
          minStock: money(r.minStock),
          currentStock: money(r.currentStock),
          description: str(r.description || r.notes),
          isActive: true,
        }));
        const oldId = num(rows[i].id);
        if (oldId != null) map("items")[String(oldId)] = id;
        map("items")[`code:${code}`] = id;
        bump("items");
      } catch (e: any) {
        report.errors.push({ entity: "items", row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  {
    const rows = data.bankAccounts || [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapRowFields(rows[i]);
        const name = str(r.name) || str(r.bankName) || `بنك-${i + 1}`;
        const id = await upsertByCode(db, bankAccounts, tenantId, "name", name, compactRow({
          name,
          bankName: str(r.bankName),
          accountNumber: str(r.accountNumber || r.code),
          balance: money(r.balance),
          isActive: true,
        }));
        const oldId = num(rows[i].id);
        if (oldId != null) map("bankAccounts")[String(oldId)] = id;
        map("bankAccounts")[`code:${name}`] = id;
        bump("bankAccounts");
      } catch (e: any) {
        report.errors.push({ entity: "bankAccounts", row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  // Company settings (single)
  if (data.companySettings?.[0]) {
    try {
      const r = mapRowFields(data.companySettings[0]);
      const existing = await db.select().from(companySettings).where(eq(companySettings.tenantId, tenantId)).limit(1);
      const vals = compactRow({
        name: str(r.name) || "شركة",
        address: str(r.address),
        phone: str(r.phone),
        email: str(r.email),
        taxNumber: str(r.taxNumber),
      });
      if (existing[0]) {
        await db.update(companySettings).set(vals as any).where(eq(companySettings.id, existing[0].id));
      } else {
        await db.insert(companySettings).values(withTenantId(tenantId, vals) as any);
      }
      bump("companySettings");
    } catch (e: any) {
      report.errors.push({ entity: "companySettings", row: 1, message: e?.message || String(e) });
    }
  }

  // --- Transactions: sales invoices ---
  {
    const headers = data.salesInvoices || [];
    const lines = data.salesInvoiceItems || [];
    for (let i = 0; i < headers.length; i++) {
      try {
        const r = mapRowFields(headers[i]);
        const number = str(r.number) || `SI-${i + 1}`;
        const custOld = num(r.customerId);
        const customerId =
          (custOld != null && map("customers")[String(custOld)]) ||
          (str(r.customerCode) && map("customers")[`code:${str(r.customerCode)}`]) ||
          undefined;
        const resolvedCustomerId = customerId || Object.values(map("customers"))[0];
        if (!resolvedCustomerId) {
          report.errors.push({ entity: "salesInvoices", row: i + 1, message: "لا يوجد عميل لربط الفاتورة" });
          continue;
        }
        const invId = await insertReturningId(db, salesInvoices, withTenantId(tenantId, compactRow({
          number,
          customerId: resolvedCustomerId,
          date: dateStr(r.date),
          dueDate: str(r.dueDate) ? dateStr(r.dueDate) : undefined,
          subtotal: money(r.subtotal || r.total),
          discount: money(r.discount),
          tax: money(r.tax),
          total: money(r.total || r.amount),
          paid: money(r.paid || r.paidAmount),
          remaining: money(r.remaining),
          status: (["draft", "confirmed", "paid", "partial", "cancelled"].includes(String(r.status))
            ? r.status
            : "confirmed") as string,
          notes: str(r.notes || r.description),
        })));
        const oldId = num(headers[i].id);
        if (oldId != null) map("salesInvoices")[String(oldId)] = invId;
        map("salesInvoices")[`code:${number}`] = invId;
        bump("salesInvoices");

        const related = lines.filter((ln) => {
          const m = mapRowFields(ln);
          return num(m.invoiceId) === oldId || str(m.invoiceNumber) === number;
        });
        for (const ln of related) {
          const m = mapRowFields(ln);
          const itemOld = num(m.itemId);
          const itemId =
            (itemOld != null && map("items")[String(itemOld)]) ||
            (str(m.itemCode) && map("items")[`code:${str(m.itemCode)}`]) ||
            undefined;
          if (!itemId) continue;
          await db.insert(salesInvoiceItems).values(withTenantId(tenantId, compactRow({
            invoiceId: invId,
            itemId,
            quantity: money(m.quantity, "1"),
            price: money(m.price || m.salePrice),
            total: money(m.total || Number(m.quantity || 1) * Number(m.price || 0)),
          })) as any);
          bump("salesInvoiceItems");
        }
      } catch (e: any) {
        report.errors.push({ entity: "salesInvoices", row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  // Purchase invoices
  {
    const headers = data.purchaseInvoices || [];
    const lines = data.purchaseInvoiceItems || [];
    for (let i = 0; i < headers.length; i++) {
      try {
        const r = mapRowFields(headers[i]);
        const number = str(r.number) || `PI-${i + 1}`;
        const supOld = num(r.supplierId);
        const supplierId =
          (supOld != null && map("suppliers")[String(supOld)]) ||
          (str(r.supplierCode) && map("suppliers")[`code:${str(r.supplierCode)}`]) ||
          undefined;
        const resolvedSupplierId = supplierId || Object.values(map("suppliers"))[0];
        if (!resolvedSupplierId) {
          report.errors.push({ entity: "purchaseInvoices", row: i + 1, message: "لا يوجد مورد لربط الفاتورة" });
          continue;
        }
        const invId = await insertReturningId(db, purchaseInvoices, withTenantId(tenantId, compactRow({
          number,
          supplierId: resolvedSupplierId,
          date: dateStr(r.date),
          dueDate: str(r.dueDate) ? dateStr(r.dueDate) : undefined,
          subtotal: money(r.subtotal || r.total),
          discount: money(r.discount),
          tax: money(r.tax),
          total: money(r.total || r.amount),
          paid: money(r.paid || r.paidAmount),
          remaining: money(r.remaining),
          status: (["draft", "confirmed", "paid", "partial", "cancelled"].includes(String(r.status))
            ? r.status
            : "confirmed") as string,
          notes: str(r.notes || r.description),
        })));
        const oldId = num(headers[i].id);
        if (oldId != null) map("purchaseInvoices")[String(oldId)] = invId;
        bump("purchaseInvoices");

        const related = lines.filter((ln) => {
          const m = mapRowFields(ln);
          return num(m.invoiceId) === oldId || str(m.invoiceNumber) === number;
        });
        for (const ln of related) {
          const m = mapRowFields(ln);
          const itemOld = num(m.itemId);
          const itemId =
            (itemOld != null && map("items")[String(itemOld)]) ||
            (str(m.itemCode) && map("items")[`code:${str(m.itemCode)}`]) ||
            undefined;
          if (!itemId) continue;
          await db.insert(purchaseInvoiceItems).values(withTenantId(tenantId, compactRow({
            invoiceId: invId,
            itemId,
            quantity: money(m.quantity, "1"),
            price: money(m.price || m.purchasePrice),
            total: money(m.total || Number(m.quantity || 1) * Number(m.price || 0)),
          })) as any);
          bump("purchaseInvoiceItems");
        }
      } catch (e: any) {
        report.errors.push({ entity: "purchaseInvoices", row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  // Cash
  {
    const rows = data.cashTransactions || [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapRowFields(rows[i]);
        const typeRaw = String(r.type || "receive").toLowerCase();
        const type = ["receive", "pay", "receive_customer", "pay_supplier"].includes(typeRaw)
          ? typeRaw
          : typeRaw.includes("pay") || typeRaw.includes("صرف")
            ? "pay"
            : "receive";
        await insertReturningId(db, cashTransactions, withTenantId(tenantId, compactRow({
          number: str(r.number) || `CASH-${i + 1}`,
          type,
          date: dateStr(r.date),
          amount: money(r.amount || r.total),
          customerId: num(r.customerId) != null ? map("customers")[String(r.customerId)] : undefined,
          supplierId: num(r.supplierId) != null ? map("suppliers")[String(r.supplierId)] : undefined,
          description: str(r.description || r.notes),
          reference: str(r.reference),
        })));
        bump("cashTransactions");
      } catch (e: any) {
        report.errors.push({ entity: "cashTransactions", row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  // Bank tx
  {
    const rows = data.bankTransactions || [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapRowFields(rows[i]);
        const bankOld = num(r.bankAccountId);
        const bankAccountId =
          (bankOld != null && map("bankAccounts")[String(bankOld)]) ||
          Object.values(map("bankAccounts"))[0];
        if (!bankAccountId) continue;
        const typeRaw = String(r.type || "deposit").toLowerCase();
        const type = ["deposit", "withdraw", "deposit_customer", "withdraw_supplier"].includes(typeRaw)
          ? typeRaw
          : "deposit";
        await insertReturningId(db, bankTransactions, withTenantId(tenantId, compactRow({
          number: str(r.number) || `BANK-${i + 1}`,
          type,
          bankAccountId,
          date: dateStr(r.date),
          amount: money(r.amount || r.total),
          customerId: num(r.customerId) != null ? map("customers")[String(r.customerId)] : undefined,
          supplierId: num(r.supplierId) != null ? map("suppliers")[String(r.supplierId)] : undefined,
          description: str(r.description || r.notes),
          reference: str(r.reference),
        })));
        bump("bankTransactions");
      } catch (e: any) {
        report.errors.push({ entity: "bankTransactions", row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  // Checks
  {
    const rows = data.checks || [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapRowFields(rows[i]);
        const typeRaw = String(r.type || "incoming").toLowerCase();
        const type = typeRaw.includes("out") || typeRaw.includes("صادر") ? "outgoing" : "incoming";
        await insertReturningId(db, checks, withTenantId(tenantId, compactRow({
          number: str(r.number) || `CHK-${i + 1}`,
          checkNumber: str(r.checkNumber) || str(r.number) || `CHK-${i + 1}`,
          type,
          date: dateStr(r.date),
          dueDate: dateStr(r.dueDate || r.date),
          amount: money(r.amount || r.total),
          customerId: num(r.customerId) != null ? map("customers")[String(r.customerId)] : undefined,
          supplierId: num(r.supplierId) != null ? map("suppliers")[String(r.supplierId)] : undefined,
          bankAccountId: num(r.bankAccountId) != null ? map("bankAccounts")[String(r.bankAccountId)] : undefined,
          status: (["pending", "deposited", "cleared", "bounced", "cancelled"].includes(String(r.status))
            ? r.status
            : "pending") as string,
          description: str(r.description || r.notes),
        })));
        bump("checks");
      } catch (e: any) {
        report.errors.push({ entity: "checks", row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  // Journals
  {
    const headers = data.journalEntries || [];
    const lines = data.journalEntryLines || [];
    for (let i = 0; i < headers.length; i++) {
      try {
        const r = mapRowFields(headers[i]);
        const number = str(r.number) || `JV-${i + 1}`;
        const entryId = await insertReturningId(db, journalEntries, withTenantId(tenantId, compactRow({
          number,
          date: dateStr(r.date),
          description: str(r.description || r.notes) || number,
          reference: str(r.reference),
          status: (["draft", "posted", "cancelled"].includes(String(r.status))
            ? r.status
            : "posted") as string,
        })));
        const oldId = num(headers[i].id);
        if (oldId != null) map("journalEntries")[String(oldId)] = entryId;
        bump("journalEntries");

        const related = lines.filter((ln) => {
          const m = mapRowFields(ln);
          return num(m.entryId) === oldId || str(m.entryNumber) === number || num(m.journalId) === oldId;
        });
        for (const ln of related) {
          const m = mapRowFields(ln);
          const accOld = num(m.accountId);
          const accountId =
            (accOld != null && map("accounts")[String(accOld)]) ||
            (str(m.accountCode) && map("accounts")[`code:${str(m.accountCode)}`]) ||
            undefined;
          if (!accountId) continue;
          await db.insert(journalEntryLines).values(withTenantId(tenantId, compactRow({
            entryId,
            accountId,
            debit: money(m.debit),
            credit: money(m.credit),
            description: str(m.description || m.notes),
          })) as any);
          bump("journalEntryLines");
        }
      } catch (e: any) {
        report.errors.push({ entity: "journalEntries", row: i + 1, message: e?.message || String(e) });
      }
    }
  }

  return report;
}
