import { afterEach, describe, expect, it } from "vitest";
import {
  ehCarregadores,
  fatorLiquidoSemImpostos,
  valorProdAtivo,
  valorProdUnitario,
} from "@/lib/sap-ov.server";

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

describe("VALOR_PROD — valor líquido, sem nenhum imposto", () => {
  // Proposta de Carregadores: 2 itens, preço cheio 1.587,30 e 3.174,60.
  // IPI 5%, ICMS 4% e PIS/COFINS 9,25% (sobre a base sem IPI e sem ICMS).
  const row = () => {
    const valor = 1587.3 + 2 * 3174.6; // valorItens
    const semIpi = valor / 1.05;
    const icms = semIpi * 0.04;
    const pisCofins = (semIpi - icms) * 0.0925;
    return {
      organizacao: "carregadores",
      itens: [
        { codigo: "200000694", qtd: 1, valor: 1587.3 },
        { codigo: "200000684", qtd: 2, valor: 3174.6 },
      ],
      totais: { valor, ipi: valor - semIpi, icms, pisCofins },
    };
  };

  it("tira IPI, ICMS e PIS/COFINS do preço unitário", () => {
    const r = row();
    const fator = fatorLiquidoSemImpostos(r)!;
    // 1/1,05 × (1 − 0,04) × (1 − 0,0925) → ~0,8305
    expect(fator).toBeCloseTo((1 / 1.05) * (1 - 0.04 - (1 - 0.04) * 0.0925), 6);
    expect(valorProdUnitario(r, r.itens[0])).toBeCloseTo(
      Math.round(1587.3 * fator * 100) / 100,
      2,
    );
    expect(valorProdUnitario(r, r.itens[1])).toBeCloseTo(
      Math.round(3174.6 * fator * 100) / 100,
      2,
    );
  });

  it("a soma dos líquidos bate com a receita da proposta sem impostos", () => {
    const r = row();
    const liquido =
      valorProdUnitario(r, r.itens[0]) * 1 + valorProdUnitario(r, r.itens[1]) * 2;
    const esperado = r.totais.valor - r.totais.ipi - r.totais.icms - r.totais.pisCofins;
    expect(liquido).toBeCloseTo(esperado, 1);
  });

  it("não calcula (e força bloqueio) quando os totais estão ausentes", () => {
    expect(fatorLiquidoSemImpostos({ organizacao: "carregadores" })).toBeNull();
    expect(fatorLiquidoSemImpostos({ totais: { valor: 100, ipi: 200 } })).toBeNull();
    expect(valorProdUnitario({ totais: {} }, { valor: 100 })).toBe(0);
  });
});
