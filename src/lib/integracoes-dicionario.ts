/**
 * Dicionário das integrações SAP e Salesforce — fonte única dos painéis
 * "Integrações → SAP" e "Integrações → Salesforce".
 *
 * Regra: este arquivo espelha o CÓDIGO que monta os envelopes/payloads
 * (`sap-clientes.server.ts`, `sap-ov.server.ts`, `sap-nfs.server.ts`,
 * `sap-precos.server.ts`, `sap-estoque.server.ts`, `sap-produtos.server.ts`,
 * `salesforce-clientes.server.ts`, `salesforce-pedidos.server.ts`).
 * O teste `tests/integracoes-dicionario.test.ts` varre esses módulos e falha
 * quando um campo novo entra num envelope e não aparece aqui — assim o painel
 * não apodrece.
 *
 * Módulo puro (sem I/O): pode ser importado do servidor e do navegador.
 */

export type CampoStatus =
  /** Enviado/lido pelo portal hoje. */
  | "implementado"
  /** Existe no portal novo e não existia na plataforma antiga. */
  | "novo-portal"
  /** Existe na plataforma antiga e o portal ainda não usa (pendência de paridade). */
  | "nao-implementado";

export type Campo = {
  campo: string;
  origem: string;
  status: CampoStatus;
};

export type GrupoCampos = {
  titulo: string;
  /** Estrutura/tabela da RFC ou objeto do CRM. */
  estrutura?: string;
  campos: Campo[];
};

export type FluxoDic = {
  id: string;
  titulo: string;
  /** RFC / endpoint chamado. */
  chamada: string;
  /** Quando o envio acontece. */
  gatilho: string;
  /** Fluxos cobertos (criação, atualização, cancelamento…). */
  operacoes: string[];
  /** slug usado em `integration_logs`. */
  logSlug: string;
  /** job em `job_runs`, quando existe. */
  job?: string;
  estados: { ok: string; pendente: string; erro: string };
  grupos: GrupoCampos[];
  retornos: Campo[];
};

const f = (campo: string, origem: string): Campo => ({ campo, origem, status: "implementado" });
const novo = (campo: string, origem: string): Campo => ({ campo, origem, status: "novo-portal" });
const falta = (campo: string, origem: string): Campo => ({ campo, origem, status: "nao-implementado" });
const vazio = (campo: string, obs = "enviado vazio (SAP resolve / reservado)"): Campo => f(campo, obs);

/* ------------------------------------------------------------------ SAP */

