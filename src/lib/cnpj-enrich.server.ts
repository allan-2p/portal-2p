// Enriquecimento de CNPJ: Serpro (dados cadastrais da Receita) + CNPJá
// (inscrição estadual habilitada na UF e Suframa). Nada é gravado aqui —
// o resultado só pré-preenche o formulário de cadastro.

export type CnaeItem = { codigo: string; descricao: string };

export type EnriquecimentoCnpj = {
  doc: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  data_abertura: string | null;
  natureza_juridica: string | null;
  porte: string | null;
  cnae_principal: CnaeItem | null;
  cnaes_secundarios: CnaeItem[];
  email: string | null;
  telefone: string | null;
  telefones: string[];
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  municipio_ibge: string | null;
  ie: string | null;
  ie_situacao: string | null;
  inscricoes_estaduais: Array<{ uf: string; numero: string; habilitada: boolean; situacao: string | null }>;
  suframa: string | null;
  suframa_situacao: string | null;
  /** Optante pelo Simples Nacional (CNPJá). null = não foi possível apurar. */
  simples_optante: boolean | null;
  /** Enquadrado no SIMEI/MEI (CNPJá). */
  simei_optante: boolean | null;
  /** Regime tributário sugerido a partir do Simples/SIMEI. */
  regime_tributario: string | null;
  fontes: string[];
  avisos: string[];
};

const PORTE: Record<string, string> = {
  "00": "Não informado",
  "01": "Microempresa (ME)",
  "03": "Empresa de Pequeno Porte (EPP)",
  "05": "Demais",
};

let tokenCache: { token: string; exp: number } | null = null;

