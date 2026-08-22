<div align="center">

<img src="public/images/imobFlow_logo.png" alt="imobFlow" width="220"/>

# imobFlow

**Plataforma SaaS multi-tenant para imobiliárias e corretores autônomos**

Portal público com SEO · Gestão de imóveis e leads · Assinaturas e billing · Painel MASTER

[![Next.js](https://img.shields.io/badge/Next.js_14-black?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma_5-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![Redis](https://img.shields.io/badge/Redis_7-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![BullMQ](https://img.shields.io/badge/BullMQ-E24244?style=for-the-badge)](https://bullmq.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)

</div>

---

## 📖 Sobre

O **imobFlow** é uma plataforma de software como serviço (SaaS) que entrega a
imobiliária ou o corretor autônomo uma operação digital completa em um único
ambiente isolado: **portal público de anúncios**, **CRM de leads** (inclusive
crédito imobiliário), **gestão de imóveis com mídias**, **assinaturas com
dunning automático** e **monetização por destaques**.

> 🔒 **Isolamento de dados por construção** — a segregação entre tenants é
> aplicada na camada de ORM (*fail-closed*), não por disciplina de código.
> Vazamento cruzado entre contas é impossível por arquitetura.

| | |
|---|---|
| 🏢 **Multi-tenant real** | Resolução por subdomínio + extensão Prisma que injeta `tenant_id` em toda query |
| 🏠 **Portal público SSR** | Busca avançada por URL, mapa Leaflet, JSON-LD (`RealEstateListing`), sitemap dinâmico |
| 📊 **Painel do assinante** | KPIs de imóveis/leads/views, funil, equipe com papéis, integrações e webhooks |
| 💳 **Billing completo** | Planos dinâmicos, trial, carência, dunning, suspensão automática, MRR/ARR |
| ✨ **Créditos de destaque** | Ledger append-only: plano credita por ciclo, 1 crédito = 1 dia de destaque |
| ⚙️ **Workers resilientes** | BullMQ com retry/backoff exponencial, DLQ com replay e auditoria |

---

## 🧰 Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router, React 18, TypeScript strict) |
| Estilo | [Tailwind CSS](https://tailwindcss.com) + [lucide-react](https://lucide.dev) |
| Banco de dados | [PostgreSQL 16](https://www.postgresql.org) — segregação por `tenant_id` + índices compostos |
| ORM | [Prisma 5](https://www.prisma.io) + extensão client que impõe o tenant automaticamente |
| Cache & filas | [Redis 7](https://redis.io) + [BullMQ](https://bullmq.io) (retry, backoff, DLQ) |
| Autenticação | JWT HS256 ([jose](https://github.com/panva/jose)) + bcrypt + cookies HttpOnly |
| Autorização | Matriz RBAC centralizada (5 papéis, catálogo de ações tipado) |
| Validação | [Zod](https://zod.dev) em todas as fronteiras de request |
| Mapas | [Leaflet](https://leafletjs.com) + OpenStreetMap |
| Imagens | [sharp](https://sharp.pixelplumbing.com) — WebP + 3 variantes responsivas |
| Storage | S3-compatível (AWS / Cloudflare R2 / MinIO) com fallback local |
| Testes | [Vitest](https://vitest.dev) — 36 suítes, 246 testes |
| Infra | Docker Compose (postgres + redis + app + worker opcional) |

<p>
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white" alt="Zod"/>
  <img src="https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest"/>
  <img src="https://img.shields.io/badge/JWT_(jose)-000000?style=flat-square&logo=jsonwebtokens&logoColor=white" alt="JWT"/>
  <img src="https://img.shields.io/badge/Leaflet-199900?style=flat-square&logo=leaflet&logoColor=white" alt="Leaflet"/>
  <img src="https://img.shields.io/badge/Stripe-008CDD?style=flat-square&logo=stripe&logoColor=white" alt="Stripe"/>
  <img src="https://img.shields.io/badge/sharp-99CC00?style=flat-square" alt="sharp"/>
</p>

---

## ✨ Funcionalidades

### 🌐 Portal público (`/`)
Landing page, catálogo `/imoveis` com filtros dirigidos pela URL
(`/imoveis/sao-paulo-sp/venda/apartamento`), página de detalhe com galeria,
lightbox, mapa, WhatsApp e agendamento de visita, captura de leads pública
(cross-tenant, roteada ao tenant do anúncio), `sitemap.xml` dinâmico,
Open Graph e dados estruturados Schema.org.

### 🏠 Gestão de imóveis (`/dashboard`)
CRUD completo com runner de ações (duplicar, status, destaque, soft-delete),
preços venda/aluguel/condomínio/IPTU, especificações completas, geolocalização,
pipeline de mídias com upload presignado e processamento assíncrono (WebP +
thumb/medium/large), galeria reordenável e importação em lote
(CSV/XML estilo portais/JSON) com dedupe e relatório por linha.

### 📬 Leads e equipe
Funil de qualificação com roteamento assíncrono por regras, consentimento LGPD,
equipe com papéis OWNER/MANAGER/AGENT/RECEPTIONIST, KPIs de conversão
(views → leads) e consolidação de crédito imobiliário com encaminhamento a
sistemas externos autorizado pelo titular.

### 💳 Assinaturas e billing (`/dashboard/billing`, `/admin/billing`)
Motor de estado da assinatura (`TRIAL → ACTIVE → PAST_DUE → BLOCKED`),
ingestão idempotente de webhooks com verificação HMAC sobre o body bruto,
adapters Stripe/Asaas/custom, dunning automático com lembretes, carência por
plano e suspensão sem perda de dados, provisionamento pelo MASTER, simulador de
eventos assinados para demo e console financeiro com MRR/ARR, churn e receita
por plano.

### 🛡️ Console MASTER (`/admin/dashboard`)
Visão global da plataforma: métricas financeiras, gestão de assinantes com
aprovação de cadastro, impersonação, bloqueio manual, editor visual de planos
(preços, limites, créditos, trial, carência e linhas exibidas no card público),
ledger de eventos de webhook com replay e varredura manual de dunning.

---

## 🏗️ Arquitetura

### Modelo multi-tenant

```
Tenant 1───< User          (tenantId nulo apenas para MASTER da plataforma)
    │───< Property         @@index([tenantId, id])  @@unique([tenantId, code])
    │───< Lead             @@index([tenantId, id])
    │───< TenantSubscription / PaymentInvoice / HighlightCreditLedger ...
    └───< AuditLog         @@index([tenantId, id], [tenantId, createdAt])
```

### Defesa em profundidade (4 camadas)

1. **Middleware Edge** — resolve subdomínio → tenant, valida a sessão JWT e
   rejeita usuário cujo tenant não corresponde.
2. **Route wrapper** (`withApiRoute`) — revalida cookie, checa RBAC, resolve o
   tenant e garante status ativo antes de qualquer handler.
3. **Extensão Prisma** — injeta `tenant_id` em toda query de tabelas sensíveis;
   sem contexto de tenant, lança `TenantContextRequiredError` (**fail-closed**).
4. **Escape hatch auditado** — `runWithoutTenantScope()` existe apenas para
   código de infraestrutura (portal público cross-tenant, workers globais).

```ts
// Nenhum tenantId no handler — a extensão insere automaticamente:
export const GET = withApiRoute(ACTIONS.PROPERTIES_READ, async () => {
  const rows = await prisma.property.findMany({ where: { city: "SP" } });
  return ok({ rows }); // escopado ao tenant ativo
});
```

### Filas e resiliência

| Fila | Consumidor | Política |
|---|---|---|
| `lead-routing-queue` | lead-routing worker | 5× backoff exponencial |
| `webhook-transmission-queue` | webhook worker | 5× + 4xx → permanente |
| `media-processing-queue` | media worker | 5×; input ilegível → DLQ |
| `property-import-queue` | import worker | batch com falha por linha |
| `billing-sync-queue` | billing worker | scan diário 02:00 (America/Sao_Paulo) |

Todo job carrega `tenantId`; falhas vão para `<queue>-dlq` com replay via
`POST /api/jobs/[jobId]/replay`.

---

## 🚀 Como rodar

### Opção A — Docker Compose (recomendado)

```bash
git clone https://github.com/bonamigod86/ImobFlow.git && cd ImobFlow
cp .env.example .env                 # defina um JWT_SECRET forte
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed
```

➡ Abra **http://localhost:3000**

### Opção B — Node local (sem Docker)

```bash
npm install
cp .env.example .env                 # aponte DATABASE_URL para seu Postgres
npx prisma migrate dev
npm run db:seed
npm run dev        # app      → http://localhost:3000
npm run worker     # workers  → terminal separado
```

### 👤 Usuários demo (após o seed)

| Perfil | E-mail | Senha |
|---|---|---|
| MASTER (plataforma) | `admin@saas.local` | `ChangeMe-123!` |
| OWNER (imobiliária) | `owner@acme.com` | `ChangeMe-123!` |

> ⚠️ Em produção use senhas fortes e um `JWT_SECRET` exclusivo
> (`openssl rand -hex 32`).

### ✅ Verificação de qualidade

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm test            # vitest — 246 testes
```

---

## ⚙️ Variáveis de ambiente

Copie `.env.example` → `.env`. As principais:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL (Prisma) |
| `REDIS_URL` | Connection string Redis (cache + BullMQ) |
| `JWT_SECRET` | Segredo HS256 das sessões (≥ 32 caracteres) |
| `APP_DOMAIN` | Domínio raiz p/ resolução de tenants por subdomínio |
| `APP_URL` | URL pública base da aplicação |
| `S3_*` | Object storage de mídias (vazio = fallback local dev) |
| `STRIPE_*` / `ASAAS_*` / `CUSTOM_WEBHOOK_SECRET` | Billing (opcional em dev) |
| `EMAIL_PROVIDER` | `console` \| `resend` \| `sendgrid` \| `ses` |
| `BILLING_GRACE_DAYS` | Carência padrão quando o plano não define |

Lista completa comentada em [`.env.example`](.env.example).

---

## ☁️ Deploy

Guia completo em **[DEPLOY.md](DEPLOY.md)** — inclui opções gratuitas
(MonkeysCloud, Vercel + Neon + Upstash), deploy no VPS Hostinger com Docker
Compose + Nginx/TLS, restore de banco e checklist pós-deploy.

---

## 🔌 API (principais rotas)

<details>
<summary><strong>Expandir tabela de endpoints</strong></summary>

| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` · `/api/auth/forgot-password` · `/api/auth/reset-password` | público / sessão |
| GET | `/api/health` | público (probes db+redis) |
| GET/POST | `/api/properties` | `properties:read` / `properties:create` |
| GET/PATCH/DELETE | `/api/properties/[id]` | leitura / atualização / soft-delete |
| POST | `/api/properties/[id]/duplicate` · `/status` · `/featured` · `/view` | `properties:*` |
| POST/PATCH | `/api/properties/[id]/media` · `/gallery` | upload presignado / galeria |
| DELETE | `/api/media/[mediaId]` | remove objeto + variantes |
| POST | `/api/imports?format=csv\|xml\|json` | importação em lote (fila) |
| GET | `/api/analytics/dashboard` | `dashboard:read` |
| GET/POST | `/api/leads` (+ `/[id]`, privacy) | `leads:*` |
| POST | `/api/public/leads` · `/api/public/listings` · `/api/public/views` | público (portal) |
| POST | `/api/register` | cria conta pendente de aprovação |
| POST | `/api/billing/webhooks` | público (assinatura HMAC → ledger idempotente) |
| GET | `/api/billing/plans` · `/subscription` · `/highlights` | `billing:self` |
| POST | `/api/billing/highlights/activate` · `/subscribe` | `billing:self` |
| GET/PATCH | `/api/admin/billing/plans[/code][/status]` | `billing:admin` (MASTER) |
| GET | `/api/admin/billing/metrics` · `/events` · `/scan` | `billing:admin` |
| PATCH/POST | `/api/admin/tenants/[id][/approve\|impersonate\|payment-link]` | `tenant:*` (MASTER) |
| POST | `/api/jobs/[jobId]/replay` | `integrations:manage` |

</details>

---

## 🔐 Segurança (checklist implementado)

- [x] Isolamento de tenant em ORM + rotas + middleware (fail-closed)
- [x] Cookies HttpOnly/SameSite; JWT curto assinado HS256 (segredo ≥ 32 chars validado no boot)
- [x] bcrypt custo 12 com limite de 72 bytes
- [x] RBAC central com guards em todas as rotas protegidas
- [x] Gate de status do tenant (BLOCKED/CANCELLED rejeitado a cada request)
- [x] Auditoria de eventos privilegiados com contexto request/user/IP
- [x] Retry/backoff/DLQ + idempotência estável em jobs e webhooks
- [x] Validação Zod em toda fronteira; nenhum segredo em respostas da API
- [x] Headers de segurança (CSP, HSTS, X-Frame-Options…) via `next.config.mjs`
- [x] Imagem de produção non-root + health checks no Docker

---

## 🗺️ Roadmap

- [ ] Gateway de integrações (portais imobiliários, CRMs)
- [ ] Rollups agendados de tendências (`PropertyPattern`)
- [ ] Sharding horizontal por tenant + event sourcing na auditoria
- [ ] Pagamentos self-service (checkout hosted Stripe/Asaas)

---

<div align="center">

Feito com ❤️ e muito café — **imobFlow**

</div>
