import { describe, expect, it } from "vitest";
import {
  CHAVE_PLACEHOLDER,
  UNIDADE_NEGOCIO_ID,
  dataHora,
  deveCriarOferta,
  docPad,
  localidade,
  montarAtualizacaoDocumento,
  montarOfertaCarga,
} from "@/lib/fretefy-oferta";

const agora = new Date("2026-08-20T12:00:00.000Z");

const ctx = {
  numero: "050010",
  nomeProjeto: "80kw",
  sapOvNumero: "0000123456",
  clienteNome: "ELETROTYME",
  clienteDoc: "22.147.863/0001-29",
  entrega: {
    logradouro: "AVENIDA DOS HOLANDESES",
    numero: "9",
    complemento: "QUADRA37 LOJA 09",
    cidade: "SAO LUIS",
    uf: "MA",
  },
  pesoTotal: 1250.5,
  valorCarga: 69250,
  freteValor: 3030.33,
  transportadoraId: "377b66a9-1115-446e-9ea9-cf9e932a1be6",
  agora,
};

describe("oferta de carga Fretefy", () => {
  it("só cria oferta para frete da 2P", () => {
    expect(deveCriarOferta("CIF")).toBe(true);
    expect(deveCriarOferta("dedicado")).toBe(true);
    expect(deveCriarOferta("FOB")).toBe(false);
    expect(deveCriarOferta(null)).toBe(false);
  });

  it("normaliza documento e localidade", () => {
    expect(docPad("22.147.863/0001-29")).toBe("22147863000129");
    expect(docPad("1234567890")).toBe("01234567890");
    expect(localidade(ctx.entrega)).toBe("AVENIDA DOS HOLANDESES, 9 QUADRA37 LOJA 09");
    expect(dataHora(new Date(2026, 7, 20, 9, 5, 3))).toBe("2026-08-20 09:05:03");
  });

  it("monta o payload de criação conforme o contrato da plataforma antiga", () => {
    const p = montarOfertaCarga(ctx) as any;
    expect(p.unidadeNegocioId).toBe(UNIDADE_NEGOCIO_ID);
    expect(p.origem.empresa.documento).toBe(37241071000277);
    expect(p.destino.empresa.documento).toBe("22147863000129");
    expect(p.destino.documentos[0].chave).toBe(CHAVE_PLACEHOLDER);
    expect(p.destino.documentos[0].chave.length).toBe(43);
    expect(p.destino.documentos[0].pedido).toBe("050010");
    expect(p.destino.observacao).toContain("Pedido: 050010 Plataforma - SAP 0000123456 - 80kw");
    expect(p.carga.pedidoEmbarcador).toBe("0000123456 - 80kw");
    expect(p.carga.pesoBruto).toBe(1250.5);
    expect(p.pagamento.valorFrete).toBe(3030.33);
    expect(p.direcionamentos).toEqual([ctx.transportadoraId]);
    expect(p.visibilidade).toBe(2);
    expect(p.caracteristicaId).toBeUndefined();
    // Coleta é agendada para 2 dias após a criação.
    expect(p.origem.dhInicio.slice(0, 10)).toBe(
      dataHora(new Date(agora.getTime() + 2 * 86400000)).slice(0, 10),
    );
  });

  it("monta a atualização de documento com a NF real", () => {
    const p = montarAtualizacaoDocumento({
      destinoId: "dest-1",
      documentoId: "doc-1",
      entrega: ctx.entrega,
      clienteNome: ctx.clienteNome,
      clienteDoc: ctx.clienteDoc,
      sapOvNumero: ctx.sapOvNumero,
      nfChave: "4".repeat(44),
      nfSerie: "001",
      nfNumero: "000123456",
      dhEmissao: "2026-08-20T12:00:00.000Z",
      pesoTotal: 1250.5,
      quantidade: 3,
      valorTotal: 72280.33,
      agora,
    }) as any;
    expect(p.destino.id).toBe("dest-1");
    expect(p.destino.documentos[0].id).toBe("doc-1");
    expect(p.destino.documentos[0].numero).toBe("000123456");
    expect(p.destino.documentos[0].pedido).toBe("0000123456");
    expect(p.destino.documentos[0].quantidade).toBe(3);
    expect(p.destino.empresa.razaoSocial).toBe("2P ACESSÓRIOS LTDA.");
  });
});
