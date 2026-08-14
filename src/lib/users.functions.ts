import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoleEnum = z.enum(["admin", "gerente", "vendedor", "diretor", "marketing"]);
const RegimeEnum = z.enum(["CLT", "PJ"]);
const OrgEnum = z.enum(["solar", "station", "carregadores", "grupo"]);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  if (error || !data) throw new Error("Forbidden: admin role required");
}

const CreateInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  cargo: z.string().optional().nullable(),
  equipe: z.string().optional().nullable(),
  regime_contratacao: RegimeEnum.optional().default("CLT"),
  organizacao: OrgEnum.optional().default("solar"),
  role: RoleEnum,
});


export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pre-insert invite so trigger applies role/equipe/cargo/full_name on profile creation
    await supabaseAdmin.from("user_invites").upsert(
      {
        email: data.email,
        role: data.role,
        full_name: data.full_name,
        cargo: data.cargo ?? null,
        equipe: data.equipe ?? null,
        regime_contratacao: data.regime_contratacao ?? "CLT",
        organizacao: data.organizacao ?? "solar",
        invited_by: context.userId,

      },
      { onConflict: "email" },
    );

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    return { id: created.user?.id };
  });

const InviteInput = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  cargo: z.string().optional().nullable(),
  equipe: z.string().optional().nullable(),
  regime_contratacao: RegimeEnum.optional().default("CLT"),
  organizacao: OrgEnum.optional().default("solar"),
  role: RoleEnum,

  is_external: z.boolean().optional().default(false),
  sf_user_id: z.string().optional().nullable(),
  avatar_url: z.string().optional().nullable(),
});

export const adminInviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InviteInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("user_invites").upsert(
      {
        email: data.email,
        role: data.role,
        full_name: data.full_name,
        cargo: data.cargo ?? null,
        equipe: data.equipe ?? null,
        regime_contratacao: data.regime_contratacao ?? "CLT",
        organizacao: data.organizacao ?? "solar",
        invited_by: context.userId,

        is_external: data.is_external ?? false,
        sf_user_id: data.sf_user_id ?? null,
        avatar_url: data.avatar_url ?? null,
      },
      { onConflict: "email" },
    );

    const origin = process.env.SITE_URL ?? "";
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.full_name },
      redirectTo: origin ? `${origin}/reset-password` : undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const RoleInput = z.object({
  user_id: z.string().uuid(),
  role: RoleEnum,
});

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ToggleInput = z.object({ user_id: z.string().uuid(), ativo: z.boolean() });

export const adminToggleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ToggleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ ativo: data.ativo }).eq("id", data.user_id);
    if (!data.ativo) {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "876000h" });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "none" });
    }
    return { ok: true };
  });

