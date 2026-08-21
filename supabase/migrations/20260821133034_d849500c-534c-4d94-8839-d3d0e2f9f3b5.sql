UPDATE public.sap_produtos
SET ativo = true,
    visibilidade = 'solar'
WHERE codigo IN ('200000690', '200000655', '200000585');