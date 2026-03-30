import { memo } from "react";

type TopStoreCardProps = {
  store: string;
  bestMultiplier: number;
};

const TopStoreCard = ({ store, bestMultiplier }: TopStoreCardProps) => (
  <article className="rounded-[16px] bg-white p-4 shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover hover:-translate-y-0.5">
    <p className="text-sm font-semibold text-nubank-text">{store}</p>
    <p className="mt-0.5 text-xs text-primary">Até {bestMultiplier}x</p>
  </article>
);

export default memo(TopStoreCard);