const SAP_CLIENTE: FluxoDic = {
  id: "sap-clientes",
  titulo: "Cadastro de clientes",
  chamada: "RFC ZHDIT_CLIENTES_CADASTRO (SOAP 1.1)",
  gatilho: "Ao salvar o cadastro do cliente (criação e edição) e no reenvio manual.",
  operacoes: [
    "Criação: ATUALIZAR vazio — o SAP gera o código (KUNNR).",
    "Edição: ATUALIZAR = X com CODCLI preenchido — o SAP atualiza o cliente.",
  ],
  logSlug: "sap-clientes",
  estados: {
    ok: "Código SAP (numero_sap) gravado no cliente.",
    pendente: "Cliente sem código SAP — cadastro nunca enviado ou faltando dado obrigatório.",
    erro: "Último envio falhou (SOAP Fault ou mensagem de erro do SAP).",
  },
  grupos: [
    {
      titulo: "Identificação",
      estrutura: "I_S_CLIENTE",
      campos: [
        f("ATUALIZAR", 'vazio na criação; "X" quando o cliente já tem código SAP (edição)'),
        f("EMPRESA", "fixo 9800"),
        f("CNPJ", "documento com zero-pad 14 (vazio para pessoa física)"),
        f("CPF", "documento de 11 dígitos (pessoa física)"),
        f("CODCLI", "código SAP já existente (KUNNR) — só na edição"),
        f("NAME1..NAME4", "razão social quebrada em linhas de 40 caracteres (máx. 4)"),
        vazio("SORTL"),
      ],
    },
    {
      titulo: "Fiscal",
      estrutura: "I_S_CLIENTE",
      campos: [
        f("IE", 'inscrição estadual sem pontuação, máx. 18; "ISENTO" quando não contribuinte'),
        f("CFOPC", "IE + finalidade: Revenda 08 · Industrialização 00 · Uso/Consumo 90 · sem IE 6"),
        f("ICMSTAXPAY", "01 contribuinte (tem IE) · 09 não contribuinte"),
        f("CRT", "regime tributário do cadastro (Simples/MEI = 1; demais = 3)"),
        f("IND_SECTOR", "04 apenas quando UF = SC e finalidade = Industrialização"),
        vazio("IMUN"),
        vazio("RG"),
        vazio("RNE"),
        vazio("CNAE"),
      ],
    },
    {
      titulo: "Endereço e contato",
      estrutura: "I_S_CLIENTE",
      campos: [
        f("CIDADE", "cidade do cadastro (40)"),
        f("BAIRRO", "bairro do cadastro (40)"),
        f("CEP", "CEP só dígitos"),
        f("LOGRADOURO", "logradouro (60)"),
        f("NUMERO", "número (10)"),
        f("COMPLEMENTO", "complemento (40)"),
        f("UF", "UF do cadastro"),
        f("PAIS", "fixo BR"),
        f("TELEFONE", "telefone do cadastro (30)"),
        f("E_MAIL", "e-mail do cadastro (60)"),
        vazio("FAX"),
      ],
    },
    {
      titulo: "Comercial",
      estrutura: "I_S_CLIENTE",
      campos: [
        f("VENDEDOR", "código SAP do consultor dono do cliente (vendedor sem código = pendência)"),
        f("PLTYP", "tabela de preço: 01 Varejo · 02 Atacado · 03 Especial · 04 Distribuidor · 05 Distr. Especial"),
        f("KONDA", "04 se UF ∈ {SP,RJ,ES,MG,RS,PR,SC}; senão 03"),
        f("ZTERM", "2P00 na criação; na edição, a condição de pagamento escolhida"),
        f("INCO1", "fixo FOB no cadastro (o incoterm real vai no pedido)"),
        vazio("INCO2"),
        f("BZIRK", "fixo SOUTH"),
        f("KALKS", "fixo 01"),
        f("VZSKZ", "fixo 01"),
        novo("EQUIPE_VENDAS (VKGRP)", "unidade do cliente: Solar 001 · Carregadores 002 · Grupo 003"),
        novo("ESCRITORIO (VKBUR)", "unidade do cliente: Solar 0002 · Carregadores 0003 · Grupo 0004"),
        vazio("WERKS"),
      ],
    },
  ],
  retornos: [
    f("E_CODCLI", "código SAP do cliente — gravado em clientes.numero_sap (é o OK do fluxo)"),
    f("Mensagem / SOAP Fault", "texto do erro gravado no log e exibido como estado Erro"),
  ],
};

