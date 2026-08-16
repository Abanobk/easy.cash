import { CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

export const LIVE_UNIFIED_CARD_INTEGRATION_ID = 5084536;
export const LEGACY_PAYMOB_CARD_IDS = [4310645, 5126391] as const;

export function isLegacyPaymobCardId(id: string | number): boolean {
  const n = typeof id === "string" ? Number(id) : id;
  return (LEGACY_PAYMOB_CARD_IDS as readonly number[]).includes(n);
}

export function cardIntegrationNeedsFix(rows: PaymentMethodFormRow[], mode: string): boolean {
  if (mode !== "live") return false;
  const card = rows.find((r) => r.methodType === "card");
  if (!card?.isEnabled || !card.integrationId.trim()) return false;
  return isLegacyPaymobCardId(card.integrationId);
}

export type PaymentMethodFormRow = {
  methodType: "card" | "wallet";
  integrationId: string;
  isEnabled: boolean;
  labelAr: string;
};

export const DEFAULT_PAYMENT_METHOD_ROWS: PaymentMethodFormRow[] = [
  { methodType: "card", integrationId: "", isEnabled: true, labelAr: "بطاقة ائتمان" },
  { methodType: "wallet", integrationId: "", isEnabled: false, labelAr: "محفظة إلكترونية" },
];

export function paymentMethodsFromServer(
  rows?: Array<{ methodType: "card" | "wallet"; integrationId: number; isEnabled: boolean; labelAr: string }>,
): PaymentMethodFormRow[] {
  if (!rows?.length) return DEFAULT_PAYMENT_METHOD_ROWS.map((r) => ({ ...r }));
  return rows.map((r) => ({
    methodType: r.methodType,
    integrationId: r.integrationId > 0 ? String(r.integrationId) : "",
    isEnabled: r.isEnabled,
    labelAr: r.labelAr,
  }));
}

export function paymentMethodsToPayload(rows: PaymentMethodFormRow[]) {
  return rows.map((r) => ({
    methodType: r.methodType,
    integrationId: r.integrationId.trim() ? Number(r.integrationId) : 0,
    isEnabled: r.isEnabled,
  }));
}

type Props = {
  rows: PaymentMethodFormRow[];
  editable?: boolean;
  mode?: string;
  onChange?: (rows: PaymentMethodFormRow[]) => void;
};

export default function PaymobPaymentMethodsTable({ rows, editable, mode = "live", onChange }: Props) {
  const update = (index: number, patch: Partial<PaymentMethodFormRow>) => {
    if (!onChange) return;
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-right px-3 py-2 font-medium">نوع الدفع</th>
            <th className="text-right px-3 py-2 font-medium">رقم التكامل</th>
            <th className="text-center px-3 py-2 font-medium w-20">مفعّل</th>
            <th className="text-center px-3 py-2 font-medium w-16">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const legacyCard = row.methodType === "card" && isLegacyPaymobCardId(row.integrationId);
            const ok = row.methodType === "wallet"
              ? row.isEnabled
              : row.isEnabled && row.integrationId.trim().length > 0 && !legacyCard;
            return (
              <tr key={row.methodType} className="border-t border-slate-100">
                <td className="px-3 py-3 font-medium text-slate-800">{row.labelAr}</td>
                <td className="px-3 py-3">
                  {editable ? (
                    <Input
                      value={row.integrationId}
                      onChange={(e) => update(index, { integrationId: e.target.value.replace(/\D/g, "") })}
                      placeholder={row.methodType === "card" ? "5084536" : "4310646 (مرجع)"}
                      dir="ltr"
                      className={`font-mono h-9 ${legacyCard ? "border-red-400 ring-1 ring-red-200" : ""}`}
                      autoComplete="off"
                    />
                  ) : (
                    <span className={`font-mono ${legacyCard ? "text-red-600 font-semibold" : "text-slate-800"}`} dir="ltr">
                      {row.integrationId || "—"}
                    </span>
                  )}
                  {legacyCard && mode === "live" && (
                    <p className="text-[11px] text-red-600 mt-1">رقم قديم — استخدم {LIVE_UNIFIED_CARD_INTEGRATION_ID}</p>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={row.isEnabled}
                      onChange={(e) => update(index, { isEnabled: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                  ) : (
                    <span className="text-xs text-slate-600">{row.isEnabled ? "نعم" : "لا"}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  {ok ? (
                    <CheckCircle2 size={18} className="text-green-600 inline" />
                  ) : (
                    <XCircle size={18} className="text-slate-300 inline" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-100 leading-relaxed">
        <strong>البطاقة:</strong> رقم التكامل <strong>5084536</strong> (MIGS-online) — مطلوب لـ Unified Checkout.
        <strong> المحفظة:</strong> فعّل الصف فقط؛ النظام يرسل <code className="text-[11px] bg-slate-200 px-1 rounded">wallet</code> لـ Paymob (رقم 4310646 في الجدول للمرجع فقط).
        لا تستخدم <strong>4310645</strong> للبطاقة — رقم API قديم.
      </p>
    </div>
  );
}
