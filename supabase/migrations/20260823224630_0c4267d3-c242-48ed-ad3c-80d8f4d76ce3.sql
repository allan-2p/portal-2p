CREATE OR REPLACE VIEW public.__mig_auth_users AS SELECT * FROM auth.users;
CREATE OR REPLACE VIEW public.__mig_auth_identities AS SELECT * FROM auth.identities;
REVOKE ALL ON public.__mig_auth_users FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.__mig_auth_identities FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.__mig_auth_users TO sandbox_exec;
GRANT SELECT ON public.__mig_auth_identities TO sandbox_exec;