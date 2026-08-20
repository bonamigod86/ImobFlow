# Guia de Implantação e Recuperação de Desastres — SaaS Imob

Versão: 1.0 · Fase 6

---

## 1. Componentes implantados

| Componente | Obrigatório | Notas |
| --- | --- | --- |
| Next.js (app + API) | sim | runtime Node ≥ 20; edge middleware no edge runtime |
| PostgreSQL 16 | sim | fonte da verdade; tenant_id row-segregated |
| Redis 7 | sim | cache + broker BullMQ (filas, retries, DLQ, rate limit) |
| Workers BullMQ | sim (1+ por fila) | `lead`, `webhook`, `media`, `import`, `billing`, `email` |
| Object storage S3 | sim (prod) | mídia/imóveis; fallback local apenas dev |
| SMTP/HTTP e-mail | opcional | `EMAIL_PROVIDER` = resend/sendgrid/ses/console |
| Gateway de pagamento | opcional | Stripe / Asaas / custom (webhooks) |

### Workers

```bash
npm run worker            # todos os workers em um processo
# ou individualmente:
npm run worker:lead
npm run worker:webhook
npm run worker:media
npm run worker:import
npm run worker:billing
npm run worker:email
```

Em produção, execute ao menos **uma instância dedicada de cada worker**
(ou o `worker` combinado, aceitando concorrência interna). Filas são
distribuídas por padrão: você pode escalar horizontalmente workers da mesma
fila.

---

## 2. Variáveis de ambiente (referência)

Copie de `.env.example`. Chaves:

