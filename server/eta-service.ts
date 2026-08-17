import crypto from "crypto";
import type { Db } from "./db";
import { eq } from "drizzle-orm";
import {
  companyProfile,
  customers,
  items,
  salesInvoiceItems,
  salesInvoices,
} from "../drizzle/schema";
import { decodeSecret, encodeSecret } from "./paymob";
import { tenantWhere } from "./tenant-scope";

export type EtaMode = "preprod" | "production";

export type EtaSettings = {
  enabled: boolean;
  mode: EtaMode;
  clientId: string;
  clientSecret?: string;
  hasClientSecret: boolean;
  activityCode: string;
  branchCode: string;
  portalUrl: string;
  apiBaseUrl: string;
};

export function etaBaseUrl(mode: EtaMode) {
  return mode === "production"
    ? "https://api.invoicing.eta.gov.eg"
    : "https://api.preprod.invoicing.eta.gov.eg";
}

export function etaPortalUrl(mode: EtaMode) {
  return mode === "production"
    ? "https://invoicing.eta.gov.eg"
    : "https://preprod.invoicing.eta.gov.eg";
}

export async function getEtaSettingsForTenant(
  db: Db,
  tenantId: number,
): Promise<EtaSettings | null> {
  const [row] = await db
    .select()
    .from(companyProfile)
    .where(eq(companyProfile.tenantId, tenantId))
    .limit(1);
  if (!row) return null;
  const mode = (row.etaMode === "production" ? "production" : "preprod") as EtaMode;
  return {
    enabled: Boolean(row.etaEnabled),
    mode,
    clientId: row.etaClientId || "",
    hasClientSecret: Boolean(row.etaClientSecretEnc),
    activityCode: row.etaActivityCode || "",
    branchCode: row.etaBranchCode || "",
    portalUrl: etaPortalUrl(mode),
    apiBaseUrl: etaBaseUrl(mode),
  };
}

export async function saveEtaSettings(
  db: Db,
  tenantId: number,
  input: {
    enabled: boolean;
    mode: EtaMode;
    clientId: string;
    clientSecret?: string;
    activityCode: string;
    branchCode: string;
  },
) {
  const [existing] = await db
    .select({ id: companyProfile.id, etaClientSecretEnc: companyProfile.etaClientSecretEnc })
    .from(companyProfile)
    .where(eq(companyProfile.tenantId, tenantId))
    .limit(1);

  const secretEnc = input.clientSecret?.trim()
    ? encodeSecret(input.clientSecret.trim())
    : existing?.etaClientSecretEnc || null;

  const payload = {
    etaEnabled: input.enabled,
    etaMode: input.mode,
    etaClientId: input.clientId.trim() || null,
    etaClientSecretEnc: secretEnc,
    etaActivityCode: input.activityCode.trim() || null,
    etaBranchCode: input.branchCode.trim() || null,
  };

  if (existing) {
    await db.update(companyProfile).set(payload).where(eq(companyProfile.id, existing.id));
  } else {
    await db.insert(companyProfile).values({
      tenantId,
      name: "شركتي",
      ...payload,
    });
  }
  return { success: true };
}

async function getEtaClientSecret(db: Db, tenantId: number) {
  const [row] = await db
    .select({ etaClientSecretEnc: companyProfile.etaClientSecretEnc })
    .from(companyProfile)
    .where(eq(companyProfile.tenantId, tenantId))
    .limit(1);
  if (!row?.etaClientSecretEnc) return "";
  return decodeSecret<string>(row.etaClientSecretEnc);
}

