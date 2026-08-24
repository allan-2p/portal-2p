-- 1) Normaliza rótulos -> códigos
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','clientes_sap','contatos','propostas','profiles','consultores_sap','user_invites'] LOOP
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
  FOREACH t IN ARRAY ARRAY['clientes','clientes_sap','contatos','client_notes','credito_analises'] LOOP
    EXECUTE format($f$
      UPDATE public.%I SET instancia = CASE
        WHEN instancia IN ('2P Solar','Acessórios 2P','Solar') THEN 'solar'
        WHEN instancia IN ('2P Carregadores','Carregadores') THEN 'carregadores'
        ELSE instancia END
      WHERE instancia IS NOT NULL
    $f$, t);
  END LOOP;
END $$;

-- 2) Defaults padronizados
ALTER TABLE public.contatos ALTER COLUMN organizacao SET DEFAULT 'solar';

-- 3) Travas
ALTER TABLE public.clientes        ADD CONSTRAINT clientes_organizacao_check        CHECK (organizacao IN ('solar','carregadores','grupo','station'));
ALTER TABLE public.clientes_sap    ADD CONSTRAINT clientes_sap_organizacao_check    CHECK (organizacao IS NULL OR organizacao IN ('solar','carregadores','grupo','station'));
ALTER TABLE public.contatos        ADD CONSTRAINT contatos_organizacao_check        CHECK (organizacao IN ('solar','carregadores','grupo','station'));
ALTER TABLE public.propostas       ADD CONSTRAINT propostas_organizacao_check       CHECK (organizacao IN ('solar','carregadores','grupo','station'));
ALTER TABLE public.profiles        ADD CONSTRAINT profiles_organizacao_check        CHECK (organizacao IN ('solar','carregadores','grupo','station'));
ALTER TABLE public.consultores_sap ADD CONSTRAINT consultores_sap_organizacao_check CHECK (organizacao IN ('solar','carregadores','grupo','station'));
ALTER TABLE public.user_invites    ADD CONSTRAINT user_invites_organizacao_check    CHECK (organizacao IN ('solar','carregadores','grupo','station'));

ALTER TABLE public.clientes         ADD CONSTRAINT clientes_instancia_check         CHECK (instancia IN ('solar','carregadores'));
ALTER TABLE public.clientes_sap     ADD CONSTRAINT clientes_sap_instancia_check     CHECK (instancia IS NULL OR instancia IN ('solar','carregadores'));
ALTER TABLE public.contatos         ADD CONSTRAINT contatos_instancia_check         CHECK (instancia IN ('solar','carregadores'));
ALTER TABLE public.client_notes     ADD CONSTRAINT client_notes_instancia_check     CHECK (instancia IN ('solar','carregadores'));