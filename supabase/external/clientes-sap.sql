-- ============================================================================
-- Projeto de destino: https://npzlinbglznnnwxxcawh.supabase.co  (grupo-2p)
-- Rode este script no SQL Editor DESSE projeto.
--
-- O script é idempotente e defensivo: só faz o backfill das colunas que
-- realmente existirem em public.clientes (foi isso que causou o erro
-- 42703: column "doc" does not exist na execução anterior).
-- ============================================================================

-- 1) Colunas de escopo em public.clientes (só se a tabela existir)
DO $$
BEGIN
  IF to_regclass('public.clientes') IS NOT NULL THEN
    ALTER TABLE public.clientes
      ADD COLUMN IF NOT EXISTS escopo_org        text,
      ADD COLUMN IF NOT EXISTS equipe_vendas     text,
      ADD COLUMN IF NOT EXISTS escritorio_vendas text;
  END IF;
END
$$;

-- 2) Tabela espelho do SAP
CREATE TABLE IF NOT EXISTS public.clientes_sap (
  cliente_id        uuid PRIMARY KEY,
  doc               text,
  razao_social      text,
  organizacao       text,
  instancia         text,
  numero_sap        text,
  escopo_org        text,
  equipe_vendas     text,
  escritorio_vendas text,
  vendedor_sap      text,
  tabela_preco      text,
  condicao_pgto_sap text,
  status            text,
  mensagem          text,
  payload           jsonb,
  sincronizado_em   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 2b) Garante as colunas mesmo se a tabela já existia com outro formato
ALTER TABLE public.clientes_sap
  ADD COLUMN IF NOT EXISTS doc               text,
  ADD COLUMN IF NOT EXISTS razao_social      text,
  ADD COLUMN IF NOT EXISTS organizacao       text,
  ADD COLUMN IF NOT EXISTS instancia         text,
  ADD COLUMN IF NOT EXISTS numero_sap        text,
  ADD COLUMN IF NOT EXISTS escopo_org        text,
  ADD COLUMN IF NOT EXISTS equipe_vendas     text,
  ADD COLUMN IF NOT EXISTS escritorio_vendas text,
  ADD COLUMN IF NOT EXISTS vendedor_sap      text,
  ADD COLUMN IF NOT EXISTS tabela_preco      text,
  ADD COLUMN IF NOT EXISTS condicao_pgto_sap text,
  ADD COLUMN IF NOT EXISTS status            text,
  ADD COLUMN IF NOT EXISTS mensagem          text,
  ADD COLUMN IF NOT EXISTS payload           jsonb,
  ADD COLUMN IF NOT EXISTS sincronizado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS created_at        timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS clientes_sap_doc_idx    ON public.clientes_sap (doc);
CREATE INDEX IF NOT EXISTS clientes_sap_status_idx ON public.clientes_sap (status);

-- 3) Grants (tabela gerenciada pelo backend; sem acesso direto do app)
GRANT ALL ON public.clientes_sap TO service_role;

-- 4) RLS bloqueando anon/authenticated
ALTER TABLE public.clientes_sap ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'clientes_sap'
      AND policyname = 'clientes_sap_sem_acesso_direto'
  ) THEN
    CREATE POLICY "clientes_sap_sem_acesso_direto"
      ON public.clientes_sap
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END
$$;

-- 5) Backfill dinâmico a partir de public.clientes
DO $$
DECLARE
  cols text[] := ARRAY[
    'doc','razao_social','organizacao','instancia','numero_sap',
    'escopo_org','equipe_vendas','escritorio_vendas',
    'tabela_preco','condicao_pgto_sap','sincronizado_em'
  ];
  c            text;
  insert_cols  text := 'cliente_id';
  select_cols  text := 'c.id';
  update_set   text := '';
  status_expr  text := 'NULL::text';
  msg_expr     text := 'NULL::text';
BEGIN
  IF to_regclass('public.clientes') IS NULL THEN
    RAISE NOTICE 'public.clientes não existe — backfill ignorado.';
    RETURN;
  END IF;

  FOREACH c IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = c
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clientes_sap' AND column_name = c
    ) THEN
      insert_cols := insert_cols || ', ' || quote_ident(c);
      select_cols := select_cols || ', c.' || quote_ident(c);
      update_set  := update_set  || ', ' || quote_ident(c) || ' = EXCLUDED.' || quote_ident(c);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='clientes' AND column_name='sap_status') THEN
    status_expr := 'c.sap_status';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='clientes' AND column_name='sap_erro') THEN
    msg_expr := 'c.sap_erro';
  END IF;

  insert_cols := insert_cols || ', status, mensagem';
  select_cols := select_cols || ', ' || status_expr || ', ' || msg_expr;
  update_set  := update_set  || ', status = EXCLUDED.status, mensagem = EXCLUDED.mensagem';

  EXECUTE format(
    'INSERT INTO public.clientes_sap (%s) SELECT %s FROM public.clientes c
     ON CONFLICT (cliente_id) DO UPDATE SET %s',
    insert_cols, select_cols, ltrim(update_set, ', ')
  );
END
$$;

-- 6) Conferência
SELECT count(*) AS total_clientes_sap FROM public.clientes_sap;
