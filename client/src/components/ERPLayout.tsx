import { useState, ReactNode, useEffect } from "react";
import { getTenantSlugFromPath, tenantPath } from "@/lib/tenant";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  Settings, Users, Package, ShoppingCart, TrendingUp, DollarSign,
  Building2, BarChart3, Shield, ChevronDown, ChevronLeft,
  Bell, FileText, Menu, X, LogOut, User, Banknote, CreditCard,
  Briefcase, Factory, Target, Landmark, Calendar, Home,
  UserCheck, Layers, ArrowLeftRight, PieChart, BookOpen,
  Wrench, Calculator, TrendingDown, FileCheck, LifeBuoy, Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface NavItem {
  label: string;
  icon: ReactNode;
  path?: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: "الرئيسية",
    icon: <Home size={18} />,
    path: "/",
  },
  {
    label: "الإعدادات العامة",
    icon: <Settings size={18} />,
    children: [
      { label: "إعدادات الشركة", icon: <Building2 size={15} />, path: "/settings/company" },
      { label: "الفروع", icon: <Layers size={15} />, path: "/settings/branches" },
      { label: "المستخدمون والصلاحيات", icon: <Shield size={15} />, path: "/settings/users" },
      { label: "الدعم الفني", icon: <LifeBuoy size={15} />, path: "/support" },
    ],
  },
  {
    label: "العملاء والموردين",
    icon: <Users size={18} />,
    children: [
      { label: "فئات العملاء / الموردين", icon: <Layers size={15} />, path: "/contact-categories" },
      { label: "قائمة العملاء", icon: <Users size={15} />, path: "/customers" },
      { label: "قائمة الموردين", icon: <Users size={15} />, path: "/suppliers" },
      { label: "كشف حساب عميل / مورد", icon: <FileText size={15} />, path: "/contacts/statement" },
    ],
  },
  {
    label: "شئون الموظفين",
    icon: <Briefcase size={18} />,
    children: [
      { label: "الإدارات", icon: <Building2 size={15} />, path: "/hr/departments" },
      { label: "الوظائف", icon: <Briefcase size={15} />, path: "/hr/jobs" },
      { label: "قائمة الموظفين", icon: <Users size={15} />, path: "/hr/employees" },
      { label: "الحضور والانصراف", icon: <Calendar size={15} />, path: "/hr/attendance" },
      { label: "السلف", icon: <DollarSign size={15} />, path: "/hr/advances" },
      { label: "الرواتب", icon: <Calculator size={15} />, path: "/hr/payroll" },
    ],
  },
  {
    label: "المخازن",
    icon: <Package size={18} />,
    children: [
      { label: "قائمة الأصناف", icon: <Package size={15} />, path: "/items" },
      { label: "تسوية مخزنية", icon: <ArrowLeftRight size={15} />, path: "/inventory/adjustments" },
      { label: "تحويل مخزني", icon: <ArrowLeftRight size={15} />, path: "/inventory/transfers" },
    ],
  },
  {
    label: "فواتير الشراء",
    icon: <ShoppingCart size={18} />,
    children: [
      { label: "طلبات الشراء", icon: <FileText size={15} />, path: "/purchases/orders" },
      { label: "فواتير الشراء", icon: <FileCheck size={15} />, path: "/purchases/invoices" },
      { label: "مردودات الشراء", icon: <TrendingDown size={15} />, path: "/purchases/returns" },
    ],
  },
  {
    label: "فواتير المبيعات",
    icon: <TrendingUp size={18} />,
    children: [
      { label: "طلبات البيع", icon: <FileText size={15} />, path: "/sales/orders" },
      { label: "فواتير البيع", icon: <FileCheck size={15} />, path: "/sales/invoices" },
      { label: "مردودات البيع", icon: <TrendingDown size={15} />, path: "/sales/returns" },
    ],
  },
  {
    label: "مندوبين البيع",
    icon: <UserCheck size={18} />,
    children: [
      { label: "قائمة المندوبين", icon: <Users size={15} />, path: "/sales/reps" },
    ],
  },
  {
    label: "معاملات نقدية",
    icon: <Banknote size={18} />,
    children: [
      { label: "استلام نقدية", icon: <DollarSign size={15} />, path: "/cash/receive" },
      { label: "استلام من عميل", icon: <DollarSign size={15} />, path: "/cash/receive-customer" },
      { label: "صرف نقدية", icon: <DollarSign size={15} />, path: "/cash/pay" },
      { label: "صرف لمورد", icon: <DollarSign size={15} />, path: "/cash/pay-supplier" },
    ],
  },
  {
    label: "معاملات بنكية",
    icon: <Landmark size={18} />,
    children: [
      { label: "المعاملات البنكية", icon: <CreditCard size={15} />, path: "/bank/transactions" },
      { label: "الشيكات", icon: <FileCheck size={15} />, path: "/bank/checks" },
    ],
  },
  {
    label: "الحسابات",
    icon: <BookOpen size={18} />,
    children: [
      { label: "شجرة الحسابات", icon: <Layers size={15} />, path: "/accounts/chart" },
      { label: "قيود اليومية", icon: <FileText size={15} />, path: "/accounts/journal" },
      { label: "تحويل الأموال", icon: <ArrowLeftRight size={15} />, path: "/accounts/transfer" },
    ],
  },
  {
    label: "الأصول الثابتة",
    icon: <Wrench size={18} />,
    children: [
      { label: "قائمة الأصول", icon: <FileText size={15} />, path: "/assets" },
    ],
  },
  {
    label: "الإنتاج",
    icon: <Factory size={18} />,
    children: [
      { label: "أوامر الإنتاج", icon: <FileText size={15} />, path: "/production" },
    ],
  },
  {
    label: "مراكز التكلفة",
    icon: <Target size={18} />,
    children: [
      { label: "قائمة مراكز التكلفة", icon: <FileText size={15} />, path: "/cost-centers" },
    ],
  },
  {
    label: "القروض",
    icon: <DollarSign size={18} />,
    children: [
      { label: "قائمة القروض", icon: <FileText size={15} />, path: "/loans" },
    ],
  },
  {
    label: "الأقساط",
    icon: <Calendar size={18} />,
    children: [
      { label: "قائمة الأقساط", icon: <Calendar size={15} />, path: "/installments" },
    ],
  },
  {
    label: "التقارير",
    icon: <BarChart3 size={18} />,
    children: [
      { label: "تقارير المخازن", icon: <Package size={15} />, path: "/reports/inventory" },
      { label: "تقارير الحسابات", icon: <BookOpen size={15} />, path: "/reports" },
      { label: "تقارير الموظفين", icon: <Users size={15} />, path: "/reports/hr" },
      { label: "الميزانية العمومية", icon: <PieChart size={15} />, path: "/reports/balance-sheet" },
      { label: "الأرباح والخسائر", icon: <TrendingUp size={15} />, path: "/reports/income-statement" },
      { label: "تحليلات المبيعات", icon: <BarChart3 size={15} />, path: "/reports/analytics" },
      { label: "تقرير الضرائب", icon: <Receipt size={15} />, path: "/reports/tax" },
    ],
  },
];

