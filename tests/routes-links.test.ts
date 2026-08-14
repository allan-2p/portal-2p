import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ADMIN_SECTIONS } from "@/lib/admin-nav";
import { ROUTE_FEATURE } from "@/lib/instances";
import { LEGACY_PREFIXES, legacyTarget } from "@/lib/routes";

/** Caminhos reais declarados na árvore de rotas gerada. */
function realPaths(): string[] {
  const src = readFileSync("src/routeTree.gen.ts", "utf8");
  const ids = new Set<string>();
  for (const m of src.matchAll(/'(\/[^']*)':\s*typeof/g)) ids.add(m[1]);
  return [...ids].map((p) => (p.replace(/\/+$/, "") || "/").replace("_/", "/"));
}

const PATHS = realPaths();

function resolves(path: string) {
  const clean = (path.split("?")[0].replace(/\/+$/, "") || "/");
  return PATHS.some((r) => {
    if (r === clean) return true;
    const rx = new RegExp("^" + r.replace(/\$[a-zA-Z]*/g, "[^/]+") + "$");
    return rx.test(clean);
  });
}

describe("padronização de links", () => {
  it("a árvore de rotas foi lida", () => {
    expect(PATHS.length).toBeGreaterThan(20);
  });

  it("todo item do menu de administração aponta para uma rota existente", () => {
    const broken: string[] = [];
    for (const section of ADMIN_SECTIONS) {
      if (!resolves(section.home)) broken.push(section.home);
      for (const group of section.groups)
        for (const item of group.items) if (!resolves(item.to)) broken.push(item.to);
    }
    expect(broken).toEqual([]);
  });

  it("todo caminho do mapa de features existe", () => {
    const broken = Object.keys(ROUTE_FEATURE).filter((p) => !resolves(p));
    expect(broken).toEqual([]);
  });

  it("todo redirecionamento legado aponta para uma rota existente", () => {
    const broken = LEGACY_PREFIXES.map(([, to]) => to).filter((p) => !resolves(p));
    expect(broken).toEqual([]);
  });

  it("caminhos legados são convertidos para os novos", () => {
    expect(legacyTarget("/pedidos")).toBe("/solar/pedidos");
    expect(legacyTarget("/clientes/cadastros")).toBe("/solar/clientes/cadastros");
    expect(legacyTarget("/usuarios")).toBe("/admin/usuarios");
    expect(legacyTarget("/solar/pedidos")).toBeNull();
  });
});
