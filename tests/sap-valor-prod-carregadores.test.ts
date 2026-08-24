import { afterEach, describe, expect, it } from "vitest";
import { ehCarregadores, valorProdAtivo } from "@/lib/sap-ov.server";

const flag = "SAP_VALOR_PROD_CARREGADORES";

afterEach(() => {
  delete process.env[flag];
});

describe("VALOR_PROD (preço manual) — gate por organização e flag", () => {
  it("identifica a organização Carregadores", () => {
    expect(ehCarregadores({ organizacao: "carregadores" })).toBe(true);
    expect(ehCarregadores({ organizacao: "2P Carregadores" })).toBe(true);
    expect(ehCarregadores({ organizacao: "solar" })).toBe(false);
  });

  it("fica desligado sem a flag, mesmo em Carregadores", () => {
    expect(valorProdAtivo({ organizacao: "carregadores" })).toBe(false);
  });

  it("liga apenas para Carregadores com a flag em X", () => {
    process.env[flag] = "X";
    expect(valorProdAtivo({ organizacao: "carregadores" })).toBe(true);
    expect(valorProdAtivo({ organizacao: "solar" })).toBe(false);
  });

  it("não liga com valor diferente de X", () => {
    process.env[flag] = "true";
    expect(valorProdAtivo({ organizacao: "carregadores" })).toBe(false);
  });
});
