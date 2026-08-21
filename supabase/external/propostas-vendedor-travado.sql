-- ---------------------------------------------------------------------------
-- Vendedor travado no pedido concluído.
-- Rode no projeto grupo-2p (https://npzlinbglznnnwxxcawh.supabase.co) (SQL Editor).
--
-- Enquanto o pedido está aberto (status "Salvo"), o vendedor da ordem de venda
-- é sempre o dono atual da proposta — se a conta for transferida, a proposta em
-- aberto vai junto. No momento em que o pedido é concluído e a ordem é criada no
-- SAP, o código do vendedor é gravado abaixo e nunca mais muda.
-- ---------------------------------------------------------------------------

alter table public.propostas
  add column if not exists sap_vendedor_codigo text,   -- VENDEDOR enviado ao SAP
  add column if not exists sap_vendedor_nome text;     -- nome do vendedor no momento da conclusão

-- Pedidos que já foram para o SAP ficam travados no vendedor atual do registro.
update public.propostas p
   set sap_vendedor_nome = coalesce(p.sap_vendedor_nome, p.consultor_nome)
 where p.sap_ov_numero is not null;

-- Backfill do código SAP do vendedor para pedidos já concluídos.
-- O código vem do cadastro do consultor vinculado à proposta.
update public.propostas p
   set sap_vendedor_codigo = (
         select pr.numero_sap
           from public.profiles pr
          where pr.id = p.consultor_id
          limit 1
       )
 where p.sap_ov_numero is not null
   and p.sap_vendedor_codigo is null
   and p.consultor_id is not null;

create index if not exists propostas_sap_vendedor_codigo_idx
  on public.propostas (sap_vendedor_codigo);
