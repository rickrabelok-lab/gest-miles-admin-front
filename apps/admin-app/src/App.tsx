import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "@/components/AdminLayout";
import RequireAdmin from "@/components/RequireAdmin";
import { AdminAuthProvider } from "@/context/AdminAuthContext";
import AssinaturasPage from "@/pages/AssinaturasPage";
import AdminInsightsPage from "@/pages/AdminInsights";
import AuditLogsPage from "@/pages/AuditLogsPage";
import ClientsPage from "@/pages/ClientsPage";
import DashboardPage from "@/pages/DashboardPage";
import EquipeDetailPage from "@/pages/EquipeDetailPage";
import EquipesPage from "@/pages/EquipesPage";
import GestoresPage from "@/pages/GestoresPage";
import LoginPage from "@/pages/LoginPage";
import UsersPage from "@/pages/UsersPage";
import UsuarioContaAdminPage from "@/pages/UsuarioContaAdminPage";
import AdminViagensPage from "@/pages/AdminViagens";
import AdminViagensGeralPage from "@/pages/AdminViagensGeral";
import AdminOperacionalPage from "@/pages/AdminOperacional";
import AdminConfigPage from "@/pages/AdminConfig";
import AdminSegurancaPage from "@/pages/AdminSeguranca";
import MonetizacaoPage from "@/pages/MonetizacaoPage";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

export default function App() {
  return (
    <BrowserRouter future={routerFuture}>
      <AdminAuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="contas/:usuarioId" element={<UsuarioContaAdminPage />} />
            <Route path="equipes" element={<EquipesPage />} />
            <Route path="equipes/:equipeId" element={<EquipeDetailPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="viagens" element={<AdminViagensPage />} />
            <Route path="viagens-geral" element={<AdminViagensGeralPage />} />
            <Route path="financeiro" element={<Navigate to="/dashboard" replace />} />
            <Route path="operacional" element={<AdminOperacionalPage />} />
            <Route path="negocio" element={<Navigate to="/assinaturas" replace />} />
            <Route path="gestores" element={<GestoresPage />} />
            <Route path="assinaturas" element={<AssinaturasPage />} />
            <Route path="monetizacao" element={<MonetizacaoPage />} />
            <Route path="gestor-groups" element={<Navigate to="/gestores" replace />} />
            <Route path="insights" element={<AdminInsightsPage />} />
            <Route path="configuracoes" element={<AdminConfigPage />} />
            <Route path="seguranca" element={<AdminSegurancaPage />} />
            <Route path="logs" element={<AuditLogsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
