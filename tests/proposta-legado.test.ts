import { describe, expect, it } from "vitest";
import {
  bloqueiaCobranca,
  bloqueiaReenvioSap,
  ehPlataformaAntiga,
  numeroAnterior,
  pagamentosLegado,
} from "@/lib/proposta-legado";

describe("faixas de numeração", () => {
  it("reconhece proposta importada pela faixa 10001–53059", () => {
    expect(ehPlataformaAntiga({ numero: "53059" })).toBe(true);
    expect(ehPlataformaAntiga({ numero: "10001" })).toBe(true);
    expect(ehPlataformaAntiga({ numero: "60027" })).toBe(false);
  });

  it("reconhece importada pela origem gravada nos totais", () => {
    expect(ehPlataformaAntiga({ numero: "60005", totais: { origem: "plataforma_antiga" } })).toBe(true);
  });

  it("expõe o nº anterior sem zeros à esquerda", () => {
    expect(numeroAnterior({ totais: { numeroAnterior: "050018" } })).toBe("50018");
    expect(numeroAnterior({ totais: {} })).toBe("");
  });
});

describe("proteções das propostas importadas", () => {
  it("bloqueia reenvio de OV e cobrança quando já existe ordem no SAP", () => {
    const p = { numero: "20500", sap_ov_numero: "0000123456" };
    expect(bloqueiaReenvioSap(p)).toBe(true);
    expect(bloqueiaCobranca(p)).toBe(true);
  });

  it("permite retomar orçamento importado sem ordem de venda", () => {
    expect(bloqueiaReenvioSap({ numero: "20500", sap_ov_numero: null })).toBe(false);
  });

  it("não bloqueia proposta nova do portal", () => {
    expect(bloqueiaReenvioSap({ numero: "60027", sap_ov_numero: "0000999" })).toBe(false);
  });
});

describe("histórico de cobranças da plataforma antiga", () => {
  it("lê legado.satelites.pagamentos", () => {
    const p = {
      numero: "20500",
      legado: {
        satelites: {
          pagamentos: [{ descricao: "Boleto 1/2", valor: "1500.5", data: "2024-05-10", status: "Pago", nosso_numero: "12345678" }],
        },
      },
    };
    const [pg] = pagamentosLegado(p);
    expect(pg).toMatchObject({ descricao: "Boleto 1/2", valor: 1500.5, status: "Pago", documento: "12345678" });
  });

  it("retorna lista vazia quando não há histórico", () => {
    expect(pagamentosLegado({ numero: "60027" })).toEqual([]);
  });
});
