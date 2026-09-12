import { useMemo } from "react";
import { SearchSelect } from "@/components/SearchSelect";

export type ItemSearchOption = {
  id: number;
  name: string;
  code?: string | null;
  barcode?: string | null;
  unit?: string | null;
  currentStock?: string | number | null;
};

function fmtStock(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/**
 * قائمة بحث ذكي للصنف — واجهة رقيقة فوق SearchSelect العامة، بتحافظ على شكل عرض
 * الصنف (كود + اسم + رصيد بالوحدة) والفلترة بالباركود اللي كانت هنا أصلاً.
 */
export function ItemSearchSelect({
  items, value, onChange, placeholder = "ابحث بالكود أو الاسم أو الباركود...",
  excludeId,
}: {
  items: ItemSearchOption[]; value: string; onChange: (id: string) => void;
  placeholder?: string; excludeId?: string;
}) {
  const options = useMemo(() => items.map((i) => ({
    id: i.id,
    label: i.code ? `${i.code} — ${i.name}` : i.name,
    sublabel: `رصيد: ${fmtStock(Number(i.currentStock || 0))}${i.unit ? ` ${i.unit}` : ""}`,
    keywords: i.barcode || "",
  })), [items]);

  return (
    <SearchSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      excludeId={excludeId}
    />
  );
}
