import { describe, expect, it } from "vitest";
import { proximoStatus, selecionarFilaRotativa } from "@/lib/sap-nfs.server";
import { transicaoPermitida } from "@/lib/proposta-status";

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