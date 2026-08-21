import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createUser,
  deleteUser,
  hasCreds,
  isPermissionError,
  makeAdmin,
  makeAnon,
  type TestUser,
} from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

const SKIP = !hasCreds;
const d = SKIP ? describe.skip : describe;

if (SKIP) {
  // eslint-disable-next-line no-console
  console.warn(
    "[rls tests] Skipping — set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY to enable.",
  );
}

const SF_A = `RLS_SF_A_${Date.now()}`;
const SF_B = `RLS_SF_B_${Date.now()}`;

let admin: SupabaseClient;
let anon: SupabaseClient;
let adminUser: TestUser;
let gerente: TestUser;
let diretor: TestUser;
let vendA: TestUser;
let vendB: TestUser;
let seededGoalIds: { table: string; id: string }[] = [];
let seededHiddenIds: string[] = [];
let seededTeamIds: string[] = [];
let seededVariantIds: string[] = [];

d("RLS regression suite", () => {
  beforeAll(async () => {
    admin = makeAdmin();
    anon = makeAnon();

    [adminUser, gerente, diretor, vendA, vendB] = await Promise.all([
      createUser({ admin, label: "admin", role: "admin" }),
      createUser({ admin, label: "gerente", role: "gerente" }),
      createUser({ admin, label: "diretor", role: "diretor" }),
      createUser({ admin, label: "vendA", role: "vendedor", sfUserId: SF_A, equipe: "pre_vendas" }),
      createUser({ admin, label: "vendB", role: "vendedor", sfUserId: SF_B, equipe: "carteira" }),
    ]);

    // Seed goals for each vendedor as service_role (admin RLS bypass).
    const seedMonthly = async (sf: string) => {
      const { data, error } = await admin
        .from("salesperson_goals")
        .insert({ sf_user_id: sf, year: 2026, month: 7, monthly_goal: 100 })
        .select("sf_user_id, year, month")
        .single();
      if (error) throw new Error(`seed salesperson_goals: ${error.message}`);
      seededGoalIds.push({
        table: "salesperson_goals",
        id: `${(data as { sf_user_id: string }).sf_user_id}|2026|7`,
      });
    };
    const seedQuarterly = async (table: string, sf: string) => {
      const { data, error } = await admin
        .from(table)
        .insert({ sf_user_id: sf, year: 2026, quarter: 3, goal: 10 })
        .select("sf_user_id, year, quarter")
        .single();
      if (error) throw new Error(`seed ${table}: ${error.message}`);
      seededGoalIds.push({
        table,
        id: `${(data as { sf_user_id: string }).sf_user_id}|2026|3`,
      });
    };
    for (const sf of [SF_A, SF_B]) {
      await seedMonthly(sf);
      await seedQuarterly("salesperson_new_ab_goals", sf);
      await seedQuarterly("salesperson_retention_goals", sf);
    }

    // Seed a hidden salesperson, team member and view variant.
    {
      const { error } = await admin
        .from("hidden_salespeople")
        .insert({ sf_user_id: SF_A });
      if (error) throw error;
      seededHiddenIds.push(SF_A);
    }
    {
      const { error } = await admin
        .from("salesforce_team_members")
        .insert({ sf_user_id: SF_A, team: "pre_vendas" });
      if (error) throw error;
      seededTeamIds.push(SF_A);
    }
    {
      const { data, error } = await admin
        .from("view_variants")
        .insert({ screen: "home", variant_key: `rls-test-${Date.now()}`, label: "RLS test" })
        .select("id")
        .single();
      if (error) throw error;
      seededVariantIds.push((data as { id: string }).id);
    }
  });

  afterAll(async () => {
    for (const g of seededGoalIds) {
      const [sf, year, m] = g.id.split("|");
      const q = admin.from(g.table).delete().eq("sf_user_id", sf).eq("year", Number(year));
      if (g.table === "salesperson_goals") await q.eq("month", Number(m));
      else await q.eq("quarter", Number(m));
    }
    for (const sf of seededHiddenIds) await admin.from("hidden_salespeople").delete().eq("sf_user_id", sf);
    for (const sf of seededTeamIds) await admin.from("salesforce_team_members").delete().eq("sf_user_id", sf);
    for (const id of seededVariantIds) await admin.from("view_variants").delete().eq("id", id);
    for (const u of [adminUser, gerente, diretor, vendA, vendB]) {
      if (u) await deleteUser(admin, u.id);
    }
  });


  // ────────────────────────────────────────────────────────────── profiles
  describe("profiles", () => {
    it("anon cannot read profiles", async () => {
      const { data } = await anon.from("profiles").select("id");
      expect(data ?? []).toHaveLength(0);
    });

    it("vendedor only sees own profile", async () => {
      const { data } = await vendA.client
        .from("profiles")
        .select("id")
        .in("id", [vendA.id, vendB.id]);
      const ids = (data ?? []).map((r) => r.id);
      expect(ids).toEqual([vendA.id]);
    });

    it("gerente/diretor/admin see other profiles", async () => {
      for (const u of [gerente, diretor, adminUser]) {
        const { data } = await u.client
          .from("profiles")
          .select("id")
          .in("id", [vendA.id, vendB.id]);
        expect((data ?? []).map((r) => r.id).sort()).toEqual(
          [vendA.id, vendB.id].sort(),
        );
      }
    });

    it("vendedor can update own profile but not others", async () => {
      const ok = await vendA.client
        .from("profiles")
        .update({ full_name: "own-name" })
        .eq("id", vendA.id);
      expect(ok.error).toBeNull();
      const denied = await vendA.client
        .from("profiles")
        .update({ full_name: "hacked" })
        .eq("id", vendB.id)
        .select();
      // Either permission error, or empty result (RLS filters row out).
      expect(isPermissionError(denied.error) || (denied.data ?? []).length === 0).toBe(true);
    });

    it("non-admin cannot delete profiles", async () => {
      const { error, data } = await gerente.client
        .from("profiles")
        .delete()
        .eq("id", vendB.id)
        .select();
      expect(isPermissionError(error) || (data ?? []).length === 0).toBe(true);
      // Confirm still present via admin.
      const check = await admin.from("profiles").select("id").eq("id", vendB.id).single();
      expect(check.data?.id).toBe(vendB.id);
    });
  });

  // ─────────────────────────────────────────────────────────── user_roles
  describe("user_roles (escalation guard)", () => {
    it("user sees only own role", async () => {
      const { data } = await vendA.client
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", [vendA.id, vendB.id, adminUser.id]);
      expect((data ?? []).map((r) => r.user_id)).toEqual([vendA.id]);
    });

    it("user CANNOT self-promote to admin", async () => {
      const { error } = await vendA.client
        .from("user_roles")
        .insert({ user_id: vendA.id, role: "admin" });
      expect(isPermissionError(error)).toBe(true);
    });

    it("user CANNOT update or delete role rows", async () => {
      const upd = await vendA.client
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", vendA.id)
        .select();
      expect(isPermissionError(upd.error) || (upd.data ?? []).length === 0).toBe(true);

      const del = await vendA.client
        .from("user_roles")
        .delete()
        .eq("user_id", vendA.id)
        .select();
      expect(isPermissionError(del.error) || (del.data ?? []).length === 0).toBe(true);
    });

    it("admin sees and manages roles", async () => {
      const { data } = await adminUser.client
        .from("user_roles")
        .select("user_id")
        .in("user_id", [vendA.id, vendB.id]);
      expect((data ?? []).length).toBe(2);
    });
  });

  // ────────────────────────────────── user_extra_features / instance
  describe("user_extra_features & user_instance_access", () => {
    it("user reads only own rows", async () => {
      for (const tbl of ["user_extra_features", "user_instance_access"] as const) {
        const { data } = await vendA.client
          .from(tbl)
          .select("user_id")
          .in("user_id", [vendA.id, vendB.id]);
        expect(
          (data ?? []).every((r) => (r as { user_id: string }).user_id === vendA.id),
        ).toBe(true);
      }
    });

    it("user cannot write another user's access", async () => {
      const uia = await vendA.client
        .from("user_instance_access")
        .insert({ user_id: vendB.id, instance_id: "solar" });
      expect(isPermissionError(uia.error)).toBe(true);

      const ufp = await vendA.client
        .from("user_extra_features")
        .insert({ user_id: vendB.id, instance_id: "solar", feature_key: "dashboards" });
      expect(isPermissionError(ufp.error)).toBe(true);
    });
  });


  // ───────────────────────────────────────────── salesperson_*_goals (scope)
  describe.each([
    "salesperson_goals",
    "salesperson_new_ab_goals",
    "salesperson_retention_goals",
  ])("%s scoped read", (table) => {
    it("vendedor A sees only own goals", async () => {
      const { data } = await vendA.client
        .from(table)
        .select("sf_user_id")
        .in("sf_user_id", [SF_A, SF_B]);
      const sfs = (data ?? []).map((r) => (r as { sf_user_id: string }).sf_user_id);
      expect(sfs).toContain(SF_A);
      expect(sfs).not.toContain(SF_B);
    });

    it("gerente/diretor/admin see both", async () => {
      for (const u of [gerente, diretor, adminUser]) {
        const { data } = await u.client
          .from(table)
          .select("sf_user_id")
          .in("sf_user_id", [SF_A, SF_B]);
        const sfs = new Set((data ?? []).map((r) => (r as { sf_user_id: string }).sf_user_id));
        expect(sfs.has(SF_A) && sfs.has(SF_B)).toBe(true);
      }
    });

    it("non-admin cannot insert/update/delete", async () => {
      const insPayload =
        table === "salesperson_goals"
          ? { sf_user_id: SF_A, year: 2026, month: 8, monthly_goal: 1 }
          : { sf_user_id: SF_A, year: 2026, quarter: 4, goal: 1 };
      const ins = await vendA.client.from(table).insert(insPayload);
      expect(isPermissionError(ins.error)).toBe(true);

      const updPatch =
        table === "salesperson_goals" ? { monthly_goal: 999 } : { goal: 999 };
      const upd = await gerente.client
        .from(table)
        .update(updPatch)
        .eq("sf_user_id", SF_A)
        .select();
      expect(isPermissionError(upd.error) || (upd.data ?? []).length === 0).toBe(true);

      const del = await diretor.client
        .from(table)
        .delete()
        .eq("sf_user_id", SF_B)
        .select();
      expect(isPermissionError(del.error) || (del.data ?? []).length === 0).toBe(true);
    });

    it("anon cannot read", async () => {
      const { data } = await anon.from(table).select("sf_user_id");
      expect(data ?? []).toHaveLength(0);
    });
  });


  // ────────────────────────────────────────────────────── hidden_salespeople
  describe("hidden_salespeople", () => {
    it("vendedor cannot read", async () => {
      const { data } = await vendA.client.from("hidden_salespeople").select("sf_user_id");
      expect(data ?? []).toHaveLength(0);
    });
    it("gerente/diretor/admin can read", async () => {
      for (const u of [gerente, diretor, adminUser]) {
        const { data } = await u.client.from("hidden_salespeople").select("sf_user_id");
        expect((data ?? []).length).toBeGreaterThan(0);
      }
    });
    it("only admin can write", async () => {
      const denied = await gerente.client
        .from("hidden_salespeople")
        .insert({ sf_user_id: `${SF_B}-x` });
      expect(isPermissionError(denied.error)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────── salesforce_team_members
  describe("salesforce_team_members", () => {
    it("any authenticated reads", async () => {
      const { data } = await vendA.client.from("salesforce_team_members").select("sf_user_id");
      expect((data ?? []).length).toBeGreaterThan(0);
    });
    it("anon cannot read", async () => {
      const { data } = await anon.from("salesforce_team_members").select("sf_user_id");
      expect(data ?? []).toHaveLength(0);
    });
    it("non-admin cannot write", async () => {
      const denied = await gerente.client
        .from("salesforce_team_members")
        .insert({ sf_user_id: `${SF_B}-x`, team: "carteira" });
      expect(isPermissionError(denied.error)).toBe(true);
    });
  });



  // ────────────────────────────────────────────────────── user_view_preferences
  describe("user_view_preferences", () => {
    it("user manages own only", async () => {
      const ok = await vendA.client
        .from("user_view_preferences")
        .insert({ user_id: vendA.id, screen: `rls-${Date.now()}`, variant_key: "default" });
      expect(ok.error).toBeNull();

      const denied = await vendA.client
        .from("user_view_preferences")
        .insert({ user_id: vendB.id, screen: `rls-${Date.now()}`, variant_key: "default" });
      expect(isPermissionError(denied.error)).toBe(true);
    });

  });

  // ─────────────────────────────────────────────────────────── view_variants
  describe("view_variants", () => {
    it("any authenticated reads", async () => {
      const { data } = await vendA.client
        .from("view_variants")
        .select("id")
        .in("id", seededVariantIds);
      expect((data ?? []).length).toBe(seededVariantIds.length);
    });
    it("anon cannot read", async () => {
      const { data } = await anon.from("view_variants").select("id");
      expect(data ?? []).toHaveLength(0);
    });
    it("non-admin cannot write", async () => {
      const denied = await gerente.client
        .from("view_variants")
        .insert({ screen: "home", variant_key: "rls-nope", label: "nope" });
      expect(isPermissionError(denied.error)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────── user_invites
  describe("user_invites", () => {
    it("non-admin cannot read", async () => {
      const { data } = await vendA.client.from("user_invites").select("id");
      expect(data ?? []).toHaveLength(0);
    });
    it("non-admin cannot insert", async () => {
      const denied = await gerente.client
        .from("user_invites")
        .insert({ email: `nope-${Date.now()}@example.test` });
      expect(isPermissionError(denied.error)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────── instances
  describe("instances", () => {
    it("any authenticated reads", async () => {
      const { data } = await vendA.client.from("instances").select("id");
      expect((data ?? []).length).toBeGreaterThan(0);
    });
    it("non-admin cannot write", async () => {
      const denied = await gerente.client
        .from("instances")
        .insert({ id: `rls-inst-${Date.now()}`, label: "x" });
      expect(isPermissionError(denied.error)).toBe(true);
    });
  });
});
