
DROP POLICY IF EXISTS "Profiles: usuário atualiza o próprio" ON public.profiles;
CREATE POLICY "Profiles: usuário atualiza o próprio"
ON public.profiles FOR UPDATE TO authenticated
USING ((select auth.uid()) = id)
WITH CHECK ((select auth.uid()) = id);

CREATE OR REPLACE FUNCTION public.profiles_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Contextos sem usuário (service_role, jobs, funções definer) e admins podem tudo
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.is_external IS DISTINCT FROM OLD.is_external
     OR NEW.is_consultor IS DISTINCT FROM OLD.is_consultor
     OR NEW.organizacao IS DISTINCT FROM OLD.organizacao
     OR NEW.numero_sap IS DISTINCT FROM OLD.numero_sap
     OR NEW.sf_user_id IS DISTINCT FROM OLD.sf_user_id
     OR NEW.cargo_tipo IS DISTINCT FROM OLD.cargo_tipo
     OR NEW.filter_scope IS DISTINCT FROM OLD.filter_scope
     OR NEW.regime_contratacao IS DISTINCT FROM OLD.regime_contratacao
     OR NEW.equipe IS DISTINCT FROM OLD.equipe
     OR NEW.meta_mensal IS DISTINCT FROM OLD.meta_mensal
     OR NEW.ativo IS DISTINCT FROM OLD.ativo
     OR NEW.email IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION 'Alteração não permitida: campos administrativos do perfil só podem ser alterados por um administrador.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_block_sensitive_self_update ON public.profiles;
CREATE TRIGGER trg_profiles_block_sensitive_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_block_sensitive_self_update();
