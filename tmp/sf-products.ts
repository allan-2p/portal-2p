const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"]!;
const SALESFORCE_API_KEY = process.env["SALESFORCE_API_KEY"]!;

async function main() {
  const q = "SELECT Id, Name, ProductCode FROM Product2 WHERE ProductCode != null LIMIT 10";
  const res = await fetch(`${GATEWAY_URL}/query?q=${encodeURIComponent(q)}`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
      Accept: "application/json",
    },
  });
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
