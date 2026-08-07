import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoleEnum = z.enum(["admin", "gerente", "vendedor", "diretor", "marketing"]);
const RegimeEnum = z.enum(["CLT", "PJ"]);

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
  is_external: z.boolean().optional(),
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
      is_external?: boolean;
    } = {};
    if (data.email !== undefined) profilePatch.email = data.email;
    if (data.full_name !== undefined) profilePatch.full_name = data.full_name;
    if (data.cargo !== undefined) profilePatch.cargo = data.cargo;
    if (data.equipe !== undefined) profilePatch.equipe = data.equipe;
    if (data.regime_contratacao !== undefined) profilePatch.regime_contratacao = data.regime_contratacao;
    if (data.is_external !== undefined) profilePatch.is_external = data.is_external;


    if (Object.keys(profilePatch).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profilePatch)
        .eq("id", data.user_id);
      if (error) throw new Error(error.message);
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


