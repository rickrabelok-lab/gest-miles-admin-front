import type { PriceMode, PriceProvider, PriceQuery, PriceQuote } from "@/lib/pricing/types";

const AIRLINES = [
  "GOL",
  "LATAM",
  "AZUL",
  "TAP",
  "AIR FRANCE",
  "QATAR",
  "IBERIA",
];

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

const buildPrice = (hash: number, mode: PriceMode) => {
  if (mode === "miles") {
    const min = 4000;
    const span = 64000;
    return roundTo(min + (hash % span), 500);
  }

  const min = 90;
  const span = 4700;
  const amount = min + (hash % span);
  return Math.round(amount * 100) / 100;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Estimativa determinística para explorar destinos até existir API de tarifas (não substitui GDS).
 */
export class HeuristicPriceProvider implements PriceProvider {
  async getQuote(query: PriceQuery): Promise<PriceQuote | null> {
    const { origin, destination, mode } = query;

    if (origin === destination) return null;

    const seed = `${origin}:${destination}:${mode}`;
    const hash = hashString(seed);
    const latencyMs = 70 + (hash % 130);

    await wait(latencyMs);

    const airline = AIRLINES[hash % AIRLINES.length];
    const price = buildPrice(hash, mode);
    const now = Date.now();
    const driftMs = (hash % 180) * 60 * 1000;

    return {
      ...query,
      price,
      airline,
      lastUpdated: new Date(now - driftMs).toISOString(),
    };
  }
}
