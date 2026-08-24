#!/usr/bin/env node
/**
 * Mantém o README.md fiel ao projeto.
 *
 * Gera automaticamente os blocos delimitados por marcadores:
 *   <!-- readme:scripts --> ... <!-- /readme:scripts -->
 *   <!-- readme:env -->     ... <!-- /readme:env -->
 *   <!-- readme:jobs -->    ... <!-- /readme:jobs -->
 *   <!-- readme:rotas -->   ... <!-- /readme:rotas -->
 *
 * Fontes da verdade: package.json (scripts), .env.example (variáveis),
 * src/lib/job-runs.server.ts + src/routes/api/public/hooks (gatilhos),
 * src/routes (rotas do app e endpoints públicos).
 *
 * Uso:
 *   node scripts/readme-sync.mjs           # reescreve o README
 *   node scripts/readme-sync.mjs --check    # falha (exit 1) se estiver desatualizado
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/* ------------------------------------------------------------------ scripts */

const DESCRICAO_SCRIPTS = {
  dev: "Servidor de desenvolvimento (http://localhost:8080)",
  build: "Build de produção",
  "build:dev": "Build em modo development (validação do preview)",
  preview: "Serve o build localmente",
  lint: "ESLint",
  format: "Prettier",
  test: "Todos os testes (Vitest)",
  "test:rls": "Somente a suíte de políticas RLS",
  "readme:sync": "Regenera as seções automáticas deste README",
  "readme:check": "Falha se o README estiver desatualizado em relação ao código",
};

function blocoScripts() {
  const pkg = JSON.parse(read("package.json"));
  const linhas = Object.keys(pkg.scripts ?? {}).map((nome) => {
    const desc = DESCRICAO_SCRIPTS[nome] ?? `\`${pkg.scripts[nome]}\``;
    return `| \`npm run ${nome}\` | ${desc} |`;
  });
  return ["| Comando | O que faz |", "| --- | --- |", ...linhas].join("\n");
}

/* ---------------------------------------------------------------------- env */

function grupoEnv() {
  const grupos = [];
  let atual = null;
  for (const raw of read(".env.example").split("\n")) {
    const linha = raw.trim();
    const header = linha.match(/^#\s*-+\s*(.+?)\s*-+\s*$/);
    if (header) {
      atual = { nome: header[1], vars: [] };
      grupos.push(atual);
      continue;
    }
    const v = linha.match(/^([A-Z0-9_]+)=/);
    if (v && atual) atual.vars.push(v[1]);
  }
  return grupos.filter((g) => g.vars.length > 0);
}

function blocoEnv() {
  const grupos = grupoEnv();
  const total = grupos.reduce((n, g) => n + g.vars.length, 0);
  const publicas = grupos.flatMap((g) => g.vars).filter((v) => v.startsWith("VITE_"));
  const linhas = grupos.map(
    (g) => `| **${g.nome}** | ${g.vars.map((v) => `\`${v}\``).join(", ")} |`,
  );
  return [
    `Fonte da verdade: [\`.env.example\`](./.env.example) — ${total} variáveis, ` +
      `sendo ${publicas.length} pública(s) no client (\`VITE_*\`).`,
    "",
    "| Grupo | Variáveis |",
    "| --- | --- |",
    ...linhas,
  ].join("\n");
}

/* --------------------------------------------------------------------- jobs */

