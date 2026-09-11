/**
 * Transferência de carteira em lote (mesma regra da ação "Transferir consultor"
 * do cadastro de clientes): atualiza o responsável no portal, no SAP (VENDEDOR)
 * e no Salesforce (OwnerId da Account).
 *
 * Entrada: CSV com cabeçalho `doc,alvo,cliente` (doc = CNPJ/CPF só dígitos,
 * alvo = código SAP do consultor de destino).
 *
 * Uso:
 *   bun run scripts/transferir-consultor-lote.ts /tmp/transf.csv
 *   bun run scripts/transferir-consultor-lote.ts /tmp/transf.csv --aplicar
 */

import { readFileSync } from "node:fs";
import { findClienteByDoc, updateCliente, temConsultorPorInstancia } from "../src/lib/clientes-db.server";
import { consultorPorSap, consultorDaInstancia, prefixoConsultor, idDeUsuario } from "../src/lib/consultor-sap.server";

const arquivo = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
if (!arquivo) throw new Error("Informe o CSV: bun run scripts/transferir-consultor-lote.ts <arquivo.csv>");

const linhas = readFileSync(arquivo, "utf8")
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((l) => {
    const [doc, alvo, ...resto] = l.split(",");
    return { doc: String(doc).replace(/\D/g, ""), alvo: String(alvo).trim(), nome: resto.join(",").trim() };
  })
  .filter((l) => l.doc && l.alvo);

const cacheConsultor = new Map<string, any>();
async function consultor(sap: string) {
  if (!cacheConsultor.has(sap)) cacheConsultor.set(sap, await consultorPorSap(sap));
  const c = cacheConsultor.get(sap);
  if (!c) throw new Error(`Consultor ${sap} não encontrado no portal.`);
  return c;
}

const porInstancia = await temConsultorPorInstancia();
let ok = 0;
let pulados = 0;
const falhas: string[] = [];

for (const l of linhas) {
  try {
    const achados = await findClienteByDoc(l.doc);
    if (!achados.length) {
      falhas.push(`${l.doc} ${l.nome}: cadastro não encontrado`);
      continue;
    }
    const novo = await consultor(l.alvo);
    for (const { instancia, cliente } of achados) {
      const anterior = consultorDaInstancia(cliente as any, instancia);
      if (String(anterior.sap ?? "") === novo.sap) {
        pulados++;
        continue;
      }
      const patch: Record<string, unknown> = { consultor_sap: novo.sap, consultor_nome: novo.nome };
      const uuid = idDeUsuario(novo.id);
      if (uuid) patch["consultor_id"] = uuid;
      if (porInstancia) {
        const p = prefixoConsultor(instancia);
        patch[`${p}_sap`] = novo.sap;
        patch[`${p}_nome`] = novo.nome;
        if (uuid) patch[`${p}_id`] = uuid;
      }
      console.log(
        `${APLICAR ? "APLICA" : "SIMULA"} ${instancia} ${l.doc} ${cliente["razao_social"]}: ${anterior.nome ?? "—"} -> ${novo.nome}`,
      );
      if (!APLICAR) {
        ok++;
        continue;
      }
      await updateCliente(instancia, cliente["id"] as string, patch);
      const { sincronizarCliente } = await import("../src/lib/clientes-integracoes.server");
      const sync = await sincronizarCliente(
        instancia,
        cliente["id"] as string,
        { ...(cliente as Record<string, any>), ...patch },
        { vendedorSap: novo.sap, ownerSfId: novo.sfUserId ?? null, alvos: ["sap", "salesforce"] },
      );
      if (sync?.sap?.ok === false) falhas.push(`${l.doc} SAP: ${sync.sap.erro}`);
      if (sync?.salesforce?.ok === false) falhas.push(`${l.doc} Salesforce: ${sync.salesforce.erro}`);
      ok++;
    }
  } catch (err) {
    falhas.push(`${l.doc} ${l.nome}: ${(err as Error)?.message ?? String(err)}`);
  }
}

console.log(`\nTransferidos: ${ok} · já estavam com o destino: ${pulados} · avisos: ${falhas.length}`);
for (const f of falhas) console.log(" -", f);
