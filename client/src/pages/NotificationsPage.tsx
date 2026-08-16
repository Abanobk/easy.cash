import { useEffect } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { tenantPath, useTenantSlug } from "@/lib/tenant";

const typeIcon = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle2,
} as const;

const typeColor = {
  info: "text-blue-600",
  warning: "text-amber-600",
  error: "text-red-600",
  success: "text-green-600",
} as const;

export default function NotificationsPage() {
  const tenantSlug = useTenantSlug();
  const utils = trpc.useUtils();
  const syncMut = trpc.notifications.syncOperational.useMutation({
    onSuccess: (res) => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      if (res.created > 0) toast.success(`تم تحديث التنبيهات — ${res.created} تنبيه جديد`);
    },
  });
  const erpNotifQuery = trpc.notifications.list.useQuery();
  const saasNotifQuery = trpc.saas.getMyNotifications.useQuery(undefined, { retry: false });
  const markReadMut = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const markAllMut = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("تم تعليم كل التنبيهات كمقروءة");
    },
  });

  useEffect(() => {
    syncMut.mutate();
  }, []);

  const erpList = erpNotifQuery.data || [];
  const saasList = saasNotifQuery.data || [];
  const unreadErp = erpList.filter((n) => !n.isRead).length;

  return (
    <ERPLayout title="التنبيهات">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-slate-600">
            تنبيهات التشغيل والمتابعة اليومية
            {unreadErp > 0 && <Badge className="mr-2">{unreadErp} غير مقروء</Badge>}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
            >
              {syncMut.isPending ? "جاري التحديث..." : "تحديث التنبيهات"}
            </Button>
            {unreadErp > 0 && (
              <Button variant="ghost" size="sm" onClick={() => markAllMut.mutate()} disabled={markAllMut.isPending}>
                تعليم الكل كمقروء
              </Button>
            )}
          </div>
        </div>

        {erpNotifQuery.isLoading ? (
          <Card><CardContent className="py-12 text-center text-slate-500">جاري تحميل التنبيهات...</CardContent></Card>
        ) : erpList.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-slate-500">لا توجد تنبيهات تشغيلية حالياً</CardContent></Card>
        ) : (
          erpList.map((n) => {
            const Icon = typeIcon[n.type as keyof typeof typeIcon] || Bell;
            const color = typeColor[n.type as keyof typeof typeColor] || "text-blue-600";
            const content = (
              <Card key={n.id} className={n.isRead ? "opacity-70" : "border-blue-200 shadow-sm"}>
                <CardContent className="p-4 flex gap-3">
                  <Icon size={18} className={`${color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-slate-800">{n.title}</span>
                      {!n.isRead && <Badge variant="default" className="text-xs">جديد</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-2">{new Date(n.createdAt).toLocaleString("en-US")}</p>
                    {n.href && (
                      <p className="text-xs text-blue-600 mt-1">اضغط للانتقال للتفاصيل</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );

            if (!n.href) {
              return (
                <div key={n.id} onClick={() => !n.isRead && markReadMut.mutate(n.id)}>
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={n.id}
                href={tenantPath(tenantSlug, n.href)}
                onClick={() => !n.isRead && markReadMut.mutate(n.id)}
              >
                {content}
              </Link>
            );
          })
        )}

        {saasList.length > 0 && (
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">تنبيهات الحساب والاشتراك</h3>
            <div className="space-y-3">
              {saasList.map((n) => (
                <Card key={`saas-${n.id}`} className={n.isRead ? "opacity-70" : "border-slate-200"}>
                  <CardContent className="p-4 flex gap-3">
                    <Bell size={18} className="text-slate-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-800">{n.title}</span>
                        {!n.isRead && <Badge variant="outline" className="text-xs">جديد</Badge>}
                      </div>
                      <p className="text-sm text-slate-600">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-2">{new Date(n.createdAt).toLocaleString("en-US")}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </ERPLayout>
  );
}
