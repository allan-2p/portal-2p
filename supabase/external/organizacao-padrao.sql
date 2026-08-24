-- ============================================================================
-- Padronização do campo `organizacao` — BANCO DO GRUPO 2P (projeto externo)
-- ============================================================================
-- O backfill dos dados já foi executado pelo portal via API (rótulos
-- "2P Solar"/"2P Carregadores"/"Acessórios 2P"/"Grupo 2P" -> códigos).
-- Este script só instala a TRAVA (default + CHECK), que exige acesso SQL ao
-- projeto grupo-2p — rode-o no SQL Editor desse projeto.
--
-- Valor canônico: 'solar' | 'carregadores' | 'grupo' | 'station'
-- (mesmo slug de `instancia` e do InstanceId do portal; rótulo bonito é só UI)
-- ============================================================================

-- 1) Rede de segurança: reaplica o backfill (idempotente)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','clientes_sap','contatos','leads','propostas','profiles','user_invites'] LOOP
    EXECUTE format($f$
      UPDATE public.%I SET organizacao = CASE
        WHEN organizacao IN ('2P Solar','Acessórios 2P','Solar') THEN 'solar'
        WHEN organizacao IN ('2P Carregadores','Carregadores') THEN 'carregadores'
        WHEN organizacao IN ('Grupo 2P','Grupo') THEN 'grupo'
        WHEN organizacao IN ('2P Station','Station') THEN 'station'
        ELSE organizacao END
      WHERE organizacao IS NOT NULL
    $f$, t);
  END LOOP;
END $$;

-- 2) Defaults padronizados
ALTER TABLE public.contatos  ALTER COLUMN organizacao SET DEFAULT 'solar';

-- 3) Travas (aceita NULL onde a coluna é opcional)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','clientes_sap','contatos','leads','propostas','profiles','user_invites'] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_organizacao_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (organizacao IS NULL OR organizacao IN (''solar'',''carregadores'',''grupo'',''station''))',
      t, t || '_organizacao_check');
  END LOOP;

  FOREACH t IN ARRAY ARRAY['clientes','clientes_sap','contatos','client_notes'] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_instancia_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (instancia IS NULL OR instancia IN (''solar'',''carregadores''))',
      t, t || '_instancia_check');
  END LOOP;
END $$;

-- 4) Conferência
SELECT 'clientes' t, organizacao, count(*) FROM public.clientes GROUP BY 1,2
UNION ALL SELECT 'contatos', organizacao, count(*) FROM public.contatos GROUP BY 1,2
UNION ALL SELECT 'leads', organizacao, count(*) FROM public.leads GROUP BY 1,2
UNION ALL SELECT 'propostas', organizacao, count(*) FROM public.propostas GROUP BY 1,2
ORDER BY 1,2;
