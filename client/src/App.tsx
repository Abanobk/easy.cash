import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TenantProvider } from "@/lib/tenant";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import SuperAdmin from "./pages/admin/SuperAdmin";
import SubscriptionExpired from "./pages/auth/SubscriptionExpired";
import Pricing from "./pages/Pricing";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/contacts/Customers";
import Suppliers from "./pages/contacts/Suppliers";
import ContactCategories from "./pages/contacts/ContactCategories";
import Items from "./pages/inventory/Items";
import StockTransfers from "./pages/inventory/StockTransfers";
import InventoryAdjustments from "./pages/inventory/InventoryAdjustments";
import SalesInvoices from "./pages/sales/SalesInvoices";
import SalesOrders from "./pages/sales/SalesOrders";
import SalesReturns from "./pages/sales/SalesReturns";
import SalesReps from "./pages/sales/SalesReps";
import PurchaseInvoices from "./pages/purchases/PurchaseInvoices";
import PurchaseOrders from "./pages/purchases/PurchaseOrders";
import PurchaseReturns from "./pages/purchases/PurchaseReturns";
import CashTransactions from "./pages/finance/CashTransactions";
import BankTransactions from "./pages/finance/BankTransactions";
import Checks from "./pages/finance/Checks";
import ChartOfAccounts from "./pages/accounts/ChartOfAccounts";
import JournalEntries from "./pages/accounts/JournalEntries";
import FundTransfer from "./pages/accounts/FundTransfer";
import Employees from "./pages/hr/Employees";
import Departments from "./pages/hr/Departments";
import JobTitles from "./pages/hr/JobTitles";
import Attendance from "./pages/hr/Attendance";
import Payroll from "./pages/hr/Payroll";
import Advances from "./pages/hr/Advances";
import FixedAssets from "./pages/assets/FixedAssets";
import Loans from "./pages/loans/Loans";
import Installments from "./pages/loans/Installments";
import CostCenters from "./pages/costcenters/CostCenters";
import Production from "./pages/production/Production";
import Reports from "./pages/reports/Reports";
import SalesAnalytics from "./pages/reports/SalesAnalytics";
import TaxReport from "./pages/reports/TaxReport";
import SalesInvoiceDetail from "./pages/sales/SalesInvoiceDetail";
import PurchaseInvoiceDetail from "./pages/purchases/PurchaseInvoiceDetail";
import ContactStatement from "./pages/contacts/ContactStatement";
import CompanySettings from "./pages/settings/CompanySettings";
import CompanyProfile from "./pages/settings/CompanyProfile";
import Branches from "./pages/settings/Branches";
import UsersPermissions from "./pages/settings/UsersPermissions";
import Support from "./pages/Support";

/** مسار ERP تحت slug الشركة: /:tenantSlug/customers */
const T = (path: string) => `/:tenantSlug${path === "/" ? "" : path}`;

function HomeRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/register"); }, [navigate]);
  return null;
}

function TenantPage({ component: Component }: { component: React.ComponentType }) {
  const [location] = useLocation();
  const slug = location.split("/").filter(Boolean)[0];
  if (!slug) return <NotFound />;
  return (
    <TenantProvider slug={slug}>
      <Component />
    </TenantProvider>
  );
}

