import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "./db";
import {
  appUsers,
  bankAccounts,
  checkRoutingEvents,
  checkRoutings,
  checks,
  customers,
} from "../drizzle/schema";
import { postCheckDepositJournal } from "./auto-journal";
import { bounceCheck, clearCheck } from "./check-actions";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { tenantWhere, withTenantId } from "./tenant-scope";

export type RoutingStatus =
  | "unrouted"
  | "in_custody"
  | "scheduled"
  | "deposited"
  | "cleared"
  | "rejected";

export type RoutingListFilter =
  | "unrouted"
  | "in_custody"
  | "scheduled"
  | "overdue_deposit"
  | "at_bank"
  | "completed"
  | "all";

type EventType =
  | "created"
  | "assign_custody"
  | "transfer_custody"
  | "route"
  | "update_route"
  | "deposit"
  | "clear"
  | "reject"
  | "note";

async function appendEvent(
  db: Db,
  tenantId: number,
  input: {
    routingId: number;
    checkId: number;
    eventType: EventType;
    fromUserId?: number | null;
    toUserId?: number | null;
    bankAccountId?: number | null;
    plannedDepositDate?: string | null;
    notes?: string | null;
    performedBy?: number | null;
  },
) {
  await db.insert(checkRoutingEvents).values(
    withTenantId(tenantId, {
      routingId: input.routingId,
      checkId: input.checkId,
      eventType: input.eventType,
      fromUserId: input.fromUserId ?? null,
      toUserId: input.toUserId ?? null,
      bankAccountId: input.bankAccountId ?? null,
      plannedDepositDate: (input.plannedDepositDate || null) as any,
      notes: input.notes ?? null,
      performedBy: input.performedBy ?? null,
    }) as any,
  );
}

export async function ensureCheckRouting(
  db: Db,
  tenantId: number,
  checkId: number,
  performedBy?: number,
) {
  const [existing] = await db
    .select()
    .from(checkRoutings)
    .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.checkId, checkId)))
    .limit(1);
  if (existing) return existing;

  const [chk] = await db
    .select()
    .from(checks)
    .where(tenantWhere(checks, tenantId, eq(checks.id, checkId)))
    .limit(1);
  if (!chk || chk.type !== "incoming") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "التوجيه للشيكات الواردة فقط" });
  }

  const initialStatus: RoutingStatus =
    chk.status === "deposited"
      ? "deposited"
      : chk.status === "cleared"
        ? "cleared"
        : chk.status === "bounced"
          ? "rejected"
          : "unrouted";

  await db.insert(checkRoutings).values(
    withTenantId(tenantId, {
      checkId,
      status: initialStatus,
      targetBankAccountId: chk.bankAccountId ?? null,
      depositedAt: chk.status === "deposited" ? (chk.dueDate as any) : null,
    }) as any,
  );

  const [created] = await db
    .select()
    .from(checkRoutings)
    .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.checkId, checkId)))
    .limit(1);

  if (created) {
    await appendEvent(db, tenantId, {
      routingId: created.id,
      checkId,
      eventType: "created",
      performedBy: performedBy ?? chk.createdBy ?? null,
      notes: "إنشاء سجل توجيه تلقائي",
    });
  }

  return created!;
}

export async function backfillOpenCheckRoutings(db: Db, tenantId: number) {
  const openChecks = await db
    .select({ id: checks.id })
    .from(checks)
    .where(
      tenantWhere(
        checks,
        tenantId,
        and(eq(checks.type, "incoming"), inArray(checks.status, ["pending", "deposited"])),
      ),
    );

  let created = 0;
  for (const row of openChecks) {
    const before = await db
      .select({ id: checkRoutings.id })
      .from(checkRoutings)
      .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.checkId, row.id)))
      .limit(1);
    if (!before.length) {
      await ensureCheckRouting(db, tenantId, row.id);
      created += 1;
    }
  }
  return { created, scanned: openChecks.length };
}

