import { Search } from "lucide-react";
import type { SearchMode } from "@/contexts/SearchFlightsContext";
import {
  formatCompactPrice,
  getMonthDays,
  getRelativePriceLevel,
  getWeekdayOffsetMondayFirst,
} from "@/lib/price-calendar";

type PriceCalendarProps = {
  month: Date;
  mode: SearchMode;
  loading: boolean;
  pricesByDay: Map<number, number>;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
};

const WEEKDAYS = ["Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb.", "Dom."];

const levelClass: Record<string, string> = {
  low: "bg-emerald-500",
  mid: "bg-yellow-400",
  high: "bg-orange-400",
  veryHigh: "bg-red-500",
};

const PriceCalendar = ({
  month,
  mode,
  loading,
  pricesByDay,
  selectedDay,
  onSelectDay,
}: PriceCalendarProps) => {
  const days = getMonthDays(month);
  const offset = getWeekdayOffsetMondayFirst(month);
  const monthPrices = [...pricesByDay.values()];

  return (
    <div className="rounded-[16px] bg-white p-5 shadow-nubank">
      <div className="mb-3 grid grid-cols-7 gap-2">
        {WEEKDAYS.map((label) => (
          <p key={label} className="text-center text-[12px] text-slate-400">
            {label}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-3">
        {Array.from({ length: offset }).map((_, index) => (
          <div key={`blank-${index}`} />
        ))}

        {Array.from({ length: days }).map((_, index) => {
          const day = index + 1;
          const price = pricesByDay.get(day);
          const selected = selectedDay === day;

          return (
            <button
              key={`day-${day}`}
              type="button"
              onClick={() => onSelectDay(day)}
              className="group flex min-h-[66px] flex-col items-center justify-start rounded-[12px] px-1 py-1 transition-all duration-300 ease-out active:scale-95"
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium transition-all duration-150 ${
                  selected ? "gradient-primary text-primary-foreground" : "text-nubank-text"
                }`}
              >
                {day}
              </span>

              {loading ? (
                <span className="mt-2 h-3 w-8 animate-pulse rounded bg-slate-200" />
              ) : price !== undefined ? (
                <>
                  <span className="mt-1 text-[12px] font-semibold text-slate-700">
                    {formatCompactPrice(price, mode)}
                  </span>
                  <span
                    className={`mt-1 h-[3px] w-10 rounded-full ${
                      levelClass[getRelativePriceLevel(price, monthPrices)]
                    }`}
                  />
                </>
              ) : (
                <Search className="mt-2 h-3.5 w-3.5 text-slate-300" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PriceCalendar;
