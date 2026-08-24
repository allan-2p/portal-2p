import { describe, expect, it } from "vitest";
import {
  CARREGADORES_CONFIG_FALLBACK,
  MARGEM_PRECO_SUGERIDO,
  calcularCarregadores,
  precoSugeridoPadrao,
  statusMB,
  type CarregadoresNcm,
  type CarregadoresProduct,
  type CarregadoresState,
  type CarregadoresUf,
} from "@/lib/carregadores";

const NCM: CarregadoresNcm = {
  id: "ncm-1",
  codigo: "85044090",
  descricao: "Carregador",
  ipi: 0.05,
  pis_cofins: 0.0925,
  aliq_inter: 0.04,
  tem_st: false,
  gera_difal: true,
  observacoes: null,
  ativo: true,
};

const PRODUTO: CarregadoresProduct = {
  id: "p1",
  codigo: "200000694",
  nome: "Carregador 7,4 kW",
  custo: 1000,
  preco_sugerido: precoSugeridoPadrao(1000),
  ativo: true,
  ncm_id: NCM.id,
};

const PRODUTO_2: CarregadoresProduct = { ...PRODUTO, id: "p2", codigo: "200000684", custo: 2000 };

const UFS: CarregadoresUf[] = [
  { uf: "SP", nome: "São Paulo", aliq_interna: 0.18, fcp: 0, convenio_st: false },
];

const produtos = [PRODUTO, PRODUTO_2];
const config = CARREGADORES_CONFIG_FALLBACK;

function estado(over: Partial<CarregadoresState> = {}): CarregadoresState {
  return {
    nome: "Cliente Teste",
    telefone: "",
    email: "",
    doc: "",
    ie: "123",
    uf: "SP",
    contribuinte: true,
    regimeTributario: null,
    finalidadeUso: "revenda",
    freteMod: "FOB",
    freteValor: 0,
    observacoes: "",
    itens: [
      { key: "1", produtoId: PRODUTO.id, qtd: 1, valor: precoSugeridoPadrao(PRODUTO.custo), valorManual: false },
    ],
    ...over,
  };
}

const calc = (s: CarregadoresState) => calcularCarregadores(s, produtos, UFS, config, [NCM]);

describe("Preço Sugerido", () => {
  // 37% é margem sobre o preço de venda (divisor), não markup sobre o custo:
  // custo / (1 - 0,37). Ver `precoSugeridoPadrao` em src/lib/carregadores.ts.
  it("aplica 37% de margem sobre o preço (custo / (1 - 0,37))", () => {
    expect(precoSugeridoPadrao(1000)).toBe(
      Math.round((1000 / (1 - MARGEM_PRECO_SUGERIDO)) * 100) / 100,
    );
    expect(precoSugeridoPadrao(1000)).toBe(1587.3);
    expect(precoSugeridoPadrao(1234.56)).toBe(1959.62);
  });


  it("retorna 0 para custo inválido ou zerado", () => {
    expect(precoSugeridoPadrao(0)).toBe(0);
    expect(precoSugeridoPadrao(Number.NaN)).toBe(0);
  });

  // Markup de 37% sobre o custo ≠ MB% de 37%: impostos e frete reduzem a
  // receita líquida, então o sugerido é só o ponto de partida — a política de
  // MB mínima (33%) é validada à parte, no cálculo da proposta.
  it("é markup sobre o custo, não MB% — a política mínima é avaliada no cálculo", () => {
    const d = calc(estado());
    expect(d.valorItens).toBeCloseTo(precoSugeridoPadrao(PRODUTO.custo), 6);
    expect(d.mbPct).toBeLessThan(MARGEM_PRECO_SUGERIDO);
    expect(statusMB(d.mbPct, config).level).toBe(
      d.mbPct < config.politica_mb_min ? "bad" : "good",
    );
  });

});

