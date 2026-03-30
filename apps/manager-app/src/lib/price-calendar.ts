import type { SearchMode } from "@/contexts/SearchFlightsContext";

export type RelativePriceLevel = "low" | "mid" | "high" | "veryHigh";

export const formatCompactPrice = (value: number, mode: SearchMode) => {
  if (mode === "money") {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  if (value >= 1000) {
    const asK = value / 1000;
    if (Number.isInteger(asK)) return `${asK}K`;
    return `${asK.toFixed(1).replace(".", ",")}K`;
  }

  return value.toLocaleString("pt-BR");
};

export const getRelativePriceLevel = (
  price: number,
  monthPrices: number[],
): RelativePriceLevel => {
  if (monthPrices.length === 0) return "mid";

  const sorted = [...monthPrices].sort((a, b) => a - b);
  const p25 = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const p5 = sorted[Math.floor((sorted.length - 1) * 0.5)];
  const p75 = sorted[Math.floor((sorted.length - 1) * 0.75)];

  if (price <= p25) return "low";
  if (price <= p5) return "mid";
  if (price <= p75) return "high";
  return "veryHigh";
};

export const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const getMonthDays = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
};

export const getWeekdayOffsetMondayFirst = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const weekday = start.getDay();
  return (weekday + 6) % 7;
};

const hash = (value: string) => {
  let output = 0;
  for (let i = 0; i < value.length; i += 1) {
    output = (output << 5) - output + value.charCodeAt(i);
    output |= 0;
  }
  return Math.abs(output);
};

export const generateMockMonthPrices = ({
  originCode,
  destinationCode,
  mode,
  month,
}: {
  originCode: string;
  destinationCode: string;
  mode: SearchMode;
  month: Date;
}) => {
  const totalDays = getMonthDays(month);
  const monthToken = monthKey(month);
  const pricesByDay = new Map<number, number>();

  for (let day = 1; day <= totalDays; day += 1) {
    const seed = hash(`${originCode}-${destinationCode}-${mode}-${monthToken}-${day}`);
    const hasPrice = seed % 9 !== 0;
    if (!hasPrice) continue;

    if (mode === "points") {
      const value = 3500 + (seed % 17000);
      pricesByDay.set(day, Math.round(value / 100) * 100);
      continue;
    }

    const moneyValue = 220 + (seed % 1700);
    pricesByDay.set(day, Math.round(moneyValue));
  }

  return pricesByDay;
};
