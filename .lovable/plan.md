# Teste read-only do proxy mTLS do Itaú em produção

Objetivo: confirmar, sem criar nenhuma cobrança, que o proxy mTLS continua de pé na URL atual e que o Itaú aceita o certificado — validando pelo app publicado (`portal.2pgroup.app`).

## Por que precisa de um endpoint novo

O portal já está no modo "proxy" (as variáveis `ITAU_PROXY_URL`, `ITAU_PROXY_SECRET`, credenciais Pix e chave Pix estão presentes). Só que hoje não existe nenhuma forma de disparar uma chamada ao Itaú em produção sem efeito colateral:

- Emitir Pix ou boleto cria cobrança real.
- O job de reconsulta de Pix (`/api/public/hooks/pix-reconsulta`) só chama o Itaú se houver cobrança pendente há mais de 15 minutos. Sem pendências ele retorna "0 consultados" e o teste fica inconclusivo — não prova nada sobre o proxy.

Por isso o teste precisa de um endpoint de diagnóstico dedicado, somente leitura.

## O que será feito

1. **Novo endpoint de diagnóstico** `/api/public/hooks/itau-diagnostico`, protegido pelo mesmo header `x-cron-secret` já usado pelos outros hooks (sem o header, 401).
2. O endpoint faz **uma única chamada GET** ao Itaú via proxy: consulta de uma cobrança Pix com um `txid` propositalmente inexistente. Nenhuma escrita, nenhuma cobrança criada.
3. A resposta traz um diagnóstico legível: modo em uso (proxy/direto/indisponível), host do proxy (sem expor segredo), status HTTP devolvido pelo Itaú e o tempo da chamada.
4. **Interpretação do resultado:**
   - Itaú devolveu `404` (cobrança não encontrada) → proxy de pé, certificado aceito, token OAuth OK. É o resultado esperado de sucesso.
   - Erro de rede / "não foi possível falar com o proxy" → o projeto do proxy foi apagado junto ou mudou de URL; Pix e boleto estão quebrados em produção.
   - `401`/`403` do proxy → `ITAU_PROXY_SECRET` divergente entre portal e proxy.
   - `403` do Itaú com "ausência do certificado" → proxy responde, mas perdeu o certificado mTLS.
5. **Execução do teste** contra o app publicado, com o resultado reportado a você em texto claro.
6. Registro da ferramenta no `CHANGELOG.md` e sincronização do `README.md` (nova rota e hook), conforme a rotina do projeto.

## Dependência importante

O endpoint só existe em produção **depois de publicar**. Ou seja: implemento, você publica, e então eu rodo o teste contra `portal.2pgroup.app`. Se preferir não publicar agora, o mesmo teste pode rodar antes contra o ambiente do editor — só não garante que as variáveis da produção sejam idênticas.

## Detalhes técnicos

- Arquivo novo: `src/routes/api/public/hooks/itau-diagnostico.ts` (handler `POST`, autenticado por `x-cron-secret` via `cron-auth.server.ts`).
- Lógica em `src/lib/itau-diagnostico.server.ts`, reutilizando `modoItau()`, `credenciaisPix()` e `chamarItau()` de `src/lib/itau-api.server.ts`. Nenhuma alteração no fluxo de cobrança existente.
- O `404` do Itaú é tratado como sucesso do diagnóstico (hoje `chamarItau` lança erro em qualquer status não-ok — o diagnóstico captura e classifica em vez de propagar).
- Nada de segredo, token, certificado ou dado de cliente na resposta ou nos logs.
