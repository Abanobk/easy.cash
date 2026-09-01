import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import {
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  type EffectivePermissions,
  type PermissionModule,
  DEFAULT_ROLE_PERMISSIONS,
  isEditableRoleKey,
} from "../shared/permissions";
import {
  canManageTeamUsers,
  getEffectivePermissions,
  getRolePermissionsForTenant,
  saveRolePermissions,
  saveUserPermissionOverrides,
  roleBypassesPermissions,
  listTenantRoles,
  createTenantRole,
  updateTenantRoleMeta,
  deleteTenantRole,
  assertRoleExists,
} from "./permissions-service";
import {
  getEffectiveScreenPermissions,
  getScreenOverridesForRole,
  saveScreenPermissionsForRole,
} from "./screen-permissions-service";
import { appUsers, tenantEntityPermissions } from "../drizzle/schema";
import { getDb } from "./db";
import { and, eq } from "drizzle-orm";
import { PERMISSION_TREE_RESOLVED, findEntityActions } from "../shared/permission-tree";

const roleKeySchema = z.string().min(1).max(64);
const editableRoleKeySchema = z.string().min(1).max(64).refine((v) => isEditableRoleKey(v), {
  message: "لا يمكن تعديل صلاحيات هذا الدور",
});

const permissionsPayload = z.record(
  z.string(),
  z.object({
    view: z.boolean(),
    create: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
  }),
);

function parsePermissionsPayload(payload: z.infer<typeof permissionsPayload>): EffectivePermissions {
  const result = { ...DEFAULT_ROLE_PERMISSIONS.user };
  for (const mod of PERMISSION_MODULES) {
    const row = payload[mod.id];
    if (row) {
      result[mod.id] = { ...row };
    }
  }
  return result as EffectivePermissions;
}

function adminOnly(ctx: { saasUser: { role: string } | null }) {
  if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
  }
}

