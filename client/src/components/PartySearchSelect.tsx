import { useMemo } from "react";
import { SearchSelect } from "@/components/SearchSelect";

export type PartyOption = {
  id: number;
  name: string;
  code?: string | null;
  phone?: string | null;
};

/**
 * قائمة بحث ذكي لعميل/مورد — نفس شكل البيانات (id/name/code/phone) لأي طرف (party).
 * اكتب اسم أو كود أو رقم تليفون وهيرشّح فوراً بدل لستة تمرير طويلة.
 */
export function PartySearchSelect({
  parties, value, onChange, placeholder = "ابحث بالاسم أو الكود أو التليفون...",
  excludeId,
}: {
  parties: PartyOption[]; value: string; onChange: (id: string) => void;
  placeholder?: string; excludeId?: string;
}) {
  const options = useMemo(() => parties.map((p) => ({
    id: p.id,
    label: p.code ? `${p.code} — ${p.name}` : p.name,
    sublabel: p.phone || undefined,
    keywords: p.phone || "",
  })), [parties]);

  return (
    <SearchSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      excludeId={excludeId}
      emptyLabel="لا نتائج"
    />
  );
}
