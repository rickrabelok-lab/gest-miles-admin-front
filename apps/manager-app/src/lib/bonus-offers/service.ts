import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { hasApiUrl } from "@/services/api";
import { fetchBonusOffers } from "@/services/bonusOffersService";
import type { BonusOffer, LoyaltyProgram } from "@/lib/bonus-offers/types";

function mapBonusRow(row: Record<string, unknown>): BonusOffer {
  const vu = row.valid_until;
  const validUntil =
    typeof vu === "string"
      ? vu.slice(0, 10)
      : vu && typeof vu === "object" && "toISOString" in vu && typeof (vu as Date).toISOString === "function"
        ? (vu as Date).toISOString().slice(0, 10)
        : "";

  return {
    id: String(row.id),
    program: row.program as BonusOffer["program"],
    store: String(row.store),
    multiplier: Number(row.multiplier),
    validUntil,
    conditions: String(row.conditions ?? ""),
    offerUrl: String(row.offer_url ?? ""),
  };
}

export const getActiveBonusOffers = async (
  program?: LoyaltyProgram,
): Promise<BonusOffer[]> => {
  if (hasApiUrl()) {
    const raw = await fetchBonusOffers(program);
    return Array.isArray(raw) ? (raw as BonusOffer[]) : [];
  }

  if (isSupabaseConfigured) {
    let q = supabase.from("bonus_offers").select("*").eq("active", true);
    if (program) {
      q = q.eq("program", program);
    }
    const { data, error } = await q.order("program", { ascending: true });
    if (error) return [];
    return (data ?? []).map((row) => mapBonusRow(row as Record<string, unknown>));
  }

  return [];
};
