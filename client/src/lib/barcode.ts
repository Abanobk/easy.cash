/** مطابقة صنف بمسح الباركود أو كتابته يدويًا — نفس منطق مطابقة الأصناف في شاشة الصنف وشاشة الإنتاج، بس مشترك بدل ما يتكرر في كل شاشة */
export interface BarcodeItemOpt {
  id: number;
  name: string;
  barcode?: string | null;
  code?: string | null;
}

export function findItemByScan<T extends BarcodeItemOpt>(catalog: T[], raw: string): T | undefined {
  const q = raw.trim().toLowerCase();
  if (!q) return undefined;
  return catalog.find((i) => {
    const bc = String(i.barcode || "").trim().toLowerCase();
    const code = String(i.code || "").trim().toLowerCase();
    return bc === q || code === q || String(i.id) === q;
  }) || catalog.find((i) => {
    const bc = String(i.barcode || "").trim().toLowerCase();
    const code = String(i.code || "").trim().toLowerCase();
    return (bc && bc.includes(q)) || (code && code.includes(q)) || i.name.toLowerCase().includes(q);
  });
}
