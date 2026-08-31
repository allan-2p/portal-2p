const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"]!;
const SALESFORCE_API_KEY = process.env["SALESFORCE_API_KEY"]!;

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
  const termos = ["criou", "finalizou", "criado", "finalizado", "criador", "finalizador", "vendedor", "consultor", "responsavel"];
  const campos = (body.fields as any[]).filter((f) => {
    const s = `${f.name} ${f.label}`.toLowerCase();
    return termos.some((t) => s.includes(t));
  });
  console.log(JSON.stringify(campos.map((f) => ({ name: f.name, label: f.label, type: f.type, custom: f.custom, createable: f.createable })), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
