import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { ptBR } from "date-fns/locale/pt-BR";

import { Button } from "@/components/ui/button";
import { Calendar, type CalendarProps } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatLocalDateToYmd, formatYmdAsPtBr, parseYmdToLocalDate } from "@/lib/dateYmd";
import { cn } from "@/lib/utils";

export type DatePickerFieldProps = {
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
  /** Classes do botão gatilho (largura, altura, tema claro/escuro). */
  triggerClassName?: string;
  /** Classes do painel do popover (borda/alinhamento ao tema da página). */
  contentClassName?: string;
  disabled?: CalendarProps["disabled"];
  id?: string;
};

/**
 * Seleção de data no mesmo padrão do calendário RDP do app (Popover + Calendar, pt-BR).
 * Valor e onChange usam string `YYYY-MM-DD`.
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = "Escolher data",
  triggerClassName,
  contentClassName,
  disabled,
  id,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          className={cn(
            "h-10 w-full justify-start rounded-[14px] border-nubank-border bg-white px-3 text-left text-sm font-normal",
            triggerClassName,
          )}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0 opacity-70" aria-hidden />
          {value ? formatYmdAsPtBr(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-auto border-nubank-border p-0", contentClassName)}
        align="start"
      >
        <Calendar
          mode="single"
          locale={ptBR}
          selected={parseYmdToLocalDate(value)}
          disabled={disabled}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatLocalDateToYmd(date));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
