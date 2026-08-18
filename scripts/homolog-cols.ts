import { grupo2pRest } from "../src/lib/grupo2p-db.server";
const r = await grupo2pRest("propostas?select=id,numero,status,pagamento_meio,pagamento_txid,pagamento_status,pago_em&limit=1");
console.log(r.status, r.text.slice(0, 400));
