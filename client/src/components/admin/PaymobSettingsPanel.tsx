import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, AlertCircle, Pencil, ShieldCheck,
  RefreshCw, KeyRound, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  clearPaymobDraft,
  loadPaymobDraft,
  paymobDraftHasContent,
  savePaymobDraft,
  type PaymobDraft,
} from "@/lib/paymob-draft";
import PaymobPaymentMethodsTable, {
  DEFAULT_PAYMENT_METHOD_ROWS,
  LIVE_UNIFIED_CARD_INTEGRATION_ID,
  cardIntegrationNeedsFix,
  paymentMethodsFromServer,
  paymentMethodsToPayload,
  type PaymentMethodFormRow,
} from "@/components/admin/PaymobPaymentMethodsTable";

type PaymobData = {
  configured: boolean;
  mode: string;
  isEnabled: boolean;
  publicKey: string;
  publicKeyLast8: string;
  currency: string;
  hasSecretKey: boolean;
  hasHmacSecret: boolean;
  needsSecretResave?: boolean;
  readyForPayments?: boolean;
  webhookUrl?: string;
  paymentMethods?: Array<{
    methodType: "card" | "wallet";
    integrationId: number;
    isEnabled: boolean;
    labelAr: string;
  }>;
};

type FormState = Omit<PaymobDraft, "editMode" | "replacePublicKey" | "replaceSecret" | "replaceHmac" | "savedAt" | "paymentMethods">;

const emptyForm = (): FormState => ({
  mode: "test",
  publicKey: "",
  secretKey: "",
  hmacSecret: "",
  currency: "EGP",
  isEnabled: false,
});

function isCredentialsComplete(data: PaymobData | undefined) {
  if (!data?.configured) return false;
  const cardOk = data.paymentMethods?.some(
    (m) => m.methodType === "card" && m.isEnabled && m.integrationId > 0,
  );
  return Boolean(data.hasSecretKey && data.publicKeyLast8 && cardOk && !data.needsSecretResave);
}

function StatusRow({
  ok,
  warn,
  label,
  value,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  value: string;
}) {
  const Icon = ok ? CheckCircle2 : warn ? AlertCircle : XCircle;
  const iconClass = ok ? "text-green-600" : warn ? "text-amber-500" : "text-red-500";
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={16} className={`shrink-0 ${iconClass}`} />
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-mono text-slate-800 truncate" dir="ltr">{value}</span>
    </div>
  );
}

