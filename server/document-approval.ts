import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import { documentApprovals, companySettings } from "../drizzle/schema";
import { getGeneralAttrBool } from "./general-attributes";
import { tenantWhere, withTenantId } from "./tenant-scope";

export type ApprovalDocumentType = "sales_invoice" | "purchase_invoice" | "journal_entry";

export async function queueDocumentApproval(
  db: Db,
  tenantId: number,
  doc: { type: ApprovalDocumentType; id: number; number: string; requestedBy?: number },
) {
  await db.insert(documentApprovals).values(
    withTenantId(tenantId, {
      documentType: doc.type,
      documentId: doc.id,
      documentNumber: doc.number,
      status: "pending",
      requestedBy: doc.requestedBy,
    }) as any,
  );
}

export async function listPendingApprovals(db: Db, tenantId: number, limit = 100) {
  return db
    .select()
    .from(documentApprovals)
    .where(tenantWhere(documentApprovals, tenantId, eq(documentApprovals.status, "pending")))
    .orderBy(documentApprovals.createdAt)
    .limit(limit);
}

export async function resolveDocumentApproval(
  db: Db,
  tenantId: number,
  approvalId: number,
  reviewerId: number | undefined,
  status: "approved" | "rejected",
  notes?: string,
) {
  const [row] = await db
    .select()
    .from(documentApprovals)
    .where(tenantWhere(documentApprovals, tenantId, eq(documentApprovals.id, approvalId)));
  if (!row) throw new Error("طلب الاعتماد غير موجود");
  if (row.status !== "pending") throw new Error("تمت معالجة الطلب مسبقاً");

  await db
    .update(documentApprovals)
    .set({
      status,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      notes,
    } as any)
    .where(tenantWhere(documentApprovals, tenantId, eq(documentApprovals.id, approvalId)));

  return row;
}

export async function companyRequiresApproval(
  db: Db,
  tenantId: number,
): Promise<boolean> {
  const attrOverride = await getGeneralAttrBool(db, tenantId, "require_document_approval");
  if (attrOverride != null) return attrOverride;

  const [row] = await db
    .select({ requireDocumentApproval: companySettings.requireDocumentApproval })
    .from(companySettings)
    .where(tenantWhere(companySettings, tenantId))
    .limit(1);
  return Boolean(row?.requireDocumentApproval);
}

export function userBypassesApproval(role: string) {
  return role === "admin" || role === "superadmin";
}
