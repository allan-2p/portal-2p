import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { dataExpedicaoSap, lerConsulta, proximoStatus, remessaSap } from "@/lib/sap-nfs.server";

/** Resposta real da RFC ZNFE_OV_CONSULTAR para a OV 17769 (04/09/2026). */
const XML_OV_17769 = `<?xml version="1.0"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope">
  <env:Body>
    <n0:ZNFE_OV_CONSULTARResponse xmlns:n0="urn:sap-com:document:sap:rfc:functions">
      <E_S_DADOS>
        <NROPED/>
        <VBELN_VA>0000017769</VBELN_VA>
        <VBELN_VL>0080015549</VBELN_VL>
        <VBELN_VF/>
        <DOCNUM>0000000000</DOCNUM>
        <CHNFE/>
        <STATUS_ROMANEIO>NOK</STATUS_ROMANEIO>
        <DATA_EXPEDICAO>04.09.2026</DATA_EXPEDICAO>
        <STATUS_PICKING>AOK</STATUS_PICKING>
      </E_S_DADOS>
    </n0:ZNFE_OV_CONSULTARResponse>
  </env:Body>
</env:Envelope>`;

function parse(xml: string) {
  return new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false }).parse(xml);
}

describe("ZNFE_OV_CONSULTAR — remessa e expedição", () => {
  it("lê a OV 17769 com remessa e data de expedição no formato SAP", () => {
    const c = lerConsulta(parse(XML_OV_17769));
    expect(c.remessa).toBe("80015549");
    expect(c.dataExpedicao).toBe("2026-09-04");
    expect(c.nfNumero).toBeNull();
    expect(proximoStatus("Aguardando Pagamento", c)).toBe("Separação");
  });

  it("aceita DD.MM.AAAA, DD/MM/AAAA e ISO; rejeita zerados", () => {
    expect(dataExpedicaoSap("04.09.2026")).toBe("2026-09-04");
    expect(dataExpedicaoSap("04/09/2026")).toBe("2026-09-04");
    expect(dataExpedicaoSap("2026-09-04")).toBe("2026-09-04");
    expect(dataExpedicaoSap("0000-00-00")).toBeNull();
    expect(dataExpedicaoSap("00.00.0000")).toBeNull();
    expect(dataExpedicaoSap("")).toBeNull();
  });

  it("STATUS_REMESSA só vale quando verde e nunca sobrepõe VBELN_VL", () => {
    expect(remessaSap({ VBELN_VL: "0000000000", STATUS_REMESSA: "NOK" })).toBeNull();
    expect(remessaSap({ VBELN_VL: "", STATUS_REMESSA: "OK" })).toBe("OK");
    expect(remessaSap({ VBELN_VL: "0080015549", STATUS_REMESSA: "NOK" })).toBe("80015549");
    expect(remessaSap({ NUM_REMESSA: "0080015550" })).toBe("80015550");
  });

  it("sem remessa e sem expedição o pedido não avança para Separação", () => {
    const c = lerConsulta(
      parse(
        XML_OV_17769.replace("<VBELN_VL>0080015549</VBELN_VL>", "<VBELN_VL/>")
          .replace("<DATA_EXPEDICAO>04.09.2026</DATA_EXPEDICAO>", "<DATA_EXPEDICAO>00.00.0000</DATA_EXPEDICAO>")
          .replace("<STATUS_PICKING>AOK</STATUS_PICKING>", "<STATUS_PICKING>NOK</STATUS_PICKING>"),
      ),
    );
    expect(c.remessa).toBeNull();
    expect(c.dataExpedicao).toBeNull();
    expect(proximoStatus("Aguardando Pagamento", c)).toBe("Processando");
  });
});
