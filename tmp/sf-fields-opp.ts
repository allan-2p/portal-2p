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
  const campos = (body.fields as any[])
    .filter((f) => f.custom || ["Amount", "Name", "AccountId", "StageName", "CloseDate", "Description", "OwnerId"].includes(f.name))
    .map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      custom: f.custom,
      createable: f.createable,
      updateable: f.updateable,
      nillable: f.nillable,
      length: f.length,
      precision: f.precision,
      scale: f.scale,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log(JSON.stringify(campos, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
