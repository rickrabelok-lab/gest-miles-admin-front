import { Gift } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import BonusOfferCard from "@/components/bonus/BonusOfferCard";
import BonusOfferCardSkeleton from "@/components/bonus/BonusOfferCardSkeleton";
import TopStoreCard from "@/components/bonus/TopStoreCard";
import { Button } from "@/components/ui/button";
import { useBonusOffers } from "@/hooks/useBonusOffers";
import type { LoyaltyProgram } from "@/lib/bonus-offers/types";

type ProgramFilter = "Todos" | LoyaltyProgram;

const FILTERS: ProgramFilter[] = [
  "Todos",
  "Livelo",
  "Smiles",
  "LATAM Pass",
  "Azul Fidelidade",
];

const BonusOffersScreen = () => {
  const [activeFilter, setActiveFilter] = useState<ProgramFilter>("Todos");
  const selectedProgram = activeFilter === "Todos" ? undefined : activeFilter;
  const { offers, loading, error, retry } = useBonusOffers(selectedProgram);

  const topStores = useMemo(() => {
    const map = new Map<string, number>();
    offers.forEach((offer) => {
      const current = map.get(offer.store) ?? 0;
      if (offer.multiplier > current) map.set(offer.store, offer.multiplier);
    });
    return [...map.entries()]
      .map(([store, bestMultiplier]) => ({ store, bestMultiplier }))
      .sort((a, b) => b.bestMultiplier - a.bestMultiplier)
      .slice(0, 6);
  }, [offers]);

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-nubank-bg px-5 pb-14 pt-6">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <Gift size={24} className="text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-nubank-text">Compras Bonificadas</h1>
        </div>
        <p className="mt-1 text-sm text-nubank-text-secondary">
          Ganhe mais pontos comprando nas lojas parceiras
        </p>
      </header>

      <section className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`shrink-0 rounded-[14px] px-5 py-2.5 text-sm font-semibold transition-all duration-300 ease-out ${
              activeFilter === filter
                ? "gradient-primary text-primary-foreground shadow-[0_2px_8px_-2px_rgba(138,5,190,0.2)]"
                : "bg-white border border-nubank-border text-nubank-text-secondary shadow-nubank hover:border-primary/20"
            }`}
          >
            {filter}
          </button>
        ))}
      </section>

      <section className="space-y-3">
        {loading && (
          <>
            <BonusOfferCardSkeleton />
            <BonusOfferCardSkeleton />
            <BonusOfferCardSkeleton />
          </>
        )}

        {!loading && error && (
          <div className="rounded-[16px] bg-white p-4 text-center shadow-nubank">
            <p className="text-sm text-slate-600">{error}</p>
            <Button
              className="mt-3 h-9"
              onClick={() => void retry()}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {!loading && !error && offers.length === 0 && (
          <div className="rounded-[16px] bg-white p-4 text-center shadow-nubank">
            <p className="text-sm text-slate-600">Nenhuma oferta ativa para este programa.</p>
          </div>
        )}

        {!loading &&
          !error &&
          offers.map((offer) => (
            <BonusOfferCard
              key={offer.id}
              offer={offer}
              onAccessOffer={(url) => {
                toast.success(`Redirecionando para oferta: ${url}`);
              }}
            />
          ))}
      </section>

      <section className="mt-7">
        <h2 className="mb-6 text-xl font-bold tracking-tight text-nubank-text">Principais Lojas</h2>
        <div className="grid grid-cols-2 gap-3">
          {topStores.map((store) => (
            <TopStoreCard
              key={store.store}
              store={store.store}
              bestMultiplier={store.bestMultiplier}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default BonusOffersScreen;