const DeleteInput = z.object({ user_id: z.string().uuid() });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) throw new Error("Não é possível remover a si mesmo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateInput = z.object({
  user_id: z.string().uuid(),
  email: z.string().email().optional(),
  full_name: z.string().min(1).optional(),
  cargo: z.string().optional().nullable(),
  equipe: z.string().optional().nullable(),
  regime_contratacao: RegimeEnum.optional(),
  organizacao: OrgEnum.optional(),
  is_external: z.boolean().optional(),
  telefone: z.string().optional().nullable(),
  meta_mensal: z.number().nullable().optional(),
  cargo_tipo: z.string().optional().nullable(),
  filter_scope: z.enum(["geral", "pre_vendas", "carteira", "individual"]).optional(),
  sf_user_id: z.string().trim().max(32).nullable().optional(),
  ativo: z.boolean().optional(),
  role: RoleEnum.optional(),
});

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const profilePatch: {
      email?: string;
      full_name?: string;
      cargo?: string | null;
      equipe?: string | null;
      regime_contratacao?: string;
      organizacao?: string;
      is_external?: boolean;
      telefone?: string | null;
      meta_mensal?: number | null;
      cargo_tipo?: string | null;
      filter_scope?: "geral" | "pre_vendas" | "carteira" | "individual";
      ativo?: boolean;
      sf_user_id?: string | null;
    } = {};
    if (data.email !== undefined) profilePatch.email = data.email;
    if (data.full_name !== undefined) profilePatch.full_name = data.full_name;
    if (data.cargo !== undefined) profilePatch.cargo = data.cargo;
    if (data.equipe !== undefined) profilePatch.equipe = data.equipe;
    if (data.regime_contratacao !== undefined) profilePatch.regime_contratacao = data.regime_contratacao;
    if (data.organizacao !== undefined) profilePatch.organizacao = data.organizacao;
    if (data.is_external !== undefined) profilePatch.is_external = data.is_external;
    if (data.telefone !== undefined) profilePatch.telefone = data.telefone;
    if (data.meta_mensal !== undefined) profilePatch.meta_mensal = data.meta_mensal;
    if (data.cargo_tipo !== undefined) profilePatch.cargo_tipo = data.cargo_tipo;
    if (data.filter_scope !== undefined) profilePatch.filter_scope = data.filter_scope;
    if (data.ativo !== undefined) profilePatch.ativo = data.ativo;
    if (data.sf_user_id !== undefined) {
      const v = (data.sf_user_id ?? "").trim();
      if (v && !/^[a-zA-Z0-9]{15,18}$/.test(v)) {
        throw new Error("ID do Salesforce inválido (15 ou 18 caracteres).");
      }
      if (v) {
        const { data: dup } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .eq("sf_user_id", v)
          .neq("id", data.user_id)
          .maybeSingle();
        if (dup) throw new Error(`Este ID já está vinculado a ${dup.email}.`);
      }
      profilePatch.sf_user_id = v || null;
    }

    if (Object.keys(profilePatch).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profilePatch)
        .eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }

    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role });
      if (error) throw new Error(error.message);
    }

    if (data.ativo !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        ban_duration: data.ativo ? "none" : "876000h",
      });
    }

    if (data.email || data.full_name) {
      const authPatch: { email?: string; user_metadata?: { full_name: string } } = {};
      if (data.email) authPatch.email = data.email;
      if (data.full_name) authPatch.user_metadata = { full_name: data.full_name };
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        data.user_id,
        authPatch,
      );
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const bootstrapFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) return { promoted: false };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { promoted: true };
  });

// ================= Salesforce sync ================= //

const SF_GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

async function sfFetchAllUsers(): Promise<
  Array<{ id: string; name: string; email: string | null; title: string | null; smallPhotoUrl: string | null; fullPhotoUrl: string | null }>
> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sfKey = process.env.SALESFORCE_API_KEY;
  if (!lovableKey || !sfKey) throw new Error("Salesforce connector não está configurado.");
  const soql =
    `SELECT Id, Name, Email, Title, SmallPhotoUrl, FullPhotoUrl FROM User ` +
    `WHERE IsActive = true AND Email LIKE '%@2pgroup.com.br' ` +
    `ORDER BY Name ASC LIMIT 500`;
  const res = await fetch(`${SF_GATEWAY_URL}/query?q=${encodeURIComponent(soql)}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sfKey,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Salesforce ${res.status}: ${JSON.stringify(body)}`);
  return (body?.records ?? []).map((r: any) => ({
    id: r.Id as string,
    name: r.Name as string,
    email: (r.Email ?? null) as string | null,
    title: (r.Title ?? null) as string | null,
    smallPhotoUrl: (r.SmallPhotoUrl ?? null) as string | null,
    fullPhotoUrl: (r.FullPhotoUrl ?? null) as string | null,
  }));
}