const SAP_OV: FluxoDic = {
  id: "sap-ov",
  titulo: "Criação do pedido (ordem de venda)",
  chamada: "RFC ZNFE_OV_CRIAR (SOAP 1.2)",
  gatilho:
    "Conclusão do pedido (boleto/faturamento) ou confirmação do Pix. Reenvio pelo reprocesso do job sap.ov-criar.",
  operacoes: [
    "Envio real: I_TESTRUN vazio — o SAP grava a ordem e devolve o VBELN.",
    "Validação (test run): I_TESTRUN = X — valida sem gravar.",
    "Reenvio: claim atômico em sap_ov_status='enviando' evita envio duplicado.",
    "Duplicado: se o SAP indicar ordem já existente para o NROPED, o portal consulta o VBELN no ZNFE_OV_CONSULTAR.",
  ],
  logSlug: "sap",
  job: "sap.ov-criar",
  estados: {
    ok: "sap_ov_numero (VBELN) gravado na proposta.",
    pendente: "Aguardando gatilho (pagamento/conclusão) ou envio em andamento.",
    erro: "sap_ov_status = 'erro' — mensagem completa do T_MSG em sap_ov_mensagem.",
  },
  grupos: [
    {
      titulo: "Controle da chamada",
      estrutura: "raiz",
      campos: [
        f("I_CARGA", "fixo S"),
        f("I_ORIG_PEDIDO", "fixo 4 (origem portal)"),
        f("I_TESTRUN", "X apenas na validação"),
        vazio("I_JOB"),
        vazio("I_JOBNAME"),
        vazio("I_USUARIO"),
        vazio("I_XMLNFE"),
      ],
    },
    {
      titulo: "Cabeçalho do pedido",
      estrutura: "I_S_OV",
      campos: [
        f("EMPRESA", "fixo 9800"),
        f("FILIAL", "9802 (SAP_OV_FILIAL)"),
        f("TP_OV", "ZV2P contribuinte (IE) · ZC2P sem IE · VBON bonificação"),
        f("INCO1", "CIF (frete CIF/DEDICADO) ou FOB"),
        f("INCO2", '"CIF BONIFICADO" quando o frete é bonificado'),
        f("NROPED", "número do pedido no portal — chave de correlação, nunca reutilizado"),
        f("XPED", "mesmo número do pedido"),
        f("VALOR_DESC", "desconto do cupom (+ frete quando bonificado)"),
        f("VLR_FRETE", "valor do frete do pedido"),
        f("ZTERM", "2P00 à vista · 2PPX Pix · 2PCC cartão · código da condição a prazo"),
        f("PURCH_DATE", "data do dia"),
        f("DATA_REMESSA", "data do dia"),
        f("VENDEDOR", "código SAP do consultor (travado em sap_vendedor_codigo na conclusão)"),
        f("NOME_VENDEDOR", "nome do consultor (35)"),
        vazio("VKBUR"),
        vazio("VKGRP"),
        vazio("VKORG"),
        vazio("VTWEG"),
        vazio("SPART"),
        vazio("AUGRU"),
        vazio("PERC_DESC"),
        vazio("NRO_BANCO"),
        vazio("QVOL"),
        vazio("PESO_BRUTO"),
        vazio("PESO_LIQ"),
        vazio("ESP"),
        vazio("IMEI_VENDEDOR"),
        vazio("EMAIL_VENDEDOR"),
        vazio("CPF_VENDEDOR"),
      ],
    },
    {
      titulo: "Transporte / peso",
      estrutura: "I_S_TRANSP",
      campos: [
        novo("PESO_BRUTO", "soma dos pesos brutos devolvidos pela simulação (ZNFE_OV_SIMULAR)"),
        novo("PESO_LIQ", "soma dos pesos líquidos da simulação"),
        vazio("QVOL"),
        vazio("ESP"),
      ],
    },
    {
      titulo: "Parceiros",
      estrutura: "T_PARCEIRO",
      campos: [
        f("PARTN_ROLE", "AG = parceiro faturado · CL = cliente do pedido"),
        f("CNPJ", "documento com zero-pad 14"),
        f("CPF", "documento com zero-pad 11 (pessoa física)"),
        f("NAME", "razão social / nome (35)"),
        f("PLTYP", "fixo 01"),
        vazio("NAME_2"),
        vazio("NAME_3"),
        vazio("NAME_4"),
        vazio("STREET"),
        vazio("POSTL_CODE"),
        vazio("CITY"),
        vazio("DISTRICT"),
        vazio("REGION"),
        vazio("TELEPHONE"),
        vazio("FAX_NUMBER"),
        vazio("E_MAIL"),
        vazio("PAIS"),
        vazio("NUMERO"),
        vazio("COMPLEMENTO"),
        vazio("KUNNR"),
      ],
    },
    {
      titulo: "Itens",
      estrutura: "T_ITEM",
      campos: [
        f("ITM_NUMBER", "sequencial do item"),
        f("MATERIAL", "código do produto (kit: 100000350 é enviado como 100000278)"),
        f("QTDE", "quantidade do item"),
        f("UM", "fixo UN"),
        f("BILL_DATE", "data do dia"),
        f("VALOR_PROD", "enviado VAZIO — o preço vem da condição do SAP"),
        vazio("PESO_BRUTO"),
        vazio("PESO_LIQ"),
        vazio("UM_PESO"),
        vazio("VALOR_DESC"),
        vazio("PERC_DESC"),
        vazio("NCM"),
        vazio("FCI"),
        vazio("EAN"),
        vazio("DEPOSITO"),
      ],
    },
    {
      titulo: "Pagamento",
      estrutura: "T_PAGTO",
      campos: [
        f("PARCELA", "sequencial da parcela"),
        f("DT_VENCTO", "vencimento pelo JSONB parcelas da condição escolhida (dias)"),
        f("VALOR", "valor da parcela (última parcela absorve o arredondamento)"),
        vazio("TIPO_PG"),
      ],
    },
    {
      titulo: "Observações e e-mail",
      estrutura: "T_OBS / T_EMAIL",
      campos: [
        f("OBS", "observações + contato + endereço de entrega + transportadora, linhas de 130 caracteres"),
        novo("OBS · kit / frete bonificado", "marcações PEDIDO KIT FOTOVOLTAICO e FRETE BONIFICADO"),
        f("EMAIL", "e-mail do cliente do pedido (cliente_email)"),
      ],
    },
  ],
  retornos: [
    f("T_MSG.TYPE", "S sucesso · W aviso · E/A/X erro (W com MSGNR 036 é tratado como erro)"),
    f("T_MSG.MSGNR", "000 com TYPE=S → MESSAGE traz o número da ordem · 017 confirmação textual"),
    f("T_MSG.MESSAGE", "número da ordem (VBELN) ou o texto do erro"),
    f("T_MSG.MSGID", "classe de mensagem do SAP"),
    novo(
      "T_MSG completo",
      "quando não vem MSGNR=000, TODOS os itens (TYPE/MSGNR: MESSAGE) são gravados em sap_ov_mensagem",
    ),
  ],
};

