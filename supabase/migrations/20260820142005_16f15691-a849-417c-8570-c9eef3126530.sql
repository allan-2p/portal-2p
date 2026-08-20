-- clientes_sap é espelho de integração SAP, escrito apenas por service_role.
-- Usuários autenticados não devem ler ou alterar essa tabela diretamente.
create policy "Acesso negado a usuários autenticados"
  on public.clientes_sap
  for all
  to authenticated, anon
  using (false)
  with check (false);