import { describe, expect, it } from "vitest";
import { proximoStatus, selecionarFilaRotativa } from "@/lib/sap-nfs.server";
import { transicaoPermitida } from "@/lib/proposta-status";
import { motivosPerdaPara, podeDarPerda, validarObsPerda } from "@/lib/perda-motivos";
import { faseDaProposta } from "@/lib/salesforce-stage";
import { cotasFilaSalesforce } from "@/lib/salesforce-fila.server";

describe("fila rotativa do cron SAP", () => {
  it("alcança todas as linhas quando o backlog supera o limite", () => {
    const rows = Array.from({ length: 123 }, (_, i) => i);
    const vistos = new Set<number>();
    for (let rodada = 0; rodada < 123; rodada++) {
      selecionarFilaRotativa(rows, 50, rodada).forEach((id) => vistos.add(id));
    }
    expect(vistos.size).toBe(123);
  });
});

describe("prioridade da fila Salesforce", () => {
  it("separa pedidos novos do backfill histórico", () => {
    // Pedidos criados hoje têm faixa própria: sem isso ficavam atrás de
    // milhares de registros antigos e nunca chegavam ao CRM.
    const c = cotasFilaSalesforce(25);
    expect(c).toEqual({ vinculadas: 13, novas: 9, backfill: 3 });
    expect(c.vinculadas + c.novas + c.backfill).toBe(25);
    expect(cotasFilaSalesforce(1)).toEqual({ vinculadas: 1, novas: 0, backfill: 0 });
    expect(cotasFilaSalesforce(2)).toEqual({ vinculadas: 1, novas: 1, backfill: 0 });
  });
});

describe("máquina de status", () => {
  it("traduz os sinais SAP sem regressão", () => {
    expect(proximoStatus("Processando", { picking: "OK", romaneio: "OK", nfNumero: "123", nfSerie: null, nfChave: null, danfeBase64: null })).toBe("Coletado");
    expect(proximoStatus("Faturado", { picking: "NOK", romaneio: null, nfNumero: null, nfSerie: null, nfChave: null, danfeBase64: null })).toBeNull();
  });

  it("exige o motor correto para cada transição", () => {
    expect(transicaoPermitida("Coletado", "Entregue", "webhook-fretefy")).toBe("webhook-fretefy");
    expect(transicaoPermitida("Coletado", "Entregue", "cron-sap")).toBeNull();
    expect(transicaoPermitida("Aguardando Pagamento", "Processando", "pagamento")).toBe("pagamento");
  });
});
describe("perda de oportunidade", () => {
  it("só permite dar perda em proposta Salvo e ainda não perdida", () => {
    expect(podeDarPerda("Salvo")).toBe(true);
    expect(podeDarPerda("Salvo", true)).toBe(false);
    expect(podeDarPerda("Processando")).toBe(false);
    expect(podeDarPerda("Cancelado")).toBe(false);
  });

  it("esconde o motivo restrito de quem não é administrador", () => {
    expect(motivosPerdaPara(false)).not.toContain("Oportunidade Mecanicamente Perdida");
    expect(motivosPerdaPara(true)).toContain("Oportunidade Mecanicamente Perdida");
  });

  it("exige descrição da perda com pelo menos 8 caracteres", () => {
    expect(() => validarObsPerda("curto")).toThrow();
    expect(validarObsPerda("  cliente   comprou  do concorrente ")).toBe(
      "cliente comprou do concorrente",
    );
  });

  it("a fase vira Oportunidade Perdida quando há motivo de perda", () => {
    expect(faseDaProposta({ status: "Salvo", totais: { projetoVendido: "sim" } })).toBe(
      "Projeto Fechado",
    );
    expect(
      faseDaProposta({ status: "Salvo", motivo_perda: "Sem Retorno", perdida_em: "2026-09-02" }),
    ).toBe("Oportunidade Perdida");
  });
});
