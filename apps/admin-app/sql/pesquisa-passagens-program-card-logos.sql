-- Logos globais dos programas de fidelidade (cartões «Meus programas» no Gestor Miles).
-- O admin_master define imagens no painel Admin → Marca e imagens; a app lê de `program_card_logos` (chave = program_id, ex. livelo, latam-pass).
-- Aplicar no Supabase (SQL Editor) se a coluna ainda não existir.

alter table if exists public.pesquisa_passagens_config
  add column if not exists program_card_logos jsonb not null default '{}'::jsonb;

comment on column public.pesquisa_passagens_config.program_card_logos is
  'Mapa program_id -> URL pública da imagem do círculo do cartão (Meus programas). Gestor: chave local ou remoto têm prioridade.';
