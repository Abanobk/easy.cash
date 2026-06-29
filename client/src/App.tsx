import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Auth (SaaS)
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import SuperAdmin from "./pages/admin/SuperAdmin";
import SubscriptionExpired from "./pages/auth/SubscriptionExpired";
import Pricing from "./pages/Pricing";

// Dashboard
import Dashboard from "./pages/Dashboard";

// Contacts
import Customers from "./pages/contacts/Customers";
import Suppliers from "./pages/contacts/Suppliers";
import ContactCategories from "./pages/contacts/ContactCategories";

// Inventory
import Items from "./pages/inventory/Items";
import StockTransfers from "./pages/inventory/StockTransfers";
import InventoryAdjustments from "./pages/inventory/InventoryAdjustments";

// Sales
import SalesInvoices from "./pages/sales/SalesInvoices";
import SalesOrders from "./pages/sales/SalesOrders";
import SalesReturns from "./pages/sales/SalesReturns";
import SalesReps from "./pages/sales/SalesReps";

// Purchases
import PurchaseInvoices from "./pages/purchases/PurchaseInvoices";
import PurchaseOrders from "./pages/purchases/PurchaseOrders";
import PurchaseReturns from "./pages/purchases/PurchaseReturns";

// Finance
import CashTransactions from "./pages/finance/CashTransactions";
import BankTransactions from "./pages/finance/BankTransactions";
import Checks from "./pages/finance/Checks";

// Accounts
import ChartOfAccounts from "./pages/accounts/ChartOfAccounts";
import JournalEntries from "./pages/accounts/JournalEntries";
import FundTransfer from "./pages/accounts/FundTransfer";

// HR
import Employees from "./pages/hr/Employees";
import Departments from "./pages/hr/Departments";
import JobTitles from "./pages/hr/JobTitles";
import Attendance from "./pages/hr/Attendance";
import Payroll from "./pages/hr/Payroll";
import Advances from "./pages/hr/Advances";

// Assets
import FixedAssets from "./pages/assets/FixedAssets";

// Loans
import Loans from "./pages/loans/Loans";
import Installments from "./pages/loans/Installments";

// Cost Centers
import CostCenters from "./pages/costcenters/CostCenters";

// Production
import Production from "./pages/production/Production";

// Reports
import Reports from "./pages/reports/Reports";
import SalesAnalytics from "./pages/reports/SalesAnalytics";
import TaxReport from "./pages/reports/TaxReport";

// Invoice Details
import SalesInvoiceDetail from "./pages/sales/SalesInvoiceDetail";
import PurchaseInvoiceDetail from "./pages/purchases/PurchaseInvoiceDetail";

// Contact Statement
import ContactStatement from "./pages/contacts/ContactStatement";

// Settings
import CompanySettings from "./pages/settings/CompanySettings";
import CompanyProfile from "./pages/settings/CompanyProfile";
import Branches from "./pages/settings/Branches";
import UsersPermissions from "./pages/settings/UsersPermissions";

// Support
import Support from "./pages/Support";

function Router() {
  return (
    <Switch>
      {/* SaaS Auth & Public */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/super-admin" component={SuperAdmin} />
      <Route path="/subscription-expired" component={SubscriptionExpired} />
      <Route path="/pricing" component={Pricing} />

      {/* Dashboard */}
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />

      {/* Contacts */}
      <Route path="/customers" component={Customers} />
      <Route path="/suppliers" component={Suppliers} />
      <Route path="/contact-categories" component={ContactCategories} />

      {/* Inventory */}
      <Route path="/items" component={Items} />
      <Route path="/inventory/adjustments" component={InventoryAdjustments} />
      <Route path="/inventory/transfers" component={StockTransfers} />

      {/* Sales */}
      <Route path="/sales/invoices" component={SalesInvoices} />
      <Route path="/sales/orders" component={SalesOrders} />
      <Route path="/sales/returns" component={SalesReturns} />
      <Route path="/sales/reps" component={SalesReps} />

      {/* Purchases */}
      <Route path="/purchases/invoices" component={PurchaseInvoices} />
      <Route path="/purchases/orders" component={PurchaseOrders} />
      <Route path="/purchases/returns" component={PurchaseReturns} />

      {/* Finance - Cash */}
      <Route path="/cash/receive" component={CashTransactions} />
      <Route path="/cash/pay" component={CashTransactions} />
      <Route path="/cash/receive-customer" component={CashTransactions} />
      <Route path="/cash/pay-supplier" component={CashTransactions} />

      {/* Finance - Bank */}
      <Route path="/bank/transactions" component={BankTransactions} />
      <Route path="/bank/checks" component={Checks} />

      {/* Accounts */}
      <Route path="/accounts/chart" component={ChartOfAccounts} />
      <Route path="/accounts/journal" component={JournalEntries} />
      <Route path="/accounts/transfer" component={FundTransfer} />

      {/* HR */}
      <Route path="/hr/employees" component={Employees} />
      <Route path="/hr/departments" component={Departments} />
      <Route path="/hr/jobs" component={JobTitles} />
      <Route path="/hr/attendance" component={Attendance} />
      <Route path="/hr/payroll" component={Payroll} />
      <Route path="/hr/advances" component={Advances} />

      {/* Assets */}
      <Route path="/assets" component={FixedAssets} />

      {/* Loans */}
      <Route path="/loans" component={Loans} />
      <Route path="/installments" component={Installments} />

      {/* Cost Centers */}
      <Route path="/cost-centers" component={CostCenters} />

      {/* Production */}
      <Route path="/production" component={Production} />

      {/* Invoice Details */}
      <Route path="/sales/invoices/:id" component={SalesInvoiceDetail} />
      <Route path="/purchases/invoices/:id" component={PurchaseInvoiceDetail} />

      {/* Contact Statement */}
      <Route path="/contacts/statement" component={ContactStatement} />

      {/* Reports */}
      <Route path="/reports" component={Reports} />
      <Route path="/reports/sales" component={Reports} />
      <Route path="/reports/purchases" component={Reports} />
      <Route path="/reports/inventory" component={Reports} />
      <Route path="/reports/hr" component={Reports} />
      <Route path="/reports/balance-sheet" component={Reports} />
      <Route path="/reports/income-statement" component={Reports} />
      <Route path="/reports/analytics" component={SalesAnalytics} />
      <Route path="/reports/tax" component={TaxReport} />

      {/* Settings */}
      <Route path="/settings" component={CompanySettings} />
      <Route path="/settings/company" component={CompanyProfile} />
      <Route path="/settings/branches" component={Branches} />
      <Route path="/settings/users" component={UsersPermissions} />

      {/* Support */}
      <Route path="/support" component={Support} />

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
