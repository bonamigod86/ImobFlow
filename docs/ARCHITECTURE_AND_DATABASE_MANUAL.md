# Manual de Arquitetura e Banco de Dados — SaaS Imob

Versão: 1.0 · Fase 6 (e-mail transacional, hardening de segurança, auditoria multi-inquilino)

---

## 1. Visão geral da plataforma

SaaS Imob é uma plataforma **multi-inquilino (SaaS)** para imobiliárias. Cada
cliente (inquilino) recebe um portal público próprio em subdomínio
(`acme.saas.local`), um painel administrativo e integrações com sistemas
externos (CRMs) via webhooks. A plataforma possui um console administrativo
exclusivo do operador do SaaS (papel `MASTER`).

### Pilares técnicos

| Camada | Tecnologia |
| --- | --- |
| Front-end / API | Next.js 14 (App Router), React 18, Tailwind |
| ORM / Banco | Prisma 5 + PostgreSQL |
| Filas | BullMQ 5 + Redis (produtores na API, workers em processos separados) |
| Cache | Redis (ioredis) |
| Objetos / Mídia | S3-compatível (AWS S3, R2, Spaces, MinIO) — fallback local em dev |
| Auth / Sessão | JWT HS256 (jose), cookie HttpOnly, verificação em edge (middleware) e runtime |
| E-mail | Transportes plugáveis: Resend, SendGrid, SES (SigV4 próprio) ou console |
| Imagens | Sharp (variantes WebP) |
| Testes | Vitest (unit) + k6 (carga, ver `load-test/`) |

### Topologia de execução

```
                    ┌─────────────────────────────┐
   Browser  ───────▶│  Next.js (edge middleware)  │
   (portal/painel)  │  • resolução de subdomínio  │
                    │  • verificação da sessão    │
                    │  • header de identidade     │
                    └──────────────┬──────────────┘
                                   │ headers x-tenant-id, x-user-id, ...
                    ┌──────────────▼──────────────┐
                    │  API routes (App Router)    │
                    │  withApiRoute (RBAC + ctx)  │
                    └──────┬──────────────┬───────┘
                           │              │
              ┌────────────▼──┐   ┌───────▼───────────────┐
              │   PostgreSQL  │   │  Redis                │
              │   (Prisma)    │   │  cache + BullMQ       │
              └───────────────┘   └───────┬───────────────┘
                                          │ jobs
                 ┌───────┬───────┬─────────┴───────┬─────────┬─────────┐
                 ▼       ▼       ▼                 ▼         ▼         ▼
            worker:   worker:  worker:          worker:   worker:   worker:
            lead      webhook media             import    billing   email
```

- A API apenas **enfileira** jobs; todo trabalho pesado roda em workers
  dedicados (`npm run worker:*`).
- **Toda** escrita/leitura em modelo com `tenantId` passa pelo
  `tenant-extension` do Prisma (isolamento por construção, ver §5).

---

## 2. Layout do repositório

```
src/
  app/                      # Rotas App Router (páginas + API)
    api/                    # Endpoints REST (ver manual de API)
      public/               #   leads + financial-leads (cross-tenant, com rate limit)
      auth/                 #   login/logout/forgot-password/reset-password
      properties/ leads/ imports/ jobs/ media/ analytics/
      integrations/         #   webhook-endpoints, webhook-deliveries
      billing/              #   subscription, highlights, webhooks (gateway)
      admin/                #   tenants, plans, billing, dlq, scan (somente MASTER)
  lib/
    auth/                   # JWT, hash de senha, tokens de reset (reset-token.ts)
    prisma/                 # client + tenant-extension.ts + segregation-audit.test.ts
    tenant/                 # contexto (AsyncLocalStorage), subdomínio
    http/                   # route-wrapper, erros, request-context, rate-limit
    security/               # rate-limit.ts, sanitize.ts
    rbac/                   # ações e papel x permissão
    events/                 # event-bus tipado + register.ts (auditoria) + register-mail.ts
    email/                  # tipos, templates, transports, signer SES, notify
    queues/                 # nomes, tipos de job, QueueManager
    properties/ leads/ imports/ media/ integrations/ billing/ crypto/
  workers/                  # um worker por fila (index.ts = todos)
  middleware.ts             # edge: subdomínio + sessão + fronteira de inquilino
  load-test/                # scripts k6
prisma/
  schema.prisma             # esquema único (fonte da verdade)
  migrations/               # migrações versionadas (apply via prisma migrate deploy)
  seed.ts                   # dados de demonstração
```

---

## 3. Banco de dados — modelos e relacionamentos

### 3.1 Modelos principais

- **Plan** — planos de assinatura oferecidos pelo operador (não tem tenant).
- **Tenant** — imobiliária/assinante; `slug` único usada no subdomínio; `status`
  (`ACTIVE`, `SUSPENDED`, `CANCELLED`, ...).
- **TenantSubscription** — assinatura corrente do tenant (plano, ciclo, trial,
  data de fim, `graceEndsAt` p/ dunning).