describe("Recalculo dos itens", () => {
  it("recalcula os totais ao alterar o valor unitário", () => {
    const base = calc(estado());
    const dobro = calc(
      estado({
        itens: [{ key: "1", produtoId: PRODUTO.id, qtd: 1, valor: precoSugeridoPadrao(PRODUTO.custo) * 2, valorManual: true }],
      }),
    );
    expect(dobro.valorItens).toBeCloseTo(base.valorItens * 2, 6);
    expect(dobro.ipiValor).toBeCloseTo(base.ipiValor * 2, 5);
    expect(dobro.icms).toBeCloseTo(base.icms * 2, 5);
    expect(dobro.pisCofins).toBeCloseTo(base.pisCofins * 2, 5);
    expect(dobro.mb).toBeGreaterThan(base.mb);
    expect(dobro.mbPct).toBeGreaterThan(base.mbPct);
    expect(dobro.comValor).not.toBe(base.comValor);
  });

  it("recalcula os totais ao alterar a quantidade", () => {
    const base = calc(estado());
    const tres = calc(
      estado({
        itens: [{ key: "1", produtoId: PRODUTO.id, qtd: 3, valor: precoSugeridoPadrao(PRODUTO.custo), valorManual: false }],
      }),
    );
    expect(tres.valorItens).toBeCloseTo(base.valorItens * 3, 6);
    expect(tres.custoTotal).toBeCloseTo(base.custoTotal * 3, 6);
    // MB% independe da escala quando o preço unitário não muda
    // Intermediários fiscais agora são arredondados a 6 casas (alinhamento SAP),
    // então a invariância de escala vale até ~9 casas.
    expect(tres.mbPct).toBeCloseTo(base.mbPct, 8);
  });

  it("soma vários itens e acompanha a alteração de um deles", () => {
    const doisItens = (valorSegundo: number) =>
      calc(
        estado({
          itens: [
            { key: "1", produtoId: PRODUTO.id, qtd: 1, valor: precoSugeridoPadrao(PRODUTO.custo), valorManual: false },
            { key: "2", produtoId: PRODUTO_2.id, qtd: 2, valor: valorSegundo, valorManual: true },
          ],
        }),
      );
    const a = doisItens(precoSugeridoPadrao(PRODUTO_2.custo));
    const b = doisItens(precoSugeridoPadrao(PRODUTO_2.custo) + 500);
    expect(a.valorItens).toBeCloseTo(
      precoSugeridoPadrao(PRODUTO.custo) + 2 * precoSugeridoPadrao(PRODUTO_2.custo),
      6,
    );
    expect(b.valorItens - a.valorItens).toBeCloseTo(1000, 6);
    expect(b.rl).toBeGreaterThan(a.rl);
    expect(b.custoTotal).toBeCloseTo(a.custoTotal, 10);
  });

  it("inclui o frete no total da proposta sem alterar o valor dos itens", () => {
    const semFrete = calc(estado());
    const comFrete = calc(estado({ freteMod: "CIF", freteValor: 300 }));
    expect(comFrete.valorItens).toBeCloseTo(semFrete.valorItens, 10);
    expect(comFrete.valorTotalProposta).toBeCloseTo(semFrete.valorTotalProposta + 300, 6);
    // frete vai por fora: não entra na base de ICMS/DIFAL nem na MB
    expect(comFrete.icms).toBeCloseTo(semFrete.icms, 10);
    expect(comFrete.mb).toBeCloseTo(semFrete.mb, 10);

  });

  it("zera totais quando não há itens válidos", () => {
    const vazio = calc(estado({ itens: [] }));
    expect(vazio.valorItens).toBe(0);
    expect(vazio.mb).toBe(0);
    expect(vazio.comValor).toBe(0);
  });
});

describe("Política de margem", () => {
  it("reprova preço abaixo da MB mínima de 33%", () => {
    const d = calc(
      estado({
        itens: [{ key: "1", produtoId: PRODUTO.id, qtd: 1, valor: PRODUTO.custo * 1.05, valorManual: true }],
      }),
    );
    expect(d.mbPct).toBeLessThan(config.politica_mb_min);
    expect(statusMB(d.mbPct, config).level).toBe("bad");
  });

  it("volta a aprovar assim que o valor unitário sobe", () => {
    const d = calc(
      estado({
        itens: [{ key: "1", produtoId: PRODUTO.id, qtd: 1, valor: PRODUTO.custo * 2.2, valorManual: true }],
      }),
    );
    expect(d.mbPct).toBeGreaterThanOrEqual(config.politica_mb_min);
    expect(d.cmvExcedido).toBe(false);
  });
});
