import { grupo2pRest } from "@/lib/grupo2p-db.server";
const r = await grupo2pRest("solar", "/propostas?numero=eq.050019&select=id,numero,sap_ov_status,sap_ov_numero,sap_ov_mensagem");
console.log(JSON.stringify(r).slice(0,1500));
