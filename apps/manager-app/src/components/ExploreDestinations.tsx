import { useEffect, useMemo, useState } from "react";
import { Plane } from "lucide-react";
import destBrasil from "@/assets/dest-brasil.jpg";
import destSudeste from "@/assets/dest-sudeste.jpg";
import destUSA from "@/assets/dest-usa.jpg";
import destPortugal from "@/assets/dest-portugal.jpg";
import { getBestPriceByDestinationForAllModes } from "@/lib/pricing";
import type { BestPriceByDestination } from "@/lib/pricing";

const destinations = [
  { name: "Brasil", code: "BRA", image: destBrasil },
  { name: "Sudeste", code: "SAO", image: destSudeste },
  { name: "EUA", code: "NYC", image: destUSA },
  { name: "Portugal", code: "LIS", image: destPortugal },
];

type ExploreDestinationsProps = {
  origins: string[];
  onDestinationSelect?: (destination: { code: string; name: string }) => void;
};

const formatMiles = (value: number | null) =>
  value === null ? "--" : value.toLocaleString("pt-BR");

const formatMoney = (value: number | null) =>
  value === null ? "--" : value.toLocaleString("pt-BR", { minimumFractionDigits: 0 });

const ExploreDestinations = ({
  origins,
  onDestinationSelect,
}: ExploreDestinationsProps) => {
  const [milesByDestination, setMilesByDestination] = useState<
    Record<string, BestPriceByDestination>
  >({});
  const [moneyByDestination, setMoneyByDestination] = useState<
    Record<string, BestPriceByDestination>
  >({});

  const destinationCodes = useMemo(() => destinations.map((item) => item.code), []);

  useEffect(() => {
    if (origins.length === 0) return;
    let cancelled = false;

    const run = async () => {
      try {
        const result = await getBestPriceByDestinationForAllModes(
          destinationCodes,
          origins,
        );

        if (cancelled) return;

        const milesMap: Record<string, BestPriceByDestination> = {};
        const moneyMap: Record<string, BestPriceByDestination> = {};

        result.miles.forEach((item) => {
          milesMap[item.destination] = item;
        });
        result.money.forEach((item) => {
          moneyMap[item.destination] = item;
        });

        setMilesByDestination(milesMap);
        setMoneyByDestination(moneyMap);
      } catch {
        if (!cancelled) {
          setMilesByDestination({});
          setMoneyByDestination({});
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [destinationCodes, origins]);

  return (
    <div className="px-5 py-4">
      <div className="rounded-2xl bg-card p-5 card-miles">
        <div className="flex items-center gap-2 mb-1">
          <Plane size={16} className="text-primary" />
          <p className="text-xs text-muted-foreground">BHZ · SAO</p>
        </div>
        <h2 className="font-display text-xl font-bold text-foreground">Explorar destinos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Descubra destinos com os menores preços em nosso histórico de{" "}
          <span className="font-bold text-foreground">1.5 milhão</span> de tarifas.
        </p>
        <button className="mt-4 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]">
          explorar todos
        </button>
      </div>

      {/* Destination cards */}
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {destinations.map((dest) => (
          <button
            key={dest.name}
            type="button"
            onClick={() => onDestinationSelect?.({ code: dest.code, name: dest.name })}
            aria-label={`Buscar emissão para ${dest.name}`}
            className="shrink-0 w-40 overflow-hidden rounded-2xl bg-card card-miles"
          >
            <div className="relative h-28 overflow-hidden">
              <img
                src={dest.image}
                alt={dest.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
              <span className="absolute bottom-2 left-3 font-display text-sm font-bold text-primary-foreground">
                {dest.name}
              </span>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">
                {formatMiles(milesByDestination[dest.code]?.bestPrice ?? null)} pts
              </p>
              <p className="text-xs text-muted-foreground">
                a partir de R$ {formatMoney(moneyByDestination[dest.code]?.bestPrice ?? null)}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                melhor origem: {moneyByDestination[dest.code]?.bestOrigin ?? "--"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ExploreDestinations;
