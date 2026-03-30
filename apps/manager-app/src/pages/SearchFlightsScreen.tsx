import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { homePathForRole } from "@/lib/homeRoute";
import { useSearchFlights } from "@/contexts/SearchFlightsContext";
import BottomNav from "@/components/BottomNav";
import {
  AIRPORTS,
  findAirportByCode,
  formatAirportLabel,
  type AirportOption,
} from "@/lib/airports";
import AirlineLogo from "@/components/AirlineLogo";

type MockFlight = {
  id: string;
  originCode: string;
  destinationCode: string;
  origin: string;
  destination: string;
  airline: string;
  points: number;
  money: number;
};

const MOCK_FLIGHTS: MockFlight[] = [
  { id: "f1", originCode: "GRU", destinationCode: "CWB", origin: "São Paulo", destination: "Curitiba", airline: "G3", points: 4000, money: 286.9 },
  { id: "f2", originCode: "CNF", destinationCode: "SDU", origin: "Belo Horizonte", destination: "Rio de Janeiro", airline: "LA", points: 4863, money: 312.5 },
  { id: "f3", originCode: "CGH", destinationCode: "POA", origin: "São Paulo", destination: "Porto Alegre", airline: "AD", points: 4878, money: 355.2 },
  { id: "f4", originCode: "BSB", destinationCode: "REC", origin: "Brasília", destination: "Recife", airline: "LA", points: 8200, money: 499.0 },
  { id: "f5", originCode: "GIG", destinationCode: "LIS", origin: "Rio de Janeiro", destination: "Lisboa", airline: "TP", points: 38500, money: 2890.0 },
  { id: "f6", originCode: "GRU", destinationCode: "JFK", origin: "São Paulo", destination: "Nova York", airline: "AA", points: 45200, money: 3210.0 },
];

const MONTH_OPTIONS = [
  "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez", "Jan", "Fev",
];

const BRAZIL_NATIONAL_HOLIDAYS = [
  "Confraternização", "Tiradentes", "Trabalho", "Independência",
  "Aparecida", "Finados", "República", "Consciência Negra", "Natal",
];

const SearchFlightsScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const isGestor = role === "gestor" || role === "admin";
  const isCs = role === "cs";
  const [airportPickerTarget, setAirportPickerTarget] = useState<
    "origin" | "destination" | null
  >(null);
  const [airportQuery, setAirportQuery] = useState("");
  const [isPassengersDrawerOpen, setIsPassengersDrawerOpen] = useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedHolidays, setSelectedHolidays] = useState<string[]>([]);
  const monthsScrollRef = useRef<HTMLDivElement | null>(null);
  const holidaysScrollRef = useRef<HTMLDivElement | null>(null);
  const dragMetaRef = useRef<{
    row: "months" | "holidays" | null;
    isDown: boolean;
    startX: number;
    startScrollLeft: number;
  }>({
    row: null,
    isDown: false,
    startX: 0,
    startScrollLeft: 0,
  });
  const ignoreTapRef = useRef(false);
  const {
    origin,
    destination,
    mode,
    passengers,
    cabinClass,
    setOrigin,
    setDestination,
    swapOriginDestination,
    setMode,
    setPassengerCount,
    setCabinClass,
  } = useSearchFlights();

  useEffect(() => {
    const destinationCode = searchParams.get("destination");
    const fromCardDestination = findAirportByCode(destinationCode);
    if (fromCardDestination) {
      setDestination(fromCardDestination);
    }
  }, [searchParams, setDestination]);

  const passengerSummary = useMemo(() => {
    const parts: string[] = [];
    if (passengers.adult > 0) parts.push(`${passengers.adult} adulto${passengers.adult > 1 ? "s" : ""}`);
    if (passengers.child > 0) parts.push(`${passengers.child} criança${passengers.child > 1 ? "s" : ""}`);
    if (passengers.baby > 0) parts.push(`${passengers.baby} bebê${passengers.baby > 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(", ") : "Passageiros";
  }, [passengers]);

  const filteredAirports = useMemo(() => {
    const query = airportQuery.trim().toLowerCase();
    if (!query) return [];
    return AIRPORTS.filter((airport) => {
      const haystack = `${airport.city} ${airport.code} ${airport.name} ${airport.country}`.toLowerCase();
      return haystack.includes(query);
    }).slice(0, 30);
  }, [airportQuery]);

  const selectAirport = (airport: AirportOption) => {
    if (airportPickerTarget === "origin") {
      setOrigin(airport);
    } else if (airportPickerTarget === "destination") {
      setDestination(airport);
    }
    setAirportPickerTarget(null);
    setAirportQuery("");
  };

  const canAdvance = !!origin && !!destination;

  const destinationCode = destination?.code ?? null;
  const filteredMockFlights = useMemo(() => {
    if (!destinationCode) return MOCK_FLIGHTS.slice(0, 6);
    const target = destinationCode.toUpperCase();
    const matches = MOCK_FLIGHTS.filter((flight) => flight.destinationCode === target);
    return matches.length > 0 ? matches : MOCK_FLIGHTS.slice(0, 6);
  }, [destinationCode]);

  const formatMoney = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleOpenCalendarFromMockFlight = (flight: MockFlight) => {
    const nextOrigin = findAirportByCode(flight.originCode);
    const nextDestination = findAirportByCode(flight.destinationCode);
    if (nextOrigin) setOrigin(nextOrigin);
    if (nextDestination) setDestination(nextDestination);
    navigate(`/price-calendar?airline=${encodeURIComponent(flight.airline)}`);
  };

  const toggleArrayItem = (
    value: string,
    items: string[],
    setter: (next: string[]) => void,
  ) => {
    if (items.includes(value)) {
      setter(items.filter((item) => item !== value));
      return;
    }
    setter([...items, value]);
  };

  const getScrollRowElement = (row: "months" | "holidays") =>
    row === "months" ? monthsScrollRef.current : holidaysScrollRef.current;

  const handleRowPointerDown = (
    row: "months" | "holidays",
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const element = getScrollRowElement(row);
    if (!element) return;
    dragMetaRef.current = {
      row,
      isDown: true,
      startX: event.clientX,
      startScrollLeft: element.scrollLeft,
    };
    ignoreTapRef.current = false;
  };

  const handleRowPointerMove = (
    row: "months" | "holidays",
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const meta = dragMetaRef.current;
    if (!meta.isDown || meta.row !== row) return;
    const element = getScrollRowElement(row);
    if (!element) return;
    const deltaX = event.clientX - meta.startX;
    if (Math.abs(deltaX) > 6) ignoreTapRef.current = true;
    element.scrollLeft = meta.startScrollLeft - deltaX;
  };

  const handleRowPointerUp = () => {
    dragMetaRef.current.isDown = false;
    dragMetaRef.current.row = null;
    if (ignoreTapRef.current) {
      setTimeout(() => { ignoreTapRef.current = false; }, 120);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-medium tracking-tight text-stone-900">
            Passagens
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-44 pt-6">
        <div className="space-y-5">
          <section>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => setAirportPickerTarget("origin")}
                className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-stone-300"
              >
                <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Origem
                </p>
                <p className="mt-0.5 text-[15px] font-medium text-stone-900">
                  {origin ? formatAirportLabel(origin) : "Onde?"}
                </p>
              </button>

              <button
                type="button"
                onClick={swapOriginDestination}
                className="flex shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 transition-colors hover:border-stone-300 hover:bg-stone-50"
                aria-label="Trocar origem e destino"
              >
                <ArrowLeftRight size={18} strokeWidth={1.5} />
              </button>

              <button
                type="button"
                onClick={() => setAirportPickerTarget("destination")}
                className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-stone-300"
              >
                <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Destino
                </p>
                <p className="mt-0.5 text-[15px] font-medium text-stone-900">
                  {destination ? formatAirportLabel(destination) : "Para onde?"}
                </p>
              </button>
            </div>
          </section>

          <section>
            <div className="flex rounded-xl border border-stone-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setMode("points")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                  mode === "points"
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Pontos
              </button>
              <button
                type="button"
                onClick={() => setMode("money")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                  mode === "money"
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Dinheiro
              </button>
            </div>
          </section>

          <section>
            <button
              type="button"
              onClick={() => setIsPassengersDrawerOpen(true)}
              className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-stone-300"
            >
              <span className="text-[15px] font-medium text-stone-900">
                {passengerSummary}
              </span>
              <ChevronRight size={18} className="text-stone-400" strokeWidth={1.5} />
            </button>
          </section>

          <section>
            <button
              type="button"
              onClick={() => setIsAdvancedFiltersOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-stone-300"
            >
              <span className="text-sm font-medium text-stone-700">
                Filtros
              </span>
              {isAdvancedFiltersOpen ? (
                <ChevronUp size={18} className="text-stone-400" strokeWidth={1.5} />
              ) : (
                <ChevronDown size={18} className="text-stone-400" strokeWidth={1.5} />
              )}
            </button>

            {isAdvancedFiltersOpen && (
              <div className="mt-3 space-y-4 rounded-xl border border-stone-200 bg-white p-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-stone-500">Classe</p>
                  <div className="flex gap-2">
                    {[
                      { id: "economica", label: "Econômica" },
                      { id: "executiva", label: "Executiva" },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setCabinClass(option.id as typeof cabinClass)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          cabinClass === option.id
                            ? "bg-stone-900 text-white"
                            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-stone-500">Período</p>
                  <div
                    ref={monthsScrollRef}
                    className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
                    onPointerDown={(e) => handleRowPointerDown("months", e)}
                    onPointerMove={(e) => handleRowPointerMove("months", e)}
                    onPointerUp={handleRowPointerUp}
                    onPointerCancel={handleRowPointerUp}
                    onPointerLeave={handleRowPointerUp}
                  >
                    {MONTH_OPTIONS.map((month) => {
                      const active = selectedMonths.includes(month);
                      return (
                        <button
                          key={month}
                          type="button"
                          onClick={() => {
                            if (ignoreTapRef.current) return;
                            toggleArrayItem(month, selectedMonths, setSelectedMonths);
                          }}
                          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                            active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {month}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-stone-500">Feriados</p>
                  <div
                    ref={holidaysScrollRef}
                    className="flex flex-wrap gap-1.5"
                  >
                    {BRAZIL_NATIONAL_HOLIDAYS.map((holiday) => {
                      const active = selectedHolidays.includes(holiday);
                      return (
                        <button
                          key={holiday}
                          type="button"
                          onClick={() => toggleArrayItem(holiday, selectedHolidays, setSelectedHolidays)}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
                            active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {holiday}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
            <p className="mb-2 text-xs font-medium text-stone-500">Sugestões</p>
            <div className="space-y-2">
              {filteredMockFlights.map((flight) => (
                <button
                  key={flight.id}
                  type="button"
                  onClick={() => handleOpenCalendarFromMockFlight(flight)}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50/50"
                >
                  <div className="flex items-center gap-3">
                    <AirlineLogo airline={flight.airline} size={20} />
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {flight.origin} → {flight.destination}
                      </p>
                      <p className="text-xs text-stone-500">
                        {flight.originCode} – {flight.destinationCode}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {mode === "points" ? (
                      <p className="text-sm font-semibold text-stone-900">
                        {flight.points.toLocaleString("pt-BR")} pts
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-stone-900">
                        {formatMoney(flight.money)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-stone-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-md px-4 pt-4 pb-2">
          <Button
            className="h-12 w-full rounded-xl bg-stone-900 text-base font-medium text-white hover:bg-stone-800"
            disabled={!canAdvance}
            onClick={() => canAdvance && navigate("/price-calendar")}
          >
            <Search size={18} className="mr-2" strokeWidth={2} />
            Ver datas
          </Button>
        </div>
        <BottomNav
          activeItem="passagens"
          onItemChange={(item) => {
            if (item === "programas") navigate(homePathForRole(role));
            else if (item === "vender") {
              if (isCs) navigate("/cs");
              else navigate("/cliente");
            }
          }}
          showClientSelector={isGestor}
          clients={[]}
        />
      </div>

      <Drawer
        open={airportPickerTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAirportPickerTarget(null);
            setAirportQuery("");
          }
        }}
      >
        <DrawerContent className="mx-auto max-h-[85vh] w-full max-w-md rounded-t-2xl border-0 bg-white">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base font-medium">
              {airportPickerTarget === "origin" ? "Origem" : "Destino"}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-stone-500">
              Busque por cidade ou código do aeroporto
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <Input
              value={airportQuery}
              placeholder="Ex.: São Paulo, GRU, Lisboa"
              onChange={(e) => setAirportQuery(e.target.value)}
              className="rounded-xl border-stone-200"
            />
            <div className="mt-3 max-h-[45vh] space-y-1 overflow-y-auto">
              {filteredAirports.length === 0 && airportQuery.trim() && (
                <p className="py-4 text-center text-sm text-stone-500">
                  Nenhum aeroporto encontrado
                </p>
              )}
              {filteredAirports.map((airport) => (
                <button
                  key={airport.code}
                  type="button"
                  onClick={() => selectAirport(airport)}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-stone-50/50 px-3 py-2.5 text-left transition-colors hover:bg-stone-100"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-900">
                      {airport.city} – {airport.code}
                    </p>
                    <p className="text-xs text-stone-500">
                      {airport.name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={isPassengersDrawerOpen} onOpenChange={setIsPassengersDrawerOpen}>
        <DrawerContent className="mx-auto max-h-[70vh] w-full max-w-md rounded-t-2xl border-0 bg-white">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base font-medium">Passageiros</DrawerTitle>
            <DrawerDescription className="text-sm text-stone-500">
              Quantidade por tipo
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2 px-4 pb-6">
            {[
              { key: "adult" as const, label: "Adultos", min: 1 },
              { key: "child" as const, label: "Crianças", min: 0 },
              { key: "baby" as const, label: "Bebês", min: 0 },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50/30 px-4 py-3"
              >
                <span className="text-sm font-medium text-stone-700">{item.label}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-50"
                    onClick={() =>
                      setPassengerCount(item.key, Math.max(item.min, passengers[item.key] - 1))
                    }
                  >
                    <Minus size={14} strokeWidth={2} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-stone-900">
                    {passengers[item.key]}
                  </span>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-50"
                    onClick={() => setPassengerCount(item.key, passengers[item.key] + 1)}
                  >
                    <Plus size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default SearchFlightsScreen;