const SAP_CONSULTA: FluxoDic = {
  id: "sap-nfs",
  titulo: "Acompanhamento e nota fiscal",
  chamada: "RFC ZNFE_OV_CONSULTAR (SOAP 1.2)",
  gatilho: "Cron a cada 15 minutos sobre os pedidos com ordem criada e ainda não entregues.",
  operacoes: [
    "Consulta por I_NROPED com I_DADOS=X e I_DANFE=X.",
    "Avanço de status: só avança, nunca retrocede (Processando → Separação → Faturado → Coletado).",
    "Recuperação de duplicado: leitura do VBELN_VA quando a criação não devolveu o número.",
  ],
  logSlug: "cron.sap-nfs",
  job: "cron.sap-nfs",
  estados: {
    ok: "Status do pedido avançado / NF e DANFE gravados.",
    pendente: 'SAP responde "processo não está completo" — pedido segue no status atual.',
    erro: "Falha HTTP/SOAP na consulta ou na gravação da DANFE.",
  },
  grupos: [
    {
      titulo: "Entrada",
      estrutura: "raiz",
      campos: [
        f("I_NROPED", "número do pedido do portal"),
        f("I_DADOS", "fixo X — pede os dados de acompanhamento"),
        f("I_DANFE", "fixo X — pede o PDF da DANFE"),
        vazio("I_BOLETO"),
        vazio("I_XML_NFE"),
      ],
    },
  ],
  retornos: [
    f("STATUS_PICKING", "AOK/OK → status Separação + separado_em"),
    f("STATUS_ROMANEIO", "OK → status Coletado + enviado_em"),
    f("NUM_NF / DOCNUM", "número da NF-e → status Faturado + nf_numero + faturado_em"),
    f("SERIE_NF / SERIE", "série da NF-e → nf_serie"),
    f("CHAVE_NFE / CHAVE / NFE_CHAVE", "chave da NF-e → nf_chave"),
    f("E_DANFE / DANFE", "PDF base64 da DANFE → Storage + danfe_path"),
    f("VBELN_VA", "número da ordem de venda — usado na recuperação de pedido duplicado"),
    falta("DHEMISSAO", "data/hora de emissão da NF-e (a antiga exibia na timeline)"),
    falta("TRANSPORTADORA", "transportadora do romaneio"),
    falta("DATA_EXPEDICAO", "data de expedição do romaneio"),
    falta("VBELN_VL / VBELN_VF", "números de remessa e fatura para a timeline"),
    falta("E_S_MSG", 'mensagem textual do SAP ("processo não está completo") — hoje não é persistida'),
  ],
};

