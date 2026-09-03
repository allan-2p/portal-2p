/**
 * Contribuinte de ICMS = IE HABILITADA. IE ausente, baixada ou suspensa deixa
 * o parceiro como NÃO contribuinte (ZC2P / ICMSTAXPAY 09) — a inferência
 * antiga por "tem IE" fazia a NF divergir de valor no SAP.
 */
import { describe, expect, it } from "vitest";
import { contribuinteDeEnrich, temDecisaoFiscal } from "@/lib/contribuinte";

describe("contribuinteDeEnrich", () => {
  it("IE habilitada ⇒ contribuinte", () => {
    expect(contribuinteDeEnrich({ ie: "123", ie_habilitada: true })).toBe(true);
  });

  it("IE presente mas baixada ⇒ não contribuinte", () => {
    expect(contribuinteDeEnrich({ ie: "123", ie_situacao: "Baixada", ie_habilitada: false })).toBe(false);
  });

  it("sem IE ⇒ não contribuinte", () => {
    expect(contribuinteDeEnrich({ ie: null, ie_habilitada: false })).toBe(false);
  });

  it("CPF nunca é contribuinte", () => {
    expect(contribuinteDeEnrich({ doc: "476.232.618-60", ie: "123", ie_habilitada: true })).toBe(false);
  });

  it("registro antigo cai para a situação textual da IE", () => {
    expect(contribuinteDeEnrich({ ie: "123", ie_situacao: "Habilitada" })).toBe(true);
    expect(contribuinteDeEnrich({ ie: "123", ie_situacao: "Suspensa" })).toBe(false);
  });

  it("legado puro (só IE) ainda lê como contribuinte, mas sem decisão fiscal", () => {
    expect(contribuinteDeEnrich({ ie: "123" })).toBe(true);
    expect(temDecisaoFiscal({ ie: "123" })).toBe(false);
    expect(temDecisaoFiscal({ ie: "123", ie_habilitada: false })).toBe(true);
  });

  it("IE isenta ⇒ não contribuinte", () => {
    expect(contribuinteDeEnrich({ ie: "ISENTO" })).toBe(false);
  });
});
