alter table public.sap_produtos
  add column if not exists visibilidade_override text null,
  add column if not exists visibilidade_override_por uuid null,
  add column if not exists visibilidade_override_em timestamptz null,
  add column if not exists visibilidade_override_motivo text null;

alter table public.sap_produtos
  drop constraint if exists sap_produtos_visibilidade_override_check;
alter table public.sap_produtos
  add constraint sap_produtos_visibilidade_override_check
  check (visibilidade_override is null or visibilidade_override in ('solar','carregadores','ambos','nenhuma'));