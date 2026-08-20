-- Script para criar a tabela espelho clientes_sap e sincronizar dados do SAP
-- Execute este SQL no banco de dados do projeto grupo-2p (onde residem os clientes).

-- 1) Adiciona colunas de escopo na tabela clientes, se ainda não existirem
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS escopo_org text,
  ADD COLUMN IF NOT EXISTS equipe_vendas text,
  ADD COLUMN IF NOT EXISTS escritorio_vendas text;

-- 2) Cria tabela espelho clientes_sap
CREATE TABLE IF NOT EXISTS public.clientes_sap (
    cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    doc text NOT NULL,
    razao_social text,
    organizacao text NOT NULL,
    instancia text NOT NULL,
    numero_sap text,
    escopo_org text,
    equipe_vendas text,
    escritorio_vendas text,
    vendedor_sap text,
    tabela_preco text,
    condicao_pgto_sap text,
    status text,
    mensagem text,
    payload jsonb,
    sincronizado_em timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (cliente_id)
);

-- 3) Garante acesso ao Data API (service_role gerencia a tabela; anon/authenticated não acessam diretamente)
GRANT ALL ON public.clientes_sap TO service_role;

-- 4) Ativa RLS e bloqueia acesso direto de anon/authenticated
ALTER TABLE public.clientes_sap ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'clientes_sap' AND policyname = 'Bloqueia acesso direto de anon e authenticated'
    ) THEN
        CREATE POLICY "Bloqueia acesso direto de anon e authenticated"
        ON public.clientes_sap
        FOR ALL
        TO anon, authenticated
        USING (false)
        WITH CHECK (false);
    END IF;
END
$$;

-- 5) Backfill: preenche clientes_sap a partir de clientes já existentes
INSERT INTO public.clientes_sap (
    cliente_id,
    doc,
    razao_social,
    organizacao,
    instancia,
    numero_sap,
    escopo_org,
    equipe_vendas,
    escritorio_vendas,
    vendedor_sap,
    tabela_preco,
    condicao_pgto_sap,
    status,
    mensagem,
    payload,
    sincronizado_em,
    created_at
)
SELECT
    c.id,
    c.doc,
    c.razao_social,
    c.organizacao,
    c.instancia,
    c.numero_sap,
    c.escopo_org,
    c.equipe_vendas,
    c.escritorio_vendas,
    NULL,
    c.tabela_preco,
    c.condicao_pgto_sap,
    c.sap_status,
    c.sap_erro,
    NULL,
    c.sincronizado_em,
    COALESCE(c.created_at, now())
FROM public.clientes c
WHERE c.organizacao IN ('2P Solar', '2P Carregadores', 'Grupo 2P')
  AND NOT EXISTS (
      SELECT 1 FROM public.clientes_sap cs WHERE cs.cliente_id = c.id
  )
ON CONFLICT (cliente_id) DO UPDATE SET
    doc = EXCLUDED.doc,
    razao_social = EXCLUDED.razao_social,
    organizacao = EXCLUDED.organizacao,
    instancia = EXCLUDED.instancia,
    numero_sap = EXCLUDED.numero_sap,
    escopo_org = EXCLUDED.escopo_org,
    equipe_vendas = EXCLUDED.equipe_vendas,
    escritorio_vendas = EXCLUDED.escritorio_vendas,
    tabela_preco = EXCLUDED.tabela_preco,
    condicao_pgto_sap = EXCLUDED.condicao_pgto_sap,
    status = EXCLUDED.status,
    mensagem = EXCLUDED.mensagem,
    sincronizado_em = EXCLUDED.sincronizado_em;
