import { createFileRoute } from "@tanstack/react-router";

const BODY = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:urn="urn:sap-com:document:sap:soap:functions:mc-style">
  <soap:Header/>
  <soap:Body>
    <urn:_-prcitnfe_-nfeOvMaterial>
      <i_t_param>
        <item><Atributo>VK12</Atributo><Valor>2P-0001</Valor></item>
        <item><Atributo>VK12</Atributo><Valor>2P-0002</Valor></item>
      </i_t_param>
    </urn:_-prcitnfe_-nfeOvMaterial>
  </soap:Body>
</soap:Envelope>`;

export const Route = createFileRoute("/api/public/sap-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (new URL(request.url).searchParams.get("k") !== "sapdbg") {
          return new Response("no", { status: 404 });
        }
        const url = process.env["SAP_BRIDGE_URL"]!;
        const auth = process.env["SAP_BRIDGE_AUTH"]!;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/soap+xml; charset=utf-8",
            accept: "application/soap+xml, text/xml, */*",
            authorization: auth,
          },
          body: BODY,
        });
        const xml = await res.text();
        return Response.json({ status: res.status, len: xml.length, head: xml.slice(0, 500) });
      },
    },
  },
});
