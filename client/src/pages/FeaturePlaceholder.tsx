import { useEffect } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { FEATURE_REGISTRY, FeatureStatus } from "@/config/erp-navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Construction, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { tenantPath, getTenantSlugFromPath } from "@/lib/tenant";

const STATUS_LABEL: Record<FeatureStatus, string> = {
  done: "جاهز",
  partial: "جزئي",
  missing: "قيد التطوير",
};

const STATUS_VARIANT: Record<FeatureStatus, "default" | "secondary" | "outline"> = {
  done: "default",
  partial: "secondary",
  missing: "outline",
};

export default function FeaturePlaceholder() {
  const tenantSlug = getTenantSlugFromPath();
  const [location, navigate] = useLocation();
  const featureKey = (() => {
    const parts = location.split("/").filter(Boolean);
    const featuresIdx = parts.indexOf("features");
    if (featuresIdx >= 0 && parts[featuresIdx + 1]) return parts[featuresIdx + 1];
    const reportsIdx = parts.indexOf("reports");
    if (reportsIdx >= 0 && parts[reportsIdx + 2]) return parts[reportsIdx + 2];
    return "";
  })();
  const feature = FEATURE_REGISTRY[featureKey] ?? (
    location.endsWith("/profile")
      ? FEATURE_REGISTRY["security-myprofile"]
      : undefined
  );

  const targetPath = feature?.path?.split("?")[0];
  const shouldRedirect = feature?.status === "done" && targetPath && !targetPath.startsWith("/features/");

  useEffect(() => {
    if (shouldRedirect && targetPath) {
      navigate(tenantPath(tenantSlug, targetPath), { replace: true });
    }
  }, [shouldRedirect, targetPath, tenantSlug, navigate]);

  if (!feature) {
    return (
      <ERPLayout title="صفحة غير موجودة">
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            لم يتم العثور على هذه الصفحة في النظام.
          </CardContent>
        </Card>
      </ERPLayout>
    );
  }

  if (shouldRedirect) {
    return (
      <ERPLayout title={feature.label}>
        <Card>
          <CardContent className="py-12 text-center text-slate-500">جاري التحويل...</CardContent>
        </Card>
      </ERPLayout>
    );
  }

  const isPartial = feature.status === "partial";
  const isDone = feature.status === "done";

  return (
    <ERPLayout title={feature.label}>
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Construction className="text-amber-600" size={24} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <CardTitle className="text-lg">{feature.label}</CardTitle>
                  <Badge variant={STATUS_VARIANT[feature.status]}>
                    {STATUS_LABEL[feature.status]}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">{feature.module}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-700">
            {isPartial ? (
              <p>
                هذه الميزة متوفرة بشكل مبسّط في Easy Cash. نعمل على إكمالها قريبًا.
              </p>
            ) : (
              <p>
                هذه الميزة ضمن خطة التطوير وستُضاف إلى Easy Cash. يمكنك العودة للقائمة الجانبية
                ومتابعة العمل من الشاشات المتاحة.
              </p>
            )}
            {(isPartial || isDone) && targetPath && (
              <Link href={tenantPath(tenantSlug, targetPath)}>
                <Button variant="outline" className="gap-2">
                  <ArrowRight size={16} />
                  فتح الصفحة
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">
          Easy Cash · {featureKey}
        </p>
      </div>
    </ERPLayout>
  );
}
