-- 1) Notificações: índice parcial quebrava o ON CONFLICT (user_id, chave).
DROP INDEX IF EXISTS public.notificacoes_chave_uidx;
CREATE UNIQUE INDEX notificacoes_chave_uidx ON public.notificacoes (user_id, chave);

-- 2) Reserva de estoque atômica (UPDATE x = x + n), evita perda por corrida.
CREATE OR REPLACE FUNCTION public.reservar_estoque_pendente(p_itens jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alterados integer := 0;
  v_count integer;
  r record;
BEGIN
  FOR r IN
    SELECT (e->>'material') AS material, COALESCE((e->>'qtd')::numeric, 0) AS qtd
    FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) e
  LOOP
    IF r.material IS NULL OR r.qtd <= 0 THEN CONTINUE; END IF;
    UPDATE public.estoque
       SET qtd_pend_faturar = COALESCE(qtd_pend_faturar, 0) + r.qtd
     WHERE material = r.material;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_alterados := v_alterados + v_count;
  END LOOP;
  RETURN v_alterados;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_estoque_pendente(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_pendente(jsonb) TO service_role;

-- 3) Cron das notas fiscais do SAP (faltava agendar).
SELECT cron.unschedule('portal-sap-nfs') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'portal-sap-nfs');
SELECT cron.schedule('portal-sap-nfs', '*/20 * * * *', $cron$select public.portal_cron_post('/api/public/hooks/sap-nfs', '{}'::jsonb)$cron$);