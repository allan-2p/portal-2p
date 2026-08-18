import { grupo2pRest } from "../src/lib/grupo2p-db.server";
const r = await grupo2pRest("propostas?select=*&limit=1");
const rows = JSON.parse(r.text || "[]");
console.log(Object.keys(rows[0] ?? {}).join(", "));
console.log("status exemplo:", rows[0]?.status, "| numero:", rows[0]?.numero);
