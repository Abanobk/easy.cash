/** خيارات المخزن حسب الفرع — مع مخازن بلا فرع (شائعة بعد الاستيراد) حتى لا يفضى البحث */
export function warehousesForBranch<T extends { id: number | string; branchId?: number | string | null; name: string; branchName?: string | null }>(
  warehouses: T[] | null | undefined,
  branchId?: string | number | null,
): { id: T["id"]; label: string }[] {
  const all = warehouses || [];
  const toOpt = (w: T) => ({
    id: w.id,
    label: w.branchName ? `${w.name} (${w.branchName})` : w.name,
  });
  if (branchId == null || branchId === "") return all.map(toOpt);

  const branchKey = String(branchId);
  const forBranch = all.filter((w) => String(w.branchId ?? "") === branchKey);
  const shared = all.filter((w) => w.branchId == null || w.branchId === "");
  const seen = new Set<string>();
  const combined: T[] = [];
  for (const w of [...forBranch, ...shared]) {
    const key = String(w.id);
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(w);
  }
  return (combined.length > 0 ? combined : all).map(toOpt);
}
