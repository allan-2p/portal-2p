-- Move has_role out of the API-exposed public schema to prevent
-- signed-in users from calling it via PostgREST RPC, while keeping
-- it callable from RLS policies.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, anon, service_role;

ALTER FUNCTION public.has_role(uuid, app_role) SET SCHEMA private;

-- Ensure execute permissions remain for policy evaluation
REVOKE ALL ON FUNCTION private.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO authenticated, anon, service_role;