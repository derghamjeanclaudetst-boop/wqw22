import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { SystemSettingsProvider } from "@/contexts/system-settings";
import { LanguageProvider } from "@/contexts/language";
import { MainLayout } from "@/components/layout/main-layout";
import { AdminPinGuard } from "@/components/admin-pin-guard";

// Eagerly load only the login page (critical path for unauthenticated users)
import Login from "@/pages/login";

// Lazy-load all authenticated pages — each loads only when first navigated to
const Dashboard         = lazy(() => import("@/pages/dashboard"));
const Users             = lazy(() => import("@/pages/users"));
const Roles             = lazy(() => import("@/pages/roles"));
const Technicians       = lazy(() => import("@/pages/technicians"));
const TechnicianMap     = lazy(() => import("@/pages/technician-map"));
const WorkOrders        = lazy(() => import("@/pages/work-orders"));
const Proposals         = lazy(() => import("@/pages/proposals"));
const PartsRequests     = lazy(() => import("@/pages/parts-requests"));
const PaymentManager    = lazy(() => import("@/pages/payment-manager"));
const TechnicianPayments= lazy(() => import("@/pages/technician-payments"));
const Invoices          = lazy(() => import("@/pages/invoices"));
const FinancialAnalysis = lazy(() => import("@/pages/financial-analysis"));
const Clients          = lazy(() => import("@/pages/clients"));
const Analytics         = lazy(() => import("@/pages/analytics"));
const DataImport        = lazy(() => import("@/pages/data-import"));
const DatabaseImport    = lazy(() => import("@/pages/database-import"));
const DatabaseExport    = lazy(() => import("@/pages/database-export"));
const SystemSettings    = lazy(() => import("@/pages/settings"));
const NotFound          = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;

  return (
    <MainLayout>
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    </MainLayout>
  );
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) return <Redirect to="/dashboard" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login"               component={() => <PublicRoute component={Login} />} />
      <Route path="/dashboard"           component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/users"               component={() => <ProtectedRoute component={Users} />} />
      <Route path="/roles"               component={() => <ProtectedRoute component={Roles} />} />
      <Route path="/technicians"         component={() => <ProtectedRoute component={Technicians} />} />
      <Route path="/technician-map"      component={() => <ProtectedRoute component={TechnicianMap} />} />
      <Route path="/clients"             component={() => <ProtectedRoute component={Clients} />} />
      <Route path="/work-orders"         component={() => <ProtectedRoute component={WorkOrders} />} />
      <Route path="/proposals"           component={() => <ProtectedRoute component={Proposals} />} />
      <Route path="/parts-requests"      component={() => <ProtectedRoute component={PartsRequests} />} />
      <Route path="/payment-manager"     component={() => <ProtectedRoute component={PaymentManager} />} />
      <Route path="/technician-payments" component={() => <ProtectedRoute component={TechnicianPayments} />} />
      <Route path="/invoices"            component={() => <ProtectedRoute component={Invoices} />} />
      <Route path="/financial-analysis"  component={() => <ProtectedRoute component={FinancialAnalysis} />} />
      <Route path="/analytics"           component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/data-import"         component={() => <ProtectedRoute component={() => <AdminPinGuard><Suspense fallback={<PageLoader />}><DataImport /></Suspense></AdminPinGuard>} />} />
      <Route path="/database-import"     component={() => <ProtectedRoute component={() => <AdminPinGuard><Suspense fallback={<PageLoader />}><DatabaseImport /></Suspense></AdminPinGuard>} />} />
      <Route path="/database-export"     component={() => <ProtectedRoute component={() => <AdminPinGuard><Suspense fallback={<PageLoader />}><DatabaseExport /></Suspense></AdminPinGuard>} />} />
      <Route path="/settings"            component={() => <ProtectedRoute component={() => <AdminPinGuard><Suspense fallback={<PageLoader />}><SystemSettings /></Suspense></AdminPinGuard>} />} />
      <Route path="/"                    component={() => <Redirect to="/dashboard" />} />
      <Route component={() => <Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <LanguageProvider>
            <SystemSettingsProvider>
              <AuthProvider>
                <Toaster />
                <Router />
              </AuthProvider>
            </SystemSettingsProvider>
          </LanguageProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
