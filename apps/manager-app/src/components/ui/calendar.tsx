import * as React from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

import "react-day-picker/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  components,
  ...props
}: CalendarProps) {
  const base = getDefaultClassNames();

  const mergedClassNames = {
    ...base,
    root: cn(
      "w-fit rounded-[14px] border border-nubank-border bg-card p-2 shadow-sm",
      "[--cell-size:2rem] sm:[--cell-size:1.875rem]",
      "[--rdp-accent-color:hsl(var(--primary))]",
      "[--rdp-accent-background-color:hsl(var(--primary)/0.12)]",
      "[--rdp-day-height:var(--cell-size)]",
      "[--rdp-day-width:var(--cell-size)]",
      "[--rdp-day_button-height:var(--cell-size)]",
      "[--rdp-day_button-width:var(--cell-size)]",
      "[--rdp-day_button-border-radius:0.625rem]",
      "[--rdp-nav_button-height:var(--cell-size)]",
      "[--rdp-nav_button-width:var(--cell-size)]",
      "[--rdp-nav-height:var(--cell-size)]",
      "[--rdp-months-gap:0.75rem]",
      "[--rdp-today-color:hsl(var(--primary))]",
      base.root,
    ),
    months: cn("relative flex flex-col gap-2 md:flex-row md:gap-3", base.months),
    month: cn("flex w-full flex-col gap-2", base.month),
    nav: cn(
      "absolute inset-x-0 top-0 z-10 flex w-full items-center justify-between gap-1 px-1",
      base.nav,
    ),
    button_previous: cn(
      buttonVariants({ variant: "outline", size: "icon" }),
      "h-[var(--cell-size)] w-[var(--cell-size)] shrink-0 rounded-[10px] border-nubank-border p-0 aria-disabled:opacity-50",
      base.button_previous,
    ),
    button_next: cn(
      buttonVariants({ variant: "outline", size: "icon" }),
      "h-[var(--cell-size)] w-[var(--cell-size)] shrink-0 rounded-[10px] border-nubank-border p-0 aria-disabled:opacity-50",
      base.button_next,
    ),
    month_caption: cn(
      "flex h-[var(--cell-size)] w-full items-center justify-center px-2 !text-sm [&]:!text-sm",
      base.month_caption,
    ),
    dropdowns: cn(
      "flex h-[var(--cell-size)] w-full items-center justify-center gap-1.5 text-sm font-medium",
      base.dropdowns,
    ),
    dropdown_root: cn(
      "relative rounded-[14px] border border-input shadow-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
      base.dropdown_root,
    ),
    dropdown: cn("absolute inset-0 bg-popover opacity-0", base.dropdown),
    caption_label: cn(
      "select-none text-sm font-semibold !text-sm",
      captionLayout === "label" ? "" : "flex h-8 items-center gap-1 rounded-md pl-2 pr-1 [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
      base.caption_label,
    ),
    month_grid: cn("w-full border-collapse", base.month_grid),
    weekdays: cn("flex", base.weekdays),
    weekday: cn(
      "flex-1 select-none rounded-md text-[11px] font-medium text-muted-foreground",
      base.weekday,
    ),
    week: cn("mt-1 flex w-full", base.week),
    week_number_header: cn("w-[var(--cell-size)] select-none", base.week_number_header),
    week_number: cn("select-none text-[0.8rem] text-muted-foreground", base.week_number),
    day: cn(
      "relative flex h-full w-full flex-1 justify-center p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
      base.day,
    ),
    day_button: cn(
      buttonVariants({ variant: "ghost" }),
      "h-[var(--cell-size)] min-h-[var(--cell-size)] w-[var(--cell-size)] min-w-[var(--cell-size)] rounded-[10px] p-0 text-[13px] font-normal leading-none data-[selected=true]:border-0 data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:shadow-none data-[selected=true]:hover:bg-primary data-[selected=true]:hover:text-primary-foreground",
      base.day_button,
    ),
    range_start: cn("rounded-l-md bg-accent", base.range_start),
    range_middle: cn("rounded-none", base.range_middle),
    range_end: cn("rounded-r-md bg-accent", base.range_end),
    today: cn(
      "rounded-[10px] bg-transparent text-foreground ring-1 ring-inset ring-primary/35 data-[selected=true]:rounded-[10px] data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:ring-0",
      base.today,
    ),
    selected: cn("!text-[13px] font-semibold leading-none [&_.rdp-day_button]:!text-[13px]", base.selected),
    outside: cn("text-muted-foreground/80", base.outside),
    disabled: cn("text-muted-foreground opacity-50", base.disabled),
    hidden: cn("invisible", base.hidden),
    ...classNames,
  };

  const mergedComponents = {
    Chevron: ({
      className: chevronClassName,
      orientation,
      ...chevronProps
    }: {
      className?: string;
      orientation?: "left" | "right" | "up" | "down";
    } & React.SVGProps<SVGSVGElement>) => {
      if (orientation === "left") {
        return (
          <ChevronLeftIcon className={cn("size-4", chevronClassName)} {...chevronProps} aria-hidden />
        );
      }
      if (orientation === "right") {
        return (
          <ChevronRightIcon className={cn("size-4", chevronClassName)} {...chevronProps} aria-hidden />
        );
      }
      return (
        <ChevronDownIcon className={cn("size-4", chevronClassName)} {...chevronProps} aria-hidden />
      );
    },
    ...components,
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn(className)}
      classNames={mergedClassNames}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      components={mergedComponents}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
