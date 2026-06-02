import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import NotFoundPage from "@/pages/NotFound";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import TransactionsPage from "@/pages/transactions/TransactionsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import { AutoUpdateToast } from "@/components/auto-update-toast";
import { ProductIdSetup, hasProductId } from "@/components/product-id-setup";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8112/api";

export default function App() {
  const [setupDone, setSetupDone] = useState(null);

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
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
