import { describe, expect, it } from "vitest";
import {
  decomporPrecoCarregadores,
  reconstruirPrecoCarregadores,
  fatorLiquidoCarregadores,
  r2,
} from "@/lib/carregadores-impostos";

const ALIQ = { ipi: 0.05, icms: 0.04, pisCofins: 0.0925 };

describe("decomporPrecoCarregadores", () => {
  it("mantém intermediários em 6 casas decimais", () => {
    const d = decomporPrecoCarregadores(1487.94, ALIQ);
    for (const v of [d.semIpi, d.ipi, d.icms, d.pisCofins, d.liquido, d.fator]) {
      expect(v).toBe(Math.round(v * 1e6) / 1e6);
    }
    // Nenhum intermediário arredondado a 2 casas.
    expect(d.semIpi).not.toBe(r2(d.semIpi));
  });

  it("líquido = bruto − IPI − ICMS − PIS/COFINS", () => {
    const d = decomporPrecoCarregadores(1000, ALIQ);
    expect(r2(d.liquido)).toBe(r2(d.bruto - d.ipi - d.icms - d.pisCofins));
  });

  it("reconstrução é o inverso da decomposição", () => {
    const d = decomporPrecoCarregadores(2345.67, ALIQ);
    expect(r2(reconstruirPrecoCarregadores(d.liquido, ALIQ))).toBe(2345.67);
    expect(fatorLiquidoCarregadores(ALIQ)).toBeCloseTo(d.fator, 5);
  });
});

// Aceite da calibração com o SAP (QAS 0000010462 / 0000010464).
// Habilitar (trocar it.skip por it) quando as bases exatas estiverem fechadas.
describe.skip("aceite SAP — VALOR_PROD 1234.56 x 3", () => {
  it("reconstrói total de 4.253,58", () => {
    const unit = reconstruirPrecoCarregadores(1234.56, ALIQ);
    expect(r2(unit * 3)).toBe(4253.58);
  });
});
