import { describe, expect, it } from "vitest";
import {
  decomporPrecoCarregadores,
  fatorLiquidoCarregadores,
  precoSemIpi,
  r2,
  r6,
  reconstruirPrecoCarregadores,
  valorProdCarregadores,
} from "@/lib/carregadores-impostos";

const ALIQ = { ipi: 0.05, icms: 0.04, pisCofins: 0.0925 };

describe("conversão preço de venda → VALOR_PROD (fórmula fiscal)", () => {
  it("PIS/COFINS incide sobre (sem IPI − ICMS)", () => {
    // Caso real da proposta 60260: T = 68.780,00, IPI 5%, ICMS 4%, PIS/COFINS 9,25%.
    const d = decomporPrecoCarregadores(68780, ALIQ);
    expect(r2(d.semIpi)).toBe(65504.76);
    expect(r2(d.ipi)).toBe(3275.24);
    expect(r2(d.icms)).toBe(2620.19);
    expect(r2(d.pisCofins)).toBe(5816.82);
    expect(r2(d.liquido)).toBe(57067.75);
  });

  it("mantém intermediários em 6 casas decimais", () => {
    const d = decomporPrecoCarregadores(1487.94, ALIQ);
    for (const v of [d.semIpi, d.ipi, d.icms, d.pisCofins, d.liquido, d.fator]) {
      expect(v).toBe(r6(v));
    }
    expect(d.semIpi).not.toBe(r2(d.semIpi));
  });

  it("detalhamento da proposta sai da mesma conta do VALOR_PROD", () => {
    const d = decomporPrecoCarregadores(1587.3, ALIQ);
    expect(d.semIpi).toBe(precoSemIpi(1587.3, 0.05));
    expect(d.icms).toBeCloseTo(d.semIpi * 0.04, 6);
    expect(d.pisCofins).toBeCloseTo((d.semIpi - d.icms) * 0.0925, 6);
    // Soma fecha o bruto: líquido + ICMS + PIS/COFINS + IPI = T.
    expect(r2(d.liquido + d.icms + d.pisCofins + d.ipi)).toBe(1587.3);
    expect(valorProdCarregadores(1587.3, ALIQ)).toBe(r2(d.liquido));
  });

  it("vale para qualquer alíquota de ICMS (venda interna em SC)", () => {
    const d = decomporPrecoCarregadores(1000, { ipi: 0.0476, icms: 0.1, pisCofins: 0.0793 });
    expect(r2(d.liquido + d.icms + d.pisCofins + d.ipi)).toBe(1000);
    expect(d.liquido).toBeGreaterThan(0);
  });

  it("reconstrução é o inverso da decomposição", () => {
    const d = decomporPrecoCarregadores(2345.67, ALIQ);
    expect(r2(reconstruirPrecoCarregadores(d.liquido, ALIQ))).toBe(2345.67);
    expect(fatorLiquidoCarregadores(ALIQ)).toBeCloseTo(d.fator, 5);
  });
});
