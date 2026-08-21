import { describe, expect, it } from "vitest";
import { classificarEventoFretefy, interpretarEventoFretefy } from "@/lib/fretefy-tracking";

describe("classificarEventoFretefy", () => {
  it("reconhece entrega concluída", () => {
    expect(classificarEventoFretefy("ENTREGUE")).toBe("entregue");
    expect(classificarEventoFretefy("Delivered")).toBe("entregue");
    expect(classificarEventoFretefy("Comprovante de entrega recebido")).toBe("entregue");
  });

  it("não confunde insucesso de entrega com entrega", () => {
    expect(classificarEventoFretefy("Não entregue - cliente ausente")).toBe("ocorrencia");
    expect(classificarEventoFretefy("Tentativa de entrega sem sucesso")).toBe("ocorrencia");
  });

  it("reconhece coleta e trânsito", () => {
    expect(classificarEventoFretefy("Coleta realizada")).toBe("coletado");
    expect(classificarEventoFretefy("Em trânsito")).toBe("em_transito");
    expect(classificarEventoFretefy("Saiu para entrega")).toBe("em_transito");
  });

  it("devolve desconhecido para textos sem sentido logístico", () => {
    expect(classificarEventoFretefy("")).toBe("desconhecido");
    expect(classificarEventoFretefy("xpto")).toBe("desconhecido");
  });
});

describe("interpretarEventoFretefy", () => {
  it("lê o formato plano", () => {
    const ev = interpretarEventoFretefy({
      pedido: "050010",
      status: "ENTREGUE",
      dataEntrega: "2026-08-20T18:30:00.000Z",
      idEvento: "abc",
    });
    expect(ev).toMatchObject({ pedido: "050010", tipo: "entregue", eventoId: "abc" });
    expect(ev.ocorridoEm).toBe("2026-08-20T18:30:00.000Z");
  });

  it("lê payload aninhado", () => {
    const ev = interpretarEventoFretefy({
      tracking: { numero: "050011", ocorrencia: "Coleta realizada", data: "2026-08-19 10:00:00" },
    });
    expect(ev.pedido).toBe("050011");
    expect(ev.tipo).toBe("coletado");
  });

  it("sem número de pedido devolve nulo", () => {
    expect(interpretarEventoFretefy({ status: "ENTREGUE" }).pedido).toBeNull();
  });

  it("data inválida não vira lixo", () => {
    expect(interpretarEventoFretefy({ pedido: "1", status: "entregue", data: "nao-e-data" }).ocorridoEm).toBeNull();
  });
});
