import { useEffect, useState } from "react";
import { useMegaCreateRoute } from "@/hooks/useMegaCreateRoute";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ArrowLeftRight, Trash2, Search, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { findItemByScan } from "@/lib/barcode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { InvoiceExpenseList, type InvoiceExpenseLine } from "@/components/invoices/InvoiceExpenseList";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import { printInvoiceQuick, printWarehouseNote } from "@/lib/print-invoice-quick";

/**
 * تحويل مخزني — مطابقة ميجا InventoryTransfer:
 * نوع · مباشر/بمرحلتين · حساب أرباح/خسائر · مصروفات · حفظ/اعتماد/استلام
 */
export default function StockTransfers() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/inventory/transfers");
  const [open, setOpen] = useState(isNewRoute);
  const [form, setForm] = useState({
    fromWarehouseId: "",
    toWarehouseId: "",
    fromBranchId: "",
    toBranchId: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    transferType: "direct" as "direct" | "two_stage",
    referenceNumber: "",
    plAccountId: "",
  });
  const [items, setItems] = useState<{
    itemId: string;
    quantity: string;
    expensePercent: string;
    unitCost: string;
    batchNumber: string;
    available?: number;
    expectedCost?: number;
  }[]>([
    { itemId: "", quantity: "1", expensePercent: "0", unitCost: "", batchNumber: "" },
  ]);
  const [expenses, setExpenses] = useState<InvoiceExpenseLine[]>([]);
  const [barcode, setBarcode] = useState("");
  const [printAfterSave, setPrintAfterSave] = useState(false);
  const [printAfterApprove, setPrintAfterApprove] = useState(false);
  const [printWithoutCosts, setPrintWithoutCosts] = useState(true);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [eitherBranchId, setEitherBranchId] = useState("");
  const [filterType, setFilterType] = useState<"" | "direct" | "two_stage">("");
  const [filterStatus, setFilterStatus] = useState<"" | "draft" | "in_transit" | "confirmed" | "cancelled">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (isNewRoute) setOpen(true);
  }, [isNewRoute]);

  const { data, refetch } = trpc.inventory.transfers.list.useQuery({
    page: 1,
    limit: 100,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    fromWarehouseId: fromWh ? Number(fromWh) : undefined,
    toWarehouseId: toWh ? Number(toWh) : undefined,
    fromBranchId: fromBranchId ? Number(fromBranchId) : undefined,
    toBranchId: toBranchId ? Number(toBranchId) : undefined,
    eitherBranchId: eitherBranchId ? Number(eitherBranchId) : undefined,
    transferType: filterType || undefined,
    status: filterStatus || undefined,
    search: debouncedSearch || undefined,
  });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: branches } = trpc.settings.branches.list.useQuery();
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const { data: accountsChart } = trpc.accounts.chart.useQuery();
  const leafAccounts = (accountsChart || []).filter((a: any) => !a.isParent);
  const utils = trpc.useUtils();

  const firePrint = (number: string) => {
    const fromName = (warehouses as any[] || []).find((w: any) => String(w.id) === form.fromWarehouseId)?.name || "—";
    const toName = (warehouses as any[] || []).find((w: any) => String(w.id) === form.toWarehouseId)?.name || "—";
    const lines = items
      .filter((it) => it.itemId)
      .map((it) => {
        const row = (itemsList?.rows || []).find((x: any) => String(x.id) === it.itemId);
        return {
          name: row ? (row.code ? `${row.code} — ${row.name}` : row.name) : it.itemId,
          quantity: Number(it.quantity || 0),
          unit: row?.unit || "",
          warehouseName: `${fromName} ← ${toName}`,
          price: printWithoutCosts ? undefined : Number(it.expectedCost || row?.averageCost || row?.purchasePrice || 0),
          total: printWithoutCosts ? undefined : Number(it.quantity || 0) * Number(it.expectedCost || row?.averageCost || row?.purchasePrice || 0),
        };
      });
    if (printWithoutCosts) {
      printWarehouseNote({
        title: "تحويل مخزني",
        number,
        date: form.date,
        partyLabel: "من / الى",
        partyName: `${fromName} → ${toName}`,
        lines,
      });
    } else {
      printInvoiceQuick({
        title: "تحويل مخزني",
        number,
        date: form.date,
        partyLabel: "من / الى",
        partyName: `${fromName} → ${toName}`,
        lines,
        total: lines.reduce((s, l) => s + Number(l.total || 0), 0),
      });
    }
  };

  const createMut = trpc.inventory.transfers.create.useMutation({
    onSuccess: () => {
      refetch();
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });
  const confirmMut = trpc.inventory.transfers.confirm.useMutation({
    onSuccess: (r) => {
      toast.success(r.status === "in_transit" ? "تم اعتماد الشحن — بانتظار الاستلام" : "تم اعتماد التحويل");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const receiveMut = trpc.inventory.transfers.receive.useMutation({
    onSuccess: () => { toast.success("تم استلام التحويل في المخزن المستقبل"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({
      fromWarehouseId: "",
      toWarehouseId: "",
      fromBranchId: "",
      toBranchId: "",
      date: new Date().toISOString().split("T")[0],
      notes: "",
      transferType: "direct",
      referenceNumber: "",
      plAccountId: "",
    });
    setItems([{ itemId: "", quantity: "1", expensePercent: "0", unitCost: "", batchNumber: "" }]);
    setExpenses([]);
    setBarcode("");
  };

  const closeDialog = () => {
    setOpen(false);
    resetForm();
    if (isNewRoute) goToList();
  };

  const openNewDialog = () => {
    if (isNewRoute) {
      resetForm();
      setOpen(true);
      return;
    }
    goToCreate();
  };

  const refreshLineMeta = async (rowIdx: number, itemId: string, warehouseId: string) => {
    if (!itemId || !warehouseId) return;
    try {
      const res = await utils.inventory.qtyAtWarehouse.fetch({
        itemId: Number(itemId),
        warehouseId: Number(warehouseId),
      });
      const catalogItem = (itemsList?.rows || []).find((r: any) => String(r.id) === itemId);
      const expectedCost = Number(catalogItem?.averageCost ?? catalogItem?.purchasePrice ?? 0);
      setItems((prev) =>
        prev.map((it, i) => (i === rowIdx ? {
          ...it,
          available: res.quantity,
          expectedCost,
          unitCost: it.unitCost || (expectedCost ? String(expectedCost) : ""),
        } : it)),
      );
    } catch {
      /* ignore */
    }
  };

  const addItem = () => setItems((prev) => [...prev, { itemId: "", quantity: "1", expensePercent: "0", unitCost: "", batchNumber: "" }]);
  const addAllFromWarehouse = async () => {
    if (!form.fromWarehouseId) return toast.error("اختر المخزن المصدر أولاً");
    try {
      const rows = await utils.inventory.stockAtWarehouse.fetch({ warehouseId: Number(form.fromWarehouseId) });
      if (!rows?.length) return toast.message("لا يوجد رصيد في المخزن المصدر");
      const mapped = rows.map((r: any) => ({
        itemId: String(r.itemId),
        quantity: String(r.quantity),
        expensePercent: "0",
        unitCost: String(r.unitCost || r.averageCost || ""),
        batchNumber: "",
        available: Number(r.quantity),
        expectedCost: Number(r.unitCost || r.averageCost || 0),
      }));
      setItems(mapped);
      toast.success(`تمت إضافة ${mapped.length} صنف من المخزن`);
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل أصناف المخزن");
    }
  };
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = async (i: number, field: string, val: string) => {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));
    if (field === "itemId") await refreshLineMeta(i, val, form.fromWarehouseId);
  };

  useEffect(() => {
    if (!form.fromWarehouseId) return;
    items.forEach((it, i) => {
      if (it.itemId) void refreshLineMeta(i, it.itemId, form.fromWarehouseId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.fromWarehouseId]);

  const handleBarcode = async () => {
    const hit = findItemByScan((itemsList?.rows || []) as any, barcode);
    if (!hit) return toast.error("باركود غير موجود");
    const emptyIdx = items.findIndex((it) => !it.itemId);
    if (emptyIdx >= 0) {
      await updateItem(emptyIdx, "itemId", String(hit.id));
    } else {
      setItems((prev) => [...prev, { itemId: String(hit.id), quantity: "1", expensePercent: "0", unitCost: "", batchNumber: "" }]);
      await refreshLineMeta(items.length, String(hit.id), form.fromWarehouseId);
    }
    setBarcode("");
  };

  const submit = (confirm: boolean) => {
    if (!form.fromWarehouseId || !form.toWarehouseId) return toast.error("يجب اختيار المخزن المصدر والمستقبل");
    if (form.fromWarehouseId === form.toWarehouseId) return toast.error("لا يمكن التحويل لنفس المخزن");
    if (items.some((it) => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    if (confirm) {
      for (const it of items) {
        if (it.available != null && Number(it.quantity) > Number(it.available)) {
          return toast.error(`الكمية أكبر من المتاحة للصنف`);
        }
      }
    }
    createMut.mutate({
      fromWarehouseId: Number(form.fromWarehouseId),
      toWarehouseId: Number(form.toWarehouseId),
      date: form.date,
      notes: form.notes,
      transferType: form.transferType,
      referenceNumber: form.referenceNumber || undefined,
      plAccountId: form.plAccountId ? Number(form.plAccountId) : null,
      confirm,
      items: items.map((it) => ({
        itemId: Number(it.itemId),
        quantity: it.quantity,
        expensePercent: it.expensePercent || "0",
        unitCost: it.unitCost || (it.expectedCost != null ? String(it.expectedCost) : undefined),
        batchNumber: it.batchNumber || undefined,
      })),
      expenses: expenses
        .filter((e) => Number(e.amount) > 0 && e.creditAccountId != null)
        .map((e) => ({
          currencyCode: e.currencyCode || "EGP",
          exchangeRate: e.exchangeRate || "1",
          amount: e.amount,
          creditAccountId: e.creditAccountId!,
          notes: e.notes,
        })),
    }, {
      onSuccess: (r) => {
        toast.success(r.status === "draft" ? "تم حفظ التحويل معلقاً" : r.status === "in_transit" ? "تم اعتماد الشحن — بانتظار الاستلام" : "تم اعتماد التحويل");
        if (confirm ? printAfterApprove : printAfterSave) firePrint(r.number);
      },
    });
  };

  const statusLabel = (s: string) =>
    ({ draft: "معلق", in_transit: "معتمد جزئياً", confirmed: "معتمد", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) =>
    ({ draft: "outline", in_transit: "secondary", confirmed: "default", cancelled: "destructive" }[s] || "outline") as any;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setFromWh("");
    setToWh("");
    setFromBranchId("");
    setToBranchId("");
    setEitherBranchId("");
    setFilterType("");
    setFilterStatus("");
    setSearch("");
  };

  return (
    <ERPLayout title={isNewRoute ? "تحويل مخزني" : "قائمة التحويلات المخزنية"}>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ArrowLeftRight size={18} className="text-purple-600" />
              {isNewRoute ? "تحويل مخزني" : "قائمة التحويلات المخزنية"}
            </CardTitle>
            <AddActionButton
              moduleKey="inventory"
              entityKey="stockTransfer"
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white gap-1"
              onClick={openNewDialog}
            >
              <Plus size={14} /> تحويل جديد
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isNewRoute && (
            <div className="flex flex-wrap gap-3 items-end rounded-lg border bg-slate-50 p-3">
              <div className="space-y-1">
                <Label className="text-xs">من تاريخ</Label>
                <Input type="date" className="h-9 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الى تاريخ</Label>
                <Input type="date" className="h-9 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">من / الى فرع</Label>
                <Select value={eitherBranchId || "all"} onValueChange={(v) => setEitherBranchId(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(branches || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الفرع</Label>
                <Select value={fromBranchId || "all"} onValueChange={(v) => setFromBranchId(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(branches || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الى فرع</Label>
                <Select value={toBranchId || "all"} onValueChange={(v) => setToBranchId(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(branches || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المخزن</Label>
                <Select value={fromWh || "all"} onValueChange={(v) => setFromWh(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الى مخزن</Label>
                <Select value={toWh || "all"} onValueChange={(v) => setToWh(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع التحويل</Label>
                <Select value={filterType || "all"} onValueChange={(v) => setFilterType(v === "all" ? "" : v as any)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="direct">تحويل مباشر</SelectItem>
                    <SelectItem value="two_stage">تحويل بمرحلتين</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الحالة</Label>
                <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v as any)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="draft">معلق</SelectItem>
                    <SelectItem value="in_transit">معتمد جزئياً</SelectItem>
                    <SelectItem value="confirmed">معتمد</SelectItem>
                    <SelectItem value="cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المسلسل / المرجع</Label>
                <div className="relative">
                  <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input className="h-9 w-40 pr-7" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={clearFilters}>تفريغ</Button>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-right text-xs">المسلسل</TableHead>
                  <TableHead className="text-right text-xs">من</TableHead>
                  <TableHead className="text-right text-xs">الى</TableHead>
                  <TableHead className="text-right text-xs">النوع</TableHead>
                  <TableHead className="text-right text-xs">التاريخ</TableHead>
                  <TableHead className="text-right text-xs">الحالة</TableHead>
                  <TableHead className="text-right text-xs">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.rows?.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-slate-400 py-8">لا توجد بيانات للعرض</TableCell>
                  </TableRow>
                )}
                {data?.rows?.map((row: any) => (
                  <TableRow key={row.id} className="hover:bg-slate-50">
                    <TableCell className="text-sm font-medium text-purple-700">#{row.number}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.fromWarehouseName}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.toWarehouseName}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {row.transferType === "two_stage" ? "بمرحلتين" : "مباشر"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColor(row.status)} className="text-xs">{statusLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.status === "draft" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={confirmMut.isPending}
                          onClick={() => confirmMut.mutate({ id: row.id })}
                        >
                          اعتماد
                        </Button>
                      )}
                      {row.status === "in_transit" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={receiveMut.isPending}
                          onClick={() => receiveMut.mutate({ id: row.id })}
                        >
                          <PackageCheck size={12} /> استلام
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>تحويل مخزني</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">التاريخ *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع التحويل</Label>
                <Select value={form.transferType} onValueChange={(v) => setForm((f) => ({ ...f, transferType: v as any }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">تحويل مباشر</SelectItem>
                    <SelectItem value="two_stage">تحويل بمرحلتين</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">رقم المرجع</Label>
                <Input value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">حساب الارباح / الخسائر</Label>
                <AccountSearchSelect
                  accounts={leafAccounts}
                  value={form.plAccountId}
                  onChange={(v) => setForm((f) => ({ ...f, plAccountId: v }))}
                  placeholder="اختياري — مدين مصروفات التحويل"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">من فرع</Label>
                <Select
                  value={form.fromBranchId || "all"}
                  onValueChange={(v) => setForm((f) => ({ ...f, fromBranchId: v === "all" ? "" : v, fromWarehouseId: "" }))}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(branches || []).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الى فرع</Label>
                <Select
                  value={form.toBranchId || "all"}
                  onValueChange={(v) => setForm((f) => ({ ...f, toBranchId: v === "all" ? "" : v, toWarehouseId: "" }))}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(branches || []).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المخزن *</Label>
                <Select value={form.fromWarehouseId} onValueChange={(v) => setForm((f) => ({ ...f, fromWarehouseId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="المخزن المصدر" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses as any[] || [])
                      .filter((w: any) => !form.fromBranchId || String(w.branchId || "") === form.fromBranchId)
                      .map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الى مخزن *</Label>
                <Select value={form.toWarehouseId} onValueChange={(v) => setForm((f) => ({ ...f, toWarehouseId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="المخزن المستقبل" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses as any[] || [])
                      .filter((w: any) => !form.toBranchId || String(w.branchId || "") === form.toBranchId)
                      .map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الباركود</Label>
                <div className="flex gap-1">
                  <Input
                    className="h-9 text-sm"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleBarcode(); } }}
                    placeholder="مسح باركود"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void handleBarcode()}>+</Button>
                </div>
              </div>
            </div>
            {form.transferType === "two_stage" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                بمرحلتين: الاعتماد يخصم من المصدر فقط — ثم «استلام» من القائمة يضيف للمستقبل.
              </p>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">الاصناف</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => void addAllFromWarehouse()}>
                    اضافة كل المخزن
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addItem}>
                    <Plus size={12} /> اضافة
                  </Button>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-right text-xs">الصنف</TableHead>
                      <TableHead className="text-right text-xs">المتاحة</TableHead>
                      <TableHead className="text-right text-xs">التكلفة</TableHead>
                      <TableHead className="text-right text-xs">التشغيلة</TableHead>
                      <TableHead className="text-right text-xs">الكمية</TableHead>
                      <TableHead className="text-right text-xs">نسبة المصروفات</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell className="p-1 min-w-[180px]">
                          <ItemSearchSelect
                            items={itemsList?.rows || []}
                            value={it.itemId}
                            onChange={(v) => void updateItem(i, "itemId", v)}
                            placeholder="اختر الصنف"
                          />
                        </TableCell>
                        <TableCell className="p-1 text-xs font-semibold text-slate-600 w-24">
                          {it.available != null ? Number(it.available).toLocaleString("en-US") : "—"}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" value={it.unitCost} onChange={(e) => void updateItem(i, "unitCost", e.target.value)} className="h-8 text-xs w-24" placeholder={it.expectedCost != null ? String(it.expectedCost) : ""} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input value={it.batchNumber} onChange={(e) => void updateItem(i, "batchNumber", e.target.value)} className="h-8 text-xs w-24" />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" value={it.quantity} onChange={(e) => void updateItem(i, "quantity", e.target.value)} className="h-8 text-xs w-24" />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" value={it.expensePercent} onChange={(e) => void updateItem(i, "expensePercent", e.target.value)} className="h-8 text-xs w-20" />
                        </TableCell>
                        <TableCell className="p-1">
                          {items.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeItem(i)}>
                              <Trash2 size={12} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <InvoiceExpenseList value={expenses} onChange={setExpenses} />
            {expenses.some((e) => Number(e.amount) > 0) && (
              <p className="text-[11px] text-purple-800 bg-purple-50 border border-purple-100 rounded px-2 py-1.5">
                عند الاعتماد يُنشأ قيد: مدين {form.plAccountId ? "حساب الأرباح/الخسائر" : "المخزون"} ↔ الحساب الدائن لكل مصروف.
              </p>
            )}

            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="text-sm min-h-[60px]" />
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
              <label className="flex items-center gap-2"><Checkbox checked={printAfterSave} onCheckedChange={(v) => setPrintAfterSave(!!v)} />طباعة بعد الحفظ</label>
              <label className="flex items-center gap-2"><Checkbox checked={printAfterApprove} onCheckedChange={(v) => setPrintAfterApprove(!!v)} />طباعة بعد الاعتماد</label>
              <label className="flex items-center gap-2"><Checkbox checked={printWithoutCosts} onCheckedChange={(v) => setPrintWithoutCosts(!!v)} />طباعة بدون تكاليف</label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeDialog}>إلغاء</Button>
            <Button variant="secondary" size="sm" disabled={createMut.isPending} onClick={() => submit(false)}>حفظ</Button>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={createMut.isPending} onClick={() => submit(true)}>
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
