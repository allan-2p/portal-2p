import { describe, expect, it } from "vitest";
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

  it("nacional fica isento de ICMS, IPI e PIS/COFINS", () => {
    expect(itemImportadoPorIcms(0.12)).toBe(false);
    expect(aliquotasSuframa({ ipi: 0.05, icms: 0.12, pisCofins: 0.0925 })).toEqual({
      ipi: 0,
      icms: 0,
      pisCofins: 0,
    });
  });
});
