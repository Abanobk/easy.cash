import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

export type SelectOption = { value: string; label: string };

export function useEmployeeOptions() {
  const q = trpc.hr.employees.list.useQuery({ page: 1, limit: 500 });
  return useMemo(
    () =>
      (q.data?.rows || []).map((e: { id: number; name: string; code?: string | null }) => ({
        value: String(e.id),
        label: e.code ? `${e.code} — ${e.name}` : e.name,
      })),
    [q.data],
  );
}

export function useItemOptions() {
  const q = trpc.items.list.useQuery({ page: 1, limit: 500 });
  return useMemo(
    () =>
      (q.data?.rows || []).map((i: { id: number; name: string; code?: string | null; unit?: string | null }) => ({
        value: String(i.id),
        label: [
          i.code ? String(i.code) : null,
          i.name,
          i.unit ? `(${i.unit})` : null,
        ].filter(Boolean).join(" — "),
      })),
    [q.data],
  );
}

export function useWarehouseOptions() {
  const q = trpc.warehouses.list.useQuery();
  return useMemo(
    () => (q.data || []).map((w: { id: number; name: string }) => ({ value: String(w.id), label: w.name })),
    [q.data],
  );
}

export function useAssetOptions(status?: "active" | "disposed" | "under_maintenance") {
  const q = trpc.assets.list.useQuery({ page: 1, limit: 500, status });
  return useMemo(
    () =>
      (q.data?.rows || []).map((a: { id: number; name: string; code?: string | null }) => ({
        value: String(a.id),
        label: a.code ? `${a.code} — ${a.name}` : a.name,
      })),
    [q.data],
  );
}

export function useDepartmentOptions() {
  const q = trpc.hr.departments.list.useQuery();
  return useMemo(
    () => (q.data || []).map((d: { id: number; name: string }) => ({ value: String(d.id), label: d.name })),
    [q.data],
  );
}

export function useShiftOptions() {
  const q = trpc.parity.hr.shifts.list.useQuery();
  return useMemo(
    () => (q.data || []).map((s: Record<string, unknown>) => ({ value: String(s.id), label: String(s.name) })),
    [q.data],
  );
}

export function useVacationTypeOptions() {
  const q = trpc.parity.hr.vacations.list.useQuery();
  return useMemo(
    () => (q.data || []).map((v: Record<string, unknown>) => ({ value: String(v.id), label: String(v.name) })),
    [q.data],
  );
}

export function useHrSystemOptions() {
  const q = trpc.parity.hr.systems.list.useQuery();
  return useMemo(
    () => (q.data || []).map((s: Record<string, unknown>) => ({ value: String(s.id), label: String(s.name) })),
    [q.data],
  );
}
