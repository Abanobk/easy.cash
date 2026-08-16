import { usePaymobReturnConfirm } from "@/lib/paymob-return";
import { getTenantSlugFromPath, tenantPath } from "@/lib/tenant";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useEffect } from "react";

/** يعالج رجوع Paymob من أي صفحة (مثل Easy Shop) */
export default function PaymentReturnHost() {
  const [location, navigate] = useLocation();
  const tenantSlug = getTenantSlugFromPath(location);

  const { isReturn, paymentStatus } = usePaymobReturnConfirm(() => {
    if (tenantSlug) {
      setTimeout(() => navigate(tenantPath(tenantSlug, "/dashboard")), 1500);
    }
  });

  useEffect(() => {
    if (!isReturn) return;
    if (paymentStatus === "paid") {
      toast.success("تم تفعيل اشتراكك بنجاح");
    }
  }, [isReturn, paymentStatus]);

  return null;
}
