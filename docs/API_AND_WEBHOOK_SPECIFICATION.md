# Especificação de API e Webhooks — SaaS Imob

Versão: 1.0 · Fase 6

Este documento descreve a superfície HTTP da plataforma, o modelo de
autenticação/autorização e o contrato de webhooks (saída e entrada).

---

## 1. Convenções

### 1.1 Base e subdomínios

- API do painel e portal público são servidas pelo Next.js na mesma origem do
  tenant: `https://<tenant-slug>.saas.local` (ou `APP_DOMAIN` configurado).
- Em desenvolvimento local, o subdomínio pode ser trocado pelo header
  `X-Tenant-Slug` (ex.: `acme`).
- Endpoints do operador (`/api/admin/**`) são acessíveis apenas por papel
  `MASTER`.

### 1.2 Autenticação

- Sessão: cookie HttpOnly `saas_session` (JWT HS256, `JWT_EXPIRES_IN`).
- Login: `POST /api/auth/login` retorna `{ token, user }` e define o cookie.
- Em testes/integrações fora do browser, envie o token no header `Cookie`:
  `Cookie: saas_session=<jwt>`.
- O middleware edge re-verifica o JWT e reconcilia o subdomínio do tenant com
  o `tenantSlug` da sessão (mismatch → `403 TENANT_MISMATCH`).

### 1.3 Autorização (RBAC)

Toda rota protegida passa por `withApiRoute(<ação>)`. Papéis:

| Papel | Escopo |
| --- | --- |
| `MASTER` | operador do SaaS — console `/admin/**`, planos, tenants, DLQ |
| `OWNER` | dono da imobiliária — tudo dentro do seu tenant |
| `AGENT` | corretor — ações de negócio do tenant |

Ações (`src/lib/rbac/actions.ts`): `properties:*`, `leads:*`, `users:*`,
`tenant:*`, `integrations:manage`, `settings:manage`, `billing:*`,
`dashboard:read`, `audit:read`, `properties:export`, `leads:export`, ...

### 1.4 Envelope de erros

```json
{ "error": "VALIDATION_ERROR", "message": "Descrição legível." }
```

Códigos comuns: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `VALIDATION_ERROR`
(400), `NOT_FOUND` (404), `RATE_LIMITED` (429), `CONFLICT` (409),
`PAYLOAD_TOO_LARGE` (413), `TENANT_MISMATCH` (403, do middleware).

---

## 2. Endpoints

### 2.1 Saúde

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/api/health` | pública | liveness/probe |

### 2.2 Autenticação

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | pública (rate limit `auth-login`) | autentica e define cookie |
| POST | `/api/auth/logout` | sessão | encerra sessão |
| POST | `/api/auth/forgot-password` | pública (rate limit `auth-forgot`) | dispara e-mail de reset; **sempre 200** (não enumera contas) |
| POST | `/api/auth/reset-password` | pública (rate limit `auth-reset`) | redefine senha (token de uso único) |

`forgot-password`:
```json
{ "email": "owner@acme.com" }
```
`reset-password`:
```json
{ "token": "<token do e-mail>", "password": "NovaSenha-123!" }
```

### 2.3 Portal público (SSR + captura)

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/imoveis[...]` | pública | busca/listagem (SSR), filtros na URL |
| GET | `/imovel/{slug}` | pública | página do imóvel (SSR + SEO) |
| POST | `/api/public/leads` | pública (rate limit `public-leads`) | captura lead de imóvel |
| POST | `/api/public/financial-leads` | pública (rate limit `public-leads`) | captura lead financeiro |

`POST /api/public/leads`:
```json
{
  "propertyId": "p1",
  "name": "Marcos Silva",
  "email": "marcos@example.com",
  "phone": "+5511999990000",
  "message": "Tenho interesse",
  "schedule": { "date": "2026-08-22", "time": "14:00" },
  "utm": { "source": "google", "campaign": "launch" },
  "consent": { "textVersion": "2026-08-19.v1" }
}
```
- Endpoint **cross-tenant**: o tenant dono é derivado do imóvel.
- Entrada é sanitizada; consentimento LGPD é obrigatório; IP/UA/referer são
  gravados pelo servidor.
- Dispara e-mails transacionais ao OWNER (`new_lead_alert` e, se houver
  `schedule`, `visit_request`).

### 2.4 Imóveis

| Método | Rota | Ação RBAC | Descrição |
| --- | --- | --- | --- |
| GET/POST | `/api/properties` | `properties:read` / `properties:create` | listar/criar |
| GET/PATCH/DELETE | `/api/properties/{id}` | `properties:*` | ler/atualizar/excluir |
| POST | `/api/properties/{id}/duplicate` | `properties:create` | duplicar com código novo |
| POST | `/api/properties/{id}/media` | `properties:update` | enviar mídia (multipart) |
| PATCH | `/api/properties/{id}/gallery` | `properties:update` | reordenar galeria |
| PATCH | `/api/properties/{id}/status` | `properties:update` | alterar status |
| POST | `/api/properties/{id}/view` | pública (autenticada) | registrar visualização |
| PATCH | `/api/properties/{id}/featured` | `billing:self` | ativar destaque (créditos) |
| DELETE | `/api/media/{mediaId}` | `properties:update` | remover mídia |

### 2.5 Leads

| Método | Rota | Ação | Descrição |
| --- | --- | --- | --- |
| GET/POST | `/api/leads` | `leads:read` / `leads:create` | listar/criar (painel) |
| — | roteamento | `leads:route` | regras de roteamento p/ CRMs (ver §3) |

### 2.6 Importação

| Método | Rota | Ação | Descrição |
| --- | --- | --- | --- |
| POST | `/api/imports?format=csv|xml|json&source=...` | `properties:create` | enviar catálogo (corpo cru, máx. 20 MB) |
| GET | `/api/imports` | `properties:read` | histórico com status/counters |
| GET | `/api/imports/{id}` | `properties:read` | detalhe do lote |

CSV suportado: colunas `code;title;city;state;neighborhood;target;salePrice;rentPrice;areaM2;bedrooms;bathrooms;parkingSpots;description`.

### 2.7 Integrações e webhooks de saída

| Método | Rota | Ação | Descrição |
| --- | --- | --- | --- |
| GET/POST | `/api/webhook-endpoints` | `integrations:manage` | listar/criar endpoint |
| PATCH/DELETE | `/api/webhook-endpoints/{id}` | `integrations:manage` | editar/excluir |
| GET/POST | `/api/routing-rules` | `leads:route` | regras de roteamento |
| PATCH/DELETE | `/api/routing-rules/{id}` | `leads:route` | editar/excluir |
| GET | `/api/webhook-deliveries` | `integrations:manage` | entregas (filtro por status) |
| GET | `/api/webhook-deliveries/{id}` | `integrations:manage` | detalhe + tentativas |

### 2.8 Faturamento (tenant)

| Método | Rota | Ação | Descrição |
| --- | --- | --- | --- |
| GET | `/api/billing/subscription` | `billing:self` | assinatura corrente |
| GET | `/api/billing/highlights` | `billing:self` | créditos e destaques |
| POST | `/api/billing/highlights/activate` | `billing:self` | ativar destaque |
| POST | `/api/billing/highlights/purchases` | `billing:self` | comprar créditos |
| POST | `/api/billing/highlights/purchases/{id}/pay` | `billing:self` | marcar pagamento |
| GET | `/api/analytics/dashboard` | `dashboard:read` | KPIs do painel |

### 2.9 Webhooks de entrada (gateways)

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/api/billing/webhooks` | assinatura do gateway | eventos Stripe/Asaas/custom |
| GET | `/api/billing/webhooks` | pública | healthcheck de gateway |

### 2.10 Console do operador (papel `MASTER`)

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/admin/tenants` | listar tenants |
| PATCH | `/api/admin/tenants/{id}` | editar / trocar status |
| GET | `/api/admin/billing/events` | eventos de cobrança |
| GET | `/api/admin/billing/metrics` | métricas de faturamento |
| GET/PATCH | `/api/admin/billing/plans` / `/plans/{code}` | planos |
| POST | `/api/admin/billing/plans/{code}/status` | ativar/desativar plano |
| GET | `/api/admin/billing/tenants/{id}` | assinatura de um tenant |
| POST | `/api/admin/billing/tenants/{id}/provision` | provisionar assinatura |
| POST | `/api/admin/billing/tenants/{id}/simulate` | simular evento de cobrança |
| POST | `/api/admin/billing/scan` | scan de cobrança (dunning manual) |
| GET | `/api/admin/dlq` | filas mortas (DLQ) |
| GET | `/api/jobs/{jobId}` | status de um job |
| POST | `/api/jobs/{jobId}/replay` | reprocessar job do DLQ |

---

## 3. Webhooks de saída (integração com CRMs)

### 3.1 Modelo

- **WebhookEndpoint**: URL, `scope` (`REAL_ESTATE` | `PLATFORM`), `strategy`
  (`PUSH` | `PULL` | `MANUAL`), segredo de assinatura, `timeoutMs`, retries.
- **RoutingRule**: condições (tipo de lead, origem, cidade, ...) + endpoint
  alvo + prioridade.
- **WebhookDelivery**: entrega de um payload (lead) p/ um endpoint.
- **WebhookDeliveryAttempt**: cada tentativa HTTP (status, resposta, latência).

### 3.2 Assinatura

Cada payload é assinado com HMAC-SHA256 usando o segredo do endpoint:

```
X-Saas-Imob-Signature: sha256=<hex>
```
assinatura = HMAC-SHA256(segredo, body cru). O receptor **deve** recalcular e
comparar em tempo constante.

### 3.3 Entrega e retentativas

- Enfileiramento: `QueueManager.addWebhookTransmission` (dedupe por
  `{deliveryId}` → `jobId`), backoff exponencial (base 2s) até as tentativas
  configuradas.
- Sucesso: `integration.delivered` (audit). Esgotou tentativas →
  `integration.failed`/`integration.parked` e a entrega cai no DLQ para
  reprocessamento manual (`POST /api/jobs/{jobId}/replay`).
- Timeout por chamada: `endpoint.timeoutMs`.

---

## 4. Rate limiting

| Chave | Limite padrão | Alvo |
| --- | --- | --- |
| `auth-login` | `RATE_LIMIT_AUTH` (10) | login |
| `auth-forgot` | `RATE_LIMIT_AUTH` (10) | forgot-password |
| `auth-reset` | `RATE_LIMIT_AUTH` (10) | reset-password |
| `public-leads` | `RATE_LIMIT_PUBLIC_LEADS` (30) | captura pública de leads |

Janela: `RATE_LIMIT_WINDOW_SECONDS` (60). Resposta `429 RATE_LIMITED` com
`retryAfterSeconds`. **Fail-open**: Redis indisponível → libera com warning.
