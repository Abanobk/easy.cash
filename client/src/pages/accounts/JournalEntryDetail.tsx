import { useParams, useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Loader2 } from "lucide-react";
import { tenantPath, useTenantSlug } from "@/lib/tenant";

export default function JournalEntryDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const id = parseInt(params.id || "0", 10);

  const { data, isLoading } = trpc.accounts.journal.byId.useQuery(id, { enabled: id > 0 });

  const entry = data?.entry;
  const lines = data?.lines || [];
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

  return (
    <ERPLayout title="تفاصيل قيد اليومية">
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-slate-600"
          onClick={() => navigate(tenantPath(tenantSlug, "/accounts/journal"))}
        >
          <ArrowRight size={14} /> العودة للقائمة
        </Button>

        {isLoading ? (
          <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" /></div>
        ) : !entry ? (
          <p className="text-center text-slate-500 py-16">القيد غير موجود</p>
        ) : (
          <>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">قيد رقم {entry.number}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-slate-500">التاريخ: </span>{entry.date ? new Date(entry.date).toLocaleDateString("en-GB") : "—"}</div>
                <div><span className="text-slate-500">الحالة: </span>{entry.status === "posted" ? "مرحّل" : "مسودة"}</div>
                <div><span className="text-slate-500">المرجع: </span>{entry.reference || "—"}</div>
                <div className="col-span-2 md:col-span-4"><span className="text-slate-500">البيان: </span>{entry.description || "—"}</div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-right">الحساب</TableHead>
                      <TableHead className="text-right">مركز التكلفة</TableHead>
                      <TableHead className="text-right">البيان</TableHead>
                      <TableHead className="text-right">مدين</TableHead>
                      <TableHead className="text-right">دائن</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.accountCode} - {line.accountName}</TableCell>
                        <TableCell>{line.costCenterName || "—"}</TableCell>
                        <TableCell>{line.description || "—"}</TableCell>
                        <TableCell className="text-blue-600">{Number(line.debit || 0).toLocaleString("en-US")}</TableCell>
                        <TableCell className="text-green-600">{Number(line.credit || 0).toLocaleString("en-US")}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 font-semibold">
                      <TableCell colSpan={3}>الإجمالي</TableCell>
                      <TableCell>{totalDebit.toLocaleString("en-US")}</TableCell>
                      <TableCell>{totalCredit.toLocaleString("en-US")}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ERPLayout>
  );
}
