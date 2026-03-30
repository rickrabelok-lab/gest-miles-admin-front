import { BONUS_OFFERS_MOCK } from "@/lib/bonus-offers/mock-data";
import type { BonusOffer, LoyaltyProgram } from "@/lib/bonus-offers/types";

export const getActiveBonusOffers = async (
  program?: LoyaltyProgram,
): Promise<BonusOffer[]> => {
  await new Promise((resolve) => setTimeout(resolve, 260));

  if (!program) return BONUS_OFFERS_MOCK;
  return BONUS_OFFERS_MOCK.filter((offer) => offer.program === program);
};
