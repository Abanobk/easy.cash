import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { getDefaultLoginPath } from "@/lib/tenant-login";
import { useCallback, useEffect, useMemo } from "react";

function resolveRedirectPath(path?: string) {
  if (path) return path;
  if (typeof window === "undefined") return "/login";
  return getDefaultLoginPath();
}

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const resolvedRedirect = resolveRedirectPath(options?.redirectPath);
  const { redirectOnUnauthenticated = false, redirectPath = resolvedRedirect } =
    options ?? {};
  const utils = trpc.useUtils();

  // Use SaaS auth instead of Manus OAuth
  const meQuery = trpc.saas.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.saas.logout.useMutation({
    onSuccess: () => {
      utils.saas.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.saas.me.setData(undefined, null);
      await utils.saas.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;
    if (window.location.pathname === "/login") return;
    if (window.location.pathname.endsWith("/login")) return;
    if (window.location.pathname === "/register") return;
    if (window.location.pathname === "/super-admin") return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