const SAP_SIMULAR: FluxoDic = {
  id: "sap-precos",
  titulo: "Preço e peso (simulação)",
  chamada: "RFC ZNFE_OV_SIMULAR (SOAP 1.2)",
  gatilho: "Montagem da proposta (preço dos itens) e cálculo do peso antes de criar a ordem.",
  operacoes: [
    "Simulação por lista de preço (PLTYP) e tipo de OV.",
    "Kit fotovoltaico: usa VALOR_LIQUIDO + PIS + COFINS (isenção de ICMS e IPI).",
  ],
  logSlug: "sap",
  estados: {
    ok: "Valores e pesos devolvidos por material.",
    pendente: "Item sem retorno de valor — cai no preço do catálogo.",
    erro: "SOAP Fault ou mensagem E/A/X em E_T_MSG.",
  },
  grupos: [
    {
      titulo: "Cabeçalho",
      estrutura: "I_S_OV",
      campos: [
        f("EMPRESA", "fixo 9800"),
        f("FILIAL", "9802"),
        f("TP_OV", "ZV2P por padrão (ou o tipo do pedido)"),
        f("VKORG", "fixo 9800"),
        f("VTWEG", "fixo 10"),
        f("SPART", "fixo 10"),
        f("ZTERM", "fixo B000 na simulação"),
        f("VLR_FRETE", "fixo 0"),
        f("PURCH_DATE", "data do dia"),
        f("DATA_REMESSA", "data do dia"),
      ],
    },
    {
      titulo: "Parceiro e itens",
      estrutura: "I_S_PARCEIRO / I_T_ITENS",
      campos: [
        f("PLTYP", "tabela de preço do cliente"),
        f("CNPJ / CPF", "documento do cliente quando informado"),
        f("ITM_NUMBER", "sequencial 000010, 000020…"),
        f("MATERIAL", "código do produto"),
        f("UM", "fixo UN"),
        f("QTDE", "quantidade simulada"),
      ],
    },
  ],
  retornos: [
    f("E_T_VALORES.MATERIAL", "material da linha (pares ATRIBUTO/VALOR por ITM_NUMBER)"),
    f("VALOR_LIQUIDO", "valor líquido do item"),
    f("VALOR_IMPOSTO", "impostos do item (somado ao líquido no preço de venda)"),
    f("VL_PIS / VL_COFINS", "usados no preço do kit fotovoltaico"),
    f("VL_ICMS / VL_IPI", "exibidos/descartados conforme a regra do kit"),
    f("PESO_LIQUIDO / PESO_BRUTO", "peso por item — alimenta I_S_TRANSP da ordem e a Fretefy"),
    f("E_T_MSG.TYPE / MESSAGE", "mensagens da simulação (E/A/X viram erro)"),
  ],
};

