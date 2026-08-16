import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { storagePut } from "../storage";
import { getDb } from "../db";
import { companyProfile } from "../../drizzle/schema";
import { getAppUserById, getSaasSessionFromRequest } from "../saas-auth";
import { registerHubApi } from "../hub-api";
import { registerPaymobRoutes } from "../paymob-routes";
import { registerShopeIntegrationApi } from "../shope-integration-api";
import { registerHrCronRoutes } from "../hr-cron-routes";
import { registerOperationalCronRoutes } from "../operational-cron-routes";
import { assertSecuritySecretsAtBoot } from "../security-secrets";
import { and, eq } from "drizzle-orm";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function corsAllowlist(): Set<string> {
  const raw = [
    process.env.CORS_ORIGINS || "",
    process.env.APP_URL || "",
    process.env.SHOPE_API_URL || "",
  ].join(",");
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
  // Local Vite / hub during development
  if (!ENV.isProduction) {
    set.add("http://localhost:3000");
    set.add("http://localhost:5173");
    set.add("http://127.0.0.1:3000");
    set.add("http://127.0.0.1:5173");
  }
  return set;
}

const LOGO_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB

async function startServer() {
  assertSecuritySecretsAtBoot();

  const app = express();
  const server = createServer(app);
  const allowedOrigins = corsAllowlist();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin.replace(/\/$/, ""))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    } else if (!origin) {
      // same-origin / server-to-server — no ACAO needed
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Tenant-Slug");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Default body limit; logo route uses same parser but we enforce size after decode
  app.use(express.json({ limit: "6mb" }));
  app.use(express.urlencoded({ limit: "6mb", extended: true }));
  registerStorageProxy(app);

  if (process.env.ENABLE_MANUS_OAUTH === "1") {
    registerOAuthRoutes(app);
    console.warn("[security] Manus OAuth enabled (ENABLE_MANUS_OAUTH=1)");
  }

  app.get("/api/health", (_req, res) => {
    res.type("text/plain").send("easy-cash-erp ok");
  });

  app.get("/health", (_req, res) => {
    res.type("text/plain").send("ok");
  });

  // Logo upload — tenant-scoped
  app.post("/api/upload/logo", async (req, res) => {
    try {
      const session = await getSaasSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const appUser = await getAppUserById(session.userId);
      if (!appUser?.isActive) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const tenantId = appUser.tenantId ?? session.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: "الحساب غير مرتبط بشركة" });
        return;
      }

      const { data, mimeType, fileName } = req.body as { data?: string; mimeType?: string; fileName?: string };
      if (!data || !mimeType) {
        res.status(400).json({ error: "بيانات ناقصة" });
        return;
      }
      const mime = String(mimeType).toLowerCase().split(";")[0]!.trim();
      if (!LOGO_MIME.has(mime)) {
        res.status(400).json({ error: "نوع الملف غير مسموح (PNG/JPEG/WebP/GIF فقط)" });
        return;
      }
      const buffer = Buffer.from(data, "base64");
      if (buffer.length > LOGO_MAX_BYTES) {
        res.status(400).json({ error: "حجم اللوجو أكبر من 2 ميجابايت" });
        return;
      }
      const extRaw = (fileName?.split(".").pop() || mime.split("/")[1] || "png").toLowerCase();
      const ext = ["png", "jpg", "jpeg", "webp", "gif"].includes(extRaw) ? extRaw : "png";
      const { key, url } = await storagePut(`company-logos/t${tenantId}/logo.${ext}`, buffer, mime);

      const db = await getDb();
      if (db) {
        const [existing] = await db
          .select({ id: companyProfile.id })
          .from(companyProfile)
          .where(eq(companyProfile.tenantId, tenantId))
          .limit(1);
        if (existing) {
          await db
            .update(companyProfile)
            .set({ logo: url, logoKey: key })
            .where(and(eq(companyProfile.id, existing.id), eq(companyProfile.tenantId, tenantId)));
        } else {
          await db.insert(companyProfile).values({
            tenantId,
            name: appUser.companyName || "شركتي",
            logo: url,
            logoKey: key,
          });
        }
      }
      res.json({ url, key });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "خطأ في الرفع" });
    }
  });

  registerHubApi(app);
  registerPaymobRoutes(app);
  registerShopeIntegrationApi(app);
  registerHrCronRoutes(app);
  registerOperationalCronRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
