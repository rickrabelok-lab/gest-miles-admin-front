import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-nubank-border/80", className)} {...props} />;
}

export { Skeleton };