- **PaymentInvoice** — faturas (status `PENDING`, `PAID`, `PAST_DUE`, ...).
- **BillingNotification** — notificações de cobrança/dunning já enviadas.
- **HighlightPurchase / PropertyHighlight / HighlightCreditLedger** — créditos
  e compras de destaque de imóveis.
- **BillingEvent** — eventos recebidos dos gateways (registro imutável).
- **User** — usuários; `role` (`MASTER`, `OWNER`, `AGENT`); `tenantId` nulo
  apenas para `MASTER`.
- **PasswordResetToken** — token de redefinição de senha (apenas **hash
  SHA-256** armazenado; uso único; expira em `RESET_TOKEN_TTL_SECONDS`).
- **Property** (+ `PropertyMedia`, `PropertyView`, `PropertyPattern`) — imóveis,
  mídia, contagem de visualizações e regras de pattern.
- **Lead / LeadConsent / FinancialLeadProfile** — leads do portal, consentimento
  LGPD e perfis de leads financeiros.
- **WebhookEndpoint / RoutingRule / WebhookDelivery / WebhookDeliveryAttempt** —
  endpoints externos, regras de roteamento e entregas com tentativas.
- **ImportBatch** — histórico de importações de catálogo (XML/CSV/JSON).
- **AuditLog** — trilha de auditoria (imutável, só leitura via console).

### 3.2 Regras de isolamento (importante)

| Regra | Implementação |
| --- | --- |
| Todo modelo com `tenantId` é registrado como **tenant-scoped** no `tenant-extension.ts` (`STRICT_MODELS`) | `Property`, `Lead`, `WebhookDelivery`, `TenantSubscription`, `PaymentInvoice`, `ImportBatch`, `HighlightCreditLedger`, ... |
| `Tenant`, `Plan`, `BillingEvent` são de **plataforma** (nunca recebem filtro) | `UNMANAGED_MODELS` |
| `User` e `AuditLog` são **soft-scoped**: exigem tenant, exceto `MASTER` | `SOFT_MODELS` |
| Sem contexto de inquilino → **falha fechada** (`TenantContextRequiredError`) | `withApiRoute` / `withTenantContext` registram o contexto |
| `findUnique`/`update`/`delete` são traduzidos p/ `findFirst` + chave `id` filtrada pelo tenant | retorna zero linhas se a linha for de outro tenant |

A suíte `src/lib/prisma/segregation-audit.test.ts` prova as 3 camadas:
superfície da API (toda rota protegida usa `withApiRoute`), fronteira do
middleware (sessão do tenant B nunca acessa o host do tenant A) e o contrato
fail-closed do ORM.

### 3.3 Migrações

```bash
npm run prisma:generate      # gerar o client
npm run prisma:migrate       # criar/aplicar em dev (migrate dev)
npm run prisma:deploy        # aplicar migrações pendentes (CI/CD, produção)
npm run db:seed              # seed de demonstração (tsx prisma/seed.ts)
```

Migrações nunca são editadas após o deploy; novas mudanças de schema geram
nova migração.

---

## 4. Eventos de domínio e filas

### 4.1 Event Bus (tipado, in-process)

Definido em `src/lib/events/event-bus.ts`. Eventos relevantes:

```
user.login            user.logout            user.created        user.activated
tenant.status_changed property.deleted       property.duplicated property.media_deleted
integration.failed    integration.delivered  integration.parked
billing.event.received            billing.subscription.past_due
billing.subscription.reactivated  billing.subscription.blocked
billing.subscription.cancelled    billing.dunning.notified
billing.highlight.activated       billing.highlight.expired
billing.highlight.purchased       billing.invoice.paid
billing.subscription.provisioned
queue.job.failed      queue.job.replayed
```

Assinantes são registrados em `src/lib/events/register.ts` (auditoria) e
`src/lib/events/register-mail.ts` (e-mails transacionais, auto-registrado no
import). Nenhum listener pode quebrar o fluxo emissor (erros são logados).

### 4.2 Filas (BullMQ)

| Fila | Worker | Objetivo |
| --- | --- | --- |
| `lead-routing-queue` | `worker:lead` | roteamento de leads p/ CRMs externos |
| `webhook-transmission-queue` | `worker:webhook` | entrega de webhooks (retries + dedupe) |
| `media-processing-queue` | `worker:media` | geração de variantes WebP |
| `property-import-queue` | `worker:import` | upsert/dedupe em lote de importações |
| `billing-sync-queue` | `worker:billing` | sincronização de faturamento/dunning |
| `email-send-queue` | `worker:email` | despacho de e-mails transacionais |

Toda fila tem DLQ (`<queue>-dlq`). Jobs que exaurem as tentativas (backoff
exponencial, base 2s) caem no DLQ para reprocessamento manual pelo console
`MASTER` (`/admin/dlq`).

### 4.3 E-mail transacional (Fase 6)

Eventos → e-mails (templates tipados em `src/lib/email/templates.ts`):

