import { afterEach, describe, expect, it } from "vitest";
import {
  aliqIcmsDoItem,
  aliqIpiDaProposta,
  ehCarregadores,
  fatorLiquidoSemImpostos,
  itensForaDaCalibracao,
  valorProdAtivo,
  valorProdUnitario,
} from "@/lib/sap-ov.server";
import { FATOR_LIQUIDO_SAP_ICMS4 } from "@/lib/carregadores-impostos";

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

describe("VALOR_PROD — conversão calibrada do preço de venda", () => {
  // Proposta de Carregadores: 2 itens, preço cheio 1.587,30 e 3.174,60.
  // IPI 5% (NCM do produto) e ICMS interestadual de 4%.
  const row = () => {
    const valor = 1587.3 + 2 * 3174.6; // valorItens (com impostos)
    const semIpi = valor / 1.05;
    return {
      organizacao: "carregadores",
      itens: [
        { codigo: "200000694", qtd: 1, valor: 1587.3, aliq_ipi: 0.05, aliq_icms: 0.04 },
        { codigo: "200000684", qtd: 2, valor: 3174.6, aliq_ipi: 0.05, aliq_icms: 0.04 },
      ],
      totais: { valor, ipi: valor - semIpi, icms: semIpi * 0.04, icmsRate: 0.04 },
    };
  };

  it("aceite SAP: 3 un de 1.417,86 (T=4.253,58, IPI 0) → 1234.56", () => {
    const r = {
      organizacao: "carregadores",
      itens: [{ codigo: "200000694", qtd: 3, valor: 4253.58 / 3, aliq_ipi: 0, aliq_icms: 0.04 }],
      totais: { valor: 4253.58, ipi: 0, icmsRate: 0.04 },
    };
    expect(valorProdUnitario(r, r.itens[0])).toBe(1234.56);
  });

  it("aceite SAP: T=1.260,45 com IPI 9,75% → 1000.00", () => {
    const r = {
      organizacao: "carregadores",
      itens: [{ codigo: "200000684", qtd: 1, valor: 1260.45, aliq_ipi: 0.0975, aliq_icms: 0.04 }],
      totais: { valor: 1260.45, ipi: 1260.45 - 1260.45 / 1.0975, icmsRate: 0.04 },
    };
    expect(valorProdUnitario(r, r.itens[0])).toBe(1000);
  });

  it("aplica preço sem IPI × fator calibrado em cada linha", () => {
    const r = row();
    const esperado = (bruto: number) =>
      Math.round(Math.round((bruto / 1.05) * 1e6) / 1e6 * FATOR_LIQUIDO_SAP_ICMS4 * 100) / 100;
    expect(valorProdUnitario(r, r.itens[0])).toBe(esperado(1587.3));
    expect(valorProdUnitario(r, r.itens[1])).toBe(esperado(3174.6));
  });

  it("deriva as alíquotas dos totais quando o item não as tem", () => {
    const r = row();
    expect(aliqIpiDaProposta(r)).toBeCloseTo(0.05, 5);
    expect(aliqIcmsDoItem(r, { valor: 100 })).toBe(0.04);
    expect(valorProdUnitario(r, { valor: 1587.3 })).toBeGreaterThan(0);
  });

  it("bloqueia itens fora da calibração de ICMS 4%", () => {
    const r = row();
    expect(itensForaDaCalibracao(r)).toHaveLength(0);
    const interno = {
      ...r,
      itens: [{ codigo: "200000694", qtd: 1, valor: 1000, aliq_ipi: 0.05, aliq_icms: 0.17 }],
    };
    expect(itensForaDaCalibracao(interno)).toHaveLength(1);
    expect(valorProdUnitario(interno, interno.itens[0])).toBe(0);
  });

  it("não calcula (e força bloqueio) quando os totais estão ausentes", () => {
    expect(fatorLiquidoSemImpostos({ organizacao: "carregadores" })).toBeNull();
    expect(fatorLiquidoSemImpostos({ totais: { valor: 100, ipi: 200 } })).toBeNull();
    expect(valorProdUnitario({ totais: {} }, { valor: 100 })).toBe(0);
  });
});
