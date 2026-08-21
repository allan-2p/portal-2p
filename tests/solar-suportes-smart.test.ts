import { describe, it, expect } from "vitest";
import { quantificarProjeto, type QuantFileira, type QuantContexto } from "@/lib/solar-quantificador";
import {
  SOLAR_CALC_CONFIG_FALLBACK,
  type SolarSuporte,
  type SolarTrilho,
} from "@/lib/solar-calculadora";

const cfg = SOLAR_CALC_CONFIG_FALLBACK;
const modulo = { largura: 1134, altura: 2278, espessura: 30 };

function trilho(legado: number, nome: string): SolarTrilho {
  return {
    id: `t${legado}`,
    legado_id: legado,
    nome,
    familia: "padrao",
    codigo_sap: null,
    laje: false,
    orientacao_fixa: legado === 5 ? "P" : null,
    suporte_fixo_legado: legado === 4 ? 14 : legado === 5 ? 13 : null,
    ativo: true,
    ordem: legado,
  };
}

function suporte(legado: number, nome: string, extra: Partial<SolarSuporte> = {}): SolarSuporte {
  return {
    id: `s${legado}`,
    legado_id: legado,
    nome,
    codigo_sap: null,
    multiplo: 2,
    usa_barra: false,
    ativo: true,
    ordem: legado,
    smart: true,
    ...extra,
  };
}

function fileira(t: SolarTrilho, s: SolarSuporte): QuantFileira {
  return {
    trilho: t,
    suporte: s,
    qtd_paineis: 10,
    qtd_fileiras: 1,
    orientacao: "R",
    distancia: 0,
    balanco: 0,
  };
}

/** 10 painéis: 18 intermediários + 4 finais = 22 grampos. */
const TOT_GRAMPO = 22;

const ctxMicro: QuantContexto = {
  todos_trilhos: "N",
  tipo_gerador: 1,
  modelo_gerador: 1,
  microinversores: 5,
};
const ctxString: QuantContexto = {
  todos_trilhos: "N",
  tipo_gerador: 3,
  modelo_gerador: 0,
  microinversores: 0,
};

const item = (r: ReturnType<typeof quantificarProjeto>, chave: string) =>
  r.itens.find((i) => i.chave === chave);

describe("suportes Smart — cadastro e quantificador", () => {
  it("1) Smart10 + SMART10-30: mini 2P-MTL300 e kit, com +micro na 1ª fileira", () => {
    const s = suporte(9, "SMART10-30", { cod_mini_trilho: "2P-MTL300" });
    const r = quantificarProjeto([fileira(trilho(3, "Smart 10"), s)], modulo, ctxMicro, cfg);
    expect(item(r, "mini_trilho")).toMatchObject({
      codigo: "2P-MTL300",
      quantidade: TOT_GRAMPO + 5,
    });
    expect(item(r, "kit_parafuso_smart")).toMatchObject({
      codigo: "100000052",
      quantidade: TOT_GRAMPO + 5,
    });
  });

  it("2) LAJE 10: 2P-LJ10A + 2P-LJ10B (tot/2 cada) + ZMIL, sem kit e sem ZMI", () => {
    const s = suporte(13, "LAJE 10", { codigo_sap: "2P-LJ10A", cod_extra: "2P-LJ10B" });
    const r = quantificarProjeto([fileira(trilho(5, "Laje 10"), s)], modulo, ctxMicro, cfg);
    expect(item(r, "laje10_a")).toMatchObject({ codigo: "2P-LJ10A", quantidade: TOT_GRAMPO / 2 });
    expect(item(r, "laje10_b")).toMatchObject({ codigo: "2P-LJ10B", quantidade: TOT_GRAMPO / 2 });
    expect(item(r, "terminal_zmil")).toMatchObject({ codigo: "2P-ZMIL", quantidade: 10 });
    expect(item(r, "kit_parafuso_smart")).toBeUndefined();
    expect(item(r, "terminal_zmi")).toBeUndefined();
    expect(item(r, "mini_trilho")).toBeUndefined();
    // Gerador string não recebe ZMIL.
    const rs = quantificarProjeto([fileira(trilho(5, "Laje 10"), s)], modulo, ctxString, cfg);
    expect(item(rs, "terminal_zmil")).toBeUndefined();
  });

  it("3) Zipado: 2P-ZIP (tot + micro) + ZMI normal, sem kit", () => {
    const s = suporte(14, "Zipado", { codigo_sap: "2P-ZIP" });
    const r = quantificarProjeto([fileira(trilho(4, "Zipado"), s)], modulo, ctxMicro, cfg);
    expect(item(r, "zipado")).toMatchObject({ codigo: "2P-ZIP", quantidade: TOT_GRAMPO + 5 });
    expect(item(r, "terminal_zmi")).toMatchObject({ codigo: "2P-ZMI", quantidade: 10 });
    expect(item(r, "kit_parafuso_smart")).toBeUndefined();
  });

  it("4) Smart 3.4 + Smart 3.4x55: mini 100000319 = tot_grampo (sem +micro) e kit", () => {
    const s = suporte(17, "Smart 3.4x55", { cod_mini_trilho: "100000319" });
    const r = quantificarProjeto([fileira(trilho(7, "Smart 3.4"), s)], modulo, ctxMicro, cfg);
    expect(item(r, "mini_trilho")).toMatchObject({ codigo: "100000319", quantidade: TOT_GRAMPO });
    expect(item(r, "kit_parafuso_smart")).toMatchObject({ quantidade: TOT_GRAMPO + 5 });
  });

  it("6) suporte madeira 250 gera 1 linha do SKU combinado", () => {
    const t = trilho(1, "Trilho");
    const s: SolarSuporte = {
      id: "s7",
      legado_id: 7,
      nome: "Prisioneiro Madeira M10x250",
      codigo_sap: "2P-PSI250+LPM10-45",
      cod_extra: null,
      multiplo: 2,
      usa_barra: true,
      ativo: true,
      ordem: 7,
      smart: false,
    };
    const f: QuantFileira = { ...fileira(t, s), distancia: 1.5, balanco: 0.5 };
    const r = quantificarProjeto([f], modulo, ctxString, cfg);
    const fix = r.itens.filter((i) => i.chave.startsWith("fixador_"));
    expect(fix).toHaveLength(1);
    expect(fix[0]).toMatchObject({ codigo: "2P-PSI250+LPM10-45" });
  });
});
