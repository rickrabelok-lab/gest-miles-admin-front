import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse";
import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = Number(process.env.AIRPORTS_BATCH_SIZE || 500);

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function normalizeFloat(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function ensureTable(supabase) {
  const { error } = await supabase.from("aeroportos").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) return;

  const sql = `
create table if not exists public.aeroportos (
  id bigserial primary key,
  codigo_iata text not null unique,
  nome text not null,
  cidade text,
  pais text,
  lat double precision,
  lng double precision
);
create index if not exists aeroportos_pais_idx on public.aeroportos (pais);
create index if not exists aeroportos_cidade_idx on public.aeroportos (cidade);
`.trim();

  throw new Error(
    ["Table `aeroportos` not available. Create it in Supabase SQL editor with:", sql, `Original error: ${error.message ?? String(error)}`].join(
      "\n\n",
    ),
  );
}

async function importAirports() {
  const csvPathArg = process.argv[2];
  if (!csvPathArg) {
    throw new Error("Usage: npm run import:airports -- <path-to-airports.csv>");
  }

  const csvPath = path.resolve(csvPathArg);
  const shouldReset = !process.argv.includes("--no-reset");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
  if (!supabaseKey) {
    throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await ensureTable(supabase);
  if (shouldReset) {
    const { error } = await supabase.from("aeroportos").delete().not("id", "is", null);
    if (error) throw new Error(`Failed to clean aeroportos table: ${error.message ?? String(error)}`);
  }

  const parser = fs.createReadStream(csvPath).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
    }),
  );

  const dedup = new Map();
  let totalRows = 0;
  let filteredRows = 0;
  let missingIata = 0;

  for await (const row of parser) {
    totalRows += 1;
    const type = String(row.type || "");
    const iata = String(row.iata_code || "").trim().toUpperCase();

    if (!iata) {
      missingIata += 1;
      continue;
    }
    if (type !== "large_airport" && type !== "medium_airport") {
      filteredRows += 1;
      continue;
    }

    dedup.set(iata, {
      codigo_iata: iata,
      nome: String(row.name || "").trim(),
      cidade: String(row.municipality || "").trim() || null,
      pais: String(row.iso_country || "").trim() || null,
      lat: normalizeFloat(row.latitude_deg),
      lng: normalizeFloat(row.longitude_deg),
    });
  }

  const records = Array.from(dedup.values()).filter((r) => r.nome);
  const batches = chunk(records, BATCH_SIZE);

  let insertedOrUpdated = 0;
  for (const batch of batches) {
    const { error } = await supabase.from("aeroportos").upsert(batch, {
      onConflict: "codigo_iata",
      ignoreDuplicates: false,
    });
    if (error) {
      throw new Error(`Batch upsert failed: ${error.message ?? String(error)}`);
    }
    insertedOrUpdated += batch.length;
  }

  console.log("Airport import completed.");
  console.log(`CSV: ${csvPath}`);
  console.log(`Total rows read: ${totalRows}`);
  console.log(`Ignored (missing IATA): ${missingIata}`);
  console.log(`Ignored (type filter): ${filteredRows}`);
  console.log(`Unique airports imported: ${records.length}`);
  console.log(`Batches processed: ${batches.length}`);
  console.log(`Inserted/updated: ${insertedOrUpdated}`);
  console.log(`Reset mode: ${shouldReset ? "enabled (table cleaned before import)" : "disabled"}`);
}

importAirports().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
