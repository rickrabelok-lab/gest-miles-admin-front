import { useNavigate } from "react-router-dom";
import { useMemo, useRef } from "react";
import BonusOfferCardSkeleton from "@/components/bonus/BonusOfferCardSkeleton";
import { useBonusOffers } from "@/hooks/useBonusOffers";

const programShortName = (program: string) => {
  if (program === "Azul Fidelidade") return "TudoAzul";
  return program;
};

const MAIN_PROGRAMS = ["LATAM Pass", "Azul Fidelidade", "Livelo", "Smiles"] as const;

const BonusOffersSection = () => {
  const navigate = useNavigate();
  const { offers, loading, error } = useBonusOffers();
  const cardsRowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    isDown: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const programHighlightsMap = useMemo(() => {
    const map = new Map<string, number>();
    offers.forEach((offer) => {
      const current = map.get(offer.program) ?? 0;
      if (offer.multiplier > current) map.set(offer.program, offer.multiplier);
    });
    return map;
  }, [offers]);

  const topStores = useMemo(() => {
    const map = new Map<string, { bestMultiplier: number; program: string }>();
    offers.forEach((offer) => {
      const current = map.get(offer.store);
      if (!current || offer.multiplier > current.bestMultiplier) {
        map.set(offer.store, {
          bestMultiplier: offer.multiplier,
          program: offer.program,
        });
      }
    });

    return [...map.entries()]
      .map(([store, value]) => ({
        store,
        bestMultiplier: value.bestMultiplier,
        program: value.program,
      }))
      .sort((a, b) => b.bestMultiplier - a.bestMultiplier)
      .slice(0, 10);
  }, [offers]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = cardsRowRef.current;
    if (!element) return;
    dragRef.current.isDown = true;
    dragRef.current.startX = event.clientX;
    dragRef.current.startScrollLeft = element.scrollLeft;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = cardsRowRef.current;
    if (!element || !dragRef.current.isDown) return;
    const deltaX = event.clientX - dragRef.current.startX;
    element.scrollLeft = dragRef.current.startScrollLeft - deltaX;
  };

  const handlePointerUp = () => {
    dragRef.current.isDown = false;
  };

  return (
    <section className="px-5 pb-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-nubank-text">Ofertas de bônus</h2>
          <p className="mt-0.5 text-xs text-nubank-text-secondary">
            Ganhe mais pontos com ofertas ativas dos programas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/bonus-offers")}
          className="shrink-0 rounded-[12px] gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-[0_2px_8px_-2px_rgba(138,5,190,0.25)] transition-all duration-300 ease-out hover:opacity-95 hover:shadow-[0_4px_12px_-2px_rgba(138,5,190,0.3)]"
        >
          Ver tudo
        </button>
      </div>

      <div className="space-y-2.5">
        {loading && (
          <>
            <BonusOfferCardSkeleton />
            <BonusOfferCardSkeleton />
          </>
        )}

        {!loading && error && (
          <div className="rounded-[16px] bg-white p-4 text-center shadow-nubank">
            <p className="text-sm text-nubank-text-secondary">Não foi possível carregar as ofertas.</p>
          </div>
        )}

        {!loading && !error && (
          <div
            ref={cardsRowRef}
            className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 scrollbar-hide touch-pan-x select-none [-webkit-overflow-scrolling:touch]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <article className="w-[84%] shrink-0 rounded-[16px] gradient-card-subtle p-3.5 shadow-nubank">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-nubank-text-secondary">Programas</p>
              <div className="grid grid-cols-2 gap-1.5">
                {MAIN_PROGRAMS.map((program) => (
                  <button
                    key={program}
                    type="button"
                    onClick={() => navigate("/bonus-offers")}
                    className="rounded-xl bg-nubank-bg px-2 py-1.5 text-left transition-all duration-200 hover:bg-primary/[0.06]"
                  >
                    <p className="text-[13px] font-semibold text-nubank-text">
                      {programShortName(program)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-nubank-text-secondary">
                      Até{" "}
                      <span className="font-semibold text-primary">
                        {programHighlightsMap.get(program) ?? "--"}x
                      </span>
                    </p>
                  </button>
                ))}
              </div>
            </article>

            <article className="w-[84%] shrink-0 rounded-[16px] gradient-card-subtle p-3.5 shadow-nubank">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-nubank-text-secondary">Lojas</p>
              <div className="grid grid-cols-2 gap-1.5">
                {topStores.slice(0, 4).map((store) => (
                  <button
                    key={store.store}
                    type="button"
                    onClick={() => navigate("/bonus-offers")}
                    className="rounded-xl bg-nubank-bg px-2 py-1.5 text-left transition-all duration-200 hover:bg-primary/[0.06]"
                  >
                    <p className="text-[13px] font-semibold text-nubank-text">{store.store}</p>
                    <p className="mt-0.5 text-[11px] text-nubank-text-secondary">
                      {programShortName(store.program)} •{" "}
                      <span className="font-semibold text-primary">até {store.bestMultiplier}x</span>
                    </p>
                  </button>
                ))}
              </div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
};

export default BonusOffersSection;
