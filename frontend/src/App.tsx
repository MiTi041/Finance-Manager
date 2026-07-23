import { lazy, Suspense, useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import NotFoundPage from "@/pages/not-found";
import { AutoUpdateToast } from "@/components/auto-update-toast";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProductIdSetup, hasProductId } from "@/components/product-id-setup";

const DashboardPage = lazy(() => import("@/pages/dashboard/dashboard-page"));
const TransactionsPage = lazy(() => import("@/pages/transactions/transactions-page"));
const SettingsPage = lazy(() => import("@/pages/settings/settings-page"));
const SubscriptionsPage = lazy(() => import("@/pages/subscriptions/subscriptions-page"));
const AnalyticsPage = lazy(() => import("@/pages/analytics/analytics-page"));


const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8112/api";

export default function App() {
  const [setupDone, setSetupDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (hasProductId()) {
      setSetupDone(true);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/product-id`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setSetupDone(data.configured); })
      .catch(() => { if (!cancelled) setSetupDone(false); });
    return () => { cancelled = true; };
  }, []);

  if (setupDone === null) return null;

  if (!setupDone) {
    return <ProductIdSetup onComplete={() => setSetupDone(true)} />;
  }

  return (
    <HashRouter>
      <AutoUpdateToast />
      <ErrorBoundary pageName="App">
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ErrorBoundary pageName="Dashboard"><DashboardPage /></ErrorBoundary>} />
              <Route path="/transactions" element={<ErrorBoundary pageName="Transaktionen"><TransactionsPage /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary pageName="Einstellungen"><SettingsPage /></ErrorBoundary>} />
              <Route path="/subscriptions" element={<ErrorBoundary pageName="Abonnements"><SubscriptionsPage /></ErrorBoundary>} />
              <Route path="/analytics" element={<ErrorBoundary pageName="Analysen"><AnalyticsPage /></ErrorBoundary>} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </HashRouter>
  );
}