async function getRoutingOrThrow(db: Db, tenantId: number, routingId: number) {
  const [row] = await db
    .select()
    .from(checkRoutings)
    .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.id, routingId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "سجل التوجيه غير موجود" });
  return row;
}

async function assertTenantUser(db: Db, tenantId: number, userId: number) {
  const [user] = await db
    .select({ id: appUsers.id, name: appUsers.name, tenantId: appUsers.tenantId, isActive: appUsers.isActive })
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.tenantId, tenantId)))
    .limit(1);
  if (!user || !user.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المستخدم غير تابع لهذه الشركة أو غير نشط" });
  }
  return user;
}

async function assertTenantBank(db: Db, tenantId: number, bankAccountId: number) {
  const [bank] = await db
    .select()
    .from(bankAccounts)
    .where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.id, bankAccountId)))
    .limit(1);
  if (!bank || bank.isActive === false) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "الحساب البنكي غير صالح" });
  }
  return bank;
}

export async function listCheckRoutings(
  db: Db,
  tenantId: number,
  opts: {
    filter?: RoutingListFilter;
    search?: string;
    custodianUserId?: number;
    bankAccountId?: number;
    page?: number;
    limit?: number;
  } = {},
) {
  await backfillOpenCheckRoutings(db, tenantId);

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const offset = (page - 1) * limit;
  const today = new Date().toISOString().slice(0, 10);
  const filter = opts.filter ?? "all";

  const statusConds = (() => {
    switch (filter) {
      case "unrouted":
        return eq(checkRoutings.status, "unrouted");
      case "in_custody":
        return eq(checkRoutings.status, "in_custody");
      case "scheduled":
        return and(eq(checkRoutings.status, "scheduled"), gte(checkRoutings.plannedDepositDate, today as any));
      case "overdue_deposit":
        return and(eq(checkRoutings.status, "scheduled"), sql`${checkRoutings.plannedDepositDate} < ${today}`);
      case "at_bank":
        return eq(checkRoutings.status, "deposited");
      case "completed":
        return inArray(checkRoutings.status, ["cleared", "rejected"]);
      default:
        return undefined;
    }
  })();

  const where = and(
    eq(checkRoutings.tenantId, tenantId),
    eq(checks.type, "incoming"),
    statusConds,
    opts.custodianUserId ? eq(checkRoutings.custodianUserId, opts.custodianUserId) : undefined,
    opts.bankAccountId ? eq(checkRoutings.targetBankAccountId, opts.bankAccountId) : undefined,
    opts.search
      ? sql`(${checks.checkNumber} LIKE ${`%${opts.search}%`} OR ${checks.number} LIKE ${`%${opts.search}%`} OR ${customers.name} LIKE ${`%${opts.search}%`})`
      : undefined,
  );

  const rows = await db
    .select({
      routingId: checkRoutings.id,
      routingStatus: checkRoutings.status,
      custodianUserId: checkRoutings.custodianUserId,
      targetBankAccountId: checkRoutings.targetBankAccountId,
      plannedDepositDate: checkRoutings.plannedDepositDate,
      depositedAt: checkRoutings.depositedAt,
      depositedBy: checkRoutings.depositedBy,
      closedAt: checkRoutings.closedAt,
      notes: checkRoutings.notes,
      routingCreatedAt: checkRoutings.createdAt,
      checkId: checks.id,
      number: checks.number,
      checkNumber: checks.checkNumber,
      amount: checks.amount,
      date: checks.date,
      dueDate: checks.dueDate,
      checkStatus: checks.status,
      customerId: checks.customerId,
      customerName: customers.name,
      custodianName: appUsers.name,
      bankAccountName: bankAccounts.name,
      bankName: bankAccounts.bankName,
    })
    .from(checkRoutings)
    .innerJoin(checks, and(eq(checkRoutings.checkId, checks.id), eq(checkRoutings.tenantId, checks.tenantId)))
    .leftJoin(customers, eq(checks.customerId, customers.id))
    .leftJoin(appUsers, eq(checkRoutings.custodianUserId, appUsers.id))
    .leftJoin(bankAccounts, eq(checkRoutings.targetBankAccountId, bankAccounts.id))
    .where(where)
    .orderBy(desc(checkRoutings.updatedAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(checkRoutings)
    .innerJoin(checks, and(eq(checkRoutings.checkId, checks.id), eq(checkRoutings.tenantId, checks.tenantId)))
    .leftJoin(customers, eq(checks.customerId, customers.id))
    .where(where);

  const mapped = rows.map((r) => {
    const custodyStart = r.routingCreatedAt ? new Date(r.routingCreatedAt).getTime() : Date.now();
    const custodyDays = Math.max(0, Math.floor((Date.now() - custodyStart) / 86_400_000));
    const planned = r.plannedDepositDate ? String(r.plannedDepositDate).slice(0, 10) : null;
    const isOverdueDeposit = r.routingStatus === "scheduled" && planned != null && planned < today;
    return {
      ...r,
      plannedDepositDate: planned,
      depositedAt: r.depositedAt ? String(r.depositedAt).slice(0, 10) : null,
      date: r.date ? String(r.date).slice(0, 10) : null,
      dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
      amount: Number(r.amount),
      custodyDays,
      isOverdueDeposit,
      bankLabel: r.bankAccountName
        ? `${r.bankAccountName}${r.bankName ? ` (${r.bankName})` : ""}`
        : "",
    };
  });

  return { rows: mapped, total: Number(totalRow?.count ?? 0), page, limit };
}

export async function listRoutingEvents(db: Db, tenantId: number, routingId: number) {
  await getRoutingOrThrow(db, tenantId, routingId);
  const events = await db
    .select()
    .from(checkRoutingEvents)
    .where(tenantWhere(checkRoutingEvents, tenantId, eq(checkRoutingEvents.routingId, routingId)))
    .orderBy(desc(checkRoutingEvents.createdAt));

  const userIds = Array.from(
    new Set(
      events
        .flatMap((e) => [e.fromUserId, e.toUserId, e.performedBy])
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  const users = userIds.length
    ? await db.select({ id: appUsers.id, name: appUsers.name }).from(appUsers).where(inArray(appUsers.id, userIds))
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const bankIds = Array.from(
    new Set(events.map((e) => e.bankAccountId).filter((id): id is number => typeof id === "number")),
  );
  const banks = bankIds.length
    ? await db
        .select({ id: bankAccounts.id, name: bankAccounts.name })
        .from(bankAccounts)
        .where(inArray(bankAccounts.id, bankIds))
    : [];
  const bankMap = new Map(banks.map((b) => [b.id, b.name]));

  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    fromUserId: e.fromUserId,
    toUserId: e.toUserId,
    fromUserName: e.fromUserId ? userMap.get(e.fromUserId) || null : null,
    toUserName: e.toUserId ? userMap.get(e.toUserId) || null : null,
    performedBy: e.performedBy,
    performedByName: e.performedBy ? userMap.get(e.performedBy) || null : null,
    bankAccountId: e.bankAccountId,
    bankAccountName: e.bankAccountId ? bankMap.get(e.bankAccountId) || null : null,
    plannedDepositDate: e.plannedDepositDate ? String(e.plannedDepositDate).slice(0, 10) : null,
    notes: e.notes,
    createdAt: e.createdAt,
  }));
}

export async function assignCustody(
  db: Db,
  tenantId: number,
  performedBy: number,
  input: { routingId: number; custodianUserId: number; notes?: string },
) {
  const routing = await getRoutingOrThrow(db, tenantId, input.routingId);
  if (routing.status === "deposited" || routing.status === "cleared" || routing.status === "rejected") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تعديل حيازة شيك مغلق أو مودع" });
  }

  await assertTenantUser(db, tenantId, input.custodianUserId);
  const fromUserId = routing.custodianUserId;
  const eventType: EventType = fromUserId && fromUserId !== input.custodianUserId
    ? "transfer_custody"
    : "assign_custody";

  await db
    .update(checkRoutings)
    .set({
      custodianUserId: input.custodianUserId,
      status: routing.status === "scheduled" ? "scheduled" : "in_custody",
      notes: input.notes ?? routing.notes,
    })
    .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.id, routing.id)));

  await appendEvent(db, tenantId, {
    routingId: routing.id,
    checkId: routing.checkId,
    eventType,
    fromUserId,
    toUserId: input.custodianUserId,
    notes: input.notes,
    performedBy,
  });

  return { success: true };
}

