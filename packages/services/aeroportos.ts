import { supabase } from "@gest-miles/shared";

export type Aeroporto = {
  id: number;
  codigo_iata: string;
  nome: string;
  cidade: string | null;
  pais: string | null;
  lat: number | null;
  lng: number | null;
};

export type AeroportoBasic = Pick<Aeroporto, "lat" | "lng" | "cidade" | "pais">;

const BASE_COLUMNS = "id, codigo_iata, nome, cidade, pais, lat, lng";

function normalizeQuery(query: string): string {
  return query.trim();
}

export async function getAeroportoByIata(iata: string): Promise<AeroportoBasic | null> {
  const codigoIata = iata.trim().toUpperCase();
  if (!codigoIata) return null;

  const { data, error } = await supabase
    .from("aeroportos")
    .select("lat, lng, cidade, pais")
    .eq("codigo_iata", codigoIata)
    .maybeSingle();

  if (error) throw error;
  return (data as AeroportoBasic | null) ?? null;
}

export async function searchAeroportos(query: string): Promise<Aeroporto[]> {
  const q = normalizeQuery(query);
  if (!q) return [];

  const escaped = q.replace(/[%_,]/g, "");
  const like = `%${escaped}%`;
  const iataExact = escaped.toUpperCase();

  const { data, error } = await supabase
    .from("aeroportos")
    .select(BASE_COLUMNS)
    .or(`codigo_iata.eq.${iataExact},codigo_iata.ilike.${like},cidade.ilike.${like},nome.ilike.${like}`)
    .order("codigo_iata", { ascending: true })
    .limit(10);

  if (error) throw error;
  return (data as Aeroporto[] | null) ?? [];
}

export async function getAllAeroportos(): Promise<Aeroporto[]> {
  const { data, error } = await supabase.from("aeroportos").select(BASE_COLUMNS).order("codigo_iata", { ascending: true });
  if (error) throw error;
  return (data as Aeroporto[] | null) ?? [];
}
