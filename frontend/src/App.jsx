import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import NotFoundPage from "@/pages/NotFound";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import TransactionsPage from "@/pages/transactions/TransactionsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import { AutoUpdateToast } from "@/components/auto-update-toast";

export default function App() {
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
