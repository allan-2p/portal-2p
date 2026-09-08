import { describe, expect, it } from "vitest";
import { normalizarFaturamentoSolar } from "@/lib/propostas-solar.functions";

describe("persistência SUFRAMA no faturamento Solar", () => {
  it("preserva a inscrição e a situação consultadas ao salvar", () => {
    const faturamento = normalizarFaturamentoSolar({
      doc: "02.985.578/0001-70",
      nome: "Cliente final",
      suframa: "201110539",
      suframa_situacao: "Ativa",
      ie_habilitada: true,
      contribuinte: true,
    });

    expect(faturamento).toMatchObject({
      doc: "02.985.578/0001-70",
      suframa: "201110539",
      suframa_situacao: "Ativa",
      ie_habilitada: true,
      contribuinte: true,
    });
  });
});