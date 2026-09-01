import { useState, ReactNode, useEffect, useMemo } from "react";
import { getTenantSlugFromPath, tenantPath } from "@/lib/tenant";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  ChevronDown, ChevronLeft,
  Bell, Menu, X, LogOut, User, Scale,
  Settings, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { ERP_NAVIGATION, NavItemConfig } from "@/config/erp-navigation";
import { navIcon } from "@/config/erp-nav-icons";
import SubscriptionStatusBar from "@/components/SubscriptionStatusBar";
import SubscriptionHubButton from "@/components/SubscriptionHubButton";
import { usePermissions } from "@/hooks/usePermissions";
import { useEntityPermissions } from "@/hooks/useEntityPermission";
import { moduleKeyForNavGroup, entityTreeAllowsNavItem } from "@/lib/entity-nav-filter";
import { toast } from "sonner";

interface NavItem {
  label: string;
  icon: ReactNode;
  path?: string;
  status?: "done" | "partial" | "missing";
  children?: NavItem[];
}

function filterNavByPermissions(
  items: NavItemConfig[],
  canAccessPath: (path?: string, featureKey?: string) => boolean,
  entities: Record<string, string[]>,
  parentModuleKey: string | null = null,
): NavItemConfig[] {
  const result: NavItemConfig[] = [];
  for (const item of items) {
    const moduleKey = parentModuleKey ?? moduleKeyForNavGroup(item.label);
    const isGroup = !!item.children?.length;

    if (!entityTreeAllowsNavItem(entities, moduleKey, item.label, isGroup)) continue;

    if (isGroup) {
      const children = filterNavByPermissions(item.children!, canAccessPath, entities, moduleKey);
      if (children.length === 0) continue;
      result.push({ ...item, children });
      continue;
    }
    if (!item.path) {
      result.push(item);
      continue;
    }
    if (canAccessPath(item.path, item.featureKey)) {
      result.push(item);
    }
  }
  return result;
}

function configToNav(items: NavItemConfig[]): NavItem[] {
  return items.map((item) => ({
    label: item.label,
    icon: navIcon(item.icon, item.children ? 20 : 18),
    path: item.path,
    status: item.status,
    children: item.children ? configToNav(item.children) : undefined,
  }));
}

const baseNavItems = configToNav(ERP_NAVIGATION);

function pathMatches(location: string, tenantSlug: string, path: string): boolean {
  const [base, query] = path.split("?");
  const href = tenantPath(tenantSlug, base || "/");
  if (location === href) return true;
  if (!location.startsWith(href)) return false;
  if (query) return location.includes(query.split("=")[0] || "");

  // Mega: صنف = بطاقة جديدة (/items/new) · قائمة الاصناف = الجدول (/items)
  // لا تفعّل «قائمة الاصناف» على /items/new
  if (base === "/items") {
    const rest = location.slice(href.length);
    return /^\/\d+(\/|$)/.test(rest);
  }
  if (base === "/items/new") {
    return location === href;
  }

  return base !== "/" && (location === href || location.startsWith(`${href}/`));
}

interface SidebarItemProps {
  item: NavItem;
  level?: number;
  onNavigate?: () => void;
}

