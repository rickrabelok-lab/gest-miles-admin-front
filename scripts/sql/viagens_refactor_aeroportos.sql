-- Refactor da tabela viagens para estrutura normalizada com aeroportos.
-- Pré-requisito: tabela public.aeroportos criada (scripts/sql/aeroportos.sql).

alter table public.viagens
  add column if not exists origem_iata text,
  add column if not exists destino_iata text,
  add column if not exists passageiros integer;

-- Migra dados legados:
-- - destino (texto livre) -> destino_iata
-- - qtd_passageiros -> passageiros
--
-- Observação: origem_iata não existe no modelo legado e deve ser preenchida manualmente
-- para voos já existentes antes de aplicar NOT NULL/FK.
update public.viagens
set
  destino_iata = coalesce(destino_iata, upper(nullif(trim(destino), ''))),
  passageiros = coalesce(passageiros, qtd_passageiros, 1)
where true;

-- Remove colunas antigas (se existirem).
alter table public.viagens
  drop column if exists destino,
  drop column if exists qtd_passageiros;

-- Segurança de dados.
alter table public.viagens
  alter column passageiros set default 1;

update public.viagens
set passageiros = 1
where passageiros is null or passageiros < 1;

alter table public.viagens
  alter column passageiros set not null;

-- Para ativar as constraints abaixo sem erro, garanta que:
-- 1) origem_iata e destino_iata estão preenchidos;
-- 2) ambos existem em public.aeroportos.codigo_iata.
alter table public.viagens
  alter column origem_iata set not null,
  alter column destino_iata set not null;

alter table public.viagens
  drop constraint if exists viagens_origem_iata_fkey,
  add constraint viagens_origem_iata_fkey
    foreign key (origem_iata) references public.aeroportos(codigo_iata),
  drop constraint if exists viagens_destino_iata_fkey,
  add constraint viagens_destino_iata_fkey
    foreign key (destino_iata) references public.aeroportos(codigo_iata);

create index if not exists idx_viagens_origem_iata on public.viagens(origem_iata);
create index if not exists idx_viagens_destino_iata on public.viagens(destino_iata);
