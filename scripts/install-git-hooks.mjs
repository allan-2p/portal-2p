#!/usr/bin/env node
/**
 * Instala o hook local de pre-commit que mantém o README.md fiel ao projeto.
 * Uso: node scripts/install-git-hooks.mjs
 */
import { writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".git", "hooks");

if (!existsSync(join(root, ".git"))) {
  console.error("Não encontrei o diretório .git — rode dentro do clone local do repositório.");
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

const hook = `#!/bin/sh
# Portal 2P — mantém o README.md em dia (gerado por scripts/install-git-hooks.mjs)
node scripts/readme-sync.mjs || exit 1
git add README.md
`;

const alvo = join(dir, "pre-commit");
writeFileSync(alvo, hook);
chmodSync(alvo, 0o755);
console.log("Hook instalado em .git/hooks/pre-commit");
