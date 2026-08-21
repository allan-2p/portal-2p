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

-- NOTE: o código SAP do vendedor (sap_vendedor_codigo) para pedidos já
-- concluídos deve ser backfilled pelo portal, pois o cadastro de consultores
-- (profiles.numero_sap) vive no banco do portal, não no projeto grupo-2p.

create index if not exists propostas_sap_vendedor_codigo_idx
  on public.propostas (sap_vendedor_codigo);
