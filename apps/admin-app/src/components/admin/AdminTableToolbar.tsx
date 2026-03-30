import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AdminTableToolbarProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  children?: ReactNode;
};

export function AdminTableToolbar({ value, onChange, placeholder, className, children }: AdminTableToolbarProps) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Pesquisar…"}
          className="pl-9"
          aria-label="Pesquisar na tabela"
        />
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
