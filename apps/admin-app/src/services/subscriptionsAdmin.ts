import { isMissingRelationError } from "@/lib/supabaseErrors";
import { supabase } from "@/lib/supabase";

export type SubscriptionRow = Record<string, unknown> & { id?: string };

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endDate(row: SubscriptionRow): Date | null {
  return (
    parseDate(pickString(row, ["expires_at", "end_at", "current_period_end", "valid_until", "data_fim"])) ??
    parseDate(pickString(row, ["canceled_at", "cancelled_at"]))
  );
}

export type SubscriptionView = {
  raw: SubscriptionRow;
  id: string;
  label: string;
  status: string;
  endsAt: Date | null;
  daysRemaining: number | null;
  isActive: boolean;
  isExpired: boolean;
};

function rowId(row: SubscriptionRow, index: number): string {
  const id = row.id ?? pickString(row, ["uuid", "subscription_id"]);
  return id ?? `row-${index}`;
}

export async function listSubscriptionsAdmin(): Promise<{ rows: SubscriptionView[]; available: boolean }> {
  const { data, error } = await supabase.from("subscriptions").select("*").limit(2000);
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], available: false };
    throw error;
  }
  const now = new Date();
  const list = (data ?? []) as SubscriptionRow[];
  const rows: SubscriptionView[] = list.map((raw, index) => {
    const id = rowId(raw, index);
    const status = (pickString(raw, ["status", "estado", "subscription_status"]) ?? "").toLowerCase();
    const endsAt = endDate(raw);
    const isExpired = endsAt ? endsAt < now : status.includes("expir") || status.includes("cancel") || status === "ended";
    const isActive =
      !isExpired &&
      (status.includes("active") ||
        status.includes("ativa") ||
        status === "trialing" ||
        status === "paid" ||
        (!status && (!endsAt || endsAt >= now)));
    let daysRemaining: number | null = null;
    if (endsAt && endsAt >= now) {
      daysRemaining = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }
    const label =
      pickString(raw, ["email", "customer_email", "user_email", "nome"]) ??
      pickString(raw, ["user_id", "usuario_id"]) ??
      id;
    return { raw, id, label, status: status || "—", endsAt, daysRemaining, isActive, isExpired };
  });
  return { rows, available: true };
}

const END_KEYS = ["expires_at", "end_at", "current_period_end", "valid_until", "data_fim"] as const;

export async function extendSubscriptionByDays(subscriptionId: string, days: number): Promise<void> {
  const { data: rows, error: fetchErr } = await supabase.from("subscriptions").select("*").eq("id", subscriptionId).limit(1);
  if (fetchErr) throw fetchErr;
  const row = (rows?.[0] ?? null) as SubscriptionRow | null;
  if (!row) throw new Error("Assinatura não encontrada.");

  const currentEnd = endDate(row) ?? new Date();
  const base = currentEnd < new Date() ? new Date() : currentEnd;
  const next = new Date(base);
  next.setDate(next.getDate() + days);

  const iso = next.toISOString();
  const patch: Record<string, string> = {};
  const key = END_KEYS.find((k) => Object.prototype.hasOwnProperty.call(row, k));
  if (key) patch[key] = iso;
  else patch.expires_at = iso;

  const { error: upErr } = await supabase.from("subscriptions").update(patch).eq("id", subscriptionId);
  if (upErr) throw upErr;
}
