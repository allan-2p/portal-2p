const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"]!;
const SALESFORCE_API_KEY = process.env["SALESFORCE_API_KEY"]!;

const CAMPOS = [
  "Feito_atrav_s_de__c",
  "Projeto_Vendido__c",
  "Tabela_de_Preco__c",
  "StageName",
];

async function main() {
  const res = await fetch(`${GATEWAY_URL}/sobjects/Opportunity/describe`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
      Accept: "application/json",
    },
  });
  const body = await res.json();
  if (!res.ok) {
    console.error("Erro:", res.status, JSON.stringify(body, null, 2));
    return;
  }
  const campos = (body.fields as any[]).filter((f) => CAMPOS.includes(f.name));
  for (const f of campos) {
    console.log(`\n=== ${f.name} (${f.label}, ${f.type}) ===`);
    if (f.picklistValues) {
      for (const p of f.picklistValues.filter((p: any) => p.active !== false)) {
        console.log(`  - ${p.value}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
