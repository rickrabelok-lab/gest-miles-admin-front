import { memo } from "react";
import { Button } from "@/components/ui/button";
import type { BonusOffer } from "@/lib/bonus-offers/types";

type BonusOfferCardProps = {
  offer: BonusOffer;
  onAccessOffer: (url: string) => void;
};

const initials = (text: string) =>
  text
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const BonusOfferCard = ({ offer, onAccessOffer }: BonusOfferCardProps) => {
  const highlight = offer.multiplier >= 10;
  const badge = offer.multiplier >= 15;

  return (
    <article
      className={`rounded-[16px] gradient-card-subtle p-3.5 shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover hover:-translate-y-0.5 ${
        highlight ? "ring-1 ring-primary/10" : ""
      }`}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-xl bg-primary/[0.08] px-2 py-1">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-primary/15 text-[10px] font-semibold text-primary">
            {initials(offer.program)}
          </span>
          <span className="text-xs font-medium text-nubank-text">{offer.program}</span>
        </div>
        {badge && (
          <span className="rounded-full bg-warning/20 px-2.5 py-1 text-[11px] font-medium text-warning">
            🔥 Oferta em destaque
          </span>
        )}
      </div>

      <div className="mb-2.5 inline-flex items-center rounded-xl bg-nubank-bg px-2 py-1.5">
        <span className="text-sm font-semibold text-nubank-text">{offer.store}</span>
      </div>

      <p className="text-[17px] font-semibold text-primary">
        Até {offer.multiplier} pontos por real
      </p>
      <p className="mt-1 text-xs text-nubank-text-secondary">
        Válido até {new Date(offer.validUntil).toLocaleDateString("pt-BR")}
      </p>
      <p className="mt-0.5 text-xs text-nubank-text-secondary">{offer.conditions}</p>

      <Button
        className="mt-3 h-10 w-full"
        onClick={() => onAccessOffer(offer.offerUrl)}
      >
        Acessar oferta
      </Button>
    </article>
  );
};

export default memo(BonusOfferCard);
