import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation, Redirect, useParams } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TenantProvider } from "@/lib/tenant";
import AssistantHost from "@/components/AssistantHost";
import PaymentReturnHost from "@/components/PaymentReturnHost";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import SuperAdmin from "./pages/admin/SuperAdmin";
import SubscriptionExpired from "./pages/auth/SubscriptionExpired";
import Pricing from "./pages/Pricing";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/contacts/Customers";
import Suppliers from "./pages/contacts/Suppliers";
import ContactsSmartImport from "./pages/contacts/ContactsSmartImport";
import ContactCategories from "./pages/contacts/ContactCategories";
import Items from "./pages/inventory/Items";
import ItemDetail from "./pages/inventory/ItemDetail";
import StockTransfers from "./pages/inventory/StockTransfers";
import InventoryAdjustments from "./pages/inventory/InventoryAdjustments";
import Warehouses from "./pages/inventory/Warehouses";
import BeginningInventorySmartImport from "./pages/inventory/BeginningInventorySmartImport";
import MegaReportImportPage from "./pages/inventory/MegaReportImportPage";
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
import CheckRouting from "./pages/finance/CheckRouting";
import ChartOfAccounts from "./pages/accounts/ChartOfAccounts";
import JournalEntries from "./pages/accounts/JournalEntries";
import JournalEntryDetail from "./pages/accounts/JournalEntryDetail";
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
import InventoryReports from "./pages/reports/inventory/InventoryReports";
import AccountingReports from "./pages/reports/accounting/AccountingReports";
import FinalReports from "./pages/reports/final/FinalReports";
import HRReports from "./pages/reports/hr/HRReports";
import AssetsReports from "./pages/reports/assets/AssetsReports";
import SalesInvoiceDetail from "./pages/sales/SalesInvoiceDetail";
import SalesOrderDetail from "./pages/sales/SalesOrderDetail";
import PurchaseInvoiceDetail from "./pages/purchases/PurchaseInvoiceDetail";
import PurchaseOrderDetail from "./pages/purchases/PurchaseOrderDetail";
import ContactStatement from "./pages/contacts/ContactStatement";
import CompanySettings from "./pages/settings/CompanySettings";
import CompanyProfile from "./pages/settings/CompanyProfile";
import Branches from "./pages/settings/Branches";
import UsersPermissions from "./pages/settings/UsersPermissions";
import Support from "./pages/Support";
import ImportCostingList from "./pages/import-costing/ImportCostingList";
import ImportCostingEditor from "./pages/import-costing/ImportCostingEditor";
import AccountingAuditorPage from "./pages/AccountingAuditor";
import WhatsAppInboxPage from "./pages/ops/WhatsAppInbox";
import FactoryDailyPage from "./pages/ops/FactoryDaily";
import FeaturePlaceholder from "./pages/FeaturePlaceholder";
import Profile from "./pages/Profile";
import NotificationsPage from "./pages/NotificationsPage";
import PendingDocs from "./pages/PendingDocs";
import {
  DatabaseBackup, ExchangeRates, GeneralAttributes, FiscalYears, UserActivitiesPage,
  ImportDataPage, StatsPage, CitiesPage, AddressesPage,
} from "./pages/parity/SettingsPages";
import {
  HrShifts, HrVacations, HrEmployeeShifts, HrIncentives, HrUnderRequest,
  HrMachines, HrMobileLocations, HrMachineAttendance, HrMobileAttendance, HrSystems, HrDepEmpSystems,
  HrEmployeeVacationRequests,
} from "./pages/parity/HrPages";
import {
  ItemCategoriesPage, ItemBatchesPage, ItemOffersPage, ItemSerialsPage, PriceChangerPage, BeginningInventoryPage,
} from "./pages/parity/InventoryPages";
import {
  AssetCategoriesPage, CapitalMaintenancePage, CapitalMaintenanceListPage,
  AssetSellingPage, AssetSellingListPage, SalesAreasPage,
} from "./pages/parity/AssetsSalesPages";

/** مسار ERP تحت slug الشركة: /:tenantSlug/customers */
const T = (path: string) => `/:tenantSlug${path === "/" ? "" : path}`;

