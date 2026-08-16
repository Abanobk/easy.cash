import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/** نفس Easy Shop: يرسل كل باراميترات رجوع Paymob للسيرفر */
export function usePaymobReturnConfirm(onActivated?: () => void) {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const isReturn = params.get("payment") === "return";
  const paymentIdRaw = params.get("paymentId");
  const paymentId = paymentIdRaw ? Number(paymentIdRaw) : null;
  const confirmed = useRef(false);
  const onActivatedRef = useRef(onActivated);
  onActivatedRef.current = onActivated;
  const utils = trpc.useUtils();
  const [returnStatus, setReturnStatus] = useState<string | undefined>();

  const paymentStatusQuery = trpc.saas.getPaymentStatus.useQuery(
    { paymentId: paymentId! },
    {
      enabled: isReturn && !!paymentId,
      refetchInterval: (q) => (q.state.data?.status === "pending" ? 3000 : false),
    },
  );

  useEffect(() => {
    if (!isReturn || !paymentId || confirmed.current) return;
    if (paymentStatusQuery.data?.status === "paid") {
      confirmed.current = true;
      setReturnStatus("paid");
      return;
    }

    confirmed.current = true;
    const payload = Object.fromEntries(params.entries());

    fetch("/api/payments/paymob/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "تعذر تأكيد الدفع");
        setReturnStatus(data.status);
        if (data.status === "paid") {
          toast.success(data.message || "تم الدفع وتفعيل الاشتراك");
          utils.saas.me.invalidate();
          paymentStatusQuery.refetch();
          onActivatedRef.current?.();
        } else if (data.status === "failed") {
          toast.error(data.message || "فشل الدفع");
        } else if (data.status === "waiting_webhook") {
          toast.message(data.message || "بانتظار تأكيد Paymob...");
        }
      })
      .catch((e: Error) => {
        toast.error(e.message);
        setReturnStatus("failed");
      });
  }, [isReturn, paymentId, paymentStatusQuery.data?.status, params, utils.saas.me, paymentStatusQuery]);

  const paymentStatus = paymentStatusQuery.data?.status || returnStatus;

  return {
    isReturn,
    paymentId,
    paymentStatus,
    isConfirming: isReturn && paymentStatus !== "paid" && paymentStatus !== "failed",
  };
}
