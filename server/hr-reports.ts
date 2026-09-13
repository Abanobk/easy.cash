import type { Db } from "./db";
import { and, desc, eq, gte, like, lte, or } from "drizzle-orm";
import {
  attendance,
  departments,
  employees,
  employeeVacationRecords,
  hrVacations,
  jobTitles,
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

function num(v: unknown) {
  return Number(v ?? 0);
}

function employeeSearchCond(filters: ReportFilters) {
  if (!filters.search?.trim()) return undefined;
  const q = `%${filters.search.trim()}%`;
  return or(like(employees.name, q), like(employees.code, q));
}

function parseWorkHours(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) return 0;
  const [ih, im] = checkIn.split(":").map(Number);
  const [oh, om] = checkOut.split(":").map(Number);
  if ([ih, im, oh, om].some((n) => Number.isNaN(n))) return 0;
  const mins = (oh * 60 + om) - (ih * 60 + im);
  return mins > 0 ? Number((mins / 60).toFixed(2)) : 0;
}

const PAYROLL_STATUS: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
  paid: "مدفوع",
  pending: "قيد الانتظار",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

export type ReportRow = Record<string, unknown>;

const HANDLERS: Record<string, (db: Db, f: ReportFilters) => Promise<ReportRow[]>> = {
  "hrreports-attendance": async (db, f) => {
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(attendance.date, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(attendance.date, f.dateTo as any));
    const searchCond = employeeSearchCond(f);
    const rows = await db.select({
      date: attendance.date,
      checkIn: attendance.checkIn,
      checkOut: attendance.checkOut,
      status: attendance.status,
      overtime: attendance.overtime,
      employeeName: employees.name,
    }).from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .where(tenantWhere(attendance, f.tenantId,
        dateParts.length ? and(...dateParts) : undefined,
        searchCond))
      .orderBy(desc(attendance.date));
    return rows.map((r) => {
      const workHours = parseWorkHours(r.checkIn, r.checkOut);
      const isLeave = r.status === "leave";
      const isHoliday = r.status === "holiday";
      const isAbsent = r.status === "absent";
      const isLate = r.status === "late";
      return {
        date: toDateStr(r.date),
        checkInTime: r.checkIn || "",
        checkOutTime: r.checkOut || "",
        workHours,
        permissionHours: 0,
        missionPermissionHours: 0,
        delayHours: isLate ? 1 : 0,
        overtimeHours: num(r.overtime),
        unknownHours: 0,
        noCheckIn: r.checkIn ? 0 : 1,
        noCheckOut: r.checkOut ? 0 : 1,
        workOnLeave: 0,
        absenceMission: 0,
        vacationDays: isLeave ? 1 : 0,
        partialVacationDays: r.status === "half_day" ? 1 : 0,
        weeklyVacationDays: 0,
        officialVacationDays: isHoliday ? 1 : 0,
        _employeeName: r.employeeName,
        _absent: isAbsent ? 1 : 0,
      };
    });
  },
  "hrreports-employeesvactions": async (db, f) => {
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(employeeVacationRecords.startDate, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(employeeVacationRecords.endDate, f.dateTo as any));
    const searchCond = employeeSearchCond(f);
    const rows = await db.select({
      startDate: employeeVacationRecords.startDate,
      endDate: employeeVacationRecords.endDate,
      status: employeeVacationRecords.status,
      employeeName: employees.name,
      vacationType: hrVacations.name,
    }).from(employeeVacationRecords)
      .innerJoin(employees, eq(employeeVacationRecords.employeeId, employees.id))
      .leftJoin(hrVacations, eq(employeeVacationRecords.vacationTypeId, hrVacations.id))
      .where(tenantWhere(employeeVacationRecords, f.tenantId,
        dateParts.length ? and(...dateParts) : undefined,
        searchCond))
      .orderBy(desc(employeeVacationRecords.startDate));
    return rows.map((r) => ({
      vacationType: r.vacationType || "",
      startDate: toDateStr(r.startDate),
      endDate: toDateStr(r.endDate),
      approved: r.status === "approved" ? "نعم" : "لا",
      _employeeName: r.employeeName,
    }));
  },
  "hrreports-employeespayroll": async (db, f) => {
    const rows = await db.select({
      month: payroll.month,
      year: payroll.year,
      basicSalary: payroll.basicSalary,
      allowances: payroll.allowances,
      deductions: payroll.deductions,
      advances: payroll.advances,
      tax: payroll.tax,
      netSalary: payroll.netSalary,
      employeeName: employees.name,
      jobTitle: jobTitles.name,
    }).from(payroll)
      .innerJoin(employees, eq(payroll.employeeId, employees.id))
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .where(tenantWhere(payroll, f.tenantId, employeeSearchCond(f)))
      .orderBy(desc(payroll.year), desc(payroll.month), employees.name);

    const out: ReportRow[] = [];
    for (const r of rows) {
      const period = `${r.month}/${r.year}`;
      const fields: [string, string | number][] = [
        ["الراتب الأساسي:", num(r.basicSalary)],
        ["الوظيفة:", r.jobTitle || ""],
        ["فترة العمل الإضافي:", ""],
        ["قيمة زيادة العمل الإضافي:", num(r.allowances)],
        ["فترة التأخير:", ""],
        ["قيمة خصم التأخير:", 0],
        ["فترة الاستئذان:", ""],
        ["قيمة خصم الاستئذان:", 0],
        ["ايام الغياب:", 0],
        ["قيمة خصم الغياب:", num(r.deductions)],
        ["ايام عمل بالخصم:", 0],
        ["قيمة عمل بالخصم:", 0],
        ["ايام الاجازات بالخصم:", 0],
        ["قيمة الاجازات بالخصم:", 0],
        ["ايام عمل بالاجازات الرسمية:", 0],
        ["قيمة العمل بالاجازات الرسمية:", 0],
        ["قيمة البدلات:", num(r.allowances)],
        ["قيمة الحوافز:", 0],
        ["قيمة السلف:", num(r.advances)],
        ["قيمة خصم العقوبات:", 0],
        ["قيمة التأمينات:", 0],
        ["قيمة خصومات أخرى:", num(r.deductions)],
        ["قيمة الضرائب:", num(r.tax)],
        ["قيمة زيادات أخرى:", 0],
        ["صافى الراتب:", num(r.netSalary)],
        ["التوقيع:", ""],
      ];
      out.push({ lineLabel: `— ${r.employeeName} (${period}) —`, value: "" });
      for (const [label, value] of fields) {
        out.push({ lineLabel: label, value: String(value ?? "") });
      }
    }
    return out;
  },
  "hrreports-employeespayroll-list": async (db, f) => {
    const rows = await db.select({
      basicSalary: payroll.basicSalary,
      allowances: payroll.allowances,
      deductions: payroll.deductions,
      advances: payroll.advances,
      tax: payroll.tax,
      netSalary: payroll.netSalary,
      employeeName: employees.name,
      jobTitle: jobTitles.name,
      departmentName: departments.name,
    }).from(payroll)
      .innerJoin(employees, eq(payroll.employeeId, employees.id))
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(tenantWhere(payroll, f.tenantId, employeeSearchCond(f)))
      .orderBy(departments.name, employees.name);
    return rows.map((r) => ({
      name: r.jobTitle ? `${r.employeeName} (${r.jobTitle})` : r.employeeName,
      basicSalary: num(r.basicSalary),
      advances: num(r.advances),
      workWithDeduction: 0,
      tax: num(r.tax),
      insurance: 0,
      penaltyDeduction: 0,
      lateDeduction: 0,
      permissionDeduction: 0,
      absenceDeduction: num(r.deductions),
      otherDeductions: 0,
      vacationWithDeduction: 0,
      overtimeIncrease: num(r.allowances),
      holidayWork: 0,
      incentives: 0,
      otherIncreases: 0,
      allowances: num(r.allowances),
      netSalary: num(r.netSalary),
      _departmentName: r.departmentName || "",
    }));
  },
  "hrreports-employeesunderrequest": async (db, f) => {
    const search = f.search?.trim();
    const rows = await db.select({
      name: underRequestEmployees.name,
      phone: underRequestEmployees.phone,
      notes: underRequestEmployees.notes,
    }).from(underRequestEmployees)
      .where(tenantWhere(underRequestEmployees, f.tenantId,
        search ? like(underRequestEmployees.name, `%${search}%`) : undefined))
      .orderBy(underRequestEmployees.name);
    return rows.map((r) => ({
      name: r.name,
      nationalId: "",
      jobTitle: "",
      qualityTestResult: "",
      speedTestResult: "",
      testDate: "",
      phone: r.phone || "",
      alternatePhone: "",
      _notes: r.notes || "",
    }));
  },
  "hrreports-employeeslist": async (db, f) => {
    const rows = await db.select({
      name: employees.name,
      code: employees.code,
      nationalId: employees.nationalId,
      basicSalary: employees.basicSalary,
      hireDate: employees.hireDate,
      birthDate: employees.birthDate,
      phone: employees.phone,
      status: employees.status,
      jobTitle: jobTitles.name,
      departmentName: departments.name,
    }).from(employees)
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(tenantWhere(employees, f.tenantId, employeeSearchCond(f)))
      .orderBy(departments.name, employees.name);

    const out: ReportRow[] = [];
    for (const r of rows) {
      const fields: [string, string | number][] = [
        ["الراتب الاساسي:", num(r.basicSalary)],
        ["التامينات:", 0],
        ["العملة:", "ج.م"],
        ["تاريخ الميلاد:", r.birthDate ? toDateStr(r.birthDate) : ""],
        ["الرقم القومي:", r.nationalId || ""],
        ["الموقف التجنيدي:", ""],
        ["الحالة الاجتماعية:", ""],
        ["الديانة:", ""],
        ["الجنسية:", ""],
        ["فترة العمل:", ""],
        ["تاريخ التعيين:", r.hireDate ? toDateStr(r.hireDate) : ""],
        ["الفرع:", ""],
        ["الوظيفة:", r.jobTitle || ""],
        ["الاجازات الاعتيادي:", ""],
        ["رقم ماكينة البصمة:", r.code || ""],
        ["الاجازات العارضة:", ""],
        ["تاريخ انهاء الخدمة:", r.status === "terminated" ? "" : ""],
        ["سبب انهاء الخدمة:", ""],
      ];
      out.push({ lineLabel: `— ${r.name} —`, value: r.departmentName || "" });
      for (const [label, value] of fields) {
        out.push({ lineLabel: label, value: String(value ?? "") });
      }
    }
    return out;
  },
  "hrreports-loans-list": async (db, f) => {
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(salaryAdvances.date, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(salaryAdvances.date, f.dateTo as any));
    const searchCond = employeeSearchCond(f);
    const rows = await db.select({
      id: salaryAdvances.id,
      date: salaryAdvances.date,
      amount: salaryAdvances.amount,
      status: salaryAdvances.status,
      reason: salaryAdvances.reason,
      employeeName: employees.name,
      departmentName: departments.name,
    }).from(salaryAdvances)
      .innerJoin(employees, eq(salaryAdvances.employeeId, employees.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(tenantWhere(salaryAdvances, f.tenantId,
        dateParts.length ? and(...dateParts) : undefined,
        searchCond))
      .orderBy(desc(salaryAdvances.date));
    return rows.map((r) => ({
      serial: r.id,
      branchName: "",
      date: toDateStr(r.date),
      startDate: toDateStr(r.date),
      amount: num(r.amount),
      creditAccount: "",
      installmentCount: "",
      installmentStatus: PAYROLL_STATUS[String(r.status)] || String(r.status),
      notes: r.reason || "",
      _employeeName: r.employeeName,
      _departmentName: r.departmentName || "",
    }));
  },
};

export const HR_REPORT_SLUGS = Object.keys(HANDLERS);

export async function runHrReport(db: Db, slug: string, filters: ReportFilters) {
  const handler = HANDLERS[slug];
  if (!handler) return [{ message: "التقرير غير موجود", slug }];
  return handler(db, filters);
}
