import { Skeleton } from "@/components/ui/skeleton";

const BonusOfferCardSkeleton = () => (
  <div className="rounded-[16px] bg-white p-4 shadow-nubank">
    <Skeleton className="h-6 w-32 rounded-full" />
    <Skeleton className="mt-2 h-9 w-24 rounded-xl" />
    <Skeleton className="mt-2 h-5 w-40 rounded-md" />
    <Skeleton className="mt-1.5 h-3.5 w-28 rounded-md" />
    <Skeleton className="mt-1.5 h-3.5 w-full rounded-md" />
    <Skeleton className="mt-3 h-9 w-full rounded-full" />
  </div>
);

export default BonusOfferCardSkeleton;
