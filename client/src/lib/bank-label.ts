/** تسمية موحّدة للحساب البنكي في القوائم المنسدلة */
export function formatBankAccountLabel(b: {
  name?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
}): string {
  const name = (b.name || "").trim();
  const bankName = (b.bankName || "").trim();
  const accountNumber = (b.accountNumber || "").trim();
  const parts: string[] = [];
  if (name) parts.push(name);
  if (bankName && bankName !== name) parts.push(bankName);
  let label = parts.join(" — ") || "حساب بنكي";
  if (accountNumber && accountNumber !== name) label += ` (${accountNumber})`;
  return label;
}
