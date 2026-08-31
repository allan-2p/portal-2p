const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"]!;
const SALESFORCE_API_KEY = process.env["SALESFORCE_API_KEY"]!;

async function main() {
  const q = "SELECT Id, Name, IsActive FROM Pricebook2 LIMIT 10";
  const res = await fetch(`${GATEWAY_URL}/query?q=${encodeURIComponent(q)}`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
      Accept: "application/json",
    },
  });
  const body = await res.json();
  console.log("Pricebooks:", JSON.stringify(body, null, 2));

  const q2 = "SELECT Id, Pricebook2Id, Product2Id, UnitPrice, ProductCode FROM PricebookEntry WHERE ProductCode = '200000684' LIMIT 5";
  const res2 = await fetch(`${GATEWAY_URL}/query?q=${encodeURIComponent(q2)}`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
      Accept: "application/json",
    },
  });
  const body2 = await res2.json();
  console.log("PricebookEntry para 200000684:", JSON.stringify(body2, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
