import { describe, it, expect } from "vitest";
import { normalizarEventosPix } from "@/lib/pagamentos-pix.server";

describe("webhook Pix — normalização", () => {
  it("pix recebido vira evento pago", () => {
    const ev = normalizarEventosPix({ pix: [{ txid: "2P050004ABC", endToEndId: "E1", valor: "73750.00", horario: "2026-08-18T18:00:00Z" }] });
    expect(ev).toHaveLength(1);
    expect(ev[0].tipo).toBe("pago");
    expect(ev[0].valor).toBe(73750);
  });
  it("devolução vira cancelado", () => {
    const ev = normalizarEventosPix({ pix: [{ txid: "T1", devolucoes: [{ status: "DEVOLVIDO" }] }] });
    expect(ev[0].tipo).toBe("cancelado");
  });
  it("cob EXPIRADA vira expirado", () => {
    const ev = normalizarEventosPix({ cob: { txid: "T2", status: "EXPIRADA", valor: { original: "100.00" } } });
    expect(ev[0]).toMatchObject({ tipo: "expirado", txid: "T2", valor: 100 });
  });
  it("cob REMOVIDA_PELO_USUARIO_RECEBEDOR vira cancelado", () => {
    expect(normalizarEventosPix({ txid: "T3", status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" })[0].tipo).toBe("cancelado");
  });
  it("status desconhecido não gera ação", () => {
    expect(normalizarEventosPix({ txid: "T4", status: "ATIVA" })[0].tipo).toBe("desconhecido");
  });
  it("payload vazio não gera eventos", () => {
    expect(normalizarEventosPix({})).toHaveLength(0);
  });
});
