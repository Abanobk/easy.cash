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
import { verifySaasToken, SAAS_COOKIE_NAME } from "../saas-auth";
import { registerHubApi } from "../hub-api";
import { eq } from "drizzle-orm";

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

async function startServer() {
  const app = express();
  const server = createServer(app);

  // CORS for portfolio dashboard + hub API
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.type("text/plain").send("easy-cash-erp ok");
  });

  app.get("/health", (_req, res) => {
    res.type("text/plain").send("ok");
  });

  // Logo upload endpoint
  app.post("/api/upload/logo", async (req, res) => {
    try {
      const cookies = req.headers.cookie || "";
      const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
      const session = await verifySaasToken(match?.[1]);
      if (!session) { res.status(401).json({ error: "غير مصرح" }); return; }
      const { data, mimeType, fileName } = req.body as { data: string; mimeType: string; fileName: string };
      if (!data || !mimeType) { res.status(400).json({ error: "بيانات ناقصة" }); return; }
      const buffer = Buffer.from(data, "base64");
      const ext = fileName?.split(".").pop() || "png";
      const { key, url } = await storagePut(`company-logos/logo.${ext}`, buffer, mimeType);
      // Save to DB
      const db = await getDb();
      if (db) {
        const [existing] = await db.select({ id: companyProfile.id }).from(companyProfile).limit(1);
        if (existing) {
          await db.update(companyProfile).set({ logo: url, logoKey: key }).where(eq(companyProfile.id, existing.id));
        } else {
          await db.insert(companyProfile).values({ name: "شركتي", logo: url, logoKey: key });
        }
      }
      res.json({ url, key });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "خطأ في الرفع" });
    }
  });

  registerHubApi(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
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

startServer().catch(console.error);
