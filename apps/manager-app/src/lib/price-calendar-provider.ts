import type { SearchMode } from "@/contexts/SearchFlightsContext";
import { generateMockMonthPrices } from "@/lib/price-calendar";

export type PriceCalendarQuery = {
  originCode: string;
  destinationCode: string;
  mode: SearchMode;
  month: Date;
};

export type PriceCalendarProvider = {
  getMonthPrices: (query: PriceCalendarQuery) => Promise<Map<number, number>>;
};

class MockPriceCalendarProvider implements PriceCalendarProvider {
  async getMonthPrices(query: PriceCalendarQuery): Promise<Map<number, number>> {
    await new Promise((resolve) => setTimeout(resolve, 220));
    return generateMockMonthPrices(query);
  }
}

let activeProvider: PriceCalendarProvider = new MockPriceCalendarProvider();

export const setPriceCalendarProvider = (provider: PriceCalendarProvider) => {
  activeProvider = provider;
};

export const getPriceCalendarProvider = () => activeProvider;
