import { AppConfigProvider } from "@gest-miles/shared";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoyaltyProgramDetails from "./pages/LoyaltyProgramDetails";
import Auth from "./pages/Auth";
import AssinaturaSuspensaPage from "./pages/AssinaturaSuspensaPage";
import Me from "./pages/Me";
import MandatoryPasswordChangePage from "./pages/MandatoryPasswordChangePage";
import GestorDashboard from "./pages/GestorDashboard";
import CsAgendarReuniaoPage from "./pages/CsAgendarReuniaoPage";
import CsAlertasInteligentesPage from "./pages/CsAlertasInteligentesPage";
import CsTarefasPage from "./pages/CsTarefasPage";
import GestorReunioesPage from "./pages/GestorReunioesPage";
import ClientProfile from "./pages/ClientProfile";
import SearchFlightsScreen from "./pages/SearchFlightsScreen";
import PriceCalendarScreen from "./pages/PriceCalendarScreen";
import BonusOffersScreen from "./pages/BonusOffersScreen";
import ClientePage from "./pages/ClientePage";
import VencimentosPage from "./pages/VencimentosPage";
import RegistrarEmissaoPage from "./pages/RegistrarEmissaoPage";
import CriarAlertaPage from "./pages/CriarAlertaPage";
import SobreGestMilesPage from "./pages/SobreGestMilesPage";
import ConvideAmigosPage from "./pages/ConvideAmigosPage";
import DuvidasPage from "./pages/DuvidasPage";
import FaleConoscoPage from "./pages/FaleConoscoPage";
import PreferenciasSugestoesPage from "./pages/PreferenciasSugestoesPage";
import SimularCompraMilhasPage from "./pages/SimularCompraMilhasPage";
import RadarOportunidadesPage from "./pages/RadarOportunidadesPage";
import ClienteInsightsPage from "./pages/ClienteInsightsPage";
import ClienteTimelinePage from "./pages/ClienteTimelinePage";
import { AuthProvider } from "@/contexts/AuthContext";
import { SearchFlightsProvider } from "@/contexts/SearchFlightsContext";
import ProtectedByRole from "@/components/RequireRole";
import RequireAuth from "@/components/RequireAuth";
import CsHomeRedirect from "@/components/CsHomeRedirect";
import MissingSupabaseConfig from "@/components/MissingSupabaseConfig";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  if (!isSupabaseConfigured) {
    return <MissingSupabaseConfig />;
  }

  return (
  <AppConfigProvider client={supabase}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <SearchFlightsProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <CsHomeRedirect>
                      <Index />
                    </CsHomeRedirect>
                  </RequireAuth>
                }
              />
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/assinatura-suspensa"
                element={
                  <RequireAuth>
                    <AssinaturaSuspensaPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/me"
                element={
                  <RequireAuth>
                    <Me />
                  </RequireAuth>
                }
              />
              <Route
                path="/trocar-senha-obrigatorio"
                element={
                  <RequireAuth>
                    <MandatoryPasswordChangePage />
                  </RequireAuth>
                }
              />
              <Route path="/search-flights" element={<SearchFlightsScreen />} />
              <Route path="/price-calendar" element={<PriceCalendarScreen />} />
              <Route path="/bonus-offers" element={<BonusOffersScreen />} />
              <Route
                path="/registrar-emissao"
                element={
                  <RequireAuth>
                    <RegistrarEmissaoPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/alertas/novo"
                element={
                  <RequireAuth>
                    <CriarAlertaPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/perfil"
                element={
                  <RequireAuth>
                    <ClientProfile />
                  </RequireAuth>
                }
              />
              <Route
                path="/gestor"
                element={
                  <ProtectedByRole allow={["gestor", "admin"]}>
                    <GestorDashboard />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/gestor/reunioes"
                element={
                  <ProtectedByRole allow={["gestor", "admin"]}>
                    <GestorReunioesPage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/cliente"
                element={
                  <ProtectedByRole allow={["gestor", "admin"]}>
                    <ClientePage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/clientes"
                element={
                  <ProtectedByRole allow={["gestor", "admin"]}>
                    <ClientePage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/cs"
                element={
                  <ProtectedByRole allow={["cs", "admin"]}>
                    <GestorDashboard variant="cs" />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/cs/agendar-reuniao"
                element={
                  <ProtectedByRole allow={["cs", "admin"]}>
                    <CsAgendarReuniaoPage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/cs/alertas"
                element={
                  <ProtectedByRole allow={["cs", "admin"]}>
                    <CsAlertasInteligentesPage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/cs/tarefas"
                element={
                  <ProtectedByRole allow={["cs", "admin"]}>
                    <CsTarefasPage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/preferencias-sugestoes"
                element={
                  <RequireAuth>
                    <PreferenciasSugestoesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/simular-compra-milhas"
                element={
                  <RequireAuth>
                    <SimularCompraMilhasPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/radar-oportunidades"
                element={
                  <RequireAuth>
                    <RadarOportunidadesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/vencimentos"
                element={
                  <RequireAuth>
                    <VencimentosPage />
                  </RequireAuth>
                }
              />
              <Route path="/program/:programId" element={<LoyaltyProgramDetails />} />
              <Route
                path="/sobre"
                element={
                  <RequireAuth>
                    <SobreGestMilesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/convide-amigos"
                element={
                  <RequireAuth>
                    <ConvideAmigosPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/duvidas"
                element={
                  <RequireAuth>
                    <DuvidasPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/fale-conosco"
                element={
                  <RequireAuth>
                    <FaleConoscoPage />
                  </RequireAuth>
                }
              />
              <Route path="/cliente/:id/insights" element={<ClienteInsightsPage />} />
              <Route path="/cliente/:id/timeline" element={<ClienteTimelinePage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SearchFlightsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </AppConfigProvider>
  );
};

export default App;
