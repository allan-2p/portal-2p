CREATE OR REPLACE FUNCTION pg_temp.wrap_rls(t text) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE s text := t;
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  s := replace(s, 'public.is_admin()', 'is_admin()');
  s := replace(s, 'auth.uid()', '(select auth.uid())');
  s := replace(s, 'is_admin()', '(select is_admin())');
  -- desfaz aninhamentos criados pela substituição
  s := replace(s, '(select (select auth.uid()))', '(select auth.uid())');
  s := replace(s, '(select (select is_admin()))', '(select is_admin())');
  s := replace(s, 'SELECT (select auth.uid()) AS uid', 'SELECT auth.uid() AS uid');
  s := replace(s, 'SELECT (select is_admin())', 'SELECT is_admin()');
  RETURN s;
END;
$fn$;

DO $$
DECLARE
  r record;
  q text;
  wc text;
  role_list text;
  parts text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') ~ 'auth\.uid\(\)|is_admin\(\)'
        OR coalesce(with_check, '') ~ 'auth\.uid\(\)|is_admin\(\)'
      )
  LOOP
    q := pg_temp.wrap_rls(r.qual);
    wc := pg_temp.wrap_rls(r.with_check);
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;

    parts := '';
    IF q IS NOT NULL THEN parts := parts || ' USING (' || q || ')'; END IF;
    IF wc IS NOT NULL THEN parts := parts || ' WITH CHECK (' || wc || ')'; END IF;

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s',
      r.policyname,
      r.schemaname,
      r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd,
      coalesce(role_list, 'public'),
      parts
    );
  END LOOP;
END;
$$;