const SAP_ESTOQUE: FluxoDic = {
  id: "sap-estoque",
  titulo: "Estoque e containers",
  chamada: "RFC ZHDIT_ZMMR059 (SOAP 1.1)",
  gatilho: "Cron a cada 6 horas e botão manual na tela de estoque.",
  operacoes: ["Espelho completo: reescreve estoque e containers a cada execução."],
  logSlug: "sap",
  job: "cron.estoque",
  estados: {
    ok: "Execução gravou as linhas de estoque e containers.",
    pendente: "Nenhuma execução no período.",
    erro: "SOAP Fault, resposta sem REGISTROS ou falha de gravação.",
  },
  grupos: [
    {
      titulo: "Filtro",
      estrutura: "I_FILTRO",
      campos: [
        f("CENTRO_DE / CENTRO_ATE", "fixo 9802"),
        f("GRP_MERC_DE", "grupos de mercadoria consultados"),
        vazio("MATERIAL_DE / MATERIAL_ATE"),
        vazio("DEPOSITO_DE / DEPOSITO_ATE"),
        vazio("LOTE_DE / LOTE_ATE"),
        vazio("TP_MATERIAL_DE / TP_MATERIAL_ATE"),
        vazio("GRP_MERC_ATE"),
        vazio("GRP_COMP_DE / GRP_COMP_ATE"),
        vazio("UNID_EXIB"),
      ],
    },
  ],
  retornos: [
    f("MATERIAL", "código do material (sem zeros à esquerda)"),
    f("CENTRO", "centro (default 9802)"),
    f("DESCRICAO", "descrição do material"),
    f("EAN", "código de barras"),
    f("NCM", "NCM normalizado (8 dígitos)"),
    f("CMM", "consumo médio mensal"),
    f("PRECO_VENDA", "preço de venda do SAP"),
    f("VALOR_ESTOQUE", "valor do estoque"),
    f("GRP_MERCADORIAS", "grupo de mercadorias"),
    f("TIPO_MATERIAL", "tipo do material"),
    f("UMB", "unidade base"),
    f("EST_LIVRE_0001/0002/0003/0005/0007", "estoque livre somado dos depósitos"),
    f("EST_BLOQ_0001/0002/0003/0005/0007", "estoque bloqueado somado dos depósitos"),
    f("QTD_PEND_FATURAR", "quantidade pendente de faturamento (reconciliação da reserva do portal)"),
    f("EST_ENTREPOSTO", "estoque em entreposto"),
    f("CONTAINER_1..8", "container em trânsito"),
    f("QTD_PEDIDO_1..8", "quantidade do container"),
    f("FORNECEDOR_1..8", "fornecedor do container"),
    f("DATA_ENTREGA_1..8", "data de entrega prevista"),
    f("PESO_BRUTO_TOT_1..8 / PESO_LIQ_TOT_1..8", "pesos totais do container"),
  ],
};

const SAP_CATALOGO: FluxoDic = {
  id: "sap-catalogo",
  titulo: "Catálogo de materiais",
  chamada: "RFC listar_material (/PRCITNFE/NFE_OV_MATERIAL, SOAP 1.2)",
  gatilho: "Sincronização do catálogo (manual no admin e junto do cron de estoque).",
  operacoes: ["Espelho somente leitura do catálogo; o portal recorta os materiais liberados."],
  logSlug: "sap",
  estados: {
    ok: "Materiais devolvidos e gravados em sap_produtos.",
    pendente: "Nenhuma sincronização executada.",
    erro: "Credencial recusada, tabela e_t_material vazia ou SOAP Fault.",
  },
  grupos: [
    {
      titulo: "Entrada",
      estrutura: "i_t_param",
      campos: [f("Atributo / Valor", "pares VK12 = 2P-0001 e VK12 = 2P-0002 (listas de preço consultadas)")],
    },
  ],
  retornos: [
    f("Matnr", "código do material"),
    f("Maktx", "descrição"),
    f("Meins", "unidade de medida"),
    f("Steuc / Stawn / Ncm", "NCM (normalizado para 8 dígitos)"),
    f("Pltyp", "lista de preço do material"),
  ],
};

const SAP_VENDAVEIS: FluxoDic = {
  id: "sap-catalogo-vendaveis",
  titulo: "Catálogo vendável (preço VK12)",
  chamada: "RFC ZNFE_OV_SIMULAR (SOAP 1.2) — lotes de 40 materiais, listas 01 e 02",
  gatilho: "Cron diário, junto da sincronização de produtos e pelo reprocesso do gatilho.",
  operacoes: [
    "Material com preço vigente fica ativo; sem preço em nenhuma lista fica inativo.",
    "Material que aborta o lote é isolado por bisseção e tratado como sem preço.",
    "Override manual na Gestão de Produtos sempre vence a varredura.",
  ],
  logSlug: "sap",
  job: "sap.sync-produtos",
  estados: {
    ok: "Varredura concluída: flags de ativo/inativo atualizados com a contagem no log.",
    pendente: "Nenhuma varredura no período.",
    erro: "Credencial recusada, SOAP Fault ou falha ao gravar o catálogo.",
  },
  grupos: [
    {
      titulo: "Entrada",
      estrutura: "I_S_PARCEIRO / I_T_ITENS",
      campos: [
        f("PLTYP", "lista de preço verificada (01 e depois 02)"),
        f("MATERIAL", "código SAP numérico do material"),
        f("QTDE", "fixo 1 (só interessa se existe preço)"),
      ],
    },
  ],
  retornos: [
    f("VALOR_LIQUIDO / VALOR_IMPOSTO", "preço encontrado (gravado em preco_vk12)"),
    f("E_T_MSG", "mensagem de erro do material que não simula"),
  ],
};

