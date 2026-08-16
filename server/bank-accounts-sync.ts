import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { accounts, bankAccounts } from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";

type AccountRow = {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  isParent: boolean | null;
};

/** حساب أب «البنوك» في الشجرة (عادة 1110) */
export async function findBanksParentAccount(
  db: MySql2Database<any>,
  tenantId: number,
): Promise<AccountRow | null> {
  const rows = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      parentId: accounts.parentId,
      isParent: accounts.isParent,
    })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  const byCode = rows.find((r) => r.code === "1110");
  if (byCode) return byCode;

  return (
    rows.find((r) => (r.isParent || false) && /بنوك|banks/i.test(r.name)) || null
  );
}

function collectDescendantLeaves(all: AccountRow[], parentId: number): AccountRow[] {
  const children = all.filter((a) => a.parentId === parentId);
  const leaves: AccountRow[] = [];
  for (const child of children) {
    const kids = all.filter((a) => a.parentId === child.id);
    if (kids.length > 0) {
      leaves.push(...collectDescendantLeaves(all, child.id));
    } else if (!child.isParent) {
      leaves.push(child);
    }
  }
  return leaves;
}

/** أوراق شجرة البنوك (حسابات بنكية في الدليل المحاسبي) */
export async function listChartBankLeafAccounts(
  db: MySql2Database<any>,
  tenantId: number,
): Promise<AccountRow[]> {
  const parent = await findBanksParentAccount(db, tenantId);
  if (!parent) return [];

  const rows = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      parentId: accounts.parentId,
      isParent: accounts.isParent,
    })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  return collectDescendantLeaves(rows, parent.id);
}

export async function ensureBankAccountForGlAccount(
  db: MySql2Database<any>,
  tenantId: number,
  gl: { id: number; name: string; code: string },
): Promise<number> {
  const [byGl] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.glAccountId, gl.id)))
    .limit(1);
  if (byGl) return byGl.id;

  const [byName] = await db
    .select({ id: bankAccounts.id, glAccountId: bankAccounts.glAccountId })
    .from(bankAccounts)
    .where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.name, gl.name)))
    .limit(1);
  if (byName) {
    if (!byName.glAccountId) {
      await db
        .update(bankAccounts)
        .set({ glAccountId: gl.id, isActive: true } as any)
        .where(eq(bankAccounts.id, byName.id));
    }
    return byName.id;
  }

  const [inserted] = await db.insert(bankAccounts).values(
    withTenantId(tenantId, {
      name: gl.name,
      bankName: null,
      accountNumber: gl.code,
      glAccountId: gl.id,
      isActive: true,
    }) as any,
  );
  return Number((inserted as { insertId?: number }).insertId ?? 0);
}

/** مزامنة حسابات شجرة «البنوك» → جدول الحسابات البنكية التشغيلية */
export async function syncBankAccountsFromChart(
  db: MySql2Database<any>,
  tenantId: number,
): Promise<{ created: number; linked: number }> {
  const leaves = await listChartBankLeafAccounts(db, tenantId);
  let created = 0;
  let linked = 0;
  for (const leaf of leaves) {
    const [existingGl] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.glAccountId, leaf.id)))
      .limit(1);
    if (existingGl) continue;

    const [byName] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.name, leaf.name)))
      .limit(1);

    await ensureBankAccountForGlAccount(db, tenantId, leaf);
    if (byName) linked += 1;
    else created += 1;
  }
  return { created, linked };
}

/** عند إنشاء حساب بنكي تشغيلي — أنشئ/اربط حساباً في شجرة البنوك */
export async function ensureGlAccountForBankAccount(
  db: MySql2Database<any>,
  tenantId: number,
  bank: { id: number; name: string; accountNumber?: string | null },
): Promise<number | null> {
  const [row] = await db
    .select({ glAccountId: bankAccounts.glAccountId })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, bank.id))
    .limit(1);
  if (row?.glAccountId) return row.glAccountId;

  const parent = await findBanksParentAccount(db, tenantId);
  if (!parent) return null;

  const codeBase = (bank.accountNumber || "").replace(/\D/g, "").slice(-4) || String(bank.id);
  let code = `1110${codeBase}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? code : `${code}${i}`;
    const [clash] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(tenantWhere(accounts, tenantId, eq(accounts.code, candidate)))
      .limit(1);
    if (!clash) {
      code = candidate;
      break;
    }
  }

  const [byName] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.tenantId, tenantId),
        eq(accounts.name, bank.name),
        eq(accounts.parentId, parent.id),
      ),
    )
    .limit(1);

  let glId = byName?.id;
  if (!glId) {
    const [inserted] = await db.insert(accounts).values(
      withTenantId(tenantId, {
        code,
        name: bank.name,
        type: "asset" as const,
        parentId: parent.id,
        isParent: false,
        isActive: true,
      }) as any,
    );
    glId = Number((inserted as { insertId?: number }).insertId ?? 0);
  }

  if (glId) {
    await db
      .update(bankAccounts)
      .set({ glAccountId: glId } as any)
      .where(eq(bankAccounts.id, bank.id));
  }
  return glId || null;
}

/** الحساب المحاسبي المرتبط ببنك تشغيلي (للقيود التلقائية) */
export async function resolveBankGlAccountId(
  db: MySql2Database<any>,
  tenantId: number,
  bankAccountId?: number | null,
  fallbackAccountId?: number,
): Promise<number> {
  if (bankAccountId) {
    const [ba] = await db
      .select({
        id: bankAccounts.id,
        name: bankAccounts.name,
        accountNumber: bankAccounts.accountNumber,
        glAccountId: bankAccounts.glAccountId,
      })
      .from(bankAccounts)
      .where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.id, bankAccountId)))
      .limit(1);
    if (ba?.glAccountId) return ba.glAccountId;
    if (ba) {
      const linked = await ensureGlAccountForBankAccount(db, tenantId, ba);
      if (linked) return linked;
    }
  }

  const leaves = await listChartBankLeafAccounts(db, tenantId);
  if (leaves[0]) return leaves[0].id;
  if (fallbackAccountId) return fallbackAccountId;
  throw new Error("لا يوجد حساب بنك في شجرة الحسابات — أضف بنكاً تحت «البنوك»");
}
