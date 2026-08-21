/**
 * Faturamento direto ao cliente final com CPF.
 *
 * O cliente final CPF não tem cadastro no portal: a finalidade de uso vem da
 * tela e é ela que define CFOP/IE/ICMSTAXPAY no cadastro enviado ao SAP.
 * Estes testes travam esse contrato (slug da tela → rótulo canônico → campos
 * fiscais) para que a validação e o payload continuem corretos.
 */
import { describe, expect, it } from "vitest";
import {
  camposSapCliente,
  normalizarFinalidade,
  validarParaSap,
  type ClienteSapInput,
} from "@/lib/sap-clientes-map";
import { finalidadeUsoDoCadastro, labelFinalidadeUso } from "@/lib/carregadores";

const clienteFinalCpf = (over: Partial<ClienteSapInput> = {}): ClienteSapInput => ({
  doc: "476.232.618-60",
  razao_social: "ALLAN RICHA",
  contribuinte: false,
  finalidade: "Uso e Consumo",
  tabela_preco: "2P-0001",
  cep: "15042-085",
  logradouro: "RUA ROGEIRO SIVA",
  numero: "212",
  complemento: "CASA",
  bairro: "AORIREA 1",
  cidade: "ATIBAIA",
  uf: "SP",
  telefone: "17955555555",
  escopo_org: "solar",
  ...over,
});

describe("finalidade escolhida na tela", () => {
  it("aceita o slug do formulário e devolve o rótulo canônico", () => {
    expect(normalizarFinalidade("uso_consumo")).toBe("Uso e Consumo");
    expect(normalizarFinalidade("industrializacao")).toBe("Industrialização");
    expect(normalizarFinalidade("revenda")).toBe("Revenda");
  });

  it("aceita o rótulo já normalizado (ida e volta tela ↔ SAP)", () => {
    for (const slug of ["uso_consumo", "revenda", "industrializacao"] as const) {
      const label = labelFinalidadeUso[slug];
      expect(finalidadeUsoDoCadastro(normalizarFinalidade(label))).toBe(slug);
    }
  });

  it("exige a finalidade antes do envio ao SAP", () => {
    expect(validarParaSap(clienteFinalCpf({ finalidade: "" }))).toContain("Finalidade de uso");
    expect(validarParaSap(clienteFinalCpf())).not.toContain("Finalidade de uso");
    expect(validarParaSap(clienteFinalCpf({ finalidade: "uso_consumo" }))).not.toContain(
      "Finalidade de uso",
    );
  });
});

describe("campos fiscais do cliente final CPF (não contribuinte)", () => {
  it("envia CPF, IE ISENTO, CFOP 6 e ICMSTAXPAY 09", () => {
    const c = camposSapCliente(clienteFinalCpf({ finalidade: "uso_consumo" }));
    expect(c.CPF).toBe("47623261860");
    expect(c.CNPJ).toBe("");
    expect(c.IE).toBe("ISENTO");
    expect(c.CFOPC).toBe("6");
    expect(c.ICMSTAXPAY).toBe("09");
  });

  it("não contribuinte mantém CFOP 6 qualquer que seja a finalidade", () => {
    for (const f of ["revenda", "industrializacao", "uso_consumo"]) {
      const c = camposSapCliente(clienteFinalCpf({ finalidade: f }));
      expect(c.CFOPC).toBe("6");
      expect(c.ICMSTAXPAY).toBe("09");
    }
  });

  it("copia o endereço da tela e a organização de vendas do solar", () => {
    const c = camposSapCliente(clienteFinalCpf());
    expect(c.CEP).toBe("15042085");
    expect(c.CIDADE).toBe("ATIBAIA");
    expect(c.UF).toBe("SP");
    expect(c.KONDA).toBe("04");
    expect(c.EQUIPE_VENDAS).toBe("001");
    expect(c.ESCRITORIO).toBe("0002");
    expect(c.ATUALIZAR).toBe("");
    expect(c.ZTERM).toBe("2P00");
  });
});

describe("cliente final CNPJ contribuinte — CFOP pela finalidade da tela", () => {
  const cnpj = (finalidade: string) =>
    camposSapCliente(
      clienteFinalCpf({
        doc: "12.345.678/0001-95",
        razao_social: "CLIENTE FINAL LTDA",
        contribuinte: true,
        ie: "123.456.789.111",
        finalidade,
      }),
    );

  it("Revenda → 08, Industrialização → 00, Uso e Consumo → 90", () => {
    expect(cnpj("revenda").CFOPC).toBe("08");
    expect(cnpj("industrializacao").CFOPC).toBe("00");
    expect(cnpj("uso_consumo").CFOPC).toBe("90");
  });

  it("contribuinte mantém IE informada e ICMSTAXPAY 01", () => {
    const c = cnpj("uso_consumo");
    expect(c.IE).toBe("123456789111");
    expect(c.ICMSTAXPAY).toBe("01");
    expect(c.CNPJ).toBe("12345678000195");
    expect(c.CPF).toBe("");
  });

  it("SC + Industrialização usa IND_SECTOR 04", () => {
    const c = camposSapCliente(
      clienteFinalCpf({
        doc: "12345678000195",
        contribuinte: true,
        ie: "111222333",
        uf: "SC",
        finalidade: "industrializacao",
      }),
    );
    expect(c.IND_SECTOR).toBe("04");
    expect(c.KONDA).toBe("04");
  });
});

describe("finalidadeDaTela — nunca assume um default", () => {
  it("recusa vazio/desconhecido em vez de cair em Revenda", async () => {
    const { finalidadeDaTela } = await import("@/lib/sap-clientes-map");
    expect(finalidadeDaTela("")).toBeNull();
    expect(finalidadeDaTela(null)).toBeNull();
    expect(finalidadeDaTela("qualquer coisa")).toBeNull();
    expect(normalizarFinalidade("")).toBe("Revenda"); // contraste: versão tolerante
  });

  it("aceita rótulo e slug da tela", async () => {
    const { finalidadeDaTela } = await import("@/lib/sap-clientes-map");
    expect(finalidadeDaTela("uso_consumo")).toBe("Uso e Consumo");
    expect(finalidadeDaTela("Uso e Consumo")).toBe("Uso e Consumo");
    expect(finalidadeDaTela("industrializacao")).toBe("Industrialização");
  });
});