export default function PaymobSettingsPanel() {
  const skipDraftRestore = useRef(false);
  const hydrated = useRef(false);

  const [editMode, setEditMode] = useState(false);
  const [lastTestOk, setLastTestOk] = useState<boolean | null>(null);
  const [lastWalletInCheckout, setLastWalletInCheckout] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [replacePublicKey, setReplacePublicKey] = useState(false);
  const [replaceSecret, setReplaceSecret] = useState(false);
  const [replaceHmac, setReplaceHmac] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const paymobQuery = trpc.saas.getPaymobSettings.useQuery();
  const data = paymobQuery.data;

  const [form, setForm] = useState<FormState>(emptyForm);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodFormRow[]>(
    () => DEFAULT_PAYMENT_METHOD_ROWS.map((r) => ({ ...r })),
  );

  const credentialsComplete = isCredentialsComplete(data);
  const legacyCardId = cardIntegrationNeedsFix(paymentMethods, form.mode);
  const walletEnabledInSettings = Boolean(
    data?.paymentMethods?.some((m) => m.methodType === "wallet" && m.isEnabled),
  );
  const cardOnlyCheckout = walletEnabledInSettings && lastWalletInCheckout === false;
  const statusTitle = data?.readyForPayments
    ? (cardOnlyCheckout ? "Paymob جاهز — البطاقة فقط" : "Paymob جاهز — الدفع مفعّل")
    : "المفاتيح محفوظة — فعّل الدفع";

  const saveSettings = (opts?: {
    methods?: PaymentMethodFormRow[];
    isEnabled?: boolean;
  }) => {
    setLastError(null);
    const rows = opts?.methods ?? paymentMethods;
    const shouldEnable = opts?.isEnabled ?? (
      credentialsComplete
        ? (form.isEnabled || Boolean(data?.isEnabled))
        : form.isEnabled
    );
    if (shouldEnable && cardIntegrationNeedsFix(rows, form.mode)) {
      toast.error(`غيّر رقم البطاقة من 4310645 إلى ${LIVE_UNIFIED_CARD_INTEGRATION_ID} ثم احفظ`);
      return;
    }
    saveMutation.mutate({
      mode: form.mode,
      publicKey: replacePublicKey || !credentialsComplete ? (form.publicKey || undefined) : undefined,
      secretKey: replaceSecret || !credentialsComplete ? (form.secretKey.trim() || undefined) : undefined,
      hmacSecret: replaceHmac ? (form.hmacSecret.trim() || undefined) : (!credentialsComplete ? form.hmacSecret.trim() || undefined : undefined),
      paymentMethods: paymentMethodsToPayload(rows),
      currency: form.currency,
      isEnabled: shouldEnable,
    });
  };

  const applyRecommendedCardId = () => {
    const fixed = paymentMethods.map((r) =>
      r.methodType === "card"
        ? { ...r, integrationId: String(LIVE_UNIFIED_CARD_INTEGRATION_ID), isEnabled: true }
        : r,
    );
    setPaymentMethods(fixed);
    setEditMode(true);
    if (credentialsComplete) {
      saveSettings({ methods: fixed, isEnabled: true });
      toast.message(`جاري الحفظ برقم البطاقة ${LIVE_UNIFIED_CARD_INTEGRATION_ID} وتفعيل الدفع...`);
    } else {
      toast.message(`تم تعيين رقم البطاقة إلى ${LIVE_UNIFIED_CARD_INTEGRATION_ID} — اضغط «حفظ»`);
    }
  };

  const validateBeforeEnable = (enabled: boolean) => {
    if (!enabled) return true;
    if (cardIntegrationNeedsFix(paymentMethods, form.mode)) {
      toast.error(`غيّر رقم البطاقة من 4310645 إلى ${LIVE_UNIFIED_CARD_INTEGRATION_ID} ثم احفظ`);
      return false;
    }
    return true;
  };

  const syncFormFromServer = (server: PaymobData) => {
    setForm({
      mode: server.mode as "test" | "live",
      publicKey: server.publicKey || "",
      secretKey: "",
      hmacSecret: "",
      currency: server.currency || "EGP",
      isEnabled: server.isEnabled,
    });
    setPaymentMethods(paymentMethodsFromServer(server.paymentMethods));
  };

  // مزامنة حالة التفعيل من السيرفر في عرض الحالة
  useEffect(() => {
    if (!data || editMode) return;
    setForm((f) => (f.isEnabled === data.isEnabled ? f : { ...f, isEnabled: data.isEnabled }));
  }, [data?.isEnabled, editMode, data]);

  // مزامنة من السيرفر — المسودة تُستخدم فقط عند أول تحميل إن وُجدت
  useEffect(() => {
    if (!data || hydrated.current) return;

    const draft = skipDraftRestore.current ? null : loadPaymobDraft();
    const hasDraft = draft && paymobDraftHasContent(draft);

    if (hasDraft) {
      setForm({
        mode: draft.mode,
        publicKey: draft.publicKey,
        secretKey: draft.secretKey,
        hmacSecret: draft.hmacSecret,
        currency: draft.currency,
        isEnabled: draft.isEnabled,
      });
      setPaymentMethods(
        draft.paymentMethods?.length
          ? draft.paymentMethods.map((m) => ({
              ...m,
              labelAr: m.methodType === "card" ? "بطاقة ائتمان" : "محفظة إلكترونية",
            }))
          : DEFAULT_PAYMENT_METHOD_ROWS.map((r) => ({ ...r })),
      );
      setEditMode(draft.editMode);
      setReplacePublicKey(draft.replacePublicKey);
      setReplaceSecret(draft.replaceSecret);
      setReplaceHmac(draft.replaceHmac);
      setDraftRestored(true);
      hydrated.current = true;
      return;
    }

    syncFormFromServer(data);
    setEditMode(!isCredentialsComplete(data) || Boolean(data.needsSecretResave));
    hydrated.current = true;
  }, [data]);

  // حفظ المسودة فقط أثناء التعديل
  useEffect(() => {
    if (!hydrated.current || !editMode) return;
    savePaymobDraft({
      ...form,
      paymentMethods: paymentMethods.map(({ methodType, integrationId, isEnabled }) => ({
        methodType,
        integrationId,
        isEnabled,
      })),
      editMode,
      replacePublicKey,
      replaceSecret,
      replaceHmac,
    });
  }, [form, paymentMethods, editMode, replacePublicKey, replaceSecret, replaceHmac]);

  const saveMutation = trpc.saas.savePaymobSettings.useMutation({
    onSuccess: (result) => {
      setLastError(null);
      skipDraftRestore.current = true;
      clearPaymobDraft();
      setDraftRestored(false);
      setReplacePublicKey(false);
      setReplaceSecret(false);
      setReplaceHmac(false);
      if (result.isEnabled) {
        setLastTestOk(true);
        setEditMode(false);
        toast.success("تم حفظ إعدادات Paymob وتفعيل الدفع");
      } else {
        toast.success("تم حفظ المفاتيح");
      }
      hydrated.current = false;
      paymobQuery.refetch().then((res) => {
        if (res.data) syncFormFromServer(res.data);
        hydrated.current = true;
        if (result.isEnabled) setEditMode(false);
      });
    },
    onError: (e) => {
      if (e.message.includes("تم حفظ المفاتيح")) {
        toast.warning(e.message);
        skipDraftRestore.current = true;
        clearPaymobDraft();
        hydrated.current = false;
        paymobQuery.refetch().then((res) => {
          if (res.data) syncFormFromServer(res.data);
          hydrated.current = true;
        });
      } else {
        toast.error(e.message);
      }
      setLastError(e.message);
    },
  });

  const testMutation = trpc.saas.testPaymobConnection.useMutation({
    onSuccess: (result) => {
      setLastTestOk(true);
      setLastWalletInCheckout(result.walletInCheckout);
      if (result.walletWarning) {
        toast.warning(result.walletWarning, { duration: 12000 });
      } else {
        toast.success("الاتصال بـ Paymob ناجح — المفاتيح صحيحة");
      }
    },
    onError: (e) => {
      setLastTestOk(false);
      setLastWalletInCheckout(null);
      setLastError(e.message);
      toast.error(e.message);
    },
  });

  const save = () => saveSettings();

  const toggleEnabled = (enabled: boolean) => {
    if (!validateBeforeEnable(enabled)) return;
    setForm((f) => ({ ...f, isEnabled: enabled }));
    saveMutation.mutate({
      mode: form.mode,
      currency: form.currency,
      paymentMethods: paymentMethodsToPayload(paymentMethods),
      isEnabled: enabled,
    });
  };

  const exitEditMode = () => {
    skipDraftRestore.current = true;
    clearPaymobDraft();
    setDraftRestored(false);
    setLastError(null);
    setReplacePublicKey(false);
    setReplaceSecret(false);
    setReplaceHmac(false);
    if (data) syncFormFromServer(data);
    setEditMode(false);
    hydrated.current = true;
    paymobQuery.refetch();
  };

  const enterEditMode = () => {
    if (data) syncFormFromServer(data);
    setLastError(null);
    setEditMode(true);
  };

  if (paymobQuery.isFetching && !data) {
    return <div className="text-center py-16 text-slate-400">جاري التحميل...</div>;
  }

  if (paymobQuery.isError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">تعذر تحميل الإعدادات</p>
        <p className="text-xs">{paymobQuery.error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {draftRestored && editMode && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-center justify-between gap-2">
          <span>تم استرجاع المسودة — المفاتيح اللي لصقتها محفوظة مؤقتاً حتى تضغط «حفظ».</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs shrink-0"
            onClick={() => {
              skipDraftRestore.current = true;
              clearPaymobDraft();
              setDraftRestored(false);
              if (data) syncFormFromServer(data);
              hydrated.current = true;
              paymobQuery.refetch();
            }}
          >
            مسح المسودة
          </Button>
        </div>
      )}

      {credentialsComplete && !editMode && (
        <div className={`rounded-2xl border p-5 ${
          data?.readyForPayments
            ? cardOnlyCheckout
              ? "border-amber-200 bg-gradient-to-l from-amber-50 to-yellow-50"
              : "border-green-200 bg-gradient-to-l from-green-50 to-emerald-50"
            : "border-amber-200 bg-gradient-to-l from-amber-50 to-orange-50"
        }`}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                data?.readyForPayments
                  ? cardOnlyCheckout ? "bg-amber-100" : "bg-green-100"
                  : "bg-amber-100"
              }`}>
                <ShieldCheck size={22} className={
                  data?.readyForPayments
                    ? cardOnlyCheckout ? "text-amber-700" : "text-green-700"
                    : "text-amber-700"
                } />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{statusTitle}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cardOnlyCheckout
                    ? "البطاقة تعمل على صفحة الدفع. المحفظة مفعّلة هنا لكن Paymob لم يضفها — راجع التنبيه بالأسفل."
                    : "لا حاجة لإعادة إدخال المفاتيح. يمكنك نسخ مفاتيح جديدة من Paymob ثم «تعديل المفاتيح»."}
                </p>
              </div>
            </div>
            {lastTestOk === true && (
              <Badge className="bg-green-600 text-white shrink-0">آخر اختبار: ناجح</Badge>
            )}
            {lastTestOk === false && (
              <Badge className="bg-red-600 text-white shrink-0">آخر اختبار: فشل</Badge>
            )}
          </div>

          <div className="bg-white/80 rounded-xl p-4 mb-4">
            <StatusRow ok={Boolean(data?.publicKeyLast8)} label="Public Key" value={data?.publicKeyLast8 ? `••••••••${data.publicKeyLast8}` : "—"} />
            <StatusRow ok={Boolean(data?.hasSecretKey)} label="Secret Key" value="محفوظ ومشفّر ✓" />
            <StatusRow ok={Boolean(data?.hasHmacSecret)} warn={!data?.hasHmacSecret} label="HMAC (Webhook)" value={data?.hasHmacSecret ? "محفوظ ✓" : "اختياري"} />
            <StatusRow ok label="الوضع" value={data?.mode === "live" ? "مباشر (Live)" : "تجريبي (Test)"} />
            <StatusRow ok={Boolean(data?.isEnabled)} warn={!data?.isEnabled} label="قبول المدفوعات" value={data?.isEnabled ? "مفعّل" : "متوقف"} />
            {walletEnabledInSettings && (
              <StatusRow
                ok={lastWalletInCheckout === true}
                warn={lastWalletInCheckout === false}
                label="المحفظة في صفحة الدفع"
                value={
                  lastWalletInCheckout === true
                    ? "تظهر ✓"
                    : lastWalletInCheckout === false
                      ? "لا تظهر — Paymob"
                      : "اضغط اختبار الاتصال"
                }
              />
            )}
          </div>

          {cardOnlyCheckout && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-4 text-sm text-amber-950 leading-relaxed">
              <p className="font-semibold mb-1">لماذا لا تظهر المحفظة في Checkout؟</p>
              <p className="text-xs">
                Easy Cash يرسل طلب دفع بـ <strong dir="ltr">5084536</strong> + محفظة، لكن Paymob يرجّع صفحة <strong>Card</strong> فقط.
                تكامل <strong dir="ltr">5084536</strong> (Shopify/MIGS) غالباً للبطاقة فقط على Unified Checkout.
                رقم <strong dir="ltr">4310646</strong> من API قديم ولا يُقبل معه.
              </p>
              <p className="text-xs mt-2">
                <strong>الحل:</strong> تواصل مع دعم Paymob (MID <strong dir="ltr">804662</strong>) واطلب تفعيل Mobile Wallets على Intention API
                أو رقم تكامل محفظة جديد متوافق مع Unified Checkout.
              </p>
            </div>
          )}

          <div className="mb-4">
            <p className="text-sm font-medium text-slate-700 mb-2">طرق الدفع (أرقام التكامل)</p>
            {cardIntegrationNeedsFix(paymentMethodsFromServer(data?.paymentMethods), data?.mode || "live") && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-3 text-sm text-red-800 flex flex-wrap items-center justify-between gap-2">
                <span>رقم البطاقة <strong dir="ltr">4310645</strong> قديم — Unified Checkout يحتاج <strong dir="ltr">{LIVE_UNIFIED_CARD_INTEGRATION_ID}</strong>.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-800 shrink-0"
                  onClick={applyRecommendedCardId}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "جاري الحفظ..." : `تعيين ${LIVE_UNIFIED_CARD_INTEGRATION_ID} وحفظ`}
                </Button>
              </div>
            )}
            <PaymobPaymentMethodsTable rows={paymentMethodsFromServer(data?.paymentMethods)} mode={data?.mode} />
          </div>

          <label className="flex items-center gap-3 cursor-pointer mb-4 bg-white/60 rounded-lg px-3 py-2.5">
            <input
              type="checkbox"
              checked={Boolean(data?.isEnabled)}
              onChange={(e) => toggleEnabled(e.target.checked)}
              disabled={saveMutation.isPending}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-medium text-slate-700">تفعيل الدفع عبر Paymob للعملاء</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              <RefreshCw size={15} className={testMutation.isPending ? "animate-spin" : ""} />
              اختبار الاتصال
            </Button>
            <Button variant="outline" className="gap-2" onClick={enterEditMode}>
              <Pencil size={15} />
              تعديل المفاتيح
            </Button>
          </div>
        </div>
      )}

      {data?.needsSecretResave && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold mb-1">مطلوب إعادة إدخال Secret Key</p>
          <p className="text-xs">المفتاح المحفوظ لا يُقرأ. أدخل Secret Key من Paymob واحفظ.</p>
        </div>
      )}

      {!credentialsComplete && !data?.needsSecretResave && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">إعداد أول مرة</p>
          <p className="text-xs">انسخ كل مفتاح من Paymob — يمكنك الخروج للموقع والرجوع، المسودة تُحفظ تلقائياً حتى تضغط حفظ.</p>
        </div>
      )}

      {editMode && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <KeyRound size={18} />
              {credentialsComplete ? "تعديل مفاتيح Paymob" : "إعداد مفاتيح Paymob"}
            </h3>
            {credentialsComplete && (
              <Button variant="ghost" size="sm" onClick={exitEditMode}>
                إلغاء
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>الوضع</Label>
              <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v as "test" | "live" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">تجريبي (Test)</SelectItem>
                  <SelectItem value="live">مباشر (Live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>العملة</Label>
              <Input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                maxLength={3}
              />
            </div>
          </div>

          <div>
            <Label>Public Key</Label>
            {credentialsComplete && data?.publicKeyLast8 && !replacePublicKey && !form.publicKey ? (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm font-mono text-slate-600" dir="ltr">••••••••{data.publicKeyLast8}</p>
                <Button type="button" variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => { setReplacePublicKey(true); setForm((f) => ({ ...f, publicKey: data.publicKey || "" })); }}>
                  تغيير
                </Button>
              </div>
            ) : (
              <Input
                value={form.publicKey}
                onChange={(e) => setForm((f) => ({ ...f, publicKey: e.target.value }))}
                placeholder="pk_test_... أو egy_pk_..."
                dir="ltr"
                className="font-mono text-sm"
                autoComplete="off"
              />
            )}
          </div>

          <div>
            <Label>Secret Key</Label>
            {credentialsComplete && data?.hasSecretKey && !replaceSecret && !form.secretKey ? (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-green-700">محفوظ ومشفّر — لا حاجة لإعادة الإدخال</p>
                <Button type="button" variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => { setReplaceSecret(true); setForm((f) => ({ ...f, secretKey: "" })); }}>
                  استبدال
                </Button>
              </div>
            ) : (
              <>
                <Input
                  type="password"
                  value={form.secretKey}
                  onChange={(e) => setForm((f) => ({ ...f, secretKey: e.target.value }))}
                  placeholder="sk_test_... أو sk_live_..."
                  dir="ltr"
                  className="font-mono text-sm"
                  autoComplete="new-password"
                />
                <p className="text-xs text-slate-500 mt-1">من Paymob → Developers → API Keys (يبدأ بـ sk_)</p>
              </>
            )}
          </div>

          <div>
            <Label>HMAC Secret (Webhook)</Label>
            {credentialsComplete && data?.hasHmacSecret && !replaceHmac && !form.hmacSecret ? (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-green-700">محفوظ ✓</p>
                <Button type="button" variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => { setReplaceHmac(true); setForm((f) => ({ ...f, hmacSecret: "" })); }}>
                  استبدال
                </Button>
              </div>
            ) : (
              <Input
                type="password"
                value={form.hmacSecret}
                onChange={(e) => setForm((f) => ({ ...f, hmacSecret: e.target.value }))}
                placeholder="من Paymob → Developers → Webhooks"
                dir="ltr"
                className="font-mono text-sm"
                autoComplete="new-password"
              />
            )}
          </div>

          <div>
            <Label className="mb-2 block">جدول طرق الدفع — غيّر رقم التكامل فقط</Label>
            {legacyCardId && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-3 text-sm text-red-800 flex flex-wrap items-center justify-between gap-2">
                <span>رقم البطاقة الحالي لا يعمل مع Unified Checkout. استخدم <strong dir="ltr">{LIVE_UNIFIED_CARD_INTEGRATION_ID}</strong>.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-800 shrink-0"
                  onClick={applyRecommendedCardId}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "جاري الحفظ..." : `تعيين ${LIVE_UNIFIED_CARD_INTEGRATION_ID} وحفظ`}
                </Button>
              </div>
            )}
            <PaymobPaymentMethodsTable
              rows={paymentMethods}
              editable
              mode={form.mode}
              onChange={setPaymentMethods}
            />
          </div>

          {lastError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {lastError}
            </div>
          )}

          {!credentialsComplete ? (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isEnabled}
                onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm font-medium text-slate-700">تفعيل الدفع عبر Paymob</span>
            </label>
          ) : (
            <p className="text-xs text-slate-500">
              لتفعيل أو إيقاف الدفع استخدم «عرض الحالة» ثم مربع «تفعيل الدفع للعملاء»، أو احفظ هنا وسيُحافظ على حالة التفعيل الحالية.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
            {credentialsComplete && (
              <Button variant="outline" onClick={exitEditMode}>
                عرض الحالة
              </Button>
            )}
          </div>
        </div>
      )}

      {data?.webhookUrl && (
        <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm border border-slate-100">
          <p className="font-medium text-slate-700 flex items-center gap-2">
            <Link2 size={16} />
            رابط Webhook (ضعه في Paymob)
          </p>
          <p className="font-mono text-xs break-all text-blue-700" dir="ltr">{data.webhookUrl}</p>
        </div>
      )}
    </div>
  );
}
