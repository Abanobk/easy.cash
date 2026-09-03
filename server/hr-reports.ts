import type { Db } from "./db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  attendance,
  employees,
  employeeVacationRecords,
  hrVacations,
  payroll,
  salaryAdvances,
  underRequestEmployees,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";
import type { ReportFilters } from "./accounting-data";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

export type ReportRow = Record<string, unknown>;

const HANDLERS: Record<string, (db: Db, f: ReportFilters) => Promise<ReportRow[]>> = {
  "hrreports-attendance": async (db, f) => {
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(attendance.date, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(attendance.date, f.dateTo as any));
    const rows = await db.select({
      date: attendance.date,
      checkIn: attendance.checkIn,
      checkOut: attendance.checkOut,
      status: attendance.status,
      source: attendance.source,
      employeeName: employees.name,
    }).from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .where(tenantWhere(attendance, f.tenantId, ...(dateParts.length ? [and(...dateParts)] : [])))
      .orderBy(desc(attendance.date));
    return rows.map((r) => ({
      date: toDateStr(r.date),
      employeeName: r.employeeName,
      checkIn: r.checkIn || "",
      checkOut: r.checkOut || "",
      status: r.status,
      source: r.source || "manual",
    }));
  },
  "hrreports-employeesvactions": async (db, f) => {
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(employeeVacationRecords.startDate, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(employeeVacationRecords.endDate, f.dateTo as any));
    const rows = await db.select({
      startDate: employeeVacationRecords.startDate,
      endDate: employeeVacationRecords.endDate,
      days: employeeVacationRecords.days,
      status: employeeVacationRecords.status,
      employeeName: employees.name,
      vacationType: hrVacations.name,
    }).from(employeeVacationRecords)
      .innerJoin(employees, eq(employeeVacationRecords.employeeId, employees.id))
      .leftJoin(hrVacations, eq(employeeVacationRecords.vacationTypeId, hrVacations.id))
      .where(tenantWhere(employeeVacationRecords, f.tenantId, ...(dateParts.length ? [and(...dateParts)] : [])))
      .orderBy(desc(employeeVacationRecords.startDate));
    return rows.map((r) => ({
      employeeName: r.employeeName,
      vacationType: r.vacationType || "",
      startDate: toDateStr(r.startDate),
      endDate: toDateStr(r.endDate),
      days: r.days ?? 0,
      status: r.status,
    }));
  },
  "hrreports-employeespayroll": async (db, f) => {
    const rows = await db.select({
      month: payroll.month,
      year: payroll.year,
      basicSalary: payroll.basicSalary,
      netSalary: payroll.netSalary,
      status: payroll.status,
      employeeName: employees.name,
    }).from(payroll)
      .innerJoin(employees, eq(payroll.employeeId, employees.id))
      .where(tenantWhere(payroll, f.tenantId))
      .orderBy(desc(payroll.year), desc(payroll.month));
    return rows.map((r) => ({
      period: `${r.month}/${r.year}`,
      employeeName: r.employeeName,
      basicSalary: Number(r.basicSalary),
      netSalary: Number(r.netSalary),
      status: r.status,
    }));
  },
  "hrreports-employeespayroll-list": async (db, f) => HANDLERS["hrreports-employeespayroll"]!(db, f),
  "hrreports-employeesunderrequest": async (db, f) => {
    const rows = await db.select({
      name: underRequestEmployees.name,
      phone: underRequestEmployees.phone,
      dailyRate: underRequestEmployees.dailyRate,
      isActive: underRequestEmployees.isActive,
      notes: underRequestEmployees.notes,
    }).from(underRequestEmployees)
      .where(tenantWhere(underRequestEmployees, f.tenantId))
      .orderBy(underRequestEmployees.name);
    return rows.map((r) => ({
      name: r.name,
      phone: r.phone || "",
      dailyRate: Number(r.dailyRate),
      isActive: r.isActive ? "نعم" : "لا",
      notes: r.notes || "",
    }));
  },
  "hrreports-employeeslist": async (db, f) => {
    const rows = await db.select({
      code: employees.code,
      name: employees.name,
      phone: employees.phone,
      status: employees.status,
      basicSalary: employees.basicSalary,
    }).from(employees).where(tenantWhere(employees, f.tenantId)).orderBy(employees.name);
    return rows.map((r) => ({
      code: r.code || "",
      name: r.name,
      phone: r.phone || "",
      status: r.status,
      basicSalary: Number(r.basicSalary),
    }));
  },
  "hrreports-loans-list": async (db, f) => {
    const rows = await db.select({
      date: salaryAdvances.date,
      amount: salaryAdvances.amount,
      status: salaryAdvances.status,
      employeeName: employees.name,
    }).from(salaryAdvances)
      .innerJoin(employees, eq(salaryAdvances.employeeId, employees.id))
      .where(tenantWhere(salaryAdvances, f.tenantId))
      .orderBy(desc(salaryAdvances.date));
    return rows.map((r) => ({
      date: toDateStr(r.date),
      employeeName: r.employeeName,
      amount: Number(r.amount),
      status: r.status,
    }));
  },
};

export const HR_REPORT_SLUGS = Object.keys(HANDLERS);

export async function runHrReport(db: Db, slug: string, filters: ReportFilters) {
  const handler = HANDLERS[slug];
  if (!handler) return [{ message: "التقرير غير موجود", slug }];
  return handler(db, filters);
}
