import { describe, expect, it } from "vitest";
import { camposSapCliente, validarParaSap } from "../src/lib/sap-clientes-map";

const base = {
  razao_social: "Joao Carlos da Silva Souza",
  logradouro: "Rua A",
  numero: "10",
  bairro: "Centro",
  cidade: "Florianópolis",
  uf: "SC",
  cep: "88000000",
  vendedor_sap: "1000004165",
  tabela_preco: "2P-0003",
  cliente_final: true as const,
};

describe("cadastro do cliente final no SAP", () => {
  it("CPF: CFOPC 06, ICMSTAXPAY 09 e nome em 1º nome + restante", () => {
    const c = camposSapCliente({ ...base, doc: "12345678901", contribuinte: false });
    expect(c.CFOPC).toBe("06");
    expect(c.ICMSTAXPAY).toBe("09");
    expect(c.NAMES).toEqual(["Joao", "Carlos da Silva Souza"]);
    expect(c.ATUALIZAR).toBe("");
  });

  it("CNPJ com IE: CFOPC 90 e ICMSTAXPAY 01", () => {
    const c = camposSapCliente({
      ...base,
      doc: "12345678000199",
      contribuinte: true,
      ie: "123456789",
    });
    expect(c.CFOPC).toBe("90");
    expect(c.ICMSTAXPAY).toBe("01");
  });

  it("CNPJ sem IE: ISENTO e ICMSTAXPAY 09", () => {
    const c = camposSapCliente({ ...base, doc: "12345678000199", contribuinte: false });
    expect(c.CFOPC).toBe("90");
    expect(c.IE).toBe("ISENTO");
    expect(c.ICMSTAXPAY).toBe("09");
  });

  it("a finalidade de uso não altera o CFOPC do cliente final", () => {
    const rev = camposSapCliente({ ...base, doc: "12345678000199", contribuinte: true, ie: "1", finalidade: "Revenda" });
    const ind = camposSapCliente({ ...base, doc: "12345678000199", contribuinte: true, ie: "1", finalidade: "Industrialização" });
    expect(rev.CFOPC).toBe("90");
    expect(ind.CFOPC).toBe("90");
    expect(ind.IND_SECTOR).toBe("");
  });

  it("reenvio usa ATUALIZAR=X + CODCLI e envia o vínculo do integrador", () => {
    const c = camposSapCliente({
      ...base,
      doc: "12345678901",
      contribuinte: false,
      numero_sap: "0000123456",
      integrador_sap: "0000999888",
      condicao_pgto_sap: "2P30",
    });
    expect(c.ATUALIZAR).toBe("X");
    expect(c.CODCLI).toBe("0000123456");
    expect(c.INTEGRADOR).toBe("0000999888");
    expect(c.ZTERM).toBe("2P30");
    expect(c.PLTYP).toBe("03");
  });

  it("cliente final não exige finalidade de uso na validação", () => {
    expect(validarParaSap({ ...base, doc: "12345678901", contribuinte: false })).toEqual([]);
  });
});