| Evento | E-mail | Conteúdo |
| --- | --- | --- |
| `user.created` | `welcome` | boas-vindas + ativação |
| `user.activated` | `account_activation` | conta ativada |
| (fluxo de reset) | `password_reset` | link único de redefinição |
| `billing.subscription.provisioned` | `subscription_created` | assinatura ativa |
| `billing.invoice.paid` | `invoice_paid` | fatura paga (com valor) |
| `billing.dunning.notified` (PAYMENT_FAILED) | `invoice_past_due` | aviso de atraso + carência |
| `billing.subscription.blocked` | `final_lockout_warning` | bloqueio de carência esgotada |
| `billing.subscription.reactivated` | `account_reactivated` | conta reativada |
| captura de lead | `new_lead_alert` | novo lead para o(s) OWNER(s) |
| captura de lead com agendamento | `visit_request` | pedido de visita |

- **Transportes**: `resend` | `sendgrid` | `ses` | `console` (`EMAIL_PROVIDER`).
  Para SES o signatário SigV4 é implementado sem dependências
  (`src/lib/email/ses-signer.ts`) e é travado por teste contra a referência
  `aws4` + o hash canônico dos docs da AWS.
- **Dedupe**: cada mensagem gera `dedupeKey = mail:{event}:{to}:{payload}`,
  usado como `jobId` do BullMQ — reenfileirar é idempotente.
- **Não bloqueia o fluxo**: `notify*` enfileira de forma assíncrona; falhas de
  enfileiramento são logadas, nunca quebram a mutação original.
- **Recipientes**: notificações de tenant vão para os usuários `OWNER` ativos.
- **Taxonomia de erro do worker**: 429/5xx = retryável; demais 4xx =
  não-retryável (vai direto ao DLQ).

---

## 5. Segurança (hardening OWASP)

| Área | Implementação |
| --- | --- |
| Sanitização | `sanitizeText`/`sanitizeEmail`/`escapeHtmlValue` (`src/lib/security/sanitize.ts`) antes do Zod em entradas públicas |
| XSS | Todos os campos dinâmicos de e-mail/telas são HTML-escaped (`escapeHtml`) |
| Headers | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (quando `APP_URL` é https), `frame-ancestors none` (`next.config.mjs`) |
| CORS | Somente `/api/public/*`; origens controladas por `CORS_ORIGINS` |
| Rate limiting | Deslizante via Redis (`INCR`+`EXPIRE`), por IP (`rl:ip:{key}:{ip}`) e por tenant (`rl:tenant:{key}:{tenantId}`). Chaves: `auth-login`, `auth-forgot`, `auth-reset`, `public-leads`. **Fail-open**: se o Redis estiver fora, a requisição é permitida (com warning) — a plataforma nunca morre por causa do cache |
| Senha | bcrypt; reset de senha: token aleatório de 32 bytes (base64url), armazenado como SHA-256, uso único atômico, TTL `RESET_TOKEN_TTL_SECONDS` |
| Enumeração | `forgot-password` responde sempre 200 (mensagem uniforme) |
| Segredos | Só via variáveis de ambiente (`.env`); nunca em código/console; `.env.example` documenta |
| Auditoria | `AuditLog` registra ações sensíveis (login, alterações, cobrança, lead) via event bus |

---

## 6. Fluxos de dados principais

### 6.1 Captura de lead (portal público)

```
POST /api/public/leads
  → rateLimitByIp("public-leads")
  → schema Zod (sanitizado)
  → captureRealEstateLead()
      • resolve o imóvel + tenant dono
      • persiste Lead + LeadConsent (LGPD) + AuditLog
      • enfileira roteamento p/ endpoints REAL_ESTATE ativos
      • notify* (novo lead; e se houver agendamento → pedido de visita)
```

### 6.2 Cobrança e dunning

```
Gateway webhook (Stripe/Asaas/custom)
  → /api/billing/webhooks (valida assinatura)
  → BillingEvent persistido + billing.invoice.paid / dunning.notified
  → register-mail.ts → notify* (fatura paga / atraso / bloqueio)
  → state-machine: provisão, ativação, bloqueio por carência (graceEndsAt)
```

### 6.3 Importação em lote

```
POST /api/imports?format=csv|xml|json
  → parse + validação síncrona (pure functions)
  → ImportBatch persistido + fila property-import (upsert/dedupe)
  → GET /api/imports (histórico com status/counters)
```

---

## 7. Testes

```bash
npm test            # vitest run (29 arquivos, 207 testes na Fase 6)
npm run lint        # next lint
npm run typecheck   # tsc --noEmit
```

Suítes-chave de segurança: `src/lib/prisma/segregation-audit.test.ts`,
`src/lib/security/rate-limit.test.ts`, `src/lib/security/sanitize.test.ts`,
`src/lib/email/ses-signer.test.ts`, `src/lib/email/templates.test.ts`.

Testes de carga em `load-test/` (k6): `public-portal.js`, `lead-spike.js`,
`import-batch.js`.
