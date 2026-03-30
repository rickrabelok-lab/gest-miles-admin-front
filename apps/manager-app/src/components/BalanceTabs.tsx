import { ArrowDownRight, ArrowUpRight, Clock, Sparkles, TrendingUp, History, Lightbulb } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";

interface BalanceTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  economyTrend?: "up" | "down" | "none";
  economyLabel?: string;
  canShowInsights?: boolean;
  canShowTimeline?: boolean;
}

const tabs = [
  { id: "saldo", label: "Inicio", icon: null },
  { id: "vencendo", label: "Vencendo", icon: Clock },
  { id: "extrato", label: "Extrato", icon: TrendingUp },
  { id: "economia", label: "R$", icon: null },
  { id: "sugestoes", label: "Sugestões", icon: Sparkles },
  { id: "insights", label: "Insights", icon: Lightbulb },
  { id: "timeline", label: "Timeline", icon: History },
];

const BalanceTabs = ({
  activeTab,
  onTabChange,
  economyTrend = "none",
  economyLabel = "R$",
  canShowInsights,
  canShowTimeline,
}: BalanceTabsProps) => {
  const { role, roleLoading } = useAuth();

  // Regras: segurança real vem das queries do backend/RLS. Aqui é apenas UX/permissão de navegação.
  const roleCanShowInsights = role === "gestor" || role === "cs" || role === "admin";
  const roleCanShowTimeline =
    role === "gestor" || role === "cs" || role === "admin" || role === "cliente_gestao";

  const resolvedCanShowInsights = canShowInsights ?? (!roleLoading && roleCanShowInsights);
  const resolvedCanShowTimeline = canShowTimeline ?? (!roleLoading && roleCanShowTimeline);

  const visibleTabs = tabs.filter((tab) => {
    if (tab.id === "insights") return resolvedCanShowInsights;
    if (tab.id === "timeline") return resolvedCanShowTimeline;
    return true;
  });

  const gridColsClass =
    visibleTabs.length === 5
      ? "grid-cols-5"
      : visibleTabs.length === 6
        ? "grid-cols-6"
        : "grid-cols-7";

  return (
    <div className={`grid ${gridColsClass} gap-1.5 px-5 py-3`}>
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        const isEconomyTab = tab.id === "economia";
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center justify-center gap-1 rounded-[14px] border px-2.5 py-2 text-[11px] font-medium transition-all duration-300 ease-out ${
              isActive
                ? "border-transparent gradient-primary text-primary-foreground shadow-[0_2px_10px_-2px_rgba(138,5,190,0.25)] active:scale-[0.98]"
                : "border-nubank-border bg-white text-nubank-text-secondary shadow-nubank hover:shadow-nubank-hover hover:border-primary/15 hover:text-nubank-text active:scale-[0.98]"
            }`}
          >
            {Icon ? (
              <>
                <Icon size={14} strokeWidth={2} />
                <span>{tab.label}</span>
              </>
            ) : isEconomyTab ? (
              <span className={economyLabel === "R$" ? "text-sm font-bold" : "text-xs font-semibold"}>
                {economyLabel}
              </span>
            ) : (
              <span>{tab.label}</span>
            )}
            {isEconomyTab && economyTrend === "up" && (
              <ArrowUpRight size={14} className="shrink-0 text-emerald-600" strokeWidth={2.5} />
            )}
            {isEconomyTab && economyTrend === "down" && (
              <ArrowDownRight size={14} className="shrink-0 text-red-600" strokeWidth={2.5} />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default BalanceTabs;