function Router() {
  const wrap = (C: React.ComponentType) => () => <TenantPage component={C} />;

  return (
    <Switch>
      <Route path="/register" component={Register} />
      <Route path="/super-admin" component={SuperAdmin} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/" component={HomeRedirect} />

      <Route path={T("/login")} component={wrap(Login)} />
      <Route path={T("/subscription-expired")} component={wrap(SubscriptionExpired)} />
      <Route path={T("/")} component={wrap(Dashboard)} />
      <Route path={T("/dashboard")} component={wrap(Dashboard)} />
      <Route path={T("/customers")} component={wrap(Customers)} />
      <Route path={T("/suppliers")} component={wrap(Suppliers)} />
      <Route path={T("/contact-categories")} component={wrap(ContactCategories)} />
      <Route path={T("/items")} component={wrap(Items)} />
      <Route path={T("/inventory/adjustments")} component={wrap(InventoryAdjustments)} />
      <Route path={T("/inventory/transfers")} component={wrap(StockTransfers)} />
      <Route path={T("/sales/invoices")} component={wrap(SalesInvoices)} />
      <Route path={T("/sales/orders")} component={wrap(SalesOrders)} />
      <Route path={T("/sales/returns")} component={wrap(SalesReturns)} />
      <Route path={T("/sales/reps")} component={wrap(SalesReps)} />
      <Route path={T("/purchases/invoices")} component={wrap(PurchaseInvoices)} />
      <Route path={T("/purchases/orders")} component={wrap(PurchaseOrders)} />
      <Route path={T("/purchases/returns")} component={wrap(PurchaseReturns)} />
      <Route path={T("/cash/receive")} component={wrap(CashTransactions)} />
      <Route path={T("/cash/pay")} component={wrap(CashTransactions)} />
      <Route path={T("/cash/receive-customer")} component={wrap(CashTransactions)} />
      <Route path={T("/cash/pay-supplier")} component={wrap(CashTransactions)} />
      <Route path={T("/bank/transactions")} component={wrap(BankTransactions)} />
      <Route path={T("/bank/checks")} component={wrap(Checks)} />
      <Route path={T("/accounts/chart")} component={wrap(ChartOfAccounts)} />
      <Route path={T("/accounts/journal")} component={wrap(JournalEntries)} />
      <Route path={T("/accounts/transfer")} component={wrap(FundTransfer)} />
      <Route path={T("/hr/employees")} component={wrap(Employees)} />
      <Route path={T("/hr/departments")} component={wrap(Departments)} />
      <Route path={T("/hr/jobs")} component={wrap(JobTitles)} />
      <Route path={T("/hr/attendance")} component={wrap(Attendance)} />
      <Route path={T("/hr/payroll")} component={wrap(Payroll)} />
      <Route path={T("/hr/advances")} component={wrap(Advances)} />
      <Route path={T("/assets")} component={wrap(FixedAssets)} />
      <Route path={T("/loans")} component={wrap(Loans)} />
      <Route path={T("/installments")} component={wrap(Installments)} />
      <Route path={T("/cost-centers")} component={wrap(CostCenters)} />
      <Route path={T("/production")} component={wrap(Production)} />
      <Route path={T("/sales/invoices/:id")} component={wrap(SalesInvoiceDetail)} />
      <Route path={T("/purchases/invoices/:id")} component={wrap(PurchaseInvoiceDetail)} />
      <Route path={T("/contacts/statement")} component={wrap(ContactStatement)} />
      <Route path={T("/reports")} component={wrap(Reports)} />
      <Route path={T("/reports/sales")} component={wrap(Reports)} />
      <Route path={T("/reports/purchases")} component={wrap(Reports)} />
      <Route path={T("/reports/inventory")} component={wrap(Reports)} />
      <Route path={T("/reports/hr")} component={wrap(Reports)} />
      <Route path={T("/reports/balance-sheet")} component={wrap(Reports)} />
      <Route path={T("/reports/income-statement")} component={wrap(Reports)} />
      <Route path={T("/reports/analytics")} component={wrap(SalesAnalytics)} />
      <Route path={T("/reports/tax")} component={wrap(TaxReport)} />
      <Route path={T("/settings")} component={wrap(CompanySettings)} />
      <Route path={T("/settings/company")} component={wrap(CompanyProfile)} />
      <Route path={T("/settings/branches")} component={wrap(Branches)} />
      <Route path={T("/settings/users")} component={wrap(UsersPermissions)} />
      <Route path={T("/support")} component={wrap(Support)} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