function jobs() {
  const src = read("src/lib/job-runs.server.ts");
  const corpo = src.slice(src.indexOf("export const JOBS"), src.indexOf("} as const;"));
  const re =
    /"([a-z0-9.\-]+)":\s*\{\s*label:\s*"([^"]+)",\s*descricao:\s*\n?\s*"([^"]*)",\s*reprocessavel:\s*(true|false)/g;
  const out = [];
  let m;
  while ((m = re.exec(corpo))) {
    out.push({ slug: m[1], label: m[2], descricao: m[3], reprocessavel: m[4] === "true" });
  }
  return out;
}

function hooksPublicos() {
  const dir = "src/routes/api/public";
  const arquivos = [];
  const walk = (rel) => {
    for (const item of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (item.isDirectory()) walk(`${rel}/${item.name}`);
      else if (item.name.endsWith(".ts")) arquivos.push(`${rel}/${item.name}`);
    }
  };
  if (existsSync(join(root, dir))) walk(dir);
  return arquivos
    .map((f) =>
      f
        .replace("src/routes", "")
        .replace(/\.ts$/, "")
        .replace(/\.\$$/, "/*")
        .replace(/\./g, "/"),
    )
    .filter((p, i, a) => a.indexOf(p) === i)
    .sort();
}

function blocoJobs() {
  const linhas = jobs().map(
    (j) =>
      `| \`${j.slug}\` | ${j.label} | ${j.descricao} | ${j.reprocessavel ? "sim" : "não"} |`,
  );
  const endpoints = hooksPublicos().map((p) => `- \`${p}\``);
  return [
    "| Gatilho | Nome | O que faz | Reprocessável |",
    "| --- | --- | --- | --- |",
    ...linhas,
    "",
    "Endpoints públicos (exigem `x-cron-secret`, exceto webhooks com assinatura própria):",
    "",
    ...endpoints,
  ].join("\n");
}

/* -------------------------------------------------------------------- rotas */

function rotasApp() {
  const base = "src/routes/_authenticated";
  const rotas = readdirSync(join(root, base))
    .filter((f) => /\.tsx$/.test(f) && f !== "route.tsx")
    .map((f) => f.replace(/\.tsx$/, ""))
    .sort();
  const grupos = new Map();
  for (const r of rotas) {
    const area = r.includes(".") ? r.split(".")[0].replace(/_$/, "") : "raiz";
    if (!grupos.has(area)) grupos.set(area, []);
    grupos.get(area).push("/" + r.replace(/_\.|\./g, "/").replace(/\/index$/, ""));
  }
  return grupos;
}

function blocoRotas() {
  const grupos = rotasApp();
  const total = [...grupos.values()].reduce((n, l) => n + l.length, 0);
  const linhas = [...grupos.entries()].map(
    ([area, lista]) =>
      `| **${area}** | ${lista.length} | ${lista.map((r) => `\`${r}\``).join(", ")} |`,
  );
  return [
    `${total} páginas autenticadas em \`src/routes/_authenticated\` (file routes do TanStack Router).`,
    "",
    "| Área | Páginas | Rotas |",
    "| --- | --- | --- |",
    ...linhas,
  ].join("\n");
}

/* ------------------------------------------------------------------ aplicar */

const BLOCOS = {
  scripts: blocoScripts,
  env: blocoEnv,
  jobs: blocoJobs,
  rotas: blocoRotas,
};

function aplicar(readme) {
  let out = readme;
  const faltando = [];
  for (const [nome, gerar] of Object.entries(BLOCOS)) {
    const re = new RegExp(
      `<!-- readme:${nome} -->[\\s\\S]*?<!-- /readme:${nome} -->`,
      "m",
    );
    if (!re.test(out)) {
      faltando.push(nome);
      continue;
    }
    out = out.replace(re, `<!-- readme:${nome} -->\n${gerar()}\n<!-- /readme:${nome} -->`);
  }
  if (faltando.length) {
    throw new Error(
      `Marcadores ausentes no README.md: ${faltando.map((n) => `readme:${n}`).join(", ")}`,
    );
  }
  return out;
}

export function readmeAtualizado() {
  return aplicar(read("README.md"));
}

const executadoDireto = process.argv[1] && process.argv[1].endsWith("readme-sync.mjs");
if (executadoDireto) {
  const atual = read("README.md");
  const novo = aplicar(atual);
  const check = process.argv.includes("--check");
  if (atual === novo) {
    console.log("README.md está em dia.");
  } else if (check) {
    console.error(
      "README.md desatualizado (scripts, variáveis, gatilhos ou rotas mudaram).\n" +
        "Rode: npm run readme:sync",
    );
    process.exit(1);
  } else {
    writeFileSync(join(root, "README.md"), novo);
    console.log("README.md atualizado.");
  }
}
