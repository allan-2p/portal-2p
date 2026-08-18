import { grupo2pRest } from "../src/lib/grupo2p-db.server";
const numero = "099999";
const del = await grupo2pRest(`propostas?numero=eq.${numero}`, { method: "DELETE" });
const r = await grupo2pRest("propostas", {
  method: "POST",
  prefer: "return=representation",
  body: JSON.stringify([{ numero, organizacao: "2P Carregadores", nome: "HOMOLOG PIX", cliente_nome: "CLIENTE HOMOLOG", status: "Aguardando pagamento" }]),
} as any);
console.log("delete:", del.status, "insert:", r.status, r.text.slice(0, 500));
