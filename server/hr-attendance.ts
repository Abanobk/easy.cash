import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import { attendance, employees, fingerprintMachines, machinePunches } from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";
import { fetchZktecoAttendances, testZktecoConnection } from "./hr-zkteco";

export type PunchRow = { enrollCode: string; punchedAt: Date };

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parsePunchCsv(text: string): PunchRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const first = lines[0].split(/[,;\t]/).map((s) => s.trim().toLowerCase());
  const hasHeader = first.some((c) => c.includes("enroll") || c.includes("code") || c.includes("date") || c.includes("time"));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: PunchRow[] = [];
  for (const line of dataLines) {
    const parts = line.split(/[,;\t]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const enrollCode = parts[0];
    const punchedAt = new Date(parts.slice(1).join(" ").replace(/\//g, "-"));
    if (Number.isNaN(punchedAt.getTime())) continue;
    rows.push({ enrollCode: enrollCode.trim(), punchedAt });
  }
  return rows;
}

function timeOnlyFromDate(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dateOnlyFromDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export async function upsertDailyAttendance(
  db: MySql2Database<Record<string, never>>,
  tenantId: number,
  data: {
    employeeId: number;
    date: string;
    checkIn?: string;
    checkOut?: string;
    status?: string;
    source?: string;
    machineId?: number;
    notes?: string;
  },
) {
  const [existing] = await db.select().from(attendance).where(
    tenantWhere(attendance, tenantId, and(eq(attendance.employeeId, data.employeeId), eq(attendance.date, data.date as any))),
  );
  const payload = {
    employeeId: data.employeeId,
    date: data.date,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    status: (data.status || "present") as "present",
    source: data.source || "manual",
    machineId: data.machineId,
    notes: data.notes,
  };
  if (existing) {
    await db.update(attendance).set({
      checkIn: payload.checkIn ?? existing.checkIn,
      checkOut: payload.checkOut ?? existing.checkOut,
      status: payload.status as any,
      source: payload.source,
      machineId: payload.machineId ?? existing.machineId,
      notes: payload.notes ?? existing.notes,
    }).where(eq(attendance.id, existing.id));
    return existing.id;
  }
  const [res] = await db.insert(attendance).values(withTenantId(tenantId, payload) as any);
  return (res as { insertId: number }).insertId;
}

async function loadEnrollMap(db: MySql2Database<Record<string, never>>, tenantId: number) {
  const empRows = await db.select({ id: employees.id, code: employees.code }).from(employees)
    .where(tenantWhere(employees, tenantId));
  const enrollMap = new Map<string, number>();
  for (const e of empRows) {
    if (e.code) enrollMap.set(String(e.code).trim(), e.id);
  }
  return enrollMap;
}

export async function ingestMachinePunchRows(
  db: MySql2Database<Record<string, never>>,
  tenantId: number,
  machineId: number,
  rows: PunchRow[],
  source: "machine" | "machine-tcp" = "machine",
) {
  const enrollMap = await loadEnrollMap(db, tenantId);
  let imported = 0;
  let skipped = 0;
  let aggregated = 0;
  const dayMap = new Map<string, { employeeId: number; punches: Date[] }>();

  for (const row of rows) {
    const enrollCode = row.enrollCode.trim();
    const employeeId = enrollMap.get(enrollCode);
    if (Number.isNaN(row.punchedAt.getTime())) {
      skipped++;
      continue;
    }

    const [dup] = await db.select({ id: machinePunches.id }).from(machinePunches).where(
      tenantWhere(machinePunches, tenantId, and(
        eq(machinePunches.machineId, machineId),
        eq(machinePunches.enrollCode, enrollCode),
        eq(machinePunches.punchedAt, row.punchedAt),
      )),
    );

    if (!dup) {
      await db.insert(machinePunches).values(withTenantId(tenantId, {
        machineId,
        enrollCode,
        employeeId: employeeId ?? null,
        punchedAt: row.punchedAt,
        processed: false,
      }) as any);
      imported++;
    } else {
      skipped++;
    }

    if (!employeeId) continue;
    const day = dateOnlyFromDate(row.punchedAt);
    const key = `${employeeId}|${day}`;
    const entry = dayMap.get(key) || { employeeId, punches: [] };
    entry.punches.push(row.punchedAt);
    dayMap.set(key, entry);
  }

  for (const [, entry] of dayMap) {
    const sorted = entry.punches.sort((a, b) => a.getTime() - b.getTime());
    const day = dateOnlyFromDate(sorted[0]);
    await upsertDailyAttendance(db, tenantId, {
      employeeId: entry.employeeId,
      date: day,
      checkIn: timeOnlyFromDate(sorted[0]),
      checkOut: sorted.length > 1 ? timeOnlyFromDate(sorted[sorted.length - 1]) : undefined,
      status: "present",
      source,
      machineId,
    });
    aggregated++;
  }

  await db.update(fingerprintMachines).set({ lastSyncAt: new Date() })
    .where(tenantWhere(fingerprintMachines, tenantId, eq(fingerprintMachines.id, machineId)));

  const unmapped = new Set(rows.filter((r) => !enrollMap.has(r.enrollCode.trim())).map((r) => r.enrollCode)).size;
  return { imported, skipped, aggregated, unmapped };
}

export async function syncMachinePunches(
  db: MySql2Database<Record<string, never>>,
  tenantId: number,
  machineId: number,
  csvText: string,
) {
  const parsed = parsePunchCsv(csvText);
  return ingestMachinePunchRows(db, tenantId, machineId, parsed, "machine");
}

async function loadMachine(db: MySql2Database<Record<string, never>>, tenantId: number, machineId: number) {
  const [machine] = await db.select().from(fingerprintMachines)
    .where(tenantWhere(fingerprintMachines, tenantId, eq(fingerprintMachines.id, machineId)));
  if (!machine) throw new TRPCError({ code: "NOT_FOUND", message: "الماكينة غير موجودة" });
  if (!machine.ipAddress) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب إدخال عنوان IP للماكينة" });
  return machine;
}

export async function syncMachineFromTcp(
  db: MySql2Database<Record<string, never>>,
  tenantId: number,
  machineId: number,
  opts: { fullSync?: boolean } = {},
) {
  const machine = await loadMachine(db, tenantId, machineId);
  const since = !opts.fullSync && machine.lastSyncAt ? new Date(machine.lastSyncAt) : null;

  let fetched;
  try {
    fetched = await fetchZktecoAttendances({
      ip: machine.ipAddress!,
      port: machine.port ?? 4370,
      commKey: machine.commKey ?? 0,
      since,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "فشل الاتصال بالماكينة";
    throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر الاتصال بجهاز ZKTeco: ${msg}` });
  }

  const result = await ingestMachinePunchRows(db, tenantId, machineId, fetched.punches, "machine-tcp");
  return {
    ...result,
    totalOnDevice: fetched.totalOnDevice,
    fetched: fetched.punches.length,
    deviceInfo: fetched.deviceInfo,
  };
}

export async function testMachineTcpConnection(
  db: MySql2Database<Record<string, never>>,
  tenantId: number,
  machineId: number,
) {
  const machine = await loadMachine(db, tenantId, machineId);
  try {
    const info = await testZktecoConnection({
      ip: machine.ipAddress!,
      port: machine.port ?? 4370,
      commKey: machine.commKey ?? 0,
    });
    return { ok: true as const, info };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "فشل الاتصال";
    throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر الاتصال: ${msg}` });
  }
}

export function isInsideGeofence(
  lat: number,
  lng: number,
  locations: { latitude: string | null; longitude: string | null; radiusMeters: number | null }[],
) {
  if (!locations.length) return true;
  for (const loc of locations) {
    const la = Number(loc.latitude);
    const lo = Number(loc.longitude);
    const r = Number(loc.radiusMeters || 100);
    if (Number.isNaN(la) || Number.isNaN(lo)) continue;
    if (haversineMeters(lat, lng, la, lo) <= r) return true;
  }
  return false;
}
