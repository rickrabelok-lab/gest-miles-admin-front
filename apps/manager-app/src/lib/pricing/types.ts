export type PriceMode = "miles" | "money";

export type RouteCode = string;

export type PriceQuery = {
  origin: RouteCode;
  destination: RouteCode;
  mode: PriceMode;
};

export type PriceQuote = PriceQuery & {
  price: number;
  airline: string;
  lastUpdated: string;
};

export type BestPriceByDestination = {
  destination: RouteCode;
  bestOrigin: RouteCode | null;
  bestPrice: number | null;
  priceType: PriceMode;
  airline: string | null;
  lastUpdated: string | null;
};

export type PriceProvider = {
  getQuote(query: PriceQuery): Promise<PriceQuote | null>;
};

export type BestPriceSearchOptions = {
  ttlMs?: number;
  maxConcurrency?: number;
};