export async function routeCheck(
  db: Db,
  tenantId: number,
  performedBy: number,
  input: {
    routingId: number;
    bankAccountId: number;
    plannedDepositDate: string;
    custodianUserId?: number;
    notes?: string;
  },
) {
  const routing = await getRoutingOrThrow(db, tenantId, input.routingId);
  if (routing.status === "deposited" || routing.status === "cleared" || routing.status === "rejected") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن توجيه شيك مغلق أو مودع" });
  }

  await assertTenantBank(db, tenantId, input.bankAccountId);
  let custodianUserId = input.custodianUserId ?? routing.custodianUserId;
  if (custodianUserId) await assertTenantUser(db, tenantId, custodianUserId);

  const isUpdate = routing.status === "scheduled";
  await db
    .update(checkRoutings)
    .set({
      targetBankAccountId: input.bankAccountId,
      plannedDepositDate: input.plannedDepositDate as any,
      custodianUserId: custodianUserId ?? null,
      status: "scheduled",
      notes: input.notes ?? routing.notes,
    })
    .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.id, routing.id)));

  await appendEvent(db, tenantId, {
    routingId: routing.id,
    checkId: routing.checkId,
    eventType: isUpdate ? "update_route" : "route",
    toUserId: custodianUserId,
    bankAccountId: input.bankAccountId,
    plannedDepositDate: input.plannedDepositDate,
    notes: input.notes,
    performedBy,
  });

  return { success: true };
}

