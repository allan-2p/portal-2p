import { describe, it, expect } from "vitest";
import {
  criarPixIOSimulado,
  processarWebhookPix,
  simularWebhookPix,
  type PropostaLike,
} from "@/lib/pagamentos-pix.server";

const pedido = (over: Partial<PropostaLike> = {}): PropostaLike => ({
  id: "p1",
  numero: "050004",
  status: "Aguardando Pagamento",
  pagamento_meio: "pix",
  pagamento_status: "pendente",
  pagamento_txid: "2P050004ABC",
  pagamento_e2eid: null,
  ...over,
});

const pagoPayload = (txid = "2P050004ABC", e2e = "E1") => ({
  pix: [{ txid, endToEndId: e2e, valor: "1000.00", horario: "2026-08-18T18:00:00Z" }],
});

describe("Pix — idempotência completa (status e logs)", () => {
  it("10 reentregas do mesmo evento geram exatamente 1 escrita e 1 log", async () => {
    const { io, rows, escritas, logs } = criarPixIOSimulado([pedido()]);
    for (let i = 0; i < 10; i++) await processarWebhookPix(pagoPayload(), io);
    expect(escritas).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(rows[0].status).toBe("Processando");
    expect(rows[0].pagamento_status).toBe("pago");
  });

  it("payload com o mesmo evento duplicado internamente só aplica uma vez", async () => {
    const { io, escritas, logs } = criarPixIOSimulado([pedido()]);
    const r = await processarWebhookPix(
      {
        pix: [
          { txid: "2P050004ABC", endToEndId: "E1", valor: "1000.00" },
          { txid: "2P050004ABC", endToEndId: "E1", valor: "1000.00" },
          { txid: "2P050004ABC", endToEndId: "E1", valor: "1000.00" },
        ],
      },
      io,
    );
    expect(r.recebidos).toBe(3);
    expect(r.atualizados).toBe(1);
    expect(escritas).toHaveLength(1);
    expect(logs).toHaveLength(1);
  });

  it("reentrega tardia de 'expirada' após o pagamento não reverte o status", async () => {
    const { io, rows, escritas, logs } = criarPixIOSimulado([pedido()]);
    await processarWebhookPix(pagoPayload(), io);
    const expirada = { cob: { txid: "2P050004ABC", status: "EXPIRADA", valor: { original: "1000.00" } } };
    for (let i = 0; i < 3; i++) {
      const r = await processarWebhookPix(expirada, io);
      expect(r.atualizados).toBe(0);
      expect(r.detalhes?.[0].motivo).toBe("Pedido já está pago.");
    }
    expect(rows[0].status).toBe("Processando");
    expect(rows[0].pagamento_status).toBe("pago");
    expect(escritas).toHaveLength(1);
    expect(logs).toHaveLength(1);
  });

  it("reentregas de cancelamento após cancelar não geram novos logs", async () => {
    const cancel = { txid: "2P050004ABC", status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" };
    const { io, rows, escritas, logs } = criarPixIOSimulado([pedido()]);
    for (let i = 0; i < 4; i++) await processarWebhookPix(cancel, io);
    expect(rows[0].status).toBe("Cancelado");
    expect(escritas).toHaveLength(1);
    expect(logs).toHaveLength(1);
  });

  it("payload com vários pedidos aplica um log por pedido e nada nas reentregas", async () => {
    const propostas = [
      pedido(),
      pedido({ id: "p2", numero: "050005", pagamento_txid: "2P050005DEF" }),
    ];
    const { io, rows, escritas, logs } = criarPixIOSimulado(propostas);
    const payload = {
      pix: [
        { txid: "2P050004ABC", endToEndId: "E1", valor: "1000.00" },
        { txid: "2P050005DEF", endToEndId: "E2", valor: "500.00" },
      ],
    };
    const r1 = await processarWebhookPix(payload, io);
    expect(r1.atualizados).toBe(2);
    const r2 = await processarWebhookPix(payload, io);
    expect(r2.atualizados).toBe(0);
    expect(escritas).toHaveLength(2);
    expect(logs).toHaveLength(2);
    expect(rows.every((r) => r.status === "Processando")).toBe(true);
  });

  it("status já 'Processando' com pagamento pendente aplica uma vez e mantém o status", async () => {
    const { io, rows, escritas } = criarPixIOSimulado([
      pedido({ status: "Processando" }),
    ]);
    await processarWebhookPix(pagoPayload(), io);
    await processarWebhookPix(pagoPayload(), io);
    expect(escritas).toHaveLength(1);
    expect(rows[0].status).toBe("Processando");
  });

  it("evento desconhecido repetido nunca escreve nem registra log", async () => {
    const { io, escritas, logs } = criarPixIOSimulado([pedido()]);
    for (let i = 0; i < 3; i++) {
      const r = await processarWebhookPix({ txid: "2P050004ABC", status: "ATIVA" }, io);
      expect(r.atualizados).toBe(0);
    }
    expect(escritas).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("simulação de 20 rodadas mantém 1 escrita e 1 log", async () => {
    const sim = await simularWebhookPix(pagoPayload(), [pedido()], 20);
    expect(sim.repeticoes).toBe(20);
    expect(sim.escritas).toBe(1);
    expect(sim.logs).toBe(1);
    expect(sim.idempotente).toBe(true);
  });

  it("pedido localizado pelo nº embutido no txid também é idempotente", async () => {
    const { io, rows, escritas, logs } = criarPixIOSimulado([
      pedido({ pagamento_txid: null }),
    ]);
    await processarWebhookPix(pagoPayload("2P050004XYZ", "E9"), io);
    await processarWebhookPix(pagoPayload("2P050004XYZ", "E9"), io);
    expect(escritas).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(rows[0].pagamento_txid).toBe("2P050004XYZ");
  });
});
