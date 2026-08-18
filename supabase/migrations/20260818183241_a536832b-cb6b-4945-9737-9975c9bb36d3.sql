create or replace function public.carregadores_padrinhos_lock_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by and not public.is_admin() then
    raise exception 'Apenas administradores podem transferir o padrinho.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_carregadores_padrinhos_lock_owner on public.carregadores_padrinhos;
create trigger trg_carregadores_padrinhos_lock_owner
before update on public.carregadores_padrinhos
for each row execute function public.carregadores_padrinhos_lock_owner();