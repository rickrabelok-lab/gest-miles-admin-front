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