export async function depositRoutedCheck(
  db: Db,
  tenantId: number,
  performedBy: number,
  input: { routingId: number; depositDate?: string; bankAccountId?: number; notes?: string },
) {
  const routing = await getRoutingOrThrow(db, tenantId, input.routingId);
  if (routing.status === "deposited" || routing.status === "cleared" || routing.status === "rejected") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "الشيك مودع أو مغلق مسبقاً" });
  }

  const bankAccountId = input.bankAccountId ?? routing.targetBankAccountId;
  if (!bankAccountId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "يجب تحديد البنك الموجّه إليه قبل الإيداع" });
  }
  const bank = await assertTenantBank(db, tenantId, bankAccountId);

  const [chk] = await db
    .select()
    .from(checks)
    .where(tenantWhere(checks, tenantId, eq(checks.id, routing.checkId)))
    .limit(1);
  if (!chk) throw new TRPCError({ code: "NOT_FOUND", message: "الشيك غير موجود" });
  if (chk.type !== "incoming") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "الإيداع للشيكات الواردة فقط" });
  }
  if (chk.status !== "pending") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إيداع الشيك في حالته الحالية" });
  }

  const depositDate = input.depositDate || new Date().toISOString().slice(0, 10);
  await assertDateNotInClosedPeriod(db, tenantId, depositDate);

  let customerName: string | undefined;
  if (chk.customerId) {
    const [c] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.id, chk.customerId)));
    customerName = c?.name;
  }

  await postCheckDepositJournal(db, tenantId, performedBy, {
    number: chk.number,
    date: depositDate,
    amount: String(chk.amount),
    description: chk.description || undefined,
    customerName,
    bankAccountName: bank.name,
  });

  await db
    .update(checks)
    .set({ status: "deposited", bankAccountId })
    .where(tenantWhere(checks, tenantId, eq(checks.id, chk.id)));

  await db
    .update(checkRoutings)
    .set({
      status: "deposited",
      targetBankAccountId: bankAccountId,
      depositedAt: depositDate as any,
      depositedBy: performedBy,
      custodianUserId: null,
      notes: input.notes ?? routing.notes,
    })
    .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.id, routing.id)));

  await appendEvent(db, tenantId, {
    routingId: routing.id,
    checkId: routing.checkId,
    eventType: "deposit",
    fromUserId: routing.custodianUserId,
    bankAccountId,
    plannedDepositDate: routing.plannedDepositDate ? String(routing.plannedDepositDate).slice(0, 10) : null,
    notes: input.notes || "إيداع الشيك وتحويل المسؤولية للبنك",
    performedBy,
  });

  return { success: true };
}