function AccountingReportRedirect({ slug }: { slug: string }) {
  const params = useParams<{ tenantSlug: string }>();
  const tenant = params.tenantSlug || "";
  return <Redirect to={`/${tenant}/reports/accounting/${slug}`} />;
}

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
      <Route path="/login" component={Login} />
      <Route path="/super-admin" component={SuperAdmin} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/" component={HomeRedirect} />

      <Route path={T("/login")} component={wrap(Login)} />
      <Route path={T("/subscription-expired")} component={wrap(SubscriptionExpired)} />
      <Route path={T("/")} component={wrap(Dashboard)} />
      <Route path={T("/dashboard")} component={wrap(Dashboard)} />
      <Route path={T("/customers")} component={wrap(Customers)} />
      <Route path={T("/suppliers")} component={wrap(Suppliers)} />
      <Route path={T("/contacts/smart-import")} component={wrap(ContactsSmartImport)} />
      <Route path={T("/contact-categories")} component={wrap(ContactCategories)} />
      <Route path={T("/items/new")} component={wrap(ItemDetail)} />
      <Route path={T("/items/:id")} component={wrap(ItemDetail)} />
      <Route path={T("/items")} component={wrap(Items)} />
      <Route path={T("/inventory/adjustments")} component={wrap(InventoryAdjustments)} />
      <Route path={T("/inventory/warehouses")} component={wrap(Warehouses)} />
      <Route path={T("/inventory/transfers")} component={wrap(StockTransfers)} />
      <Route path={T("/inventory/categories")} component={wrap(ItemCategoriesPage)} />
      <Route path={T("/inventory/batches")} component={wrap(ItemBatchesPage)} />
      <Route path={T("/inventory/serials")} component={wrap(ItemSerialsPage)} />
      <Route path={T("/inventory/offers")} component={wrap(ItemOffersPage)} />
      <Route path={T("/inventory/price-changer")} component={wrap(PriceChangerPage)} />
      <Route path={T("/inventory/beginning-inventory/smart-import")} component={wrap(BeginningInventorySmartImport)} />
      <Route path={T("/inventory/mega-report-import")} component={wrap(MegaReportImportPage)} />
      <Route path={T("/inventory/beginning-inventory")} component={wrap(BeginningInventoryPage)} />
      <Route path={T("/sales/invoices/new")} component={wrap(SalesInvoices)} />
      <Route path={T("/sales/invoices")} component={wrap(SalesInvoices)} />
      <Route path={T("/sales/orders/new")} component={wrap(SalesOrders)} />
      <Route path={T("/sales/orders")} component={wrap(SalesOrders)} />
      <Route path={T("/sales/returns/new")} component={wrap(SalesReturns)} />
      <Route path={T("/sales/returns")} component={wrap(SalesReturns)} />
      <Route path={T("/sales/reps")} component={wrap(SalesReps)} />
      <Route path={T("/sales/areas")} component={wrap(SalesAreasPage)} />
      <Route path={T("/purchases/invoices/new")} component={wrap(PurchaseInvoices)} />
      <Route path={T("/purchases/invoices")} component={wrap(PurchaseInvoices)} />
      <Route path={T("/purchases/orders/new")} component={wrap(PurchaseOrders)} />
      <Route path={T("/purchases/orders")} component={wrap(PurchaseOrders)} />
      <Route path={T("/purchases/returns/new")} component={wrap(PurchaseReturns)} />
      <Route path={T("/purchases/returns")} component={wrap(PurchaseReturns)} />
      <Route path={T("/cash/receive")} component={wrap(CashTransactions)} />
      <Route path={T("/cash/pay")} component={wrap(CashTransactions)} />
      <Route path={T("/cash/receive-customer")} component={wrap(CashTransactions)} />
      <Route path={T("/cash/pay-customer")} component={wrap(CashTransactions)} />
      <Route path={T("/cash/pay-supplier")} component={wrap(CashTransactions)} />
      <Route path={T("/bank/transactions")} component={wrap(BankTransactions)} />
      <Route path={T("/bank/checks")} component={wrap(Checks)} />
      <Route path={T("/bank/check-routing")} component={wrap(CheckRouting)} />
      <Route path={T("/accounts/chart")} component={wrap(ChartOfAccounts)} />
      <Route path={T("/accounts/journal/:id")} component={wrap(JournalEntryDetail)} />
      <Route path={T("/accounts/journal")} component={wrap(JournalEntries)} />
      <Route path={T("/accounts/transfer")} component={wrap(FundTransfer)} />
      <Route path={T("/hr/employees")} component={wrap(Employees)} />
      <Route path={T("/hr/departments")} component={wrap(Departments)} />
      <Route path={T("/hr/jobs")} component={wrap(JobTitles)} />
      <Route path={T("/hr/attendance")} component={wrap(Attendance)} />
      <Route path={T("/hr/payroll")} component={wrap(Payroll)} />
      <Route path={T("/hr/advances")} component={wrap(Advances)} />
      <Route path={T("/hr/shifts")} component={wrap(HrShifts)} />
      <Route path={T("/hr/vacations")} component={wrap(HrVacations)} />
      <Route path={T("/hr/employee-vacations")} component={wrap(HrEmployeeVacationRequests)} />
      <Route path={T("/hr/employee-shifts")} component={wrap(HrEmployeeShifts)} />
      <Route path={T("/hr/incentives")} component={wrap(HrIncentives)} />
      <Route path={T("/hr/under-request")} component={wrap(HrUnderRequest)} />
      <Route path={T("/hr/machines")} component={wrap(HrMachines)} />
      <Route path={T("/hr/mobile-locations")} component={wrap(HrMobileLocations)} />
      <Route path={T("/hr/machine-attendance")} component={wrap(HrMachineAttendance)} />
      <Route path={T("/hr/mobile-attendance")} component={wrap(HrMobileAttendance)} />
      <Route path={T("/hr/systems")} component={wrap(HrSystems)} />
      <Route path={T("/hr/dep-emp-systems")} component={wrap(HrDepEmpSystems)} />
      <Route path={T("/assets")} component={wrap(FixedAssets)} />
      <Route path={T("/assets/categories")} component={wrap(AssetCategoriesPage)} />
      <Route path={T("/assets/capital-maintenance")} component={wrap(CapitalMaintenancePage)} />
      <Route path={T("/assets/capital-maintenance-list")} component={wrap(CapitalMaintenanceListPage)} />
      <Route path={T("/assets/selling")} component={wrap(AssetSellingPage)} />
      <Route path={T("/assets/selling-list")} component={wrap(AssetSellingListPage)} />
      <Route path={T("/loans")} component={wrap(Loans)} />
      <Route path={T("/installments")} component={wrap(Installments)} />
      <Route path={T("/cost-centers")} component={wrap(CostCenters)} />
      <Route path={T("/production")} component={wrap(Production)} />
      <Route path={T("/sales/invoices/:id")} component={wrap(SalesInvoiceDetail)} />
      <Route path={T("/sales/orders/:id")} component={wrap(SalesOrderDetail)} />
      <Route path={T("/purchases/invoices/:id")} component={wrap(PurchaseInvoiceDetail)} />
      <Route path={T("/purchases/orders/:id")} component={wrap(PurchaseOrderDetail)} />
      <Route path={T("/contacts/statement")} component={wrap(ContactStatement)} />
      <Route path={T("/reports")} component={wrap(Reports)} />
      <Route path={T("/reports/sales")}>
        {() => <AccountingReportRedirect slug="accountingreports-sales" />}
      </Route>
      <Route path={T("/reports/purchases")}>
        {() => <AccountingReportRedirect slug="accountingreports-purchases" />}
      </Route>
      <Route path={T("/reports/inventory/:reportSlug")} component={wrap(InventoryReports)} />
      <Route path={T("/reports/inventory")} component={wrap(InventoryReports)} />
      <Route path={T("/reports/accounting/:slug")} component={wrap(AccountingReports)} />
      <Route path={T("/reports/accounting")} component={wrap(AccountingReports)} />
      <Route path={T("/reports/final/:slug")} component={wrap(FinalReports)} />
      <Route path={T("/reports/final")} component={wrap(FinalReports)} />
      <Route path={T("/reports/hr/:slug")} component={wrap(HRReports)} />
      <Route path={T("/reports/hr")} component={wrap(HRReports)} />
      <Route path={T("/reports/assets/:slug")} component={wrap(AssetsReports)} />
      <Route path={T("/reports/assets")} component={wrap(AssetsReports)} />
      <Route path={T("/reports/balance-sheet")} component={wrap(FinalReports)} />
      <Route path={T("/reports/income-statement")} component={wrap(FinalReports)} />
      <Route path={T("/reports/analytics")} component={wrap(SalesAnalytics)} />
      <Route path={T("/reports/tax")} component={wrap(TaxReport)} />
      <Route path={T("/features/:featureKey")} component={wrap(FeaturePlaceholder)} />
      <Route path={T("/profile")} component={wrap(Profile)} />
      <Route path={T("/notifications")} component={wrap(NotificationsPage)} />
      <Route path={T("/pending-docs")} component={wrap(PendingDocs)} />
      <Route path={T("/settings")} component={wrap(CompanySettings)} />
      <Route path={T("/settings/company")} component={wrap(CompanyProfile)} />
      <Route path={T("/settings/branches")} component={wrap(Branches)} />
      <Route path={T("/settings/users")} component={wrap(UsersPermissions)} />
      <Route path={T("/settings/backup")} component={wrap(DatabaseBackup)} />
      <Route path={T("/settings/exchange-rates")} component={wrap(ExchangeRates)} />
      <Route path={T("/settings/general-attributes")} component={wrap(GeneralAttributes)} />
      <Route path={T("/settings/fiscal-years")} component={wrap(FiscalYears)} />
      <Route path={T("/settings/user-activities")} component={wrap(UserActivitiesPage)} />
      <Route path={T("/settings/import")} component={wrap(ImportDataPage)} />
      <Route path={T("/settings/stats")} component={wrap(StatsPage)} />
      <Route path={T("/settings/cities")} component={wrap(CitiesPage)} />
      <Route path={T("/settings/addresses")} component={wrap(AddressesPage)} />
      <Route path={T("/support")} component={wrap(Support)} />
      <Route path={T("/import-costing/new")} component={wrap(ImportCostingEditor)} />
      <Route path={T("/import-costing/:id")} component={wrap(ImportCostingEditor)} />
      <Route path={T("/import-costing")} component={wrap(ImportCostingList)} />
      <Route path={T("/accounting-auditor")} component={wrap(AccountingAuditorPage)} />
      <Route path={T("/ops/whatsapp-inbox")} component={wrap(WhatsAppInboxPage)} />
      <Route path={T("/ops/factory-daily")} component={wrap(FactoryDailyPage)} />

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
          <PaymentReturnHost />
          <AssistantHost />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
