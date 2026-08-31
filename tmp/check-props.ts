import { grupo2pRest } from "@/lib/grupo2p-db.server";

async function contar(org: string) {
  const { ok, status, text, total } = await grupo2pRest(
    `propostas?select=id&organizacao=eq.${org}`,
    { range: { from: 0, to: 0 }, count: true },
  );
  if (!ok) {
    console.log(`${org}: erro ${status} ${text.slice(0, 200)}`);
    return;
  }
  console.log(`${org}: ${total}`);
}

async function main() {
  for (const org of ["solar", "carregadores", "grupo", "station"]) await contar(org);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
