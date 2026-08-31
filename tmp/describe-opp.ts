import { describeObjeto } from "@/lib/salesforce-describe.server";

async function main() {
  const { campos, erro } = await describeObjeto("Opportunity");
  if (erro) {
    console.error("Erro:", erro);
    return;
  }
  const lista = campos
    .filter((c: any) => c.custom || ["Amount", "Name", "AccountId", "StageName", "CloseDate", "Description", "OwnerId"].includes(c.name))
    .map((c: any) => ({
      name: c.name,
      label: c.label,
      type: c.type,
      custom: c.custom,
      length: c.length,
      precision: c.precision,
      scale: c.scale,
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
  console.log(JSON.stringify(lista, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