interface SidebarItemProps {
  item: NavItem;
  level?: number;
  onNavigate?: () => void;
}

function SidebarItem({ item, level = 0, onNavigate, tenantSlug }: SidebarItemProps & { tenantSlug: string }) {
  const [location] = useLocation();
  const href = tenantPath(tenantSlug, item.path || "/");
  const [open, setOpen] = useState(() => {
    if (!item.children) return false;
    return item.children.some(c => c.path && location.startsWith(tenantPath(tenantSlug, c.path)));
  });

  const isActive = item.path && (location === href || (item.path !== "/" && location.startsWith(href)));

  if (!item.children) {
    return (
      <Link href={href} onClick={onNavigate}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all duration-150 text-sm
            ${isActive
              ? "bg-blue-500 text-white font-semibold shadow-sm"
              : "text-slate-300 hover:bg-slate-700 hover:text-white"
            }
            ${level > 0 ? "mr-4 text-xs" : ""}
          `}
        >
          <span className="flex-shrink-0 opacity-80">{item.icon}</span>
          <span className="flex-1 truncate">{item.label}</span>
        </div>
      </Link>
    );
  }

  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all duration-150 text-sm
          ${open ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-white"}
        `}
      >
        <span className="flex-shrink-0 opacity-80">{item.icon}</span>
        <span className="flex-1 truncate font-medium">{item.label}</span>
        <span className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
          <ChevronLeft size={14} />
        </span>
      </div>
      {open && (
        <div className="mt-0.5 space-y-0.5 border-r-2 border-blue-500/30 mr-4">
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
  const [, navigate] = useLocation();
  const tenantSlug = getTenantSlugFromPath();
  const { user, isAuthenticated, logout } = useAuth();
  // جلب الإشعارات الداخلية للمستخدم
  const notifQuery = trpc.saas.getMyNotifications.useQuery(undefined, {
    retry: false,
    refetchInterval: 60000, // تحديث كل دقيقة
    refetchOnWindowFocus: true,
  });
  const notifCount = { count: (notifQuery.data || []).filter(n => !n.isRead).length };

  // Fetch SaaS user for subscription check
  const saasMe = trpc.saas.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const saasUser = saasMe.data;

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
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Easy Cash</h1>
          <p className="text-slate-500 mb-8 text-sm">نظام المحاسبة والإدارة المتكامل</p>
          <a href={tenantPath(tenantSlug, "/login")}>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-semibold rounded-xl">
              تسجيل الدخول
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const SidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700">
        <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <BookOpen size={18} className="text-white" />
        </div>
        {sidebarOpen && (
          <div>
            <div className="text-white font-bold text-base leading-tight">Easy Cash</div>
            <div className="text-slate-400 text-xs">نظام المحاسبة المتكامل</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item, i) => (
          <SidebarItem key={i} item={item} onNavigate={() => setMobileSidebarOpen(false)} tenantSlug={tenantSlug || ""} />
        ))}
      </nav>

      {/* User info */}
      <div className="border-t border-slate-700 p-3">
        <div className="flex items-center gap-2 text-slate-300 text-sm">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{user?.name || "مستخدم"}</div>
              <div className="text-slate-400 text-xs truncate">{user?.email || ""}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden" dir="rtl">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-slate-800 transition-all duration-300 flex-shrink-0 ${sidebarOpen ? "w-64" : "w-16"}`}
      >
        {SidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute right-0 top-0 bottom-0 w-72 bg-slate-800 flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <BookOpen size={16} className="text-white" />
                </div>
                <span className="text-white font-bold">Easy Cash</span>
              </div>
              <button onClick={() => setMobileSidebarOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
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
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm flex-shrink-0">
          {/* Mobile menu */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden text-slate-500 hover:text-slate-700"
          >
            <Menu size={22} />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex text-slate-500 hover:text-blue-600 transition-colors"
          >
            <Menu size={20} />
          </button>

          {/* Page title */}
          <div className="flex-1">
            {title && <h1 className="text-slate-800 font-semibold text-base">{title}</h1>}
          </div>

          {/* Subscription warning banner */}
          {saasUser && saasUser.daysRemaining !== null && saasUser.daysRemaining <= 7 && saasUser.daysRemaining > 0 && (
            <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5 text-xs text-amber-700 font-medium">
              <span className="text-amber-500">⚠️</span>
              <span>ينتهي اشتراكك خلال {saasUser.daysRemaining} يوم</span>
              <a href="/pricing" className="underline hover:text-amber-900">جدد الآن</a>
            </div>
          )}

          {/* Top bar actions */}
          <div className="flex items-center gap-2">
            {/* Database indicator */}
            <div className="hidden sm:flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-blue-700 font-medium">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>قاعدة البيانات الرئيسية</span>
            </div>

            {/* Cashier */}
            <Link href="/cashier">
              <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
                <Banknote size={14} />
                الكاشير
              </Button>
            </Link>

            {/* Notifications */}
            <Link href="/notifications">
              <button className="relative p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Bell size={18} />
                {(notifCount?.count ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {notifCount?.count}
                  </span>
                )}
              </button>
            </Link>

            {/* Pending docs */}
            <Link href="/pending-docs">
              <button className="relative p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <FileText size={18} />
              </button>
            </Link>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center">
                    <User size={13} className="text-white" />
                  </div>
                  <span className="text-sm font-medium text-slate-700 hidden sm:block">{user?.name || "مستخدم"}</span>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User size={14} className="ml-2" />
                    الملف الشخصي
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/company">
                    <Settings size={14} className="ml-2" />
                    الإعدادات
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { logout(); }} className="text-red-600">
                  <LogOut size={14} className="ml-2" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
