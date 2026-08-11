# Portal 2P — Worker de background (VPS)

Processo Node sem dependências que roda **fora** do portal. Responsável por sincronizar o
Salesforce para as bases espelho do Supabase. O portal nunca consulta o Salesforce em tempo real:
as telas leem apenas o banco.

```
Salesforce ──(SOQL, OAuth)──> Worker (VPS) ──(PostgREST)──> account_sf (base espelho)
                                   │
                                   └──> sync_runs / sync_queue / sync_state (Lovable Cloud)
```

## Requisitos

- VPS com Node 20+ (2 vCPU / 4 GB é suficiente)
- Nenhuma porta exposta na internet — o worker só faz chamadas de saída

## Instalação

```bash
git clone <este-repo> /opt/portal-worker && cd /opt/portal-worker/worker
cp .env.example .env && nano .env      # preencha as chaves
node --env-file=.env src/index.js --once --job=salesforce_accounts   # teste
```

### Variáveis

| Variável | Onde obter |
| --- | --- |
| `PORTAL_SUPABASE_SERVICE_KEY` | chave de serviço do projeto do portal |
| `ACCOUNTS_*_SUPABASE_SERVICE_KEY` | chave de serviço de cada base espelho |
| `SF_*_CLIENT_ID` / `SF_*_CLIENT_SECRET` | Connected App do Salesforce com **OAuth Client Credentials Flow** habilitado e um "Run As" user com acesso às contas |

## Rodando como serviço (systemd)

```ini
# /etc/systemd/system/portal-worker.service
[Unit]
Description=Portal 2P background worker
After=network-online.target

[Service]
WorkingDirectory=/opt/portal-worker/worker
ExecStart=/usr/bin/node --env-file=.env src/index.js
Restart=always
RestartSec=10
User=portal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now portal-worker && journalctl -u portal-worker -f
```

## Como funciona

- **Ciclo automático**: a cada `SYNC_INTERVAL_MINUTES` roda todos os jobs de todas as instâncias.
- **Incremental**: cada job guarda o último `LastModifiedDate` em `sync_state`; a rodada seguinte
  traz só o que mudou. Para forçar carga total: `--once --job=salesforce_accounts --full`.
- **Fila manual**: o botão "Sincronizar agora" em *Integrações* insere uma linha em `sync_queue`;
  o worker consome a cada `QUEUE_POLL_SECONDS`. Não é preciso expor HTTP na VPS.
- **Observabilidade**: toda execução vira uma linha em `sync_runs` (status, duração, registros,
  erro), exibida no painel de Integrações.

## Adicionando um novo job

1. Crie `src/jobs/<nome>.js` exportando `JOB` e uma função `(instance, cursor) => { read, written, cursor }`.
2. Registre no mapa `JOBS` em `src/index.js`.
3. Adicione o job na lista `JOBS` de `src/components/sync-panel.tsx` (portal) para aparecer no painel.
