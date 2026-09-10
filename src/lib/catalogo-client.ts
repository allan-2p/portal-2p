/**
 * `catalogoFrom("solar_modulos")` — mesma cara do supabase-js, mas as
 * consultas do catálogo passam por server functions (ver
 * `catalogo-rest.functions.ts`), porque o catálogo vive no banco do grupo-2p
 * e o token do navegador não vale lá.
 *
 * Suporta o que as telas usam: select/insert/update/upsert/delete +
 * eq/neq/gt/gte/lt/lte/is/in/ilike, order, limit, maybeSingle e single.
 * O resultado é `{ data, error }`, igual ao supabase-js.
 */
import {
  catalogoDelete,
  catalogoSelect,
  catalogoUpdate,
  catalogoUpsert,
  type TabelaCatalogo,
} from "@/lib/catalogo-rest.functions";

type Filtro = { op: string; coluna: string; valor: any };
type Resposta<T> = { data: T; count?: number; error: { message: string; code?: string } | null };

class CatalogoQuery<T = any> implements PromiseLike<Resposta<T>> {
  private filtros: Filtro[] = [];
  private colunas = "*";
  private ordem?: string;
  private ascendente = true;
  private limite?: number;
  private unico: "nenhum" | "maybeSingle" | "single" = "nenhum";
  private acao: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private linhas: any[] = [];
  private valores: Record<string, any> = {};
  private onConflict?: string;
  private retornar = false;
  private contar = false;

  constructor(private tabela: TabelaCatalogo) {}

  select(colunas = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.acao === "select") {
      this.colunas = colunas;
      this.contar = opts?.count === "exact";
    } else this.retornar = true;
    return this;
  }
  insert(linhas: any) {
    this.acao = "insert";
    this.linhas = Array.isArray(linhas) ? linhas : [linhas];
    return this;
  }
  upsert(linhas: any, opts?: { onConflict?: string }) {
    this.acao = "upsert";
    this.linhas = Array.isArray(linhas) ? linhas : [linhas];
    this.onConflict = opts?.onConflict ?? "id";
    return this;
  }
  update(valores: Record<string, any>) {
    this.acao = "update";
    this.valores = valores;
    return this;
  }
  delete() {
    this.acao = "delete";
    return this;
  }

  private filtro(op: string, coluna: string, valor: any) {
    this.filtros.push({ op, coluna, valor });
    return this;
  }
  eq(c: string, v: any) {
    return this.filtro("eq", c, v);
  }
  neq(c: string, v: any) {
    return this.filtro("neq", c, v);
  }
  gt(c: string, v: any) {
    return this.filtro("gt", c, v);
  }
  gte(c: string, v: any) {
    return this.filtro("gte", c, v);
  }
  lt(c: string, v: any) {
    return this.filtro("lt", c, v);
  }
  lte(c: string, v: any) {
    return this.filtro("lte", c, v);
  }
  is(c: string, v: any) {
    return this.filtro("is", c, v);
  }
  in(c: string, v: any[]) {
    return this.filtro("in", c, v);
  }
  ilike(c: string, v: string) {
    return this.filtro("ilike", c, v);
  }
  order(coluna: string, opts?: { ascending?: boolean }) {
    this.ordem = coluna;
    this.ascendente = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limite = n;
    return this;
  }
  maybeSingle() {
    this.unico = "maybeSingle";
    return this;
  }
  single() {
    this.unico = "single";
    return this;
  }

  private async executar(): Promise<Resposta<T>> {
    try {
      if (this.acao === "select") {
        const data = await catalogoSelect({
          data: {
            tabela: this.tabela,
            colunas: this.colunas,
            filtros: this.filtros as any,
            ordem: this.ordem,
            ascendente: this.ascendente,
            limite: this.limite,
            unico: this.unico,
          },
        });
        if (this.contar) {
          const linhas = Array.isArray(data) ? data : data ? [data] : [];
          return { data: data as T, count: linhas.length, error: null };
        }
        return { data: data as T, error: null };
      }
      if (this.acao === "insert" || this.acao === "upsert") {
        const data = await catalogoUpsert({
          data: {
            tabela: this.tabela,
            linhas: this.linhas,
            onConflict: this.acao === "upsert" ? this.onConflict : undefined,
            retornar: this.retornar,
          },
        });
        return { data: data as T, error: null };
      }
      if (this.acao === "update") {
        await catalogoUpdate({
          data: { tabela: this.tabela, valores: this.valores, filtros: this.filtros as any },
        });
        return { data: null as T, error: null };
      }
      await catalogoDelete({ data: { tabela: this.tabela, filtros: this.filtros as any } });
      return { data: null as T, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = /duplicate key|unique constraint/i.test(msg) ? "23505" : undefined;
      return { data: null as T, error: { message: msg, code } };
    }
  }

  then<R1 = Resposta<T>, R2 = never>(
    onfulfilled?: ((value: Resposta<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.executar().then(onfulfilled, onrejected);
  }
}

export function catalogoFrom<T = any>(tabela: TabelaCatalogo) {
  return new CatalogoQuery<T>(tabela);
}

/** Açúcar para as telas: `catalogoDbClient.from("solar_modulos")`. */
export const catalogoDbClient = { from: catalogoFrom };
