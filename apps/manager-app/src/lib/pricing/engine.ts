import { HeuristicPriceProvider } from "@/lib/pricing/providers/heuristicPriceProvider";
import type {
  BestPriceByDestination,
  BestPriceSearchOptions,
  PriceMode,
  PriceProvider,
  PriceQuote,
  RouteCode,
} from "@/lib/pricing/types";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_CONCURRENCY = 8;

type CacheEntry = {
  value: PriceQuote | null;
  expiresAt: number;
};

const normalizeCode = (value: string) => value.trim().toUpperCase();

const normalizeUniqueCodes = (values: string[]) => {
  const dedup = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizeCode(value);
    if (normalized) dedup.add(normalized);
  });

  return [...dedup];
};

const buildCacheKey = (origin: RouteCode, destination: RouteCode, mode: PriceMode) =>
  `${origin}::${destination}::${mode}`;

const runWithConcurrency = async <T>(
  jobs: Array<() => Promise<T>>,
  maxConcurrency: number,
) => {
  if (jobs.length === 0) return [] as T[];

  const results = new Array<T>(jobs.length);
  const safeConcurrency = Math.max(1, Math.min(maxConcurrency, jobs.length));
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < jobs.length) {
      const jobIndex = currentIndex;
      currentIndex += 1;
      results[jobIndex] = await jobs[jobIndex]();
    }
  };

  await Promise.all(
    Array.from({ length: safeConcurrency }, () => worker()),
  );

  return results;
};

export const createPriceAggregationEngine = (provider: PriceProvider) => {
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<PriceQuote | null>>();

  const getRouteQuote = async (
    origin: RouteCode,
    destination: RouteCode,
    mode: PriceMode,
    ttlMs: number,
  ) => {
    const key = buildCacheKey(origin, destination, mode);
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const existingRequest = inFlight.get(key);
    if (existingRequest) {
      return existingRequest;
    }

    const request = provider
      .getQuote({ origin, destination, mode })
      .then((quote) => {
        cache.set(key, {
          value: quote,
          expiresAt: Date.now() + ttlMs,
        });
        return quote;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, request);
    return request;
  };

  const getBestPriceByDestination = async (
    destinations: string[],
    origins: string[],
    mode: PriceMode,
    options: BestPriceSearchOptions = {},
  ): Promise<BestPriceByDestination[]> => {
    const normalizedDestinations = normalizeUniqueCodes(destinations);
    const normalizedOrigins = normalizeUniqueCodes(origins);

    if (normalizedDestinations.length === 0) return [];

    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

    const routeJobs: Array<{
      destination: RouteCode;
      origin: RouteCode;
      key: string;
      run: () => Promise<PriceQuote | null>;
    }> = [];

    normalizedDestinations.forEach((destination) => {
      normalizedOrigins.forEach((origin) => {
        const key = buildCacheKey(origin, destination, mode);
        routeJobs.push({
          destination,
          origin,
          key,
          run: () => getRouteQuote(origin, destination, mode, ttlMs),
        });
      });
    });

    const uniqueJobsByKey = new Map<string, () => Promise<PriceQuote | null>>();
    routeJobs.forEach((job) => {
      if (!uniqueJobsByKey.has(job.key)) {
        uniqueJobsByKey.set(job.key, job.run);
      }
    });

    const uniqueJobEntries = [...uniqueJobsByKey.entries()];
    const uniqueResults = await runWithConcurrency(
      uniqueJobEntries.map(([, run]) => run),
      maxConcurrency,
    );
    const quoteByKey = new Map<string, PriceQuote | null>();
    uniqueJobEntries.forEach(([key], index) => {
      quoteByKey.set(key, uniqueResults[index]);
    });

    return normalizedDestinations.map((destination) => {
      const quotesForDestination = normalizedOrigins
        .map((origin) => quoteByKey.get(buildCacheKey(origin, destination, mode)))
        .filter((quote): quote is PriceQuote => !!quote);

      if (quotesForDestination.length === 0) {
        return {
          destination,
          bestOrigin: null,
          bestPrice: null,
          priceType: mode,
          airline: null,
          lastUpdated: null,
        };
      }

      const bestQuote = quotesForDestination.reduce((currentBest, quote) => {
        if (quote.price < currentBest.price) return quote;
        return currentBest;
      });

      return {
        destination,
        bestOrigin: bestQuote.origin,
        bestPrice: bestQuote.price,
        priceType: mode,
        airline: bestQuote.airline,
        lastUpdated: bestQuote.lastUpdated,
      };
    });
  };

  const getBestPriceByDestinationForAllModes = async (
    destinations: string[],
    origins: string[],
    options: BestPriceSearchOptions = {},
  ) => {
    const [miles, money] = await Promise.all([
      getBestPriceByDestination(destinations, origins, "miles", options),
      getBestPriceByDestination(destinations, origins, "money", options),
    ]);

    return { miles, money };
  };

  const clearCache = () => {
    cache.clear();
    inFlight.clear();
  };

  return {
    getBestPriceByDestination,
    getBestPriceByDestinationForAllModes,
    clearCache,
  };
};

const defaultPricingEngine = createPriceAggregationEngine(new HeuristicPriceProvider());

export const getBestPriceByDestination = defaultPricingEngine.getBestPriceByDestination;
export const getBestPriceByDestinationForAllModes =
  defaultPricingEngine.getBestPriceByDestinationForAllModes;
export const clearPriceAggregationCache = defaultPricingEngine.clearCache;
