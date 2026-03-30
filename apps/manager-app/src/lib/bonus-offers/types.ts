export type LoyaltyProgram =
  | "Livelo"
  | "Smiles"
  | "LATAM Pass"
  | "Azul Fidelidade";

export type BonusOffer = {
  id: string;
  program: LoyaltyProgram;
  store: string;
  multiplier: number;
  validUntil: string;
  conditions: string;
  offerUrl: string;
};
