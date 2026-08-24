-- ---------------------------------------------------------------------------
-- Consultor responsável pelo cadastro do cliente (usuário do portal).
-- Rode no projeto grupo-2p (SQL Editor).
--
-- O portal grava o par canônico do consultor em `consultor_sap` /
-- `consultor_nome` e, quando o consultor é um usuário do portal, o uuid dele
-- em `consultor_id`. Sem esta coluna o cadastro de cliente falhava com
-- PGRST204 ("Could not find the 'consultor_id' column of 'clientes'").
--
-- O código do portal tolera a ausência da coluna (grava sem ela), mas com a
-- coluna aplicada a carteira por vendedor fica correta também para cadastros
-- transferidos, em que `created_by` continua sendo quem criou o registro.
-- ---------------------------------------------------------------------------

alter table public.clientes
  add column if not exists consultor_id uuid;

create index if not exists clientes_consultor_id_idx
  on public.clientes (consultor_id);

-- Backfill: enquanto não houve transferência, o dono é quem criou o cadastro.
update public.clientes
   set consultor_id = created_by
 where consultor_id is null
   and created_by is not null;
