import { afterEach, describe, expect, it } from "vitest";
import {
  aliqIcmsDoItem,
  aliqIpiDaProposta,
  ehCarregadores,
  fatorLiquidoSemImpostos,
  itensSemAliquota,
  valorProdAtivo,
  valorProdUnitario,
} from "@/lib/sap-ov.server";
import { valorProdCarregadores } from "@/lib/carregadores-impostos";

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

describe("VALOR_PROD — conversão fiscal do preço de venda", () => {
  // Proposta de Carregadores: 2 itens, preço cheio 1.587,30 e 3.174,60.
  // IPI 5% (NCM do produto) e ICMS interestadual de 4%.
  const row = () => {
    const valor = 1587.3 + 2 * 3174.6; // valorItens (com impostos)
    const semIpi = valor / 1.05;
    return {
      organizacao: "carregadores",
      itens: [
        {
          codigo: "200000694",
          qtd: 1,
          valor: 1587.3,
          aliq_ipi: 0.05,
          aliq_icms: 0.04,
          aliq_pis_cofins: 0.0925,
        },
        {
          codigo: "200000684",
          qtd: 2,
          valor: 3174.6,
          aliq_ipi: 0.05,
          aliq_icms: 0.04,
          aliq_pis_cofins: 0.0925,
        },
      ],
      totais: {
        valor,
        ipi: valor - semIpi,
        icms: semIpi * 0.04,
        icmsRate: 0.04,
        pisCofinsRate: 0.0925,
      },
    };
  };

  it("sem IPI: T=4.253,58 em 3 un → líquido pela fórmula fiscal", () => {
    const r = {
      organizacao: "carregadores",
      itens: [
        {
          codigo: "200000694",
          qtd: 3,
          valor: 4253.58 / 3,
          aliq_ipi: 0,
          aliq_icms: 0.04,
          aliq_pis_cofins: 0.0925,
        },
      ],
      totais: { valor: 4253.58, ipi: 0, icmsRate: 0.04, pisCofinsRate: 0.0925 },
    };
    expect(valorProdUnitario(r, r.itens[0])).toBe(
      valorProdCarregadores(4253.58 / 3, { ipi: 0, icms: 0.04, pisCofins: 0.0925 }),
    );
  });

  it("aplica a fórmula fiscal em cada linha", () => {
    const r = row();
    const esperado = (bruto: number) =>
      valorProdCarregadores(bruto, { ipi: 0.05, icms: 0.04, pisCofins: 0.0925 });
    expect(valorProdUnitario(r, r.itens[0])).toBe(esperado(1587.3));
    expect(valorProdUnitario(r, r.itens[1])).toBe(esperado(3174.6));
  });

  it("deriva as alíquotas dos totais quando o item não as tem", () => {
    const r = row();
    expect(aliqIpiDaProposta(r)).toBeCloseTo(0.05, 5);
    expect(aliqIcmsDoItem(r, { valor: 100 })).toBe(0.04);
    expect(valorProdUnitario(r, { valor: 1587.3 })).toBeGreaterThan(0);
  });

  it("aceita ICMS diferente de 4% (venda interna) e bloqueia só sem alíquota", () => {
    const r = row();
    expect(itensSemAliquota(r)).toHaveLength(0);
    const interno = {
      ...r,
      itens: [
        {
          codigo: "200000694",
          qtd: 1,
          valor: 1000,
          aliq_ipi: 0.05,
          aliq_icms: 0.17,
          aliq_pis_cofins: 0.0925,
        },
      ],
    };
    expect(itensSemAliquota(interno)).toHaveLength(0);
    expect(valorProdUnitario(interno, interno.itens[0])).toBeGreaterThan(0);

    const semAliq = { organizacao: "carregadores", totais: {}, itens: [{ qtd: 1, valor: 1000 }] };
    expect(itensSemAliquota(semAliq)).toHaveLength(1);
    expect(valorProdUnitario(semAliq, semAliq.itens[0])).toBe(0);
  });

  it("não calcula (e força bloqueio) quando os totais estão ausentes", () => {
    expect(fatorLiquidoSemImpostos({ organizacao: "carregadores" })).toBeNull();
    expect(fatorLiquidoSemImpostos({ totais: { valor: 100, ipi: 200 } })).toBeNull();
    expect(valorProdUnitario({ totais: {} }, { valor: 100 })).toBe(0);
  });
});