async function serproToken(): Promise<string | null> {
  const key = process.env["SERPRO_CONSUMER_KEY"];
  const secret = process.env["SERPRO_CONSUMER_SECRET"];
  if (!key || !secret) return null;
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.token;
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch("https://gateway.apiserpro.serpro.gov.br/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  tokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3000) * 1000 };
  return json.access_token;
}

function limpa(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

export async function enrichCnpj(cnpjRaw: string): Promise<EnriquecimentoCnpj> {
  const doc = cnpjRaw.replace(/\D/g, "");
  const out: EnriquecimentoCnpj = {
    doc,
    razao_social: null, nome_fantasia: null, situacao_cadastral: null, data_abertura: null,
    natureza_juridica: null, porte: null,
    cnae_principal: null, cnaes_secundarios: [],
    email: null, telefone: null, telefones: [],
    cep: null, logradouro: null, numero: null, complemento: null, bairro: null,
    cidade: null, uf: null, municipio_ibge: null,
    ie: null, ie_situacao: null, inscricoes_estaduais: [],
    suframa: null, suframa_situacao: null,
    simples_optante: null, simei_optante: null, regime_tributario: null,
    fontes: [], avisos: [],
  };
  if (doc.length !== 14) {
    out.avisos.push("CNPJ deve ter 14 dígitos.");
    return out;
  }

  // ---- Serpro (Consulta CNPJ básica) ----
  try {
    const token = await serproToken();
    if (!token) {
      out.avisos.push("Serpro indisponível (credenciais não configuradas).");
    } else {
      const res = await fetch(
        `https://gateway.apiserpro.serpro.gov.br/consulta-cnpj-df/v2/basica/${doc}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const d = (await res.json()) as any;
        out.fontes.push("Serpro");
        out.razao_social = limpa(d.nomeEmpresarial);
        out.nome_fantasia = limpa(d.nomeFantasia);
        out.situacao_cadastral = d.situacaoCadastral?.codigo === "2"
          ? "Ativa"
          : limpa(d.situacaoCadastral?.motivo) || limpa(d.situacaoCadastral?.codigo);
        out.data_abertura = limpa(d.dataAbertura);
        out.natureza_juridica = limpa(d.naturezaJuridica?.descricao);
        out.porte = PORTE[String(d.porte ?? "")] ?? limpa(d.porte);
        if (d.cnaePrincipal?.codigo) {
          out.cnae_principal = {
            codigo: String(d.cnaePrincipal.codigo),
            descricao: String(d.cnaePrincipal.descricao ?? ""),
          };
        }
        out.cnaes_secundarios = Array.isArray(d.cnaeSecundarias)
          ? d.cnaeSecundarias.map((c: any) => ({ codigo: String(c.codigo), descricao: String(c.descricao ?? "") }))
          : [];
        out.email = limpa(d.correioEletronico)?.toLowerCase() ?? null;
        out.telefones = Array.isArray(d.telefones)
          ? d.telefones.map((t: any) => `(${t.ddd}) ${t.numero}`)
          : [];
        out.telefone = out.telefones[0] ?? null;
        const e = d.endereco ?? {};
        out.cep = limpa(e.cep);
        out.logradouro = [limpa(e.tipoLogradouro), limpa(e.logradouro)].filter(Boolean).join(" ") || null;
        out.numero = limpa(e.numero);
        out.complemento = limpa(e.complemento);
        out.bairro = limpa(e.bairro);
        out.cidade = limpa(e.municipio?.descricao);
        out.uf = limpa(e.uf);
      } else {
        out.avisos.push(`Serpro respondeu ${res.status}.`);
      }
    }
  } catch {
    out.avisos.push("Falha ao consultar a Receita (Serpro).");
  }

  // ---- CNPJá (IE habilitada na UF, Suframa, complementos) ----
  try {
    const apiKey = process.env["CNPJA_API_KEY"];
    if (!apiKey) {
      out.avisos.push("CNPJá indisponível (chave não configurada).");
    } else {
      const res = await fetch(`https://api.cnpja.com/office/${doc}?registrations=BR&suframa=true&simples=true`, {
        headers: { Authorization: apiKey },
      });
      if (res.ok) {
        const d = (await res.json()) as any;
        out.fontes.push("CNPJá");
        out.razao_social ??= limpa(d.company?.name);
        out.nome_fantasia ??= limpa(d.alias);
        out.situacao_cadastral ??= limpa(d.status?.text);
        out.data_abertura ??= limpa(d.founded);
        out.natureza_juridica ??= limpa(d.company?.nature?.text);
        out.porte ??= limpa(d.company?.size?.text);
        if (!out.cnae_principal && d.mainActivity?.id) {
          out.cnae_principal = { codigo: String(d.mainActivity.id), descricao: String(d.mainActivity.text ?? "") };
        }
        if (out.cnaes_secundarios.length === 0 && Array.isArray(d.sideActivities)) {
          out.cnaes_secundarios = d.sideActivities.map((c: any) => ({
            codigo: String(c.id), descricao: String(c.text ?? ""),
          }));
        }
        const a = d.address ?? {};
        out.cep ??= limpa(a.zip);
        out.logradouro ??= limpa(a.street);
        out.numero ??= limpa(a.number);
        out.complemento ??= limpa(a.details);
        out.bairro ??= limpa(a.district);
        out.cidade ??= limpa(a.city);
        out.uf ??= limpa(a.state);
        out.municipio_ibge = a.municipality ? String(a.municipality) : out.municipio_ibge;
        if (!out.email && Array.isArray(d.emails) && d.emails[0]?.address) {
          out.email = String(d.emails[0].address).toLowerCase();
        }
        if (out.telefones.length === 0 && Array.isArray(d.phones)) {
          out.telefones = d.phones.map((p: any) => `(${p.area}) ${p.number}`);
          out.telefone = out.telefones[0] ?? null;
        }
        const regs = Array.isArray(d.registrations) ? d.registrations : [];
        out.inscricoes_estaduais = regs.map((r: any) => ({
          uf: String(r.state ?? ""),
          numero: String(r.number ?? ""),
          habilitada: !!r.enabled,
          situacao: limpa(r.status?.text),
        }));
        const daUf = out.inscricoes_estaduais.find((r) => r.uf === out.uf && r.habilitada)
          ?? out.inscricoes_estaduais.find((r) => r.habilitada)
          ?? out.inscricoes_estaduais[0];
        if (daUf) {
          out.ie = daUf.numero || null;
          out.ie_situacao = daUf.habilitada ? "Habilitada" : (daUf.situacao ?? "Não habilitada");
        }
        // Simples Nacional / SIMEI (só vem com ?simples=true)
        const simples = d.company?.simples ?? d.simples;
        const simei = d.company?.simei ?? d.simei;
        if (simples && typeof simples.optant === "boolean") out.simples_optante = simples.optant;
        if (simei && typeof simei.optant === "boolean") out.simei_optante = simei.optant;
        if (out.simei_optante) out.regime_tributario = "MEI";
        else if (out.simples_optante === true) out.regime_tributario = "Simples Nacional";
        else if (out.simples_optante === false) out.regime_tributario = "Lucro Presumido";
        const suf = Array.isArray(d.suframa) ? d.suframa[0] : null;
        if (suf) {
          out.suframa = limpa(suf.number);
          out.suframa_situacao = suf.approved ? "Aprovado" : (limpa(suf.status?.text) ?? "Não aprovado");
        }
      } else {
        out.avisos.push(`CNPJá respondeu ${res.status}.`);
      }
    }
  } catch {
    out.avisos.push("Falha ao consultar a CNPJá.");
  }

  if (out.fontes.length === 0) out.avisos.push("Nenhuma fonte respondeu — preencha manualmente.");
  return out;
}
