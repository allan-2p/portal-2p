INSERT INTO public.sap_produtos (codigo, descricao, tipo, permissao, ativo, visibilidade, origem, custo, preco_sugerido, ncm_codigo)
SELECT p.codigo, p.descricao, COALESCE(NULLIF(p.tipo,''), 'outros'), 'Todos', true, 'solar', 'sap', 0, 0, p.ncm
FROM public.produtos p
WHERE p.codigo IN ('200000384','200000383','200000586','200000507','200000650','200000653','200000651','200000656')
  AND NOT EXISTS (SELECT 1 FROM public.sap_produtos s WHERE s.codigo = p.codigo);

UPDATE public.solar_calc_config SET
  cod_juncao = '200000650',
  cod_grampo_intermediario = '200000653',
  cod_grampo_final = '200000651',
  cod_terminal_aterramento = '200000656',
  updated_at = now();

UPDATE public.solar_trilhos SET
  cod_4800 = '200000384',
  cod_2400 = '200000383',
  cod_2700 = '200000586',
  cod_3600 = '200000507',
  updated_at = now()
WHERE legado_id = 1;