import { describe, it, expect } from "vitest";
import {
  criarPixIOSimulado,
  processarWebhookPix,
  simularWebhookPix,
} from "@/lib/pagamentos-pix.server";

const pedido = () => ({
  id: "p1",
  numero: "050004",
  status: "Aguardando Pagamento",
  pagamento_meio: "pix",
  pagamento_status: "pendente",
  pagamento_txid: "2P050004ABC",
  pagamento_e2eid: null,
});

const pago = {
  pix: [{ txid: "2P050004ABC", endToEndId: "E1", valor: "1000.00", horario: "2026-08-18T18:00:00Z" }],
};

describe("webhook Pix — idempotência", () => {
  it("aplica o pagamento na primeira entrega e ignora as reentregas", async () => {
    const { io, rows, escritas, logs } = criarPixIOSimulado([pedido()]);

    const r1 = await processarWebhookPix(pago, io);
    expect(r1.atualizados).toBe(1);
    expect(rows[0].status).toBe("Processando");

    const r2 = await processarWebhookPix(pago, io);
    const r3 = await processarWebhookPix(pago, io);
    expect(r2.atualizados).toBe(0);
    expect(r3.atualizados).toBe(0);
    expect(r2.detalhes?.[0].motivo).toBe("Evento já aplicado.");

    expect(escritas).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(rows[0].status).toBe("Processando");
  });

  it("simulação reporta idempotente com 5 reentregas do mesmo payload", async () => {
    const sim = await simularWebhookPix(pago, [pedido()], 5);
    expect(sim.repeticoes).toBe(5);
    expect(sim.escritas).toBe(1);
    expect(sim.idempotente).toBe(true);
    expect(sim.rodadas[0].escritasNaRodada).toBe(1);
    expect(sim.rodadas.slice(1).every((r) => r.escritasNaRodada === 0)).toBe(true);
    expect(sim.estadoFinal[0]).toMatchObject({ status: "Processando", pagamento_status: "pago" });
  });

  it("nada é gravado no banco durante a simulação (cópia em memória)", async () => {
    const original = pedido();
    await simularWebhookPix(pago, [original], 3);
    expect(original.status).toBe("Aguardando Pagamento");
    expect(original.pagamento_status).toBe("pendente");
  });

  it("expiração repetida não altera o status do pedido mais de uma vez", async () => {
    const expirado = { cob: { txid: "2P050004ABC", status: "EXPIRADA", valor: { original: "1000.00" } } };
    const sim = await simularWebhookPix(expirado, [pedido()], 4);
    expect(sim.escritas).toBe(1);
    expect(sim.idempotente).toBe(true);
    expect(sim.estadoFinal[0]).toMatchObject({ status: "Aguardando Pagamento", pagamento_status: "expirado" });
  });

  it("cancelamento repetido cancela uma única vez", async () => {
    const cancel = { txid: "2P050004ABC", status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" };
    const sim = await simularWebhookPix(cancel, [pedido()], 3);
    expect(sim.escritas).toBe(1);
    expect(sim.estadoFinal[0].status).toBe("Cancelado");
  });

  it("pedido já pago não é sobrescrito por outro e2e do mesmo txid", async () => {
    const base = { ...pedido(), status: "Processando", pagamento_status: "pago", pagamento_e2eid: "E1" };
    const { io, escritas } = criarPixIOSimulado([base]);
    const r = await processarWebhookPix(
      { pix: [{ txid: "2P050004ABC", endToEndId: "E2", valor: "1000.00" }] },
      io,
    );
    expect(r.atualizados).toBe(0);
    expect(r.detalhes?.[0].motivo).toBe("Pedido já está pago.");
    expect(escritas).toHaveLength(0);
  });

  it("txid sem pedido correspondente não gera escrita", async () => {
    const sim = await simularWebhookPix({ pix: [{ txid: "2P999999ZZZ" }] }, [pedido()], 3);
    expect(sim.escritas).toBe(0);
    expect(sim.idempotente).toBe(true);
    expect(sim.rodadas[0].resultado.detalhes?.[0].motivo).toBe(
      "Nenhum pedido encontrado para este txid.",
    );
  });
});
