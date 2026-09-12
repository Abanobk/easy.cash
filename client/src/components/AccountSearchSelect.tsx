import { useMemo } from "react";
import { SearchSelect } from "@/components/SearchSelect";

export type AccountOption = {
  id: number;
  name: string;
  code?: string | null;
};

/** قائمة بحث ذكي لحساب من دليل الحسابات — بحث بالكود أو الاسم بدل لستة طويلة. */
export function AccountSearchSelect({
  accounts, value, onChange, placeholder = "ابحث بالكود أو اسم الحساب...",
  excludeId,
}: {
  accounts: AccountOption[]; value: string; onChange: (id: string) => void;
  placeholder?: string; excludeId?: string;
}) {
  const options = useMemo(() => accounts.map((a) => ({
    id: a.id,
    label: a.code ? `${a.code} — ${a.name}` : a.name,
  })), [accounts]);

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
