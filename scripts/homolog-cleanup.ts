import { grupo2pRest } from "../src/lib/grupo2p-db.server";
const r = await grupo2pRest("propostas?numero=eq.099999", { method: "DELETE" });
console.log("cleanup:", r.status);
