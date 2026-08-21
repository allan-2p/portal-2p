/**
 * Parsing numérico das respostas do SAP.
 *
 * Regressão do incidente de peso/estoque ×1000: o SAP devolve decimais com
 * PONTO ("8.856" = 8,856 kg — campos QUAN têm 3 casas). Ponto só é separador
 * de milhar quando existe vírgula decimal na mesma string ("1.234,56").
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  numSap,
  iniciarColetaNumerica,
  coletarSuspeitasNumericas,
  detectarSaltosDeEscala,
} from "@/lib/sap-num.server";
import { num as numEstoque } from "@/lib/sap-estoque.server";

describe("numSap — decimal com ponto (formato SAP)", () => {
  beforeEach(() => iniciarColetaNumerica());

  it("lê peso QUAN de 3 casas como decimal, não como milhar", () => {
    expect(numSap("8.856", "PESO_LIQUIDO")).toBe(8.856);
    expect(numSap("47.795", "PESO_LIQUIDO")).toBe(47.795);
    expect(numSap("0.500", "PESO_LIQUIDO")).toBe(0.5);
  });

  it("lê quantidades de estoque com 3 casas na escala correta", () => {
    expect(numEstoque("68.119", "EST_LIVRE_0001")).toBe(68.119);
    expect(numEstoque("1.000", "QTD_PEND_FATURAR")).toBe(1);
    expect(numEstoque("12.500", "EST_ENTREPOSTO")).toBe(12.5);
  });

  it("trata ponto como milhar apenas quando há vírgula decimal", () => {
    expect(numSap("1.234,56", "VALOR_LIQUIDO")).toBe(1234.56);
    expect(numSap("1.234.567,89", "VALOR_LIQUIDO")).toBe(1234567.89);
    expect(numSap("0,5", "VALOR_LIQUIDO")).toBe(0.5);
  });

  it("mantém decimais comuns e inteiros", () => {
    expect(numSap("1234.56")).toBe(1234.56);
    expect(numSap("197")).toBe(197);
    expect(numSap(8.856)).toBe(8.856);
  });

  it("aceita negativo com sinal no fim (formato SAP) e espaços", () => {
    expect(numEstoque("123-")).toBe(-123);
    expect(numEstoque("1.500-", "EST_LIVRE_0002")).toBe(-1.5);
    expect(numSap("  42.250  ", "PESO_BRUTO")).toBe(42.25);
  });

  it("devolve 0 para vazio, nulo e texto", () => {
    expect(numSap("")).toBe(0);
    expect(numSap(null)).toBe(0);
    expect(numSap(undefined)).toBe(0);
    expect(numSap("N/A")).toBe(0);
  });
});

describe("detecção de ambiguidade milhar/decimal", () => {
  beforeEach(() => iniciarColetaNumerica());

  it("registra a leitura ambígua com o valor de risco ×1000", () => {
    numSap("8.856", "PESO_LIQUIDO");
    const [s] = coletarSuspeitasNumericas();
    expect(s).toMatchObject({
      campo: "PESO_LIQUIDO",
      bruto: "8.856",
      interpretado: 8.856,
      seFosseMilhar: 8856,
      motivo: "ponto-com-3-digitos",
    });
  });

  it("não registra valores sem ambiguidade", () => {
    numSap("1.234,56", "VALOR_LIQUIDO");
    numSap("1234.56", "VALOR_LIQUIDO");
    numSap("197", "QTD");
    expect(coletarSuspeitasNumericas()).toHaveLength(0);
  });

  it("limpa o coletor a cada leitura", () => {
    numSap("8.856", "PESO_LIQUIDO");
    expect(coletarSuspeitasNumericas()).toHaveLength(1);
    expect(coletarSuspeitasNumericas()).toHaveLength(0);
  });
});

describe("detectarSaltosDeEscala", () => {
  it("aponta saldo inflado ~1000× em relação ao gravado", () => {
    const saltos = detectarSaltosDeEscala(
      new Map([["200000653", 68_729_000]]),
      new Map([["200000653", 68_119]]),
    );
    expect(saltos).toHaveLength(1);
    expect(saltos[0]?.chave).toBe("200000653");
  });

  it("aponta também a queda de ~1000×", () => {
    const saltos = detectarSaltosDeEscala(new Map([["a", 68.119]]), new Map([["a", 68_119]]));
    expect(saltos).toHaveLength(1);
  });

  it("ignora variações normais de estoque", () => {
    const saltos = detectarSaltosDeEscala(
      new Map([["a", 90], ["b", 0], ["c", 1_500]]),
      new Map([["a", 100], ["b", 10], ["c", 1_200]]),
    );
    expect(saltos).toHaveLength(0);
  });
});
