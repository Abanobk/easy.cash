import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getDefaultLoginPath } from "./lib/tenant-login";
import { getTenantSlugFromPath } from "./lib/tenant";
import "./index.css";

/** سكرول الماوس فوق حقل رقم ما يغيّرش القيمة — يسيّب الفوكس ويكمل سكرول الصفحة */
if (typeof window !== "undefined") {
  window.addEventListener(
    "wheel",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "number") return;
      if (document.activeElement === t) t.blur();
    },
    { passive: true, capture: true },
  );
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Redirect to SaaS login page instead of Manus OAuth
  const currentPath = window.location.pathname;
  const loginPath = getDefaultLoginPath(currentPath);
  if (
    currentPath !== "/login" &&
    currentPath !== "/register" &&
    currentPath !== "/super-admin" &&
    !currentPath.endsWith("/login")
  ) {
    window.location.href = loginPath;
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const extra: Record<string, string> = {};
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              extra.Authorization = `Bearer ${token}`;
            }
          }
        } catch {
          /* sessionStorage unavailable */
        }
        if (!extra.Authorization && typeof document !== "undefined") {
          const saasMatch = document.cookie.match(/(?:^|;\s*)easy_cash_session=([^;]+)/);
          if (saasMatch?.[1]) {
            try {
              extra.Authorization = `Bearer ${decodeURIComponent(saasMatch[1])}`;
            } catch {
              extra.Authorization = `Bearer ${saasMatch[1]}`;
            }
          }
        }
        const slug = getTenantSlugFromPath();
        if (slug) {
          extra["x-tenant-slug"] = slug;
        }
        return extra;
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
