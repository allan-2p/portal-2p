# SAP — envelopes de referência (RFC via SOAP)

Namespace RFC: `urn:sap-com:document:sap:rfc:functions` · SOAP 1.1 (`Content-Type: text/xml; charset=utf-8` + `SOAPAction`).

| Arquivo | Função | Uso no portal |
| --- | --- | --- |
| `znfe_ov_simular.request.xml` | `ZNFE_OV_SIMULAR` | Simulação de preços/impostos e pesos dos itens (já em uso) |
| `znfe_ov_criar.request.xml` | `ZNFE_OV_CRIAR` | Criação da ordem de venda no checkout (Salvo → Processando) |
| `znfe_ov_consultar.request.xml` | `ZNFE_OV_CONSULTAR` | Consulta por `I_NROPED` (dados + XML da NF-e) |
| `znfe_ov_consultar_nf.request.xml` | `ZNFE_OV_CONSULTAR` | Consulta por filial + `I_VBELN_VA`, retornando DANFE |

## Constantes 2P Carregadores (do exemplo de criação)

- `EMPRESA` 9800 · `FILIAL` 9802 · `TP_OV` ZC2P
- `VKORG` 9800 · `VTWEG` 10 · `SPART` 10 (vistos na simulação)
- `I_ORIG_PEDIDO` 4 (portal) · `I_CARGA` `S`
- `ZTERM` = condição de pagamento (ex.: `2P00`, `B000`)
- `I_TESTRUN` = `X` para validar sem gravar

## Notas de mapeamento

- `NROPED` = número do pedido do portal (mantido o esquema de numeração atual).
- `T_PARCEIRO`: `AG` = emissor da ordem, `CL` = cliente de faturamento (`CNPJ` ou `CPF`).
- `T_ITEM`: `MATERIAL` = código SAP do produto, `QTDE`, `UM`; peso/NCM podem ir vazios (SAP resolve).
- `T_PAGTO`: parcelas com `DT_VENCTO` e `VALOR` (usado para o boleto Itaú).
- `T_OBS`: observações livres — usamos para contato e endereço de entrega quando difere do faturamento.
- `I_S_TRANSP`: `QVOL`, `PESO_BRUTO`, `PESO_LIQ`, `ESP` — alimentados com os totais da cotação de frete.
- `ZNFE_OV_CONSULTAR`: flags `I_DADOS`, `I_DANFE`, `I_XML_NFE`, `I_BOLETO` controlam o que volta; base do cron que move Processando → Separação → Faturado.
