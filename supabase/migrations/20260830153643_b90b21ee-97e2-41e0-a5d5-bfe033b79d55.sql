-- ---------- Conversas do Atlas ----------
CREATE TABLE public.atlas_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  titulo text NOT NULL DEFAULT 'Nova conversa',
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atlas_threads_user_idx ON public.atlas_threads (user_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atlas_threads TO authenticated;
GRANT ALL ON public.atlas_threads TO service_role;

ALTER TABLE public.atlas_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario gerencia suas conversas do Atlas"
  ON public.atlas_threads FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE TRIGGER atlas_threads_touch
  BEFORE UPDATE ON public.atlas_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- Mensagens do Atlas ----------
CREATE TABLE public.atlas_mensagens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES public.atlas_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  texto text,
  sdk_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atlas_mensagens_thread_idx ON public.atlas_mensagens (thread_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atlas_mensagens TO authenticated;
GRANT ALL ON public.atlas_mensagens TO service_role;

ALTER TABLE public.atlas_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario gerencia mensagens das suas conversas"
  ON public.atlas_mensagens FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------- Alertas do Atlas ----------
CREATE TABLE public.atlas_alertas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia text NOT NULL DEFAULT 'solar',
  cliente_id uuid,
  cliente_doc text,
  cliente_nome text NOT NULL,
  sf_account_id text,
  consultor_id uuid,
  consultor_nome text,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  sinais jsonb NOT NULL DEFAULT '[]'::jsonb,
  metricas jsonb NOT NULL DEFAULT '{}'::jsonb,
  severidade text NOT NULL DEFAULT 'atencao' CHECK (severidade IN ('atencao', 'critico')),
  score numeric NOT NULL DEFAULT 0,
  resumo text,
  recomendacao text,
  situacao text NOT NULL DEFAULT 'aberto' CHECK (situacao IN ('aberto', 'tratado', 'silenciado')),
  silenciado_ate timestamptz,
  tratado_em timestamptz,
  tratado_por uuid,
  chave text NOT NULL,
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX atlas_alertas_chave_uidx ON public.atlas_alertas (chave);
CREATE INDEX atlas_alertas_consultor_idx ON public.atlas_alertas (consultor_id, situacao, created_at DESC);
CREATE INDEX atlas_alertas_cliente_idx ON public.atlas_alertas (cliente_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atlas_alertas TO authenticated;
GRANT ALL ON public.atlas_alertas TO service_role;

ALTER TABLE public.atlas_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor ve alertas da sua carteira"
  ON public.atlas_alertas FOR SELECT TO authenticated
  USING (
    consultor_id = (SELECT auth.uid())
    OR public.can_manage_all_propostas((SELECT auth.uid()))
  );

CREATE POLICY "Consultor atualiza alertas da sua carteira"
  ON public.atlas_alertas FOR UPDATE TO authenticated
  USING (
    consultor_id = (SELECT auth.uid())
    OR public.can_manage_all_propostas((SELECT auth.uid()))
  )
  WITH CHECK (
    consultor_id = (SELECT auth.uid())
    OR public.can_manage_all_propostas((SELECT auth.uid()))
  );

CREATE TRIGGER atlas_alertas_touch
  BEFORE UPDATE ON public.atlas_alertas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- Varreduras ----------
CREATE TABLE public.atlas_alerta_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  origem text NOT NULL DEFAULT 'cron',
  clientes_avaliados integer NOT NULL DEFAULT 0,
  alertas_gerados integer NOT NULL DEFAULT 0,
  emails_enviados integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  erro text,
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atlas_alerta_runs_created_idx ON public.atlas_alerta_runs (created_at DESC);

GRANT SELECT ON public.atlas_alerta_runs TO authenticated;
GRANT ALL ON public.atlas_alerta_runs TO service_role;

ALTER TABLE public.atlas_alerta_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve varreduras do Atlas"
  ON public.atlas_alerta_runs FOR SELECT TO authenticated
  USING (public.is_admin());