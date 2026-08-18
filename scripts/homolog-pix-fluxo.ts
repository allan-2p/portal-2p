import { grupo2pRest } from "../src/lib/grupo2p-db.server";
const token = process.env["ITAU_PIX_WEBHOOK_SECRET"]!;
const numero = "099999";
const txid = `2P${numero}HOMOLOG`;
async function post(body: unknown) {
  const res = await fetch(`http://localhost:8080/api/public/hooks/pix-itau?token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return `${res.status} ${(await res.text()).slice(0, 500)}`;
}
async function statusAtual() {
  const r = await grupo2pRest(`propostas?numero=eq.${numero}&select=status`);
  return JSON.parse(r.text || "[]")[0]?.status;
}
console.log("status inicial:", await statusAtual());
console.log("[pago]", await post({ pix: [{ txid, endToEndId: "E2E-HOMOLOG-1", valor: "10.00" }] }));
console.log("status:", await statusAtual());
console.log("[pago repetido/idempotência]", await post({ pix: [{ txid, endToEndId: "E2E-HOMOLOG-1", valor: "10.00" }] }));
console.log("status:", await statusAtual());
console.log("[cancelado]", await post({ txid, status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }));
console.log("status final:", await statusAtual());
