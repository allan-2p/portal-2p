-- clientes: escopo por instância + admin
drop policy if exists "Usuários autenticados podem ler clientes" on public.clientes;
drop policy if exists "Usuários autenticados podem inserir clientes" on public.clientes;
drop policy if exists "Usuários autenticados podem atualizar clientes" on public.clientes;

create policy "clientes_select_scoped" on public.clientes
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.user_instance_access uia
      where uia.user_id = auth.uid() and uia.instance_id = clientes.instancia
    )
  );

create policy "clientes_insert_scoped" on public.clientes
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      exists (
        select 1 from public.user_instance_access uia
        where uia.user_id = auth.uid() and uia.instance_id = clientes.instancia
      )
      and (created_by is null or created_by = auth.uid())
    )
  );

create policy "clientes_update_scoped" on public.clientes
  for update to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.user_instance_access uia
      where uia.user_id = auth.uid() and uia.instance_id = clientes.instancia
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_instance_access uia
      where uia.user_id = auth.uid() and uia.instance_id = clientes.instancia
    )
  );

-- contatos: herda a visibilidade do cliente vinculado
drop policy if exists "Autenticados leem contatos" on public.contatos;
drop policy if exists "Autenticados criam contatos" on public.contatos;
drop policy if exists "Autenticados atualizam contatos" on public.contatos;

create policy "contatos_select_scoped" on public.contatos
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.user_instance_access uia
      where uia.user_id = auth.uid() and uia.instance_id = contatos.instancia
    )
  );

create policy "contatos_insert_scoped" on public.contatos
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_instance_access uia
      where uia.user_id = auth.uid() and uia.instance_id = contatos.instancia
    )
  );

create policy "contatos_update_scoped" on public.contatos
  for update to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.user_instance_access uia
      where uia.user_id = auth.uid() and uia.instance_id = contatos.instancia
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_instance_access uia
      where uia.user_id = auth.uid() and uia.instance_id = contatos.instancia
    )
  );
