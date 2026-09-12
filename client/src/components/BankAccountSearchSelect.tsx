import { useMemo } from "react";
import { SearchSelect } from "@/components/SearchSelect";
import { formatBankAccountLabel } from "@/lib/bank-label";

export type BankAccountOption = {
  id: number;
  name: string;
  bankName?: string | null;
  accountNumber?: string | null;
};

/**
 * قائمة بحث ذكي لحساب بنكي — بحث باسم الحساب أو اسم البنك أو رقم الحساب.
 * بتستخدم نفس تنسيق التسمية الموحّد (formatBankAccountLabel) المستخدم في باقي الشاشة.
 */
export function BankAccountSearchSelect({
  accounts, value, onChange, placeholder = "ابحث باسم الحساب أو البنك أو رقم الحساب...",
  excludeId,
}: {
  accounts: BankAccountOption[]; value: string; onChange: (id: string) => void;
  placeholder?: string; excludeId?: string;
}) {
  const options = useMemo(() => accounts.map((a) => ({
    id: a.id,
    label: formatBankAccountLabel(a),
    keywords: a.accountNumber || "",
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