| Variável | Necessidade | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | obrigatória | PostgreSQL (`postgresql://user:pass@host:5432/db?schema=public`) |
| `REDIS_URL` | obrigatória | `redis://host:6379` (use TLS/credenciais em produção) |
| `JWT_SECRET` | obrigatória | ≥ 32 chars; `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | opcional | `8h` padrão |
| `SESSION_COOKIE` | opcional | `saas_session` padrão |
| `APP_DOMAIN` | produção | domínio raiz p/ subdomínios (`saas.local`) |
| `APP_URL` | produção | URL pública da aplicação |
| `SEED_ADMIN_PASSWORD` | dev/seed | senha do admin demonstração |
| `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET/PUBLIC_BASE_URL` | produção | storage S3-compatível |
| `STRIPE_WEBHOOK_SECRET`/`STRIPE_SECRET_KEY` · `ASAAS_*` · `CUSTOM_WEBHOOK_SECRET` | pagamento | assinaturas de webhook de gateway |
| `BILLING_GRACE_DAYS` (5) · `BILLING_PRE_DUE_NOTIFY_DAYS` (3) · `BILLING_AUTOSUSPEND_ENABLED` | opcional | dunning |
| `EMAIL_PROVIDER` · `EMAIL_API_KEY` · `EMAIL_FROM` · `EMAIL_FROM_NAME` | e-mail | transporte ativo |
| `SES_REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY` | e-mail SES | credenciais AWS SES |
| `RESET_TOKEN_TTL_SECONDS` (900) | opcional | TTL do token de reset |
| `RATE_LIMIT_WINDOW_SECONDS` (60) · `RATE_LIMIT_AUTH` (10) · `RATE_LIMIT_PUBLIC_LEADS` (30) | opcional | rate limiting |
| `CORS_ORIGINS` | opcional | origens permitidas em `/api/public/*` |

> **Segredos nunca no repositório.** Use o gerenciador de segredos da sua
> plataforma (Vault, Secret Manager, env seguros da Vercel/Railway/Fly).

---

## 3. Implantação passo a passo (produção)

### 3.1 Pré-requisitos locais (dev/staging)

```bash
cp .env.example .env          # ajuste credenciais
docker compose up -d --build  # postgres + redis + app
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed
npm run dev                   # fora do container, se preferir
```

### 3.2 Deploy (CI/CD)

1. `npm ci`
2. `npx prisma generate`
3. `npx prisma migrate deploy` → **antes** de liberar o novo build
4. `npm run lint && npm run typecheck && npm test`
5. `npm run build`
6. Publicar build + iniciar web/API e os workers.

> Regra de ouro: **migre antes de publicar**. Migrações devem ser
> compatíveis com o build anterior (expansivo) sempre que possível.

### 3.3 Build com Docker

```bash
docker build -t saas-imob:latest .
# Dockerfile já cuida de prisma generate + next build.
```

---

## 4. Escalabilidade

- **Web/API**: stateless (sessão em JWT; contexto de tenant via headers) →
  escala horizontalmente atrás de um load balancer; habilite
  `APP_DOMAIN` + wildcard DNS (`*.saas.local`) e TLS.
- **Workers**: escala horizontal por fila; a concorrência de cada worker é
  configurável no construtor do worker.
- **Postgres**: use serviço gerenciado (RDS/Cloud SQL) com réplica de leitura
  se necessário. Índices cobrem os filtros de busca/leads.
- **Redis**: use serviço gerenciado com **persistência AOF** (as filas BullMQ
  devem sobreviver a reinícios). Nunca `maxmemory-policy noeviction` para o
  banco de filas — configure políticas adequadas e monitore `used_memory`.

---

## 5. Backups e recuperação de desastres (DR)

### 5.1 Postgres — fonte da verdade

Backup diário (lógico) + PITR (WAL) em serviço gerenciado:

```bash
# lógico (full)
pg_dump "$DATABASE_URL" --format=custom --file=saas-imob-$(date +%F).dump
# restore
pg_restore --clean --if-exists -d "$DATABASE_URL" saas-imob-$(date +%F).dump
```

Objetivos recomendados: RPO ≤ 5 min (WAL contínuo), RTO ≤ 1 h (restore
automático de snapshot + PITR).

### 5.2 Redis

- Persistência **AOF** ativada (appendonly yes, everysec) para filas e rate
  limit tolerantes a perda de segundos.
- Perda de cache/rate-limit é **não crítica** (fail-open; recálculo).
- Perda de jobs: os workers reprocessam a partir do que o Postgres referencia
  (ImportBatch, WebhookDelivery, faturas) — scripts de reconciliação existem
  (`/api/admin/billing/scan`, replay de jobs).

### 5.3 Object storage (S3)

- Versionamento de bucket + lifecycle (transição para IA/Glacier) + replicação
  cross-region para o bucket de mídia.

### 5.4 Runbook de DR — exemplo

| Cenário | Ação |
| --- | --- |
| Perda total da instância web | subir novo build (imagem Docker) + apontar LB |
| Perda do Postgres | restore snapshot PITR + validar integridade (`npx prisma migrate status`, testes) |
| Perda do Redis | subir novo Redis (AOF) — filas recomeçam; rate limit zera (fail-open) |
| Vazamento de segredo (JWT_SECRET) | rotacionar JWT_SECRET, `EMAIL_API_KEY`, secrets de webhook; invalidar sessões (novo secret = novas sessões) |
| Fila morta acumulada | investigar `integration.failed`, reprocessar via DLQ (`POST /api/jobs/{jobId}/replay`) |

---

## 6. Segurança operacional (checklist)

- [ ] `JWT_SECRET` com ≥ 32 caracteres aleatórios, rotacionável.
- [ ] Secrets de webhook de gateway configurados (verificação de assinatura ativa).
- [ ] `EMAIL_PROVIDER` real + `EMAIL_FROM` verificado; transport SES com credenciais mínimas.
- [ ] `CORS_ORIGINS` restrito ao portal real.
- [ ] TLS obrigatório (`APP_URL` https → HSTS ativo).
- [ ] `CSP`/headers ativos (`next.config.mjs`).
- [ ] Rate limits sintonizados (veja ajuste abaixo).
- [ ] Backups Postgres verificados com restore de teste mensal.

### Ajuste de rate limit

Em pico de tráfego público sem bloqueios legítimos, aumente
`RATE_LIMIT_PUBLIC_LEADS`/`RATE_LIMIT_WINDOW_SECONDS` antes de liberar mais
capacidade; se 429s indevidos aparecerem no `lead-spike.js`, os limites estão
baixos para o pico esperado.

---

## 7. Observabilidade (recomendado)

- **Logs**: estruturados (JSON) no Next.js e workers; correlacione por
  `requestId`/`jobId`/`tenantId`.
- **Métricas**: BullMQ (jobs concluídos, atrasados, dead), latência de webhook,
  taxa de 429, fila de e-mail, RTT do gateway.
- **Alertas**: `email-send-queue` DLQ > 0, `webhook-transmission` DLQ > 0,
  `property-import` atrasado, taxa de 500 > limite, espaço/IO do Postgres.

---

## 8. Testes de carga (k6)

Pré-requisito: instalar [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/).

```bash
# Portal público (busca/PDP + leads) — 30 VUs por 3 min
k6 run -e K6_BASE_URL=https://acme.localhost:3000 -e K6_TENANT_DOMAIN=acme.localhost load-test/public-portal.js

# Pico de leads — 200 VUs em rampa
k6 run -e K6_BASE_URL=https://acme.localhost:3000 -e K6_TENANT_DOMAIN=acme.localhost load-test/lead-spike.js

# Importação em lote (autenticado) — 5 VUs, 250 imóveis por envio
k6 run -e K6_BASE_URL=https://acme.localhost:3000 -e K6_TENANT_DOMAIN=acme.localhost \
  -e K6_SESSION_TOKEN=<jwt> load-test/import-batch.js
```