async function fetchEtaToken(mode: EtaMode, clientId: string, clientSecret: string) {
  const base = etaBaseUrl(mode);
  const res = await fetch(`${base}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "InvoicingAPI",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error_description || data?.message || `فشل الحصول على توكن ETA (${res.status})`);
  }
  return data.access_token as string;
}

export async function testEtaConnection(db: Db, tenantId: number) {
  const settings = await getEtaSettingsForTenant(db, tenantId);
  if (!settings) throw new Error("ملف الشركة غير موجود");
  if (!settings.clientId) throw new Error("Client ID مطلوب");
  const clientSecret = await getEtaClientSecret(db, tenantId);
  if (!clientSecret) throw new Error("Client Secret غير محفوظ");

  const token = await fetchEtaToken(settings.mode, settings.clientId, clientSecret);
  return {
    success: true,
    mode: settings.mode,
    portalUrl: settings.portalUrl,
    apiBaseUrl: settings.apiBaseUrl,
    tokenPreview: `${token.slice(0, 12)}…`,
    message: settings.mode === "production"
      ? "الاتصال ببيئة الإنتاج نجح"
      : "الاتصال بالبيئة التجريبية نجح",
  };
}

function buildEtaDocument(opts: {
  invoiceNumber: string;
  date: string;
  issuerTax: string;
  issuerName: string;
  receiverTax?: string | null;
  receiverName: string;
  activityCode: string;
  branchCode: string;
  lines: Array<{
    itemName: string;
    itemCode?: string;
    quantity: number;
    unitPrice: number;
    taxPercent: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}) {
  const issueDate = opts.date.slice(0, 10);
  const netAmount = Math.max(0, opts.subtotal - opts.discount);
  return {
    documents: [
      {
        documentType: "I",
        documentTypeVersion: "1.0",
        dateTimeIssued: `${issueDate}T12:00:00Z`,
        taxpayerActivityCode: opts.activityCode,
        internalID: opts.invoiceNumber,
        issuer: {
          type: "B",
          id: opts.issuerTax.replace(/\D/g, ""),
          name: opts.issuerName,
          branchCode: opts.branchCode || "0",
        },
        receiver: {
          type: opts.receiverTax ? "B" : "P",
          id: (opts.receiverTax || "000000000000000").replace(/\D/g, "") || "000000000000000",
          name: opts.receiverName,
        },
        invoiceLines: opts.lines.map((line, idx) => {
          const salesTotal = line.quantity * line.unitPrice;
          const taxAmount = line.taxPercent > 0
            ? Number((salesTotal * (line.taxPercent / 100)).toFixed(2))
            : 0;
          return {
            description: line.itemName,
            itemType: "EGS",
            itemCode: line.itemCode || `EG-${String(idx + 1).padStart(3, "0")}`,
            unitType: "EA",
            quantity: line.quantity,
            unitValue: {
              currencySold: "EGP",
              amountEGP: line.unitPrice,
            },
            salesTotal,
            total: line.total,
            taxableItems: taxAmount > 0
              ? [{ taxType: "T1", amount: taxAmount, subType: "V001", rate: line.taxPercent }]
              : [],
          };
        }),
        totalSalesAmount: opts.subtotal,
        totalDiscountAmount: opts.discount,
        netAmount,
        taxTotals: opts.tax > 0 ? [{ taxType: "T1", amount: opts.tax }] : [],
        totalAmount: opts.total,
        extraDiscountAmount: 0,
        totalItemsDiscountAmount: 0,
      },
    ],
  };
}

async function markEtaFailed(
  db: Db,
  tenantId: number,
  invoiceId: number,
  error: string,
  uuid?: string,
) {
  await db
    .update(salesInvoices)
    .set({
      etaStatus: "failed",
      etaLastError: error.slice(0, 2000),
      ...(uuid ? { etaUuid: uuid } : {}),
    } as any)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));
}

export async function submitSalesInvoiceToEta(
  db: Db,
  tenantId: number,
  invoiceId: number,
) {
  const [inv] = await db
    .select()
    .from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (!["confirmed", "paid", "partial"].includes(inv.status || "")) {
    throw new Error("يجب اعتماد الفاتورة قبل الإرسال لـ ETA");
  }
  if (inv.etaStatus === "submitted" || inv.etaStatus === "accepted") {
    throw new Error("تم إرسال هذه الفاتورة مسبقاً");
  }

  const [profile] = await db
    .select()
    .from(companyProfile)
    .where(eq(companyProfile.tenantId, tenantId))
    .limit(1);
  if (!profile?.etaEnabled) throw new Error("فاتورة ETA غير مفعّلة في إعدادات الشركة");
  if (!profile.taxNumber) throw new Error("الرقم الضريبي للشركة مطلوب");
  if (!profile.etaClientId || !profile.etaActivityCode) {
    throw new Error("أكمل إعدادات ETA (Client ID وكود النشاط)");
  }

  const clientSecret = await getEtaClientSecret(db, tenantId);
  if (!clientSecret) throw new Error("Client Secret لـ ETA غير محفوظ");

  const [customer] = await db
    .select({ name: customers.name, taxNumber: customers.taxNumber })
    .from(customers)
    .where(tenantWhere(customers, tenantId, eq(customers.id, inv.customerId)));

  const invItems = await db
    .select({
      quantity: salesInvoiceItems.quantity,
      price: salesInvoiceItems.price,
      tax: salesInvoiceItems.tax,
      total: salesInvoiceItems.total,
      itemName: items.name,
      itemCode: items.code,
    })
    .from(salesInvoiceItems)
    .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
    .where(tenantWhere(salesInvoiceItems, tenantId, eq(salesInvoiceItems.invoiceId, invoiceId)));

  if (!invItems.length) throw new Error("الفاتورة بدون بنود");

  const uuid = inv.etaUuid || crypto.randomUUID();
  const mode = (profile.etaMode === "production" ? "production" : "preprod") as EtaMode;

  try {
    const token = await fetchEtaToken(mode, profile.etaClientId, clientSecret);
    const payload = buildEtaDocument({
      invoiceNumber: inv.number,
      date: String(inv.date).slice(0, 10),
      issuerTax: profile.taxNumber,
      issuerName: profile.name,
      receiverTax: customer?.taxNumber,
      receiverName: customer?.name || "عميل",
      activityCode: profile.etaActivityCode,
      branchCode: profile.etaBranchCode || "0",
      lines: invItems.map((row) => ({
        itemName: row.itemName || "صنف",
        itemCode: row.itemCode || undefined,
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.price) || 0,
        taxPercent: Number(row.tax) || 0,
        total: Number(row.total) || 0,
      })),
      subtotal: Number(inv.subtotal) || 0,
      discount: Number(inv.discount) || 0,
      tax: Number(inv.tax) || 0,
      total: Number(inv.total) || 0,
    });

    const base = etaBaseUrl(mode);
    const res = await fetch(`${base}/api/v1.0/documentsubmissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.message || data?.error || JSON.stringify(data).slice(0, 300);
      throw new Error(`رفض ETA: ${msg}`);
    }

    const submissionId = data?.submissionId || data?.id || null;
    const rejected = Array.isArray(data?.rejectedDocuments) && data.rejectedDocuments.length > 0;
    if (rejected) {
      const reason = JSON.stringify(data.rejectedDocuments).slice(0, 500);
      await markEtaFailed(db, tenantId, invoiceId, reason, uuid);
      throw new Error(`رفضت المنظومة المستند: ${reason}`);
    }

    await db
      .update(salesInvoices)
      .set({
        etaUuid: uuid,
        etaStatus: "submitted",
        etaSubmittedAt: new Date(),
        etaSubmissionId: submissionId,
        etaLastError: null,
      } as any)
      .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));

    return {
      success: true,
      uuid,
      submissionId,
      mode,
      portalUrl: etaPortalUrl(mode),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "فشل الإرسال لـ ETA";
    await markEtaFailed(db, tenantId, invoiceId, msg, uuid);
    throw err;
  }
}

