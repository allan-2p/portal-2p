import { describe, expect, it } from "vitest";
import { camposTravados, semCamposTravados, unirCamposTravados } from "@/lib/catalogo-travas";

describe("travas do catálogo", () => {
  it("lê campos travados mesmo sem a coluna", () => {
    expect(camposTravados(null).size).toBe(0);
    expect([...camposTravados({ campos_manuais: ["custo"] })]).toEqual(["custo"]);
  });

  it("acumula edições manuais sem duplicar e ignora campo desconhecido", () => {
    expect(unirCamposTravados(["custo"], ["descricao", "custo", "hackeado"])).toEqual([
      "custo",
      "descricao",
    ]);
  });

  it("remove do payload do SAP o que foi definido à mão", () => {
    const payload = { descricao: "Nome do SAP", custo: 10, tipo: "acessorio" };
    expect(semCamposTravados(payload, { campos_manuais: ["descricao", "custo"] })).toEqual({
      tipo: "acessorio",
    });
    expect(semCamposTravados(payload, {})).toEqual(payload);
  });
});
