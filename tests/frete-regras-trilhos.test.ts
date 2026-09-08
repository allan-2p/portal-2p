import { describe, expect, it } from "vitest";
import {
  CNPJ,
  FRETE_REGRAS_PADRAO,
  aplicarRegras,
  detectarTrilhos,
  filtraFretes,
} from "@/lib/fretefy-rules.server";

// Pedido 17790: 2,40M (permitido) vem antes do 4,80M (proibido na São Miguel).
const CARRINHO = ["200000651", "200000383", "200000384", "100000052"];
const CARRINHO_INVERSO = ["200000651", "200000384", "200000383", "100000052"];

describe("regras de trilho por transportadora", () => {
  it("detecta todos os trilhos do carrinho", () => {
    expect(detectarTrilhos(CARRINHO)).toEqual(["200000383", "200000384"]);
  });

  it("bloqueia a São Miguel com trilho 4,80M em qualquer ordem dos itens", () => {
    for (const c of [CARRINHO, CARRINHO_INVERSO])
      expect(filtraFretes(c, CNPJ.SAO_MIGUEL, [], FRETE_REGRAS_PADRAO, "solar")).toBe(false);
  });

  it("mantém a São Miguel quando só há trilho permitido", () => {
    expect(
      filtraFretes(["200000383", "100000052"], CNPJ.SAO_MIGUEL, [], FRETE_REGRAS_PADRAO, "solar"),
    ).toBe(true);
  });

  it("aplica o TDE da Transcarapia uma única vez, mesmo com o trilho não sendo o primeiro", () => {
    const opt = { transportadoraDocumento: CNPJ.TRANSCARAPIA, total: 1000, sla: 48 };
    const r = aplicarRegras(opt, {
      codigosCarrinho: CARRINHO,
      tipoEntrega: "S",
      unidade: "solar",
    });
    expect(r.total).toBe(1300);
    expect(r.ajustes).toEqual(["TDE Transcarapia: +300"]);
  });
});
