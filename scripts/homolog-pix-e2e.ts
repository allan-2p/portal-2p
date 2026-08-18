const token = process.env["ITAU_PIX_WEBHOOK_SECRET"]!;
const base = "http://localhost:8080/api/public/hooks/pix-itau";
async function call(name: string, body: unknown, method = "POST") {
  const res = await fetch(`${base}?token=${encodeURIComponent(token)}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  console.log(`[${name}] ${res.status} ${(await res.text()).slice(0, 400)}`);
}
await call("GET validacao", null, "GET");
await call("pix pago (txid inexistente)", { pix: [{ txid: "HOMOLOG000000", endToEndId: "E2E-HOMOLOG-1", valor: "10.00" }] });
await call("cob expirada", { cob: { txid: "HOMOLOG000000", status: "EXPIRADA", valor: { original: "10.00" } } });
await call("cob cancelada", { txid: "HOMOLOG000000", status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" });
await call("payload vazio", {});