export async function syncRoutingAfterClearOrBounce(
  db: Db,
  tenantId: number,
  checkId: number,
  outcome: "cleared" | "rejected",
  performedBy: number,
) {
  const routing = await ensureCheckRouting(db, tenantId, checkId, performedBy);
  if (routing.status === outcome) return;

  await db
    .update(checkRoutings)
    .set({
      status: outcome,
      closedAt: new Date(),
      closedBy: performedBy,
      custodianUserId: null,
    })
    .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.id, routing.id)));

  await appendEvent(db, tenantId, {
    routingId: routing.id,
    checkId,
    eventType: outcome === "cleared" ? "clear" : "reject",
    performedBy,
    notes: outcome === "cleared" ? "تم التحصيل" : "تم الرفض/الإرجاع",
  });
}

export async function collectRoutedCheck(
  db: Db,
  tenantId: number,
  performedBy: number,
  input: { routingId: number; date?: string },
) {
  const routing = await getRoutingOrThrow(db, tenantId, input.routingId);
  return clearCheck(db, tenantId, performedBy, routing.checkId, { date: input.date });
}

export async function rejectRoutedCheck(
  db: Db,
  tenantId: number,
  performedBy: number,
  input: { routingId: number; date?: string },
) {
  const routing = await getRoutingOrThrow(db, tenantId, input.routingId);
  return bounceCheck(db, tenantId, performedBy, routing.checkId, { date: input.date });
}

export async function routingSummaryCounts(db: Db, tenantId: number) {
  await backfillOpenCheckRoutings(db, tenantId);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      status: checkRoutings.status,
      plannedDepositDate: checkRoutings.plannedDepositDate,
      count: sql<number>`count(*)`,
    })
    .from(checkRoutings)
    .innerJoin(checks, and(eq(checkRoutings.checkId, checks.id), eq(checks.tenantId, checkRoutings.tenantId)))
    .where(and(eq(checkRoutings.tenantId, tenantId), eq(checks.type, "incoming")))
    .groupBy(checkRoutings.status, checkRoutings.plannedDepositDate);

  let unrouted = 0;
  let inCustody = 0;
  let scheduled = 0;
  let overdueDeposit = 0;
  let atBank = 0;
  let completed = 0;

  for (const r of rows) {
    const c = Number(r.count);
    if (r.status === "unrouted") unrouted += c;
    else if (r.status === "in_custody") inCustody += c;
    else if (r.status === "scheduled") {
      const planned = r.plannedDepositDate ? String(r.plannedDepositDate).slice(0, 10) : null;
      if (planned && planned < today) overdueDeposit += c;
      else scheduled += c;
    } else if (r.status === "deposited") atBank += c;
    else if (r.status === "cleared" || r.status === "rejected") completed += c;
  }

  return { unrouted, inCustody, scheduled, overdueDeposit, atBank, completed };
}