export const permissionsRouter = router({
  my: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.saasUser?.tenantId) {
      return { role: ctx.saasUser?.role ?? "user", permissions: DEFAULT_ROLE_PERMISSIONS.user, bypass: false };
    }
    const bypass = roleBypassesPermissions(ctx.saasUser.role);
    const permissions = await getEffectivePermissions({
      userId: ctx.saasUser.id,
      tenantId: ctx.saasUser.tenantId,
      role: ctx.saasUser.role,
    });
    const screenOverrides = bypass
      ? {}
      : await getScreenOverridesForRole(ctx.saasUser.tenantId, ctx.saasUser.role);
    return {
      role: ctx.saasUser.role,
      permissions,
      screenOverrides,
      bypass,
    };
  }),

  /**
   * صلاحيات المستخدم الحالي التفصيلية (للتنفيذ الفعلي في الواجهة — إخفاء/تعطيل الأزرار).
   * entities هنا فيها بس العناصر اللي المدير ظبطها فعليًا لدور المستخدم؛ أي عنصر غير موجود
   * يعتبر "غير مقيّد" (بيرجع للنظام القديم) — نفس منطق assertEntityAction في السيرفر.
   */
  myEntityPermissions: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.saasUser || !ctx.tenantId) return { bypass: true, entities: {} as Record<string, string[]> };
    const bypass = roleBypassesPermissions(ctx.saasUser.role);
    if (bypass) return { bypass: true, entities: {} as Record<string, string[]> };
    const db = await getDb();
    if (!db) return { bypass: true, entities: {} as Record<string, string[]> };
    const rows = await db.select().from(tenantEntityPermissions).where(
      and(eq(tenantEntityPermissions.tenantId, ctx.tenantId), eq(tenantEntityPermissions.role, ctx.saasUser.role)),
    );
    const entities: Record<string, string[]> = {};
    for (const r of rows) entities[`${r.moduleKey}::${r.entityKey}`] = (r.allowedActions as string[]) || [];
    return { bypass: false, entities };
  }),

  /** قائمة الأدوار (مدمجة + مخصصة) لتعيين الصلاحيات والمستخدمين */
  listRoles: protectedProcedure.query(async ({ ctx }) => {
    adminOnly(ctx);
    if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
    const roles = await listTenantRoles(ctx.tenantId);
    return {
      roles,
      editableRoles: roles.filter((r) => isEditableRoleKey(r.roleKey)),
      modules: PERMISSION_MODULES,
      actions: PERMISSION_ACTIONS,
    };
  }),

  createRole: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(500).optional(),
      copyFrom: z.string().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      try {
        const created = await createTenantRole({
          tenantId: ctx.tenantId,
          name: input.name,
          description: input.description,
          copyFrom: input.copyFrom,
        });
        return { success: true, ...created };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message || "فشل إنشاء الدور" });
      }
    }),

  updateRoleMeta: protectedProcedure
    .input(z.object({
      roleKey: editableRoleKeySchema,
      name: z.string().min(1).max(80),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      try {
        await updateTenantRoleMeta({
          tenantId: ctx.tenantId,
          roleKey: input.roleKey,
          name: input.name,
          description: input.description,
        });
        return { success: true };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message || "فشل تحديث الدور" });
      }
    }),

  deleteRole: protectedProcedure
    .input(z.object({ roleKey: editableRoleKeySchema }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      try {
        await deleteTenantRole(ctx.tenantId, input.roleKey);
        return { success: true };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message || "فشل حذف الدور" });
      }
    }),

  roleMatrix: protectedProcedure
    .input(z.object({ role: roleKeySchema }))
    .query(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      await assertRoleExists(ctx.tenantId, input.role);
      const permissions = await getRolePermissionsForTenant(ctx.tenantId, input.role);
      return { role: input.role, permissions };
    }),

  allRoles: protectedProcedure.query(async ({ ctx }) => {
    adminOnly(ctx);
    if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
    const listed = await listTenantRoles(ctx.tenantId);
    const editable = listed.filter((r) => isEditableRoleKey(r.roleKey));
    const entries = await Promise.all(
      editable.map(async (r) => ({
        role: r.roleKey,
        name: r.name,
        permissions: await getRolePermissionsForTenant(ctx.tenantId!, r.roleKey),
      })),
    );
    return {
      modules: PERMISSION_MODULES,
      actions: PERMISSION_ACTIONS,
      roles: entries,
    };
  }),

  saveRole: protectedProcedure
    .input(z.object({
      role: editableRoleKeySchema,
      permissions: permissionsPayload,
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      await saveRolePermissions(ctx.tenantId, input.role, parsePermissionsPayload(input.permissions));
      return { success: true };
    }),

  userOverrides: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [user] = await db.select().from(appUsers).where(and(eq(appUsers.id, input.userId), eq(appUsers.tenantId, ctx.tenantId))).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.role === "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "صلاحيات المدير كاملة" });
      }
      const permissions = await getEffectivePermissions({
        userId: user.id,
        tenantId: ctx.tenantId,
        role: user.role,
      });
      return { userId: user.id, role: user.role, permissions };
    }),

  saveUserOverrides: protectedProcedure
    .input(z.object({
      userId: z.number(),
      permissions: permissionsPayload,
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [user] = await db.select().from(appUsers).where(and(eq(appUsers.id, input.userId), eq(appUsers.tenantId, ctx.tenantId))).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.role === "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "صلاحيات المدير كاملة" });
      }

      const roleDefaults = await getRolePermissionsForTenant(ctx.tenantId!, user.role);
      const overrides: Partial<Record<PermissionModule, EffectivePermissions[PermissionModule] | null>> = {};

      for (const mod of PERMISSION_MODULES) {
        const desired = input.permissions[mod.id];
        if (!desired) continue;
        const base = roleDefaults[mod.id];
        const differs =
          desired.view !== base.view ||
          desired.create !== base.create ||
          desired.edit !== base.edit ||
          desired.delete !== base.delete;
        overrides[mod.id] = differs ? desired : null;
      }

      await saveUserPermissionOverrides(user.id, overrides);
      return { success: true };
    }),

  screenMatrix: protectedProcedure
    .input(z.object({
      role: editableRoleKeySchema,
      featureKeys: z.array(z.string()),
    }))
    .query(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      await assertRoleExists(ctx.tenantId, input.role);
      const modulePerms = await getRolePermissionsForTenant(ctx.tenantId, input.role);
      const screens = await getEffectiveScreenPermissions(
        ctx.tenantId,
        input.role,
        modulePerms,
        input.featureKeys,
      );
      return { role: input.role, screens };
    }),

  saveScreens: protectedProcedure
    .input(z.object({
      role: editableRoleKeySchema,
      screens: z.record(
        z.string(),
        z.object({
          view: z.boolean(),
          create: z.boolean(),
          edit: z.boolean(),
          delete: z.boolean(),
        }),
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      await saveScreenPermissionsForRole(ctx.tenantId, input.role, input.screens);
      return { success: true };
    }),

  /**
   * الشجرة التفصيلية (زي ميجا كاش) — قسم ← عنصر ← أفعال محددة له. مرحلة تخزين/إدارة بس
   * حاليًا (shared/permission-tree.ts) — الربط بالتنفيذ الفعلي هيحصل تدريجيًا بعد كده.
   */
  entityTree: protectedProcedure
    .input(z.object({ role: roleKeySchema }))
    .query(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      await assertRoleExists(ctx.tenantId, input.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(tenantEntityPermissions).where(
        and(eq(tenantEntityPermissions.tenantId, ctx.tenantId), eq(tenantEntityPermissions.role, input.role)),
      );
      const saved = new Map<string, string[]>();
      for (const r of rows) saved.set(`${r.moduleKey}::${r.entityKey}`, (r.allowedActions as string[]) || []);
      const tree = PERMISSION_TREE_RESOLVED.map((m) => ({
        key: m.key,
        label: m.label,
        entities: m.entities.map((e) => {
          const id = `${m.key}::${e.key}`;
          return {
            key: e.key,
            label: e.label,
            availableActions: e.actions,
            allowedActions: saved.get(id) || [],
            // العنصر ده له صف محفوظ فعليًا (حتى لو أفعاله فاضية = مقفول تمامًا) —
            // مختلف عن "لسه محدش لمسه خالص". الواجهة محتاجة تفرّق بينهم عشان الحفظ
            // متبعتش كل عنصر في الشجرة كل مرة (كان بيلغي أي عنصر مقفول عمدًا فاضي).
            configured: saved.has(id),
          };
        }),
      }));
      return { role: input.role, tree };
    }),

  saveEntityTree: protectedProcedure
    .input(z.object({
      role: editableRoleKeySchema,
      entities: z.array(z.object({
        moduleKey: z.string().min(1).max(64),
        entityKey: z.string().min(1).max(128),
        allowedActions: z.array(z.string()).max(30),
      })).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // ملحوظة مهمة: بنحفظ العنصر حتى لو قائمة أفعاله بقت فاضية (يعني "مقفول تمامًا"
      // عمدًا) — دي مختلفة عن "العنصر ده أصلاً مش موجود في الطلب" (يعني الواجهة
      // ما بعتتوش لأن المستخدم لسه ما لمسهوش، فيفضل زي ما هو أو يتشال لو كان متظبط
      // قبل كده). الواجهة (EntityPermissionsTree.tsx) بترسل بس العناصر اللي إما متظبطة
      // من الأول أو المستخدم لمسها في الجلسة دي — مش الشجرة كلها كل مرة.
      const rowsToInsert: Array<{ moduleKey: string; entityKey: string; allowedActions: string[] }> = [];
      for (const e of input.entities) {
        const valid = findEntityActions(e.moduleKey, e.entityKey);
        if (!valid) continue; // عنصر غير معروف في الشجرة — يتجاهل بدل ما يفشل الحفظ كله
        const allowed = e.allowedActions.filter((a) => (valid as string[]).includes(a));
        rowsToInsert.push({ moduleKey: e.moduleKey, entityKey: e.entityKey, allowedActions: allowed });
      }

      await db.delete(tenantEntityPermissions).where(
        and(eq(tenantEntityPermissions.tenantId, ctx.tenantId), eq(tenantEntityPermissions.role, input.role)),
      );
      for (const r of rowsToInsert) {
        await db.insert(tenantEntityPermissions).values({
          tenantId: ctx.tenantId,
          role: input.role,
          moduleKey: r.moduleKey,
          entityKey: r.entityKey,
          allowedActions: r.allowedActions,
        });
      }
      return { success: true, saved: rowsToInsert.length };
    }),
});
