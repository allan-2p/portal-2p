-- Numeração do pedido (NROPED) no banco do Grupo 2P.
-- Rode este script UMA vez no projeto grupo-2p.
--
-- Regra da plataforma antiga: o número do PEDIDO nasce no portal, é monotônico
-- e NUNCA é reutilizado (excluir um pedido não devolve o número). O "Nº SAP"
-- (VBELN) nasce no SAP e é gravado apenas em `propostas.sap_ov_numero`.

do $$
declare
  v_inicio bigint;
begin
  select greatest(coalesce(max((regexp_replace(numero, '\D', '', 'g'))::bigint), 0) + 1, 50000)
    into v_inicio
    from public.propostas
   where numero ~ '^[0-9]+$';

  if not exists (select 1 from pg_class where relkind = 'S' and relname = 'propostas_numero_seq') then
    execute format('create sequence public.propostas_numero_seq start with %s', v_inicio);
  else
    execute format('select setval(''public.propostas_numero_seq'', greatest(%s, last_value)) from public.propostas_numero_seq', v_inicio);
  end if;
end $$;

create or replace function public.proximo_numero_proposta(p_organizacao text default 'carregadores')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  -- p_organizacao existe só para compatibilidade de assinatura: a sequence é
  -- única para o grupo, garantindo NROPED global sem colisão entre unidades.
  loop
    v := lpad(nextval('public.propostas_numero_seq')::text, 6, '0');
    exit when not exists (select 1 from public.propostas where numero = v);
  end loop;
  return v;
end $$;

grant execute on function public.proximo_numero_proposta(text) to service_role;
