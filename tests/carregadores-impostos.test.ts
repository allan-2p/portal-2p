import { describe, expect, it } from "vitest";
import {
  AVISO_FORA_CALIBRACAO,
  FATOR_LIQUIDO_SAP_ICMS4,
  decomporPrecoCarregadores,
  dentroDaCalibracao,
  fatorLiquidoCarregadores,
  precoSemIpi,
  r2,
  reconstruirPrecoCarregadores,
  valorProdCarregadores,
} from "@/lib/carregadores-impostos";

const ALIQ = { ipi: 0.05, icms: 0.04, pisCofins: 0.0925 };

describe("conversão calibrada preço de venda → VALOR_PROD", () => {
  it("fator calibrado com o SAP (QAS 0000010462/0000010464)", () => {
    expect(FATOR_LIQUIDO_SAP_ICMS4).toBe(0.870722);
    expect(dentroDaCalibracao(0.04)).toBe(true);
    expect(dentroDaCalibracao(0.17)).toBe(false);
    expect(AVISO_FORA_CALIBRACAO).toContain("fora da calibração");
  });

  it("aceite SAP: T=4.253,58 (3 un, IPI 0) → 1234.56/un", () => {
    const unit = 4253.58 / 3;
    expect(valorProdCarregadores(unit, 0)).toBe(1234.56);
  });

  it("aceite SAP: T=1.260,45 com IPI 9,75% → 1000.00", () => {
    expect(valorProdCarregadores(1260.45, 0.0975)).toBe(1000);
  });

  it("mantém intermediários em 6 casas decimais", () => {
    const d = decomporPrecoCarregadores(1487.94, ALIQ);
    for (const v of [d.semIpi, d.ipi, d.icms, d.pisCofins, d.liquido, d.fator]) {
      expect(v).toBe(Math.round(v * 1e6) / 1e6);
    }
    expect(d.semIpi).not.toBe(r2(d.semIpi));
  });

  it("detalhamento da proposta sai da mesma conta do VALOR_PROD", () => {
    const d = decomporPrecoCarregadores(1587.3, ALIQ);
    expect(d.calibrado).toBe(true);
    expect(d.semIpi).toBe(precoSemIpi(1587.3, 0.05));
    expect(d.liquido).toBeCloseTo(d.semIpi * FATOR_LIQUIDO_SAP_ICMS4, 6);
    expect(d.icms).toBeCloseTo(d.semIpi * 0.04, 6);
    // Soma fecha o bruto: líquido + ICMS + PIS/COFINS + IPI = T.
    expect(r2(d.liquido + d.icms + d.pisCofins + d.ipi)).toBe(1587.3);
    expect(r2(valorProdCarregadores(1587.3, 0.05))).toBe(r2(d.liquido));
  });

  it("marca como não calibrado quando o ICMS não é 4%", () => {
    const d = decomporPrecoCarregadores(1000, { ...ALIQ, icms: 0.17 });
    expect(d.calibrado).toBe(false);
  });

  it("reconstrução é o inverso da decomposição", () => {
    const d = decomporPrecoCarregadores(2345.67, ALIQ);
    expect(r2(reconstruirPrecoCarregadores(d.liquido, ALIQ))).toBe(2345.67);
    expect(fatorLiquidoCarregadores(ALIQ)).toBeCloseTo(d.fator, 5);
  });
});
