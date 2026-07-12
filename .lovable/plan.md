## Objetivo
Adicionar uma nova aba **"Compras Efetuadas [A-WF]"** dentro de **Administrador > Tabelas** que carrega diretamente o relatório de mesmo nome do Salesforce (via Analytics API), exibindo o relatório inteiro (sem filtro de escopo de vendedor) com as colunas principais.

## Onde
- Rota existente: `src/routes/_authenticated/admin.tabelas.tsx` (já tem estrutura de `Tabs`).
- Adicionar nova `TabsTrigger` + `TabsContent` `compras-efetuadas`, ao lado das abas atuais (Orçamento, Vendas, Projeções, Semanas).
- Restrito a admin (guard já existe na página).

## Backend — nova server function
Arquivo: `src/lib/salesforce.functions.ts`

1. `getSalesforceReportByName` — `createServerFn({ method: "GET" })` com `requireSupabaseAuth`.
   - Passo A: Busca o Id do relatório via SOQL:
     `GET /query?q=SELECT+Id,Name+FROM+Report+WHERE+Name='Compras Efetuadas [A-WF]'+LIMIT+1`
   - Passo B: Executa o relatório via Analytics REST:
     `GET /analytics/reports/{reportId}?includeDetails=true`
   - Retorna DTO serializável:
     ```ts
     {
       reportId: string;
       name: string;
       columns: { label: string; apiName: string; dataType: string }[];
       rows: Array<Record<string, string | number | null>>;
     }
     ```
   - Mapeia `reportMetadata.detailColumns` + `reportExtendedMetadata.detailColumnInfo` para nomes de coluna, e itera `factMap["T!T"].rows[].dataCells[]` para linhas (usa `label` como valor formatado; `value` bruto quando numérico/data).
   - Se o relatório não for encontrado, retorna erro claro ("Relatório 'Compras Efetuadas [A-WF]' não encontrado no Salesforce").
   - Sem filtro de escopo (é relatório inteiro conforme escolhido).

## Frontend — nova aba na página Tabelas
Arquivo: `src/routes/_authenticated/admin.tabelas.tsx`

1. Novo componente `ComprasEfetuadasTable` que:
   - Usa `useServerFn(getSalesforceReportByName)` + `useQuery` (`staleTime: 60_000`, `enabled: hasRole("admin") && tab === "compras-efetuadas"`).
   - Renderiza um `<table>` com o mesmo visual das outras tabelas (glass/rounded), com colunas principais escolhidas:
     - **Data** (Data de fechamento / Close Date do pedido)
     - **Cliente / Conta**
     - **Oportunidade / Pedido** (nome)
     - **Produto** (quando disponível — detalhe de linha)
     - **Vendedor** (Owner)
     - **Etapa / Status**
     - **Quantidade**
     - **Valor Total** (formatado BRL, com totalizador no `<tfoot>`)
   - Mapeamento das colunas do relatório para nossos cabeçalhos por `apiName` (heurística case-insensitive: `CloseDate|Data`, `Account|Cliente`, `Opportunity.Name|Name|Pedido`, `Product|Produto`, `Owner|Vendedor`, `Stage|Status`, `Quantity|Qtd`, `Amount|TotalPrice|Valor`).
   - Se uma coluna esperada não existir no relatório, mostra "—".
   - Suporta o mesmo input de busca (`search`) já existente no topo (filtra por Cliente, Oportunidade, Vendedor, Produto).
   - **Não** usa o `DateRangeFilter` (a aba não mostra o filtro de data, pois o relatório é a fonte da verdade).
   - Estados: loading (spinner), error (banner destrutivo), vazio ("Nenhum registro no relatório").

2. Registro da aba:
   - `type Tab = "orcamentos" | "vendas" | "projecoes" | "semanas" | "compras-efetuadas"`.
   - `TabsTrigger value="compras-efetuadas"` com ícone `ShoppingBag` (lucide) e label "Compras Efetuadas [A-WF]".
   - `TabsContent` renderiza `<ComprasEfetuadasTable search={search} />`.
   - Esconder `DateRangeFilter` também quando `tab === "compras-efetuadas"` (mesma lógica que `projecoes`).

## Considerações técnicas
- Analytics API do Salesforce está exposta pelo gateway em `/analytics/reports/{id}` — mesma base `GATEWAY_URL` já usada em `sfFetch`.
- Nome do relatório com `[` `]` precisa ser URL-encoded no `q=` da SOQL.
- Se houver mais de um relatório com esse nome (folder diferente), pega o primeiro e loga aviso; documentar isso no error message caso vazio.
- Retorno é DTO plano (strings/números/null), compatível com SSR-serializable.

## Arquivos alterados
- `src/lib/salesforce.functions.ts` — adiciona `getSalesforceReportByName` e tipo `SalesforceReportResult`.
- `src/routes/_authenticated/admin.tabelas.tsx` — adiciona aba, tipo, componente `ComprasEfetuadasTable`, import `ShoppingBag`.

## Validação
- Rodar `tsgo` (via build automático) para garantir tipagem.
- Abrir `/admin/tabelas` como admin → clicar aba "Compras Efetuadas [A-WF]" → conferir linhas e totalizador.
- Testar caso o relatório não existir (mensagem clara).
