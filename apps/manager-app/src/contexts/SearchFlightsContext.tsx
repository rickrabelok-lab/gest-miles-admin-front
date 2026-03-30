import { createContext, useContext, useMemo, useState } from "react";
import type { AirportOption } from "@/lib/airports";

export type SearchMode = "points" | "money";
export type CabinClass = "economica" | "premium" | "executiva" | "primeira";

export type PassengerState = {
  adult: number;
  child: number;
  baby: number;
};

type SearchFlightsState = {
  origin: AirportOption | null;
  destination: AirportOption | null;
  mode: SearchMode;
  passengers: PassengerState;
  cabinClass: CabinClass;
};

type SearchFlightsContextValue = SearchFlightsState & {
  setOrigin: (airport: AirportOption | null) => void;
  setDestination: (airport: AirportOption | null) => void;
  swapOriginDestination: () => void;
  setMode: (mode: SearchMode) => void;
  setPassengerCount: (type: keyof PassengerState, count: number) => void;
  setCabinClass: (cabinClass: CabinClass) => void;
};

const SearchFlightsContext = createContext<SearchFlightsContextValue | null>(null);

export const SearchFlightsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [origin, setOrigin] = useState<AirportOption | null>(null);
  const [destination, setDestination] = useState<AirportOption | null>(null);
  const [mode, setMode] = useState<SearchMode>("points");
  const [passengers, setPassengers] = useState<PassengerState>({
    adult: 1,
    child: 0,
    baby: 0,
  });
  const [cabinClass, setCabinClass] = useState<CabinClass>("economica");

  const value = useMemo<SearchFlightsContextValue>(
    () => ({
      origin,
      destination,
      mode,
      passengers,
      cabinClass,
      setOrigin,
      setDestination,
      swapOriginDestination: () => {
        setOrigin(destination);
        setDestination(origin);
      },
      setMode,
      setPassengerCount: (type, count) => {
        setPassengers((previous) => ({
          ...previous,
          [type]: Math.max(0, count),
        }));
      },
      setCabinClass,
    }),
    [origin, destination, mode, passengers, cabinClass],
  );

  return (
    <SearchFlightsContext.Provider value={value}>
      {children}
    </SearchFlightsContext.Provider>
  );
};

export const useSearchFlights = () => {
  const context = useContext(SearchFlightsContext);
  if (!context) {
    throw new Error("useSearchFlights must be used inside SearchFlightsProvider");
  }
  return context;
};
