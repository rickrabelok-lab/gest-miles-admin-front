import { apiFetch, hasApiUrl } from "./api";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { DemoFlight } from "@gest-miles/shared";

type DemoFlightRow = {
  external_id?: string;
  id?: string;
  origin_code: string;
  destination_code: string;
  origin_name: string;
  destination_name: string;
  airline: string;
  points: number;
  money: number;
};

function mapDemoFlightRow(row: DemoFlightRow): DemoFlight {
  return {
    id: String(row.external_id ?? row.id ?? ""),
    originCode: row.origin_code,
    destinationCode: row.destination_code,
    origin: row.origin_name,
    destination: row.destination_name,
    airline: row.airline,
    points: Number(row.points),
    money: Number(row.money),
  };
}

export async function fetchDemoFlights(destinationCode?: string | null): Promise<DemoFlight[]> {
  if (hasApiUrl()) {
    const qs = destinationCode
      ? `?destination=${encodeURIComponent(destinationCode)}`
      : "";
    const data = await apiFetch<DemoFlight[]>(`/api/demo-flights${qs}`);
    return Array.isArray(data) ? data : [];
  }

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("demo_flights")
      .select("*")
      .order("external_id");
    if (error) return [];
    const rows = (data ?? []) as DemoFlightRow[];
    const mapped = rows.map(mapDemoFlightRow);
    if (destinationCode) {
      const d = destinationCode.toUpperCase();
      const matches = mapped.filter((f) => f.destinationCode.toUpperCase() === d);
      return (matches.length > 0 ? matches : mapped).slice(0, 6);
    }
    return mapped.slice(0, 6);
  }

  return [];
}