export async function checkEtaInvoiceStatus(
  db: Db,
  tenantId: number,
  invoiceId: number,
) {
  const [inv] = await db
    .select()
    .from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (!inv.etaUuid && !inv.etaSubmissionId) {
    throw new Error("الفاتورة لم تُرسل لـ ETA بعد");
  }

  const [profile] = await db
    .select()
    .from(companyProfile)
    .where(eq(companyProfile.tenantId, tenantId))
    .limit(1);
  if (!profile?.etaClientId) throw new Error("إعدادات ETA غير مكتملة");

  const clientSecret = await getEtaClientSecret(db, tenantId);
  if (!clientSecret) throw new Error("Client Secret غير محفوظ");

  const mode = (profile.etaMode === "production" ? "production" : "preprod") as EtaMode;
  const token = await fetchEtaToken(mode, profile.etaClientId, clientSecret);
  const base = etaBaseUrl(mode);

  let remoteStatus = inv.etaStatus || "unknown";
  let detail: unknown = null;

  if (inv.etaUuid) {
    const res = await fetch(`${base}/api/v1.0/documents/${inv.etaUuid}/raw`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      detail = await res.json().catch(() => null);
      const status = (detail as { status?: string })?.status
        || (detail as { documentStatus?: string })?.documentStatus;
      if (status) remoteStatus = String(status).toLowerCase();
    } else if (inv.etaSubmissionId) {
      const subRes = await fetch(`${base}/api/v1.0/documentSubmissions/${inv.etaSubmissionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (subRes.ok) {
        detail = await subRes.json().catch(() => null);
        remoteStatus = "submitted";
      }
    }
  }

  let localStatus = inv.etaStatus || "submitted";
  if (remoteStatus.includes("valid") || remoteStatus.includes("accept")) localStatus = "accepted";
  else if (remoteStatus.includes("reject") || remoteStatus.includes("invalid")) localStatus = "rejected";
  else if (remoteStatus.includes("cancel")) localStatus = "cancelled";
  else if (inv.etaStatus === "submitted") localStatus = "submitted";

  await db
    .update(salesInvoices)
    .set({
      etaStatus: localStatus,
      etaLastError: localStatus === "rejected" ? String(remoteStatus) : null,
    } as any)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));

  return {
    success: true,
    uuid: inv.etaUuid,
    submissionId: inv.etaSubmissionId,
    status: localStatus,
    remoteStatus,
    portalUrl: etaPortalUrl(mode),
    detail,
  };
}
