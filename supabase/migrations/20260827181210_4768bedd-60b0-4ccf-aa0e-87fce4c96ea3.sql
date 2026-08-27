-- Tabela interna: só a função SECURITY DEFINER public.check_rate_limit escreve
-- nela. RLS ligado sem política já nega tudo; revogar os privilégios deixa a
-- intenção explícita e remove o alerta do linter.
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;