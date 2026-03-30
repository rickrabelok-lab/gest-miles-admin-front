import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AirlineLogo from "@/components/AirlineLogo";
import PriceCalendar from "@/components/PriceCalendar";
import { Button } from "@/components/ui/button";
import { useSearchFlights } from "@/contexts/SearchFlightsContext";
import { usePriceCalendarData } from "@/hooks/usePriceCalendarData";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const AIRLINE_OPTIONS = ["G3", "LA", "AD", "TP", "AA", "IB", "AF", "QR"];

const hash = (value: string) => {
  let output = 0;
  for (let i = 0; i < value.length; i += 1) {
    output = (output << 5) - output + value.charCodeAt(i);
    output |= 0;
  }
  return Math.abs(output);
};

const PriceCalendarScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { origin, destination, mode, passengers, cabinClass } = useSearchFlights();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { loading, pricesByDay } = usePriceCalendarData({
    originCode: origin?.code,
    destinationCode: destination?.code,
    mode,
    month: currentMonth,
  });

  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  const routeLabel = useMemo(() => {
    const from = origin?.city ?? "Origem";
    const to = destination?.city ?? "Destino";
    return `${from} ✈ ${to}`;
  }, [origin?.city, destination?.city]);

  const displayedAirline = useMemo(() => {
    const fromQuery = searchParams.get("airline");
    if (fromQuery) return fromQuery.toUpperCase();
    const seed = `${origin?.code ?? "ORG"}-${destination?.code ?? "DST"}-${mode}`;
    return AIRLINE_OPTIONS[hash(seed) % AIRLINE_OPTIONS.length];
  }, [searchParams, origin?.code, destination?.code, mode]);

  const canSearch = !!selectedDay;

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-nubank-bg">
      <header className="fixed inset-x-0 top-0 z-40 flex justify-center bg-nubank-bg/95 backdrop-blur">
        <div className="w-full max-w-[480px] px-4 pb-3 pt-4">
          <div className="grid grid-cols-[40px_1fr_40px] items-center">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-white text-nubank-text shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-center text-xl font-bold tracking-tight text-nubank-text">
              Seleção de voos
            </h1>
            <div />
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-[17px] font-medium text-nubank-text">{routeLabel}</p>
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-[10px] bg-white px-2.5 py-1.5 shadow-nubank">
                <AirlineLogo airline={displayedAirline} size={14} />
                <span className="text-[11px] font-medium text-slate-600">
                  Companhia: {displayedAirline}
                </span>
              </div>
            </div>
            <div className="rounded-[14px] bg-white px-3 py-2 text-right shadow-nubank">
              <p className="text-[11px] text-nubank-text-secondary">Histórico de preços</p>
              <p className="text-[14px] font-medium text-slate-700">24 horas</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 pb-28 pt-[132px]">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setSelectedDay(null);
              setCurrentMonth(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
              );
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-[18px] font-semibold text-nubank-text">{monthLabel}</h2>
          <button
            type="button"
            onClick={() => {
              setSelectedDay(null);
              setCurrentMonth(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
              );
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <PriceCalendar
          month={currentMonth}
          mode={mode}
          loading={loading}
          pricesByDay={pricesByDay}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-nubank-bg via-nubank-bg to-transparent pt-6">
        <div className="w-full max-w-[480px] px-4 pb-5">
          <Button
            className="h-14 w-full rounded-[16px] gradient-primary text-base font-semibold text-white shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover active:scale-[0.98]"
            disabled={!canSearch}
            onClick={() => {
              if (!selectedDay) return;
              const travelers = passengers.adult + passengers.child + passengers.baby;
              toast.success(
                `Busca pronta: ${routeLabel}, ${selectedDay}/${currentMonth.getMonth() + 1}, ${mode}, ${cabinClass}, ${travelers} pax.`,
              );
            }}
          >
            Buscar voos
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PriceCalendarScreen;
