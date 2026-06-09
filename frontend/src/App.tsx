import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import NotFoundPage from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard/dashboard-page";
import TransactionsPage from "@/pages/transactions/transactions-page";
import SettingsPage from "@/pages/settings/settings-page";
import { AutoUpdateToast } from "@/components/auto-update-toast";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProductIdSetup, hasProductId } from "@/components/product-id-setup";
import SubscriptionsPage from "@/pages/subscriptions/subscriptions-page";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8112/api";

export default function App() {
  const [setupDone, setSetupDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (hasProductId()) {
      setSetupDone(true);
      return;
    }
    fetch(`${API_BASE}/product-id`)
      .then((r) => r.json())
      .then((data) => setSetupDone(data.configured))
      .catch(() => setSetupDone(false));
  }, []);

  if (setupDone === null) return null;

  if (!setupDone) {
    return <ProductIdSetup onComplete={() => setSetupDone(true)} />;
  }

  return (
    <HashRouter>
      <AutoUpdateToast />
      <ErrorBoundary>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
    </HashRouter>
  );
}
