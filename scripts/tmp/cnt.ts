import { grupo2pRest } from "../../src/lib/grupo2p-db.server";
const r: any = await grupo2pRest("propostas?select=id&sf_opp_id=not.is.null", { range: { from: 0, to: 0 }, prefer: "count=exact" } as any);
console.log(JSON.stringify(r).slice(0, 400));