function SidebarItem({ item, level = 0, onNavigate, tenantSlug }: SidebarItemProps & { tenantSlug: string }) {
  const [location] = useLocation();
  const rawPath = item.path || "/";
  const [basePath, query] = rawPath.split("?");
  const href = tenantPath(tenantSlug, basePath || "/");
  const linkHref = query ? `${href}?${query}` : href;
  const [open, setOpen] = useState(() => {
    if (!item.children) return false;
    return item.children.some((c) => {
      const match = (child: NavItem): boolean => {
        if (child.path && pathMatches(location, tenantSlug, child.path)) return true;
        return (child.children ?? []).some(match);
      };
      return match(c);
    });
  });

  const isActive = item.path && pathMatches(location, tenantSlug, item.path);

  if (!item.children) {
    return (
      <Link href={linkHref} onClick={onNavigate}>
        <div
          className={`erp-nav-item ${isActive ? "erp-nav-item-active" : ""} ${level > 0 ? "erp-nav-child" : ""}`}
          style={level > 0 ? { marginRight: `${level * 0.65}rem` } : undefined}
        >
          <span className="flex-shrink-0 opacity-95">{item.icon}</span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.status === "missing" && (
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="قيد التطوير" />
          )}
          {item.status === "partial" && (
            <span className="w-2 h-2 rounded-full bg-sky-300 flex-shrink-0" title="جزئي" />
          )}
        </div>
      </Link>
    );
  }

  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        className={`erp-nav-item erp-nav-group ${open ? "erp-nav-group-open" : ""}`}
      >
        <span className="flex-shrink-0 opacity-95">{item.icon}</span>
        <span className="flex-1 truncate">{item.label}</span>
        <span className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
          <ChevronLeft size={16} strokeWidth={2.5} />
        </span>
      </div>
      {open && (
        <div className="mt-1 space-y-1 border-r-[3px] mr-3 pr-0.5" style={{ borderColor: "rgba(217,165,66,0.35)" }}>
          {item.children.map((child, i) => (
            <SidebarItem key={i} item={child} level={level + 1} onNavigate={onNavigate} tenantSlug={tenantSlug} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ERPLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function ERPLayout({ children, title }: ERPLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [location, navigate] = useLocation();
  const tenantSlug = getTenantSlugFromPath();
  const { user, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const syncOperational = trpc.notifications.syncOperational.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });
  const notifCountQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    retry: false,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const alertsQuery = trpc.dashboard.alerts.useQuery(undefined, {
    retry: false,
    refetchInterval: 120_000,
  });
  const saasNotifQuery = trpc.saas.getMyNotifications.useQuery(undefined, {
    retry: false,
    refetchInterval: 120_000,
  });
  const notifCount = {
    count: (notifCountQuery.data?.count ?? 0) + (saasNotifQuery.data || []).filter((n) => !n.isRead).length,
  };
  const pendingDocsCount =
    (alertsQuery.data?.counts.draftDocs ?? 0) +
    (alertsQuery.data?.counts.unpaidSales ?? 0) +
    (alertsQuery.data?.counts.unpaidPurchases ?? 0);

  useEffect(() => {
    if (!isAuthenticated) return;
    syncOperational.mutate();
    const timer = setInterval(() => syncOperational.mutate(), 5 * 60_000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  // Fetch SaaS user for subscription check
  const saasMe = trpc.saas.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
  const saasUser = saasMe.data;
  const { canAccessPath, isLoading: permsLoading, bypass: permsBypass } = usePermissions();
  const { entities: entityPerms, isLoading: entityPermsLoading } = useEntityPermissions();

  const navItems = useMemo(() => {
    if (permsLoading || permsBypass) return baseNavItems;
    if (entityPermsLoading) return baseNavItems;
    const filtered = filterNavByPermissions(ERP_NAVIGATION, canAccessPath, entityPerms);
    return configToNav(filtered);
  }, [permsLoading, permsBypass, canAccessPath, entityPerms, entityPermsLoading]);

  useEffect(() => {
    if (permsLoading || permsBypass || !tenantSlug) return;
    const prefix = `/${tenantSlug}`;
    if (!location.startsWith(prefix)) return;
    const relative = location.slice(prefix.length) || "/";
    if (relative.startsWith("/subscription-expired") || relative.startsWith("/login")) return;
    if (!canAccessPath(relative)) {
      toast.error("ليس لديك صلاحية الوصول لهذه الصفحة");
      navigate(tenantPath(tenantSlug, "/"));
    }
  }, [location, tenantSlug, permsLoading, permsBypass, canAccessPath, navigate]);

  // Redirect to expired page if subscription is not active (except superadmin)
  useEffect(() => {
    if (saasMe.isLoading) return;
    if (!saasUser) return;
    if (saasUser.role === "superadmin") return;
    if (!saasUser.hasActiveSubscription) {
      navigate(tenantPath(tenantSlug, "/subscription-expired"));
    }
  }, [saasUser, saasMe.isLoading, navigate, tenantSlug]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--ink-900) 0%, var(--ink-700) 100%)" }}>
        <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center eca-fade-up">
          <img
            src="/easy-cash-brand.png"
            alt="Easy Cash"
            className="w-28 h-28 object-contain mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Easy Cash</h1>
          <p className="text-slate-500 mb-8 text-sm">نظام المحاسبة والإدارة المتكامل</p>
          <a href={tenantPath(tenantSlug, "/login")}>
            <Button className="eca-btn-primary w-full py-3 text-base font-semibold rounded-xl border-0">
              تسجيل الدخول
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const SidebarContent = (
    <div className="flex flex-col h-full">
      {/* هوية Easy Cash */}
      <div className={`border-b border-white/10 ${sidebarOpen ? "px-4 py-4" : "px-2 py-3"}`}>
        {sidebarOpen ? (
          <div className="flex flex-col items-center text-center gap-2">
            <img
              src="/easy-cash-brand.png"
              alt="Easy Cash"
              className="w-[5.5rem] h-[5.5rem] object-contain drop-shadow-md bg-white rounded-2xl p-1.5"
            />
            <div>
              <div className="text-white font-extrabold text-lg leading-tight tracking-tight">Easy Cash</div>
              <div className="text-sky-200/90 text-xs font-semibold mt-0.5">حساباتك .. أسهل معانا</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <img
              src="/easy-cash-logo.png"
              alt="Easy Cash"
              className="w-11 h-11 object-contain rounded-xl bg-white p-0.5 shadow-lg"
            />
          </div>
        )}
      </div>

      {/* Nav — min-h-0 so the list scrolls instead of covering the footer */}
      <nav className="erp-sidebar-nav flex-1 min-h-0 overflow-y-auto py-4 px-2.5 space-y-1">
        {navItems.map((item, i) => (
          <SidebarItem key={i} item={item} onNavigate={() => setMobileSidebarOpen(false)} tenantSlug={tenantSlug || ""} />
        ))}
      </nav>

      {/* User info */}
      <div className="border-t border-white/10 p-3.5" style={{ background: "rgba(18,34,44,0.4)" }}>
        <div className="flex items-center gap-2.5 text-slate-200">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-md" style={{ background: "linear-gradient(135deg, var(--brass-400), var(--brass-600))" }}>
            <User size={16} className="text-white" strokeWidth={2.4} />
          </div>
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-extrabold truncate">{user?.name || "مستخدم"}</div>
              <div className="text-sky-200/80 text-xs font-semibold truncate">{user?.email || ""}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden erp-main" dir="rtl">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col erp-sidebar transition-all duration-300 flex-shrink-0 print:hidden ${sidebarOpen ? "w-[17.5rem]" : "w-[4.5rem]"}`}
      >
        {SidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute right-0 top-0 bottom-0 w-[19rem] erp-sidebar flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <img
                  src="/easy-cash-brand.png"
                  alt="Easy Cash"
                  className="w-10 h-10 object-contain rounded-lg bg-white p-0.5"
                />
                <span className="text-white font-extrabold text-lg">Easy Cash</span>
              </div>
              <button onClick={() => setMobileSidebarOpen(false)} className="text-slate-300 hover:text-white p-1">
                <X size={22} />
              </button>
            </div>
            <nav className="erp-sidebar-nav flex-1 min-h-0 overflow-y-auto py-4 px-2.5 space-y-1">
              {navItems.map((item, i) => (
                <SidebarItem key={i} item={item} onNavigate={() => setMobileSidebarOpen(false)} tenantSlug={tenantSlug || ""} />
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white/95 backdrop-blur border-b-2 px-4 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0 print:hidden" style={{ borderColor: "var(--line)" }}>
          {/* Mobile menu */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden p-1.5 rounded-lg transition-colors" style={{ color: "var(--ink-700)" }}
          >
            <Menu size={24} strokeWidth={2.4} />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex transition-colors p-1.5 rounded-lg hover:bg-[var(--paper-100)]" style={{ color: "var(--ink-700)" }}
          >
            <Menu size={22} strokeWidth={2.4} />
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            {title && <h1 className="erp-page-title truncate">{title}</h1>}
          </div>

          {/* Subscription — header only, never over the sidebar menu */}
          {saasUser?.subscriptionBanner && saasUser.role !== "superadmin" && (
            <div className="hidden md:block max-w-xs">
              <SubscriptionStatusBar
                banner={saasUser.subscriptionBanner}
                tenantSlug={tenantSlug}
                compact
              />
            </div>
          )}
          {saasUser?.subscriptionBanner && saasUser.role !== "superadmin" && (
            <SubscriptionHubButton
              tenantSlug={tenantSlug}
              banner={saasUser.subscriptionBanner}
            />
          )}

          {/* Top bar actions */}
          <div className="flex items-center gap-2">
            {/* Database indicator */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold" style={{ background: "var(--good-100)", border: "1px solid #bcd9c8", color: "var(--good-600)" }}>
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
              <span>قاعدة البيانات الرئيسية</span>
            </div>

            {/* مراجع الحسابات الذكي — بدل الكاشير غير الشغّال */}
            <Link href={tenantPath(tenantSlug, "/accounting-auditor")}>
              <Button variant="outline" size="sm" className="flex gap-1.5 text-sm font-bold border-emerald-300 text-emerald-900 hover:bg-emerald-50 px-2.5 sm:px-3 h-9">
                <Scale size={16} />
                <span className="hidden sm:inline">مراجع الحسابات</span>
              </Button>
            </Link>

            {/* Notifications */}
            <Link href={tenantPath(tenantSlug, "/notifications")}>
              <button className="relative p-2.5 rounded-xl transition-colors hover:bg-[var(--paper-100)]" style={{ color: "var(--muted-foreground)" }}>
                <Bell size={20} strokeWidth={2.3} />
                {(notifCount?.count ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 min-w-5 h-5 px-1 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-extrabold">
                    {notifCount?.count}
                  </span>
                )}
              </button>
            </Link>

            {/* Pending docs */}
            <Link href={tenantPath(tenantSlug, "/pending-docs")}>
              <button className="relative p-2.5 rounded-xl transition-colors hover:bg-[var(--paper-100)]" style={{ color: "var(--muted-foreground)" }}>
                <FileText size={20} strokeWidth={2.3} />
                {pendingDocsCount > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 min-w-5 h-5 px-1 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-extrabold">
                    {pendingDocsCount > 9 ? "9+" : pendingDocsCount}
                  </span>
                )}
              </button>
            </Link>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm" style={{ background: "var(--brass-500)" }}>
                    <User size={15} className="text-white" strokeWidth={2.4} />
                  </div>
                  <span className="text-sm font-bold text-slate-800 hidden sm:block">{user?.name || "مستخدم"}</span>
                  <ChevronDown size={15} className="text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 text-[15px]">
                <DropdownMenuItem asChild>
                  <Link href={tenantPath(tenantSlug, "/profile")}>
                    <User size={15} className="ml-2" />
                    الملف الشخصي
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={tenantPath(tenantSlug, "/settings/company")}>
                    <Settings size={15} className="ml-2" />
                    الإعدادات
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { logout(); }} className="text-red-600 font-bold">
                  <LogOut size={15} className="ml-2" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