export const FLUXOS_SAP: FluxoDic[] = [
  SAP_CLIENTE,
  SAP_OV,
  SAP_CONSULTA,
  SAP_SIMULAR,
  SAP_ESTOQUE,
  SAP_CATALOGO,
  SAP_VENDAVEIS,
];

/* ----------------------------------------------------------- Salesforce */

const SF_CLIENTE: FluxoDic = {
  id: "salesforce-clientes",
  titulo: "Cliente → Account / Contact",
  chamada: "REST /sobjects/Account e /sobjects/Contact (gateway do conector)",
  gatilho: "Ao salvar o cadastro do cliente (junto do envio ao SAP) e no re-sync manual.",
  operacoes: [
    "Insert: POST quando não existe Account para o documento.",
    "Update: PATCH quando o cliente já tem sf_account_id (ou Account achada por CNPJ__c/Name).",
    "Contatos adicionais da tabela contatos viram Contacts do mesmo Account.",
    "Retry sem CNPJ__c quando a org recusa o campo customizado.",
  ],
  logSlug: "salesforce-clientes",
  estados: {
    ok: "sf_account_id (e sf_contact_id) gravados no cliente.",
    pendente: "Cliente sem sf_account_id — nunca sincronizado.",
    erro: "sf_status = 'erro' — texto real da org em sf_erro.",
  },
  grupos: [
    {
      titulo: "Account",
      estrutura: "Account",
      campos: [
        f("Name", "razão social do cliente"),
        f("Phone", "telefone do cadastro"),
        f("Website", "site do cadastro"),
        f("BillingStreet", "logradouro + número + complemento"),
        f("BillingCity", "cidade"),
        f("BillingState", "UF"),
        f("BillingPostalCode", "CEP só dígitos"),
        f("BillingCountry", 'fixo "Brasil"'),
        f("CNPJ__c", "documento só dígitos — chave de dedupe (com retry sem o campo)"),
        f("OwnerId", "consultor dono do cliente via profiles.sf_user_id"),
      ],
    },
    {
      titulo: "Contact",
      estrutura: "Contact",
      campos: [
        f("AccountId", "Account do cliente"),
        f("LastName", "sobrenome do contato (dedupe por Account + LastName)"),
        f("FirstName", "primeiro nome do contato"),
        f("Email", "e-mail do contato (fallback: e-mail do cliente)"),
        f("Phone", "telefone do contato (fallback: telefone do cliente)"),
        f("OwnerId", "consultor dono do cliente"),
      ],
    },
  ],
  retornos: [
    f("sf_account_id", "Id do Account gravado no cliente"),
    f("sf_contact_id", "Id do Contact principal"),
    f("sf_status", "sincronizado | erro"),
    f("sf_erro", "mensagem real devolvida pelo Salesforce"),
  ],
};

