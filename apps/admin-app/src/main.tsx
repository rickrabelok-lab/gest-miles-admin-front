import { AppConfigProvider } from "@gest-miles/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";

import App from "./App.tsx";
import { AppConfigThemeBridge } from "./components/AppConfigThemeBridge.tsx";
import { RootErrorBoundary } from "./RootErrorBoundary.tsx";
import { supabase } from "@/lib/supabase";
import { Toaster as RadixToaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";
import "./styles/admin-master-html.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <AppConfigProvider client={supabase}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light">
            <TooltipProvider delayDuration={200}>
              <AppConfigThemeBridge />
              <App />
              <RadixToaster />
              <SonnerToaster position="top-right" />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </AppConfigProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
