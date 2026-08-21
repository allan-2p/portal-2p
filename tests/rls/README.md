# RLS Regression Tests

Automated Row-Level Security tests for the Portal 2P database. Every table
with RLS gets checked from the perspective of `anon`, `vendedor`, `gerente`,
`diretor` and `admin` — through the real PostgREST / Data API path, so both
policies **and** GRANTs are validated on every run.

## What it covers

| Table | Checks |
| --- | --- |
| `profiles` | Anon blocked · vendedor sees only own · gerente/diretor/admin see all · self-update ok, others blocked · non-admin delete blocked |
| `user_roles` | User sees only own · **cannot self-promote to admin** · cannot update/delete own row · admin sees all |
| `user_extra_features`, `user_instance_access` | User reads own only · cannot write another user's access |
| `salesperson_goals`, `salesperson_new_ab_goals`, `salesperson_retention_goals` | Vendedor sees own `sf_user_id` only · privileged roles see all · non-admin cannot insert/update/delete · anon blocked |
| `hidden_salespeople` | Vendedor blocked · privileged roles read · only admin writes |
| `salesforce_team_members` | Authenticated reads · anon blocked · only admin writes |
| `user_view_preferences` | User writes only own rows |
| `view_variants` | Authenticated reads · anon blocked · only admin writes |
| `user_invites` | Non-admin cannot read or insert |
| `instances` | Authenticated reads · only admin writes |

## Running locally

Set these env vars (or put them in `.env.local`):

```
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Then:

```
bun run test:rls
```

Without the three vars, the whole suite is `describe.skip`ped so `bun run test`
never fails on machines that don't have the service-role key.

## What each run does

1. Creates 5 disposable users (`admin`, `gerente`, `diretor`, two vendedores
   with unique `sf_user_id`s) through the Auth Admin API.
2. Seeds one row per goals table for each vendedor, plus rows in
   `hidden_salespeople`, `salesforce_team_members` and `view_variants`.
3. Runs the assertions above.
4. Cleans up all seeded rows and users in `afterAll`.

Everything is namespaced with a timestamp, so partial cleanup on failure
never collides with real data or with a subsequent run.
