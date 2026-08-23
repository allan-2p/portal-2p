/**
 * Precificação quando a NF sai contra o cliente final.
 *
 * A simulação de preço precisa usar o documento e o TP_OV do parceiro FATURADO
 * (cliente final), porque os impostos mudam — foi o que causou a divergência do
 * pedido #050024 (portal 1.290,11 × SAP 1.404,01). A tabela de preço (PLTYP)
 * continua sendo a do cliente da proposta (integrador).
 */
import { describe, expect, it } from "vitest";
import { contribuinteDoFaturamento, documentoDaSimulacao, tpOvDoPedido } from "@/lib/sap-tp-ov";

const integrador = "12400169000118"; // MACROPORT, contribuinte
const clienteFinal = "48611580000180"; // MITTMIND, CNPJ sem IE

describe("documento da simulação de preço", () => {
  it("sem cliente final, usa o documento do cliente da proposta", () => {
    expect(
      documentoDaSimulacao({ faturarClienteFinal: false, faturamento: { doc: clienteFinal }, clienteDoc: integrador }),
    ).toBe(integrador);
  });

  it("com cliente final, usa o documento do faturamento", () => {
    expect(
      documentoDaSimulacao({ faturarClienteFinal: true, faturamento: { doc: "48.611.580/0001-80" }, clienteDoc: integrador }),
    ).toBe(clienteFinal);
  });

  it("cliente final com documento incompleto não troca o documento", () => {
    expect(
      documentoDaSimulacao({ faturarClienteFinal: true, faturamento: { doc: "486115" }, clienteDoc: integrador }),
    ).toBe(integrador);
  });
});

describe("TP_OV da simulação segue o parceiro faturado", () => {
  const tp = (input: Parameters<typeof contribuinteDoFaturamento>[0]) =>
    tpOvDoPedido("venda", contribuinteDoFaturamento(input));

  it("integrador contribuinte → ZV2P", () => {
    expect(tp({ contribuinte: true, faturarClienteFinal: false, clienteDoc: integrador })).toBe("ZV2P");
  });

  it("cliente final CNPJ sem IE → ZC2P", () => {
    expect(
      tp({
        contribuinte: true,
        faturarClienteFinal: true,
        faturamento: { doc: clienteFinal, contribuinte: false },
        clienteDoc: integrador,
      }),
    ).toBe("ZC2P");
  });

  it("cliente final CPF → sempre ZC2P", () => {
    expect(
      tp({
        contribuinte: true,
        faturarClienteFinal: true,
        faturamento: { doc: "476.232.618-60", contribuinte: true },
        clienteDoc: integrador,
      }),
    ).toBe("ZC2P");
  });

  it("bonificação sobrescreve tudo", () => {
    expect(tpOvDoPedido("bonificacao", true)).toBe("VBON");
  });
});
