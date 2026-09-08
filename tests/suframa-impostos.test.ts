import { describe, expect, it } from "vitest";
import { precoUnitarioSuframa } from "@/lib/suframa";

import { aliquotasSuframa, itemImportadoPorIcms, statusSuframa } from "@/lib/suframa";

describe("status SUFRAMA", () => {
  it("aprovado quando a inscrição existe e a situação está ativa", () => {
    expect(statusSuframa({ doc: "12345678000199", suframa: "123456789", suframa_situacao: "Ativa" })).toBe("aprovado");
  });

  it("bloqueado quando a situação tem impedimento", () => {
    expect(statusSuframa({ doc: "12345678000199", suframa: "123456789", suframa_situacao: "Bloqueada" })).toBe("bloqueado");
  });

  it("sem inscrição = sem benefício", () => {
    expect(statusSuframa({ doc: "12345678000199" })).toBe("sem");
  });

  it("CPF nunca tem SUFRAMA", () => {
    expect(statusSuframa({ doc: "12345678909", suframa: "123456789", suframa_situacao: "Ativa" })).toBe("sem");
  });
});

describe("alíquotas na Zona Franca de Manaus", () => {
  it("importado (ICMS 4%) mantém 4% e zera IPI e PIS/COFINS", () => {
    expect(itemImportadoPorIcms(0.04)).toBe(true);
    expect(aliquotasSuframa({ ipi: 0.05, icms: 0.04, pisCofins: 0.0925 })).toEqual({
      ipi: 0,
      icms: 0.04,
      pisCofins: 0,
    });
  });

  it("nacional mantém o ICMS da operação e zera IPI e PIS/COFINS", () => {
    expect(itemImportadoPorIcms(0.07)).toBe(false);
    expect(aliquotasSuframa({ ipi: 0.05, icms: 0.07, pisCofins: 0.0925 })).toEqual({
      ipi: 0,
      icms: 0.07,
      pisCofins: 0,
    });
  });

  it("preço unitário = líquido ÷ (1 − ICMS), como na planilha", () => {
    expect(precoUnitarioSuframa(2.5, 0.04)).toBe(2.6);
    expect(precoUnitarioSuframa(9.98, 0.07)).toBe(10.73);
    expect(precoUnitarioSuframa(3.03, 0.04)).toBe(3.16);
    expect(precoUnitarioSuframa(3.18, 0.04)).toBe(3.31);
  });
});

