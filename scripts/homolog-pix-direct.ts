import { normalizarEventosPix, aplicarEventoPix } from "../src/lib/pagamentos-pix.server";
const [ev] = normalizarEventosPix({ pix: [{ txid: "HOMOLOG000000", endToEndId: "E1", valor: "10.00" }] });
try {
  console.log(JSON.stringify(await aplicarEventoPix(ev!), null, 2));
} catch (e) {
  console.log("ERRO:", (e as Error).name, (e as Error).message);
  console.log((e as Error).stack?.split("\n").slice(0, 6).join("\n"));
}
