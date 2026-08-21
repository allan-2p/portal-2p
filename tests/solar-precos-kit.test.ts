/**
 * Precificação do Kit Fotovoltaico (Venda em kit = Sim).
 *
 * Regra oficial (calculadora.php:887-894): no kit há isenção de ICMS e IPI, e o
 * preço da linha passa a ser VALOR_LIQUIDO + VL_PIS + VL_COFINS. Fora do kit o
 * preço é VALOR_LIQUIDO + VALOR_IMPOSTO. Quando o SAP não devolve os tributos,
 * o portal nunca pode precificar zerado: cai para o valor cheio e, na ausência
 * total de valor, para o preço sugerido do catálogo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_FAKE = "https://sap.test/znfe_ov_simular";

type Attrs = Record<string, string | number>;

/** Monta uma resposta SOAP do ZNFE_OV_SIMULAR com pares ATRIBUTO/VALOR. */
function envelopeValores(itens: { item: string; attrs: Attrs }[], msgs: { TYPE: string; MESSAGE: string }[] = []) {
  const linhas = itens
    .flatMap(({ item, attrs }) =>
      Object.entries(attrs).map(
        (entry) =>
          `<item><ITM_NUMBER>${item}</ITM_NUMBER><ATRIBUTO>${entry[0]}</ATRIBUTO><VALOR>${entry[1]}</VALOR></item>`,
      ),
    )
    .join("");
  const msgXml = msgs
    .map((m) => `<item><TYPE>${m.TYPE}</TYPE><MESSAGE>${m.MESSAGE}</MESSAGE></item>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <n0:ZNFE_OV_SIMULARResponse xmlns:n0="urn:sap-com:document:sap:soap:functions:mc-style">
      <E_T_VALORES>${linhas}</E_T_VALORES>
      <E_T_MSG>${msgXml}</E_T_MSG>
    </n0:ZNFE_OV_SIMULARResponse>
  </soap:Body>
</soap:Envelope>`;
}

function mockSap(xml: string, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => new Response(xml, { status: ok ? status : status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let precosSolar: typeof import("@/lib/solar-precos.server").precosSolar;
let simularSap: typeof import("@/lib/sap-precos.server").simularSap;

beforeEach(async () => {
  vi.stubEnv("SAP_SIMULAR_URL", URL_FAKE);
  vi.stubEnv("SAP_BRIDGE_AUTH", "Basic dGVzdGU6dGVzdGU=");
  vi.stubEnv("SAP_FILIAIS", "9802");
  vi.resetModules();
  ({ precosSolar } = await import("@/lib/solar-precos.server"));
  ({ simularSap } = await import("@/lib/sap-precos.server"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ITEM_KIT = {
  item: "000010",
  attrs: {
    MATERIAL: "100000350",
    PESO_LIQUIDO: "120",
    VALOR_LIQUIDO: "10000.00",
    VALOR_IMPOSTO: "1500.00",
    VL_PIS: "165.00",
    VL_COFINS: "760.00",
    VL_ICMS: "1200.00",
    VL_IPI: "300.00",
  },
};

describe("simularSap — decomposição dos tributos", () => {
  it("devolve valor cheio e valor sem ICMS/IPI (VALOR_LIQUIDO + PIS + COFINS)", async () => {
    mockSap(envelopeValores([ITEM_KIT]));
    const { valores, erros, motivo } = await simularSap([{ codigo: "100000350", quantidade: 1 }]);
    const reg = valores.get("100000350")!;
    expect(motivo).toBeNull();
    expect(erros).toEqual([]);
    expect(reg.valor).toBe(11500); // 10000 + VALOR_IMPOSTO
    expect(reg.valorSemIcmsIpi).toBe(10925); // 10000 + 165 + 760
    expect(reg.vlIcms).toBe(1200);
    expect(reg.vlIpi).toBe(300);
  });

  it("sem VALOR_LIQUIDO, os dois valores ficam nulos (nunca zero implícito)", async () => {
    mockSap(
      envelopeValores([{ item: "000010", attrs: { MATERIAL: "100000350", PESO_LIQUIDO: "120" } }]),
    );
    const { valores } = await simularSap([{ codigo: "100000350", quantidade: 1 }]);
    const reg = valores.get("100000350")!;
    expect(reg.valor).toBeNull();
    expect(reg.valorSemIcmsIpi).toBeNull();
  });
});

describe("precosSolar — Venda em kit = Sim", () => {
  it("aplica VALOR_LIQUIDO + PIS + COFINS no kit", async () => {
    mockSap(envelopeValores([ITEM_KIT]));
    const r = await precosSolar([{ codigo: "100000350", quantidade: 1 }], {
      kitFotovoltaico: true,
      sugeridos: { "100000350": 9999 },
    });
    expect(r.precos["100000350"]).toBe(10925);
    expect(r.fallback).toEqual([]);
  });

  it("fora do kit usa o valor cheio (com ICMS/IPI)", async () => {
    mockSap(envelopeValores([ITEM_KIT]));
    const r = await precosSolar([{ codigo: "100000350", quantidade: 1 }], {
      kitFotovoltaico: false,
      sugeridos: { "100000350": 9999 },
    });
    expect(r.precos["100000350"]).toBe(11500);
  });

  it("divide pela quantidade para chegar ao unitário do kit", async () => {
    mockSap(
      envelopeValores([
        { item: "000010", attrs: { ...ITEM_KIT.attrs, VALOR_LIQUIDO: "20000.00", VL_PIS: "330.00", VL_COFINS: "1520.00" } },
      ]),
    );
    const r = await precosSolar([{ codigo: "100000350", quantidade: 2 }], { kitFotovoltaico: true });
    expect(r.precos["100000350"]).toBe(10925); // (20000 + 330 + 1520) / 2
  });
});

describe("precosSolar — fallback quando o SAP não devolve tributos", () => {
  it("sem PIS/COFINS, o kit cai para o valor cheio em vez de zerar", async () => {
    mockSap(
      envelopeValores([
        {
          item: "000010",
          attrs: { MATERIAL: "100000350", VALOR_LIQUIDO: "10000.00", VALOR_IMPOSTO: "1500.00" },
        },
      ]),
    );
    const r = await precosSolar([{ codigo: "100000350", quantidade: 1 }], {
      kitFotovoltaico: true,
      sugeridos: { "100000350": 9999 },
    });
    expect(r.precos["100000350"]).toBe(11500);
    expect(r.fallback).toEqual([]);
  });

  it("sem VALOR_LIQUIDO, cai para o preço sugerido do catálogo", async () => {
    mockSap(envelopeValores([{ item: "000010", attrs: { MATERIAL: "100000350", PESO_LIQUIDO: "120" } }]));
    const r = await precosSolar([{ codigo: "100000350", quantidade: 1 }], {
      kitFotovoltaico: true,
      sugeridos: { "100000350": 9999 },
    });
    expect(r.precos["100000350"]).toBe(9999);
    expect(r.fallback).toEqual(["100000350"]);
  });

  it("SAP fora do ar: fallback no catálogo e aviso registrado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const r = await precosSolar([{ codigo: "100000350", quantidade: 1 }], {
      kitFotovoltaico: true,
      sugeridos: { "100000350": 8500 },
    });
    expect(r.precos["100000350"]).toBe(8500);
    expect(r.fallback).toEqual(["100000350"]);
    expect(r.avisos.join(" ")).toMatch(/SAP/i);
  });

  it("mensagem de erro do SAP vira aviso e o item cai no sugerido", async () => {
    mockSap(
      envelopeValores(
        [{ item: "000010", attrs: { MATERIAL: "100000350" } }],
        [{ TYPE: "E", MESSAGE: "Cliente sem parceiro cadastrado" }],
      ),
    );
    const r = await precosSolar([{ codigo: "100000350", quantidade: 1 }], {
      kitFotovoltaico: true,
      sugeridos: { "100000350": 7000 },
    });
    expect(r.avisos).toContain("Cliente sem parceiro cadastrado");
    expect(r.precos["100000350"]).toBe(7000);
    expect(r.fallback).toEqual(["100000350"]);
  });

  it("sem preço sugerido, o item fica zerado e sinalizado como fallback", async () => {
    mockSap(envelopeValores([{ item: "000010", attrs: { MATERIAL: "100000350" } }]));
    const r = await precosSolar([{ codigo: "100000350", quantidade: 1 }], { kitFotovoltaico: true });
    expect(r.precos["100000350"]).toBe(0);
    expect(r.fallback).toEqual(["100000350"]);
  });
});
