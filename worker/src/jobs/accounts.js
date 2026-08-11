// Job: Salesforce Account -> tabela espelho `account_sf` da instância.

import { mirrorConfig } from "../env.js";
import { createRest } from "../rest.js";
import { soqlAll } from "../salesforce.js";

export const JOB = "salesforce_accounts";

// Campos padrão espelhados em colunas; o resto vai para custom_fields.
const BASE_FIELDS = [
  "Id",
  "Name",
  "Phone",
  "Website",
  "Industry",
  "Description",
  "OwnerId",
  "CreatedDate",
  "LastModifiedDate",
];

// Campos extras por instância (personalizados do Salesforce), gravados em custom_fields.
const EXTRA_FIELDS = {
  solar: ["Type", "BillingState", "BillingCity", "AccountNumber"],
  carregadores: ["Type", "BillingState", "BillingCity", "AccountNumber"],
};

const BATCH = 500;

function toRow(rec, extras) {
  const custom = {};
  for (const f of extras) {
    if (rec[f] !== undefined) custom[f] = rec[f];
  }
  return {
    id: rec.Id,
    name: rec.Name ?? null,
    phone: rec.Phone ?? null,
    website: rec.Website ?? null,
    industry: rec.Industry ?? null,
    description: rec.Description ?? null,
    owner_id: rec.OwnerId ?? null,
    created_date: rec.CreatedDate ?? null,
    custom_fields: custom,
  };
}

/**
 * @param {string} instance "solar" | "carregadores"
 * @param {string|null} cursor último LastModifiedDate sincronizado (ISO) ou null para carga total
 * @returns {Promise<{read:number, written:number, cursor:string|null}>}
 */
export async function runAccountsSync(instance, cursor) {
  const rest = createRest(mirrorConfig(instance));
  const extras = EXTRA_FIELDS[instance] ?? [];
  const fields = [...BASE_FIELDS, ...extras].join(", ");

  const where = cursor ? ` WHERE LastModifiedDate > ${cursor}` : "";
  const soql = `SELECT ${fields} FROM Account${where} ORDER BY LastModifiedDate ASC`;

  let written = 0;
  let maxModified = cursor;
  let buffer = [];

  async function flush() {
    if (!buffer.length) return;
    await rest.upsert("account_sf", buffer, "id");
    written += buffer.length;
    buffer = [];
  }

  const read = await soqlAll(instance, soql, async (records) => {
    for (const rec of records) {
      buffer.push(toRow(rec, extras));
      if (rec.LastModifiedDate && (!maxModified || rec.LastModifiedDate > maxModified)) {
        maxModified = rec.LastModifiedDate;
      }
      if (buffer.length >= BATCH) await flush();
    }
  });
  await flush();

  return { read, written, cursor: maxModified };
}