async function downloadSFPhotoToStorage(
  sfUserId: string,
  photoUrl: string | null,
): Promise<string | null> {
  if (!photoUrl) return null;
  try {
    const lovableKey = process.env.LOVABLE_API_KEY!;
    const sfKey = process.env.SALESFORCE_API_KEY!;
    let pathAfterHost: string;
    try {
      pathAfterHost = new URL(photoUrl).pathname;
    } catch {
      return null;
    }
    const gwUrl = `${SF_GATEWAY_URL}${pathAfterHost}`;
    const res = await fetch(gwUrl, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sfKey,
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0) return null;
    const ext = contentType.includes("png") ? "png" : "jpg";
    const storagePath = `sf/${sfUserId}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("avatars")
      .upload(storagePath, buf, { upsert: true, contentType });
    if (error) return null;
    return storagePath;
  } catch {
    return null;
  }
}

export type SFCandidate = {
  sf_user_id: string;
  name: string;
  email: string | null;
  title: string | null;
  status: "active" | "invited" | "pending";
  portal_user_id: string | null;
};

export const listSalesforceCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [people, profilesRes, invitesRes] = await Promise.all([
      sfFetchAllUsers(),
      context.supabase.from("profiles").select("id, email, sf_user_id"),
      context.supabase
        .from("user_invites")
        .select("email, sf_user_id, accepted_at")
        .is("accepted_at", null),
    ]);
    const profiles = (profilesRes.data ?? []) as Array<{ id: string; email: string; sf_user_id: string | null }>;
    const invites = (invitesRes.data ?? []) as Array<{ email: string; sf_user_id: string | null }>;

    const profileByEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));
    const profileBySf = new Map(profiles.filter((p) => p.sf_user_id).map((p) => [p.sf_user_id!, p]));
    const inviteEmails = new Set(invites.map((i) => i.email.toLowerCase()));
    const inviteSf = new Set(invites.map((i) => i.sf_user_id).filter(Boolean) as string[]);

    const records: SFCandidate[] = people.map((p) => {
      const email = (p.email ?? "").toLowerCase();
      const existing = profileBySf.get(p.id) ?? (email ? profileByEmail.get(email) : undefined);
      if (existing) {
        return {
          sf_user_id: p.id,
          name: p.name,
          email: p.email,
          title: p.title,
          status: "active",
          portal_user_id: existing.id,
        };
      }
      if (inviteSf.has(p.id) || (email && inviteEmails.has(email))) {
        return {
          sf_user_id: p.id,
          name: p.name,
          email: p.email,
          title: p.title,
          status: "invited",
          portal_user_id: null,
        };
      }
      return {
        sf_user_id: p.id,
        name: p.name,
        email: p.email,
        title: p.title,
        status: "pending",
        portal_user_id: null,
      };
    });
    return { records };
  });

const InviteSFInput = z.object({
  sf_user_id: z.string().min(3),
  role: RoleEnum,
  cargo: z.string().optional().nullable(),
  equipe: z.string().optional().nullable(),
});

export const inviteSalesforceUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InviteSFInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const users = await sfFetchAllUsers();
    const sfUser = users.find((u) => u.id === data.sf_user_id);
    if (!sfUser) throw new Error("Usuário do Salesforce não encontrado.");
    if (!sfUser.email) throw new Error("Este usuário do Salesforce não possui e-mail.");

    const photoPath = await downloadSFPhotoToStorage(
      sfUser.id,
      sfUser.smallPhotoUrl ?? sfUser.fullPhotoUrl,
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_invites").upsert(
      {
        email: sfUser.email,
        role: data.role,
        full_name: sfUser.name,
        cargo: data.cargo ?? sfUser.title ?? null,
        equipe: data.equipe ?? null,
        invited_by: context.userId,
        sf_user_id: sfUser.id,
        is_external: false,
        avatar_url: photoPath,
      },
      { onConflict: "email" },
    );

    const origin = process.env.SITE_URL ?? "";
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(sfUser.email, {
      data: { full_name: sfUser.name },
      redirectTo: origin ? `${origin}/reset-password` : undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true, photo_synced: !!photoPath };
  });

const SyncPhotoInput = z.object({ user_id: z.string().uuid() });

export const syncSalesforcePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SyncPhotoInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("sf_user_id")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!profile?.sf_user_id) {
      return { ok: false as const, reason: "Usuário não está vinculado ao Salesforce." };
    }
    const users = await sfFetchAllUsers();
    const sfUser = users.find((u) => u.id === profile.sf_user_id);
    if (!sfUser) {
      return { ok: false as const, reason: "Usuário do Salesforce não encontrado." };
    }
    const path = await downloadSFPhotoToStorage(
      sfUser.id,
      sfUser.smallPhotoUrl ?? sfUser.fullPhotoUrl,
    );
    if (!path) {
      return { ok: false as const, reason: "Este usuário não tem foto no Salesforce." };
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", data.user_id);
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const, path };
  });

export const syncAllSalesforcePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, sf_user_id")
      .not("sf_user_id", "is", null);
    if (pErr) throw new Error(pErr.message);
    const linked = (profiles ?? []).filter((p) => !!p.sf_user_id) as Array<{ id: string; sf_user_id: string }>;

    const sfUsers = await sfFetchAllUsers();
    const bySf = new Map(sfUsers.map((u) => [u.id, u]));

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    for (const p of linked) {
      const sf = bySf.get(p.sf_user_id);
      const url = sf?.smallPhotoUrl ?? sf?.fullPhotoUrl ?? null;
      if (!sf || !url) { skipped++; continue; }
      try {
        const path = await downloadSFPhotoToStorage(sf.id, url);
        if (!path) { skipped++; continue; }
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ avatar_url: path })
          .eq("id", p.id);
        if (error) { failed++; continue; }
        updated++;
      } catch {
        failed++;
      }
    }
    return { ok: true as const, total: linked.length, updated, skipped, failed };
  });



// ---------------------------------------------------------------------------
// Vínculos Salesforce: painel admin para vincular/corrigir sf_user_id
// ---------------------------------------------------------------------------

export type SfLinkRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  cargo: string | null;
  organizacao: string;
  ativo: boolean;
  sf_user_id: string | null;
  sf_name: string | null;
  sf_email: string | null;
  status: "ok" | "missing" | "invalid" | "duplicate" | "mismatch";
};

export const adminListSfLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [profilesRes, sfUsers] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, email, full_name, cargo, organizacao, ativo, sf_user_id")
        .order("full_name", { ascending: true }),
      sfFetchAllUsers(),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    const profiles = (profilesRes.data ?? []) as Array<{
      id: string;
      email: string;
      full_name: string | null;
      cargo: string | null;
      organizacao: string;
      ativo: boolean;
      sf_user_id: string | null;
    }>;

    const bySf = new Map(sfUsers.map((u) => [u.id, u]));
    const counts = new Map<string, number>();
    for (const p of profiles) {
      if (p.sf_user_id) counts.set(p.sf_user_id, (counts.get(p.sf_user_id) ?? 0) + 1);
    }

    const rows: SfLinkRow[] = profiles.map((p) => {
      const sf = p.sf_user_id ? bySf.get(p.sf_user_id) : undefined;
      let status: SfLinkRow["status"] = "ok";
      if (!p.sf_user_id) status = "missing";
      else if (!sf) status = "invalid";
      else if ((counts.get(p.sf_user_id) ?? 0) > 1) status = "duplicate";
      else if (
        sf.email &&
        p.email &&
        sf.email.toLowerCase() !== p.email.toLowerCase()
      )
        status = "mismatch";
      return {
        user_id: p.id,
        email: p.email,
        full_name: p.full_name,
        cargo: p.cargo,
        organizacao: p.organizacao,
        ativo: p.ativo,
        sf_user_id: p.sf_user_id,
        sf_name: sf?.name ?? null,
        sf_email: sf?.email ?? null,
        status,
      };
    });

    const options = sfUsers
      .map((u) => ({ id: u.id, name: u.name, email: u.email }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { rows, options };
  });

const SetSfLinkInput = z.object({
  user_id: z.string().uuid(),
  sf_user_id: z.string().trim().min(15).max(18).nullable(),
});

export const adminSetSfUserId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetSfLinkInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.sf_user_id) {
      const users = await sfFetchAllUsers();
      const sf = users.find((u) => u.id === data.sf_user_id);
      if (!sf) throw new Error("ID do Salesforce não encontrado ou usuário inativo.");
      const { data: dup } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .eq("sf_user_id", data.sf_user_id)
        .neq("id", data.user_id)
        .maybeSingle();
      if (dup) throw new Error(`Este ID já está vinculado a ${dup.email}.`);
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ sf_user_id: data.sf_user_id })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminAutoMatchSfLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error }, sfUsers] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, sf_user_id"),
      sfFetchAllUsers(),
    ]);
    if (error) throw new Error(error.message);

    const taken = new Set(
      (profiles ?? []).map((p: any) => p.sf_user_id).filter(Boolean) as string[],
    );
    const byEmail = new Map(
      sfUsers.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]),
    );

    let linked = 0;
    for (const p of (profiles ?? []) as Array<{ id: string; email: string; sf_user_id: string | null }>) {
      if (p.sf_user_id) continue;
      const sf = byEmail.get((p.email ?? "").toLowerCase());
      if (!sf || taken.has(sf.id)) continue;
      const { error: uErr } = await supabaseAdmin
        .from("profiles")
        .update({ sf_user_id: sf.id })
        .eq("id", p.id);
      if (uErr) continue;
      taken.add(sf.id);
      linked++;
    }
    return { ok: true as const, linked };
  });

// ================= Diagnóstico do usuário ================= //

export type UserCheck = {
  id: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
  fix?: string;
};

export type UserDiagnostics = {
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    cargo: string | null;
    cargo_tipo: string | null;
    equipe: string | null;
    telefone: string | null;
    avatar_url: string | null;
    meta_mensal: number | null;
    regime_contratacao: string;
    organizacao: string;
    ativo: boolean;
    is_external: boolean;
    filter_scope: string;
    sf_user_id: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  roles: string[];
  auth: { last_sign_in_at: string | null; email_confirmed_at: string | null; banned: boolean };
  salesforce: {
    linked: boolean;
    valid: boolean;
    name: string | null;
    email: string | null;
    title: string | null;
    duplicate_of: string | null;
    team: string | null;
    hidden: boolean;
  };
  scope: { scope: string; allowed_sf_ids: string[] | null; allowed_count: number | null };
  access: {
    instances: string[];
    permissions_allowed: number;
    permissions_denied: number;
    by_instance: Array<{ instance_id: string; allowed: number; denied: number }>;
  };
  goals: { monthly: number; bonus: boolean; new_ab: number; retention: number };
  activity: Array<{ event: string; detail: string | null; created_at: string }>;
  checks: UserCheck[];
};

export const adminUserDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<UserDiagnostics> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getScopeForUser } = await import("./scope.server");
    const uid = data.user_id;

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);
    if (!prof) throw new Error("Usuário não encontrado.");
    const p = prof as any;

    const sfId: string | null = p.sf_user_id ?? null;

    const [
      rolesRes,
      instRes,
      permRes,
      teamRes,
      hiddenRes,
      goalsRes,
      bonusRes,
      newAbRes,
      retRes,
      actRes,
      dupRes,
      authRes,
      sfUsers,
      scope,
    ] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", uid),
      supabaseAdmin.from("user_instance_access").select("instance_id").eq("user_id", uid),
      supabaseAdmin
        .from("user_permission_profiles")
        .select("profile_id, permission_profile_features(instance_id)")
        .eq("user_id", uid),
      sfId
        ? supabaseAdmin.from("salesforce_team_members").select("team").eq("sf_user_id", sfId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      sfId
        ? supabaseAdmin.from("hidden_salespeople").select("sf_user_id").eq("sf_user_id", sfId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      sfId
        ? supabaseAdmin.from("salesperson_goals").select("id", { count: "exact", head: true }).eq("sf_user_id", sfId)
        : Promise.resolve({ count: 0 } as any),
      sfId
        ? supabaseAdmin.from("salesperson_bonus_goals").select("sf_user_id").eq("sf_user_id", sfId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      sfId
        ? supabaseAdmin.from("salesperson_new_ab_goals").select("sf_user_id", { count: "exact", head: true }).eq("sf_user_id", sfId)
        : Promise.resolve({ count: 0 } as any),
      sfId
        ? supabaseAdmin.from("salesperson_retention_goals").select("sf_user_id", { count: "exact", head: true }).eq("sf_user_id", sfId)
        : Promise.resolve({ count: 0 } as any),
      supabaseAdmin
        .from("user_activity_log")
        .select("event, detail, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(10),
      sfId
        ? supabaseAdmin.from("profiles").select("email").eq("sf_user_id", sfId).neq("id", uid).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabaseAdmin.auth.admin.getUserById(uid),
      sfId ? sfFetchAllUsers().catch(() => null) : Promise.resolve(null),
      getScopeForUser(supabaseAdmin as any, uid),
    ]);

    const roles = ((rolesRes.data ?? []) as any[]).map((r) => r.role as string);
    const instances = ((instRes.data ?? []) as any[]).map((r) => r.instance_id as string);
    // Permissões vêm exclusivamente dos perfis vinculados ao usuário.
    const perms = ((permRes.data ?? []) as any[]).flatMap((r) =>
      ((r.permission_profile_features ?? []) as any[]).map((f) => ({
        instance_id: f.instance_id as string,
      })),
    );
    const byInstMap = new Map<string, { allowed: number; denied: number }>();
    for (const perm of perms) {
      const cur = byInstMap.get(perm.instance_id) ?? { allowed: 0, denied: 0 };
      cur.allowed++;
      byInstMap.set(perm.instance_id, cur);
    }

    const sf = sfUsers && sfId ? sfUsers.find((u) => u.id === sfId) ?? null : null;
    const authUser = (authRes as any)?.data?.user ?? null;

    const checks: UserCheck[] = [];
    const push = (c: UserCheck) => checks.push(c);

    push(
      p.ativo
        ? { id: "ativo", label: "Usuário ativo", status: "ok", detail: "Conta habilitada para acesso." }
        : {
            id: "ativo",
            label: "Usuário inativo",
            status: "error",
            detail: "A conta está inativa e o acesso está bloqueado.",
            fix: "Ative o usuário na lista ou na edição.",
          },
    );

    if (!sfId) {
      push({
        id: "sf_missing",
        label: "Sem vínculo com Salesforce",
        status: "error",
        detail: "O campo sf_user_id está vazio — nenhuma oportunidade, conta ou tarefa será atribuída a este usuário.",
        fix: "Vincule o ID do Salesforce em Administrador > Vínculos Salesforce ou na edição do usuário.",
      });
    } else if (sfUsers && !sf) {
      push({
        id: "sf_invalid",
        label: "ID do Salesforce inválido",
        status: "error",
        detail: `O ID ${sfId} não corresponde a nenhum usuário ativo do Salesforce.`,
        fix: "Corrija o ID em Vínculos Salesforce.",
      });
    } else {
      push({
        id: "sf_ok",
        label: "Vínculo com Salesforce",
        status: "ok",
        detail: sf ? `Vinculado a ${sf.name} (${sf.email ?? "sem e-mail"}).` : `ID ${sfId} vinculado.`,
      });
      if (sf?.email && p.email && sf.email.toLowerCase() !== String(p.email).toLowerCase()) {
        push({
          id: "sf_mismatch",
          label: "E-mail divergente do Salesforce",
          status: "warn",
          detail: `Portal: ${p.email} · Salesforce: ${sf.email}.`,
          fix: "Confirme se o vínculo é da pessoa certa.",
        });
      }
    }

    if ((dupRes as any)?.data) {
      push({
        id: "sf_dup",
        label: "ID do Salesforce duplicado",
        status: "error",
        detail: `O mesmo ID também está em ${(dupRes as any).data.email}.`,
        fix: "Remova o vínculo duplicado — dados ficam somados/incorretos.",
      });
    }

    const allowedCount = scope.allowed_sf_ids ? scope.allowed_sf_ids.length : null;
    if (scope.scope === "individual" && !sfId) {
      push({
        id: "scope_individual_no_sf",
        label: "Escopo individual sem ID",
        status: "error",
        detail: "Escopo 'Individual' filtra apenas pelo próprio sf_user_id — sem ID, todas as métricas ficam zeradas.",
        fix: "Vincule o Salesforce ou mude o escopo para Geral/Carteira/Pré Vendas.",
      });
    } else if (allowedCount === 0) {
      push({
        id: "scope_empty",
        label: "Escopo sem vendedores",
        status: "error",
        detail: `Escopo '${scope.scope}' não resolveu nenhum ID do Salesforce — nada será exibido.`,
        fix: "Adicione o vendedor à equipe (Pré Vendas / Carteira) ou ajuste o escopo.",
      });
    } else {
      push({
        id: "scope_ok",
        label: "Escopo de dados",
        status: "ok",
        detail:
          scope.scope === "geral"
            ? "Escopo geral: vê todos os vendedores."
            : `Escopo '${scope.scope}' com ${allowedCount} vendedor(es) visível(is).`,
      });
    }

    if ((scope.scope === "pre_vendas" || scope.scope === "carteira") && sfId && !(teamRes as any)?.data) {
      push({
        id: "team_missing",
        label: "Sem equipe no Salesforce",
        status: "warn",
        detail: "O usuário não está cadastrado em nenhuma equipe (Pré Vendas / Carteira).",
        fix: "Defina a equipe na coluna 'Equipe SF' da lista de usuários.",
      });
    }

    if ((hiddenRes as any)?.data) {
      push({
        id: "hidden",
        label: "Vendedor oculto nos rankings",
        status: "warn",
        detail: "Este vendedor está marcado como oculto e não aparece nas listagens/rankings.",
        fix: "Reative a visibilidade na coluna 'Visível' da lista de usuários.",
      });
    }

    if (roles.length === 0) {
      push({
        id: "no_role",
        label: "Sem papel definido",
        status: "error",
        detail: "O usuário não tem nenhum papel (admin/gerente/vendedor/...).",
        fix: "Defina o papel na edição do usuário.",
      });
    }

    if (instances.length === 0) {
      push({
        id: "no_instance",
        label: "Sem acesso a instâncias",
        status: "error",
        detail: "Nenhuma instância liberada — o portal abre travado na tela de perfil.",
        fix: "Libere as instâncias em Administrador > Perfis.",
      });
    }

    const totalAllowed = perms.length;
    if (totalAllowed === 0) {
      push({
        id: "no_permissions",
        label: "Sem telas liberadas",
        status: "error",
        detail: "O modelo é 'bloqueado por padrão' e o perfil do usuário não libera nenhuma tela.",
        fix: "Libere as telas em Administrador > Perfis.",
      });
    }

    const goalsCount = ((goalsRes as any)?.count ?? 0) as number;
    if (sfId && goalsCount === 0) {
      push({
        id: "no_goals",
        label: "Sem metas cadastradas",
        status: "warn",
        detail: "Nenhuma meta mensal encontrada — os cards de atingimento ficam em 0%.",
        fix: "Cadastre em Administrador > Regras de Meta.",
      });
    }

    if (!authUser?.last_sign_in_at) {
      push({
        id: "never_logged",
        label: "Nunca acessou o portal",
        status: "warn",
        detail: "Não há registro de login para este usuário.",
      });
    }

    return {
      profile: {
        id: p.id,
        email: p.email,
        full_name: p.full_name ?? null,
        cargo: p.cargo ?? null,
        cargo_tipo: p.cargo_tipo ?? null,
        equipe: p.equipe ?? null,
        telefone: p.telefone ?? null,
        avatar_url: p.avatar_url ?? null,
        meta_mensal: p.meta_mensal ?? null,
        regime_contratacao: p.regime_contratacao,
        organizacao: p.organizacao,
        ativo: p.ativo,
        is_external: p.is_external,
        filter_scope: p.filter_scope,
        sf_user_id: sfId,
        created_at: p.created_at ?? null,
        updated_at: p.updated_at ?? null,
      },
      roles,
      auth: {
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        email_confirmed_at: authUser?.email_confirmed_at ?? null,
        banned: !!authUser?.banned_until,
      },
      salesforce: {
        linked: !!sfId,
        valid: !!sf,
        name: sf?.name ?? null,
        email: sf?.email ?? null,
        title: sf?.title ?? null,
        duplicate_of: (dupRes as any)?.data?.email ?? null,
        team: (teamRes as any)?.data?.team ?? null,
        hidden: !!(hiddenRes as any)?.data,
      },
      scope: {
        scope: scope.scope,
        allowed_sf_ids: scope.allowed_sf_ids ?? null,
        allowed_count: allowedCount,
      },
      access: {
        instances,
        permissions_allowed: totalAllowed,
        permissions_denied: perms.length - totalAllowed,
        by_instance: Array.from(byInstMap.entries()).map(([instance_id, v]) => ({
          instance_id,
          ...v,
        })),
      },
      goals: {
        monthly: goalsCount,
        bonus: !!(bonusRes as any)?.data,
        new_ab: ((newAbRes as any)?.count ?? 0) as number,
        retention: ((retRes as any)?.count ?? 0) as number,
      },
      activity: ((actRes as any)?.data ?? []) as Array<{
        event: string;
        detail: string | null;
        created_at: string;
      }>,
      checks,
    };
  });
