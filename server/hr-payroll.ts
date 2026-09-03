import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  attendance,
  employeeShifts,
  employeeVacationRecords,
  employees,
  hrIncentives,
  hrShifts,
  payroll,
  salaryAdvances,
} from "../drizzle/schema";
import { getGeneralAttrNumber } from "./general-attributes";
import { tenantWhere, withTenantId } from "./tenant-scope";

function monthBounds(month: number, year: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, daysInMonth: lastDay };
}

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

function dec(n: number) {
  return n.toFixed(2);
}

function vacationDaysInMonth(
  startDate: string,
  endDate: string,
  monthStart: string,
  monthEnd: string,
) {
  // المتصلين بيمرروا نصوص متطبّعة (toDateStr) — مفيش Date objects هنا
  const vStart = startDate.slice(0, 10);
  const vEnd = endDate.slice(0, 10);
  const clipStart = vStart > monthStart ? vStart : monthStart;
  const clipEnd = vEnd < monthEnd ? vEnd : monthEnd;
  if (clipStart > clipEnd) return 0;
  const start = new Date(`${clipStart}T12:00:00`);
  const end = new Date(`${clipEnd}T12:00:00`);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

function minutesFromTime(t: string) {
  const parts = String(t).trim().slice(0, 5).split(":");
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
  return h * 60 + m;
}

function isLateByShift(checkIn: string | null | undefined, shiftStart: string, graceMinutes: number) {
  if (!checkIn) return false;
  const actual = minutesFromTime(checkIn);
  const expected = minutesFromTime(shiftStart) + graceMinutes;
  return actual > expected;
}

async function resolveEmployeeShift(
  db: Db,
  tenantId: number,
  employeeId: number,
  monthEnd: string,
) {
  const rows = await db
    .select({
      startTime: hrShifts.startTime,
      endTime: hrShifts.endTime,
      effectiveFrom: employeeShifts.effectiveFrom,
    })
    .from(employeeShifts)
    .innerJoin(hrShifts, eq(employeeShifts.shiftId, hrShifts.id))
    .where(
      tenantWhere(
        employeeShifts,
        tenantId,
        and(
          eq(employeeShifts.employeeId, employeeId),
          eq(hrShifts.isActive, true),
          sql`(${employeeShifts.effectiveFrom} IS NULL OR ${employeeShifts.effectiveFrom} <= ${monthEnd})`,
        ),
      ),
    )
    .orderBy(sql`${employeeShifts.effectiveFrom} DESC`);
  return rows[0] ?? null;
}

export async function calculateMonthPayroll(
  db: Db,
  tenantId: number,
  month: number,
  year: number,
) {
  const { start, end, daysInMonth } = monthBounds(month, year);
  const lateGrace = await getGeneralAttrNumber(db, tenantId, "payroll_late_grace_minutes", 15);
  const lateDayFraction = await getGeneralAttrNumber(db, tenantId, "payroll_late_day_fraction", 0.25);
  const overtimeHourly = await getGeneralAttrNumber(db, tenantId, "payroll_overtime_hourly_rate", 0);

  const activeEmployees = await db
    .select()
    .from(employees)
    .where(tenantWhere(employees, tenantId, eq(employees.status, "active")));

  const existingRows = await db
    .select()
    .from(payroll)
    .where(tenantWhere(payroll, tenantId, and(eq(payroll.month, month), eq(payroll.year, year))));

  const paidEmployeeIds = new Set(
    existingRows.filter((r) => r.status === "paid").map((r) => r.employeeId),
  );

  let created = 0;
  let updated = 0;

  for (const emp of activeEmployees) {
    if (paidEmployeeIds.has(emp.id)) continue;

    const basic = Number(emp.basicSalary || 0);
    const dailyRate = basic / daysInMonth;
    const hourlyRate = dailyRate / 8;

    const shift = await resolveEmployeeShift(db, tenantId, emp.id, end);

    const attRows = await db
      .select({
        status: attendance.status,
        checkIn: attendance.checkIn,
        overtime: attendance.overtime,
      })
      .from(attendance)
      .where(
        tenantWhere(
          attendance,
          tenantId,
          and(
            eq(attendance.employeeId, emp.id),
            gte(attendance.date, start as any),
            lte(attendance.date, end as any),
          ),
        ),
      );

    let absentDays = 0;
    let lateDays = 0;
    let overtimeHours = 0;
    for (const row of attRows) {
      if (row.status === "absent") absentDays += 1;
      else if (row.status === "half_day") absentDays += 0.5;
      else if (row.status === "late") lateDays += lateDayFraction;
      else if (
        shift &&
        row.status === "present" &&
        isLateByShift(row.checkIn, shift.startTime, lateGrace)
      ) {
        lateDays += lateDayFraction;
      }
      overtimeHours += Number(row.overtime || 0);
    }

    const attendanceDeduction = dailyRate * absentDays + dailyRate * lateDays;

    const vacationRows = await db
      .select({
        startDate: employeeVacationRecords.startDate,
        endDate: employeeVacationRecords.endDate,
        days: employeeVacationRecords.days,
      })
      .from(employeeVacationRecords)
      .where(
        tenantWhere(
          employeeVacationRecords,
          tenantId,
          and(
            eq(employeeVacationRecords.employeeId, emp.id),
            eq(employeeVacationRecords.status, "approved"),
            lte(employeeVacationRecords.startDate, end as any),
            gte(employeeVacationRecords.endDate, start as any),
          ),
        ),
      );

    let vacationDays = 0;
    for (const row of vacationRows) {
      vacationDays += vacationDaysInMonth(toDateStr(row.startDate), toDateStr(row.endDate), start, end);
    }

    const vacationDeduction = dailyRate * vacationDays;

    const [advanceRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${salaryAdvances.amount}), 0)` })
      .from(salaryAdvances)
      .where(
        and(
          eq(salaryAdvances.employeeId, emp.id),
          eq(salaryAdvances.status, "approved"),
          gte(salaryAdvances.date, start as any),
          lte(salaryAdvances.date, end as any),
        ),
      );

    const advances = Number(advanceRow?.total || 0);

    const [incentiveRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${hrIncentives.amount}), 0)` })
      .from(hrIncentives)
      .where(
        tenantWhere(
          hrIncentives,
          tenantId,
          and(
            eq(hrIncentives.employeeId, emp.id),
            gte(hrIncentives.date, start as any),
            lte(hrIncentives.date, end as any),
          ),
        ),
      );

    const incentiveTotal = Number(incentiveRow?.total || 0);
    const overtimePay = overtimeHours * (overtimeHourly > 0 ? overtimeHourly : hourlyRate);
    const allowances = incentiveTotal + overtimePay;
    const tax = 0;
    const deductions = attendanceDeduction + vacationDeduction;
    const net = Math.max(0, basic + allowances - deductions - advances - tax);

    const noteParts: string[] = [];
    if (absentDays > 0) noteParts.push(`خصم غياب: ${absentDays} يوم`);
    if (lateDays > 0) noteParts.push(`خصم تأخير: ${lateDays.toFixed(2)} يوم`);
    if (vacationDays > 0) noteParts.push(`خصم إجازة: ${vacationDays} يوم`);
    if (incentiveTotal > 0) noteParts.push(`حوافز: ${dec(incentiveTotal)}`);
    if (overtimePay > 0) noteParts.push(`إضافي: ${overtimeHours} س (${dec(overtimePay)})`);
    if (shift) noteParts.push(`وردية: ${shift.startTime}-${shift.endTime}`);

    const payload = {
      employeeId: emp.id,
      month,
      year,
      basicSalary: dec(basic),
      allowances: dec(allowances),
      deductions: dec(deductions),
      advances: dec(advances),
      tax: dec(tax),
      netSalary: dec(net),
      status: "approved" as const,
      notes: noteParts.length > 0 ? noteParts.join(" | ") : undefined,
    };

    const existing = existingRows.find((r) => r.employeeId === emp.id);
    if (existing) {
      await db
        .update(payroll)
        .set(payload as any)
        .where(tenantWhere(payroll, tenantId, eq(payroll.id, existing.id)));
      updated += 1;
    } else {
      await db.insert(payroll).values(withTenantId(tenantId, payload) as any);
      created += 1;
    }
  }

  return { created, updated, skippedPaid: paidEmployeeIds.size };
}

export async function payMonthPayroll(
  db: Db,
  tenantId: number,
  month: number,
  year: number,
) {
  const payDate = new Date().toISOString().split("T")[0];
  const pending = await db
    .select({ id: payroll.id, netSalary: payroll.netSalary })
    .from(payroll)
    .where(
      tenantWhere(
        payroll,
        tenantId,
        and(
          eq(payroll.month, month),
          eq(payroll.year, year),
          sql`${payroll.status} != 'paid'`,
        ),
      ),
    );
  const totalNet = pending.reduce((sum, row) => sum + Number(row.netSalary || 0), 0);
  if (pending.length === 0) return { paidCount: 0, totalNet: 0, payDate };
  await db
    .update(payroll)
    .set({ status: "paid", paidDate: payDate as any })
    .where(
      tenantWhere(
        payroll,
        tenantId,
        and(
          eq(payroll.month, month),
          eq(payroll.year, year),
          sql`${payroll.status} != 'paid'`,
        ),
      ),
    );
  return { paidCount: pending.length, totalNet, payDate };
}