const SF_PEDIDO: FluxoDic = {
  id: "salesforce-pedidos",
  titulo: "Pedido → Opportunity",
  chamada: "REST /sobjects/Opportunity + SOQL /query (gateway do conector)",
  gatilho:
    "Salvar proposta · concluir pedido (após o SAP) · mudança de status pelo cron de NFs/Fretefy · cancelamento · reprocesso do job salesforce.pedido.",
  operacoes: [
    "Insert: POST quando a proposta não tem sf_opp_id.",
    "Update: PATCH da Opportunity existente (idempotente).",
    "Recriação: se a Opportunity gravada não existe mais na org, o portal recria.",
    "Retry sem campos customizados quando a org recusa Numero_Pedido_Portal__c / Numero_SAP__c.",
    "Cancelamento: StageName vai para Pedido Cancelado (o Salesforce é espelho, nunca altera o status no portal).",
  ],
  logSlug: "salesforce",
  job: "salesforce.pedido",
  estados: {
    ok: "sf_opp_id gravado e sf_status = 'sincronizado'.",
    pendente: "Pedido sem sf_opp_id — aguardando gatilho.",
    erro: "sf_status = 'erro' — mensagem real em sf_mensagem (inclui 'sincronize o cadastro do cliente primeiro').",
  },
  grupos: [
    {
      titulo: "Opportunity",
      estrutura: "Opportunity",
      campos: [
        f("Name", '"Pedido {número} — {nome do projeto}" (120 caracteres)'),
        f("AccountId", "sf_account_id do cliente ou busca por CNPJ__c/Name — sem conta, a sync bloqueia"),
        f(
          "StageName",
          "status do portal → picklist da org: Em Negociação · Projeto Fechado · Estoque · Pedido Concluído · Pedido Cancelado · Oportunidade Perdida",
        ),
        f("CloseDate", "previsão de fechamento ou data de criação do pedido"),
        f("Amount", "valor total do pedido"),
        f("Description", "itens, frete, forma de pagamento e nº da OV SAP em texto"),
        f("OwnerId", "dono do pedido via profiles.sf_user_id"),
        f("Numero_Pedido_Portal__c", "número do pedido no portal"),
        f("Numero_SAP__c", "número da ordem de venda no SAP (VBELN)"),
      ],
    },
    {
      titulo: "Busca da conta",
      estrutura: "SOQL",
      campos: [
        f("Account.CNPJ__c", "primeira tentativa de resolução da conta"),
        f("Account.Name", "fallback quando a org não tem CNPJ__c"),
      ],
    },
  ],
  retornos: [
    f("sf_opp_id", "Id da Opportunity"),
    f("sf_account_id", "Id do Account resolvido"),
    f("sf_status", "sincronizado | erro"),
    f("sf_mensagem", "mensagem real da operação/erro"),
    f("sf_enviado_em", "data/hora da última sincronização (base do alerta de estágio defasado)"),
  ],
};

export const FLUXOS_SALESFORCE: FluxoDic[] = [SF_CLIENTE, SF_PEDIDO];

export function fluxosDoPainel(painel: "sap" | "salesforce"): FluxoDic[] {
  return painel === "sap" ? FLUXOS_SAP : FLUXOS_SALESFORCE;
}

/** Todos os nomes de campo do dicionário (usado pelo teste de paridade). */
export function camposDoDicionario(fluxos: FluxoDic[]): Set<string> {
  const out = new Set<string>();
  for (const fl of fluxos) {
    for (const g of fl.grupos) for (const c of g.campos) for (const nome of expandir(c.campo)) out.add(nome);
    for (const c of fl.retornos) for (const nome of expandir(c.campo)) out.add(nome);
  }
  return out;
}

/** "NAME1..NAME4", "CNPJ / CPF", "EST_LIVRE_0001/0002" → nomes individuais. */
function expandir(campo: string): string[] {
  const limpo = campo.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const partes = limpo.split(/\s*(?:\/|·)\s*|\s{2,}/).filter(Boolean);
  const out: string[] = [];
  for (const p of partes) {
    const faixa = /^([A-Z_]*?)(\d+)\.\.(?:[A-Z_]*?)(\d+)$/.exec(p);
    if (faixa) {
      const [, prefixo, de, ate] = faixa;
      for (let i = Number(de); i <= Number(ate); i++) out.push(`${prefixo}${i}`);
      continue;
    }
    const sufixos = /^([A-Z_]+_)(\d{4})((?:\/\d{4})+)$/.exec(p);
    if (sufixos) {
      out.push(`${sufixos[1]}${sufixos[2]}`);
      continue;
    }
    out.push(p.replace(/\.$/, ""));
  }
  return out;
}
