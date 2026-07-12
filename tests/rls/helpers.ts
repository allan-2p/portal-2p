import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const publishable =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const hasCreds = Boolean(url && publishable && serviceRole);

export function makeAdmin(): SupabaseClient {
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function makeAnon(): SupabaseClient {
  return createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

const TAG = `rls-test-${Date.now()}`;

export async function createUser(opts: {
  admin: SupabaseClient;
  label: string;
  role?: "admin" | "gerente" | "diretor" | "vendedor" | "marketing";
  sfUserId?: string | null;
  equipe?: string | null;
}): Promise<TestUser> {
  const email = `${TAG}-${opts.label}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `Pw!${Math.random().toString(36).slice(2)}Aa1`;

  const { data: created, error: createErr } = await opts.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `RLS ${opts.label}` },
  });
  if (createErr || !created.user) throw createErr ?? new Error("createUser failed");
  const id = created.user.id;

  // handle_new_user trigger inserted profile + default 'vendedor' role.
  // Patch to desired role/sf_user_id via service_role.
  if (opts.sfUserId !== undefined || opts.equipe !== undefined) {
    const patch: Record<string, unknown> = {};
    if (opts.sfUserId !== undefined) patch.sf_user_id = opts.sfUserId;
    if (opts.equipe !== undefined) patch.equipe = opts.equipe;
    const { error } = await opts.admin.from("profiles").update(patch).eq("id", id);
    if (error) throw error;
  }
  if (opts.role && opts.role !== "vendedor") {
    // Replace default role with the desired one.
    const del = await opts.admin.from("user_roles").delete().eq("user_id", id);
    if (del.error) throw del.error;
    const ins = await opts.admin
      .from("user_roles")
      .insert({ user_id: id, role: opts.role });
    if (ins.error) throw ins.error;
  }

  const client = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw signInErr;

  return { id, email, password, client };
}

export async function deleteUser(admin: SupabaseClient, id: string) {
  await admin.from("user_roles").delete().eq("user_id", id);
  await admin.from("user_instance_access").delete().eq("user_id", id);
  await admin.from("user_feature_permissions").delete().eq("user_id", id);
  await admin.from("user_view_preferences").delete().eq("user_id", id);
  await admin.from("profiles").delete().eq("id", id);
  await admin.auth.admin.deleteUser(id);
}

/**
 * PostgREST returns rows filtered by RLS with no error. A "denied" read looks
 * like an empty array. A denied write returns a permission error.
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === "42501" ||
    e.code === "PGRST301" ||
    /permission denied|row-level security|violates row-level/i.test(
      e.message ?? "",
    )
  );
}
