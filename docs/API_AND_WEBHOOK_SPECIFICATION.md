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
  "channel": "form",
  "interestType": "tenho_interesse",
  "schedule": { "date": "2026-08-22", "time": "14:00" },
  "utm": { "source": "google", "campaign": "launch" },
  "consent": { "granted": true, "textVersion": "2026-08-19.v1" }
}
```
- Endpoint **cross-tenant**: o tenant dono é derivado do imóvel.
- Entrada é sanitizada; consentimento LGPD é obrigatório; IP/UA/referer são
  gravados pelo servidor.
- Dispara e-mails transacionais ao OWNER (`new_lead_alert` e, se houver
  `schedule`, `visit_request`).
- `interestType` preserva o CTA de origem (`tenho_interesse | agendar_visita |
  falar_anunciante | saber_mais | financiamento | alternativas_aquisicao |
  simulacao`). O portal PDP expõe todos os 7 CTAs e anexa os UTM da URL.
- O payload captura o **snapshot do imóvel** (`propertySnapshot`: código, valor,
  cidade, imobiliária e corretor atribuído) no momento da submissão — "quando
  disponível" — além de `capturedAt`. Canal `whatsapp` é anônimo (sem PII).

`POST /api/public/financial-leads` (captura também leve — preencher o perfil
financeiro é opcional; valor/cidade são derivados do imóvel quando ausentes):
```json
{
  "propertyId": "p1",
  "name": "Camila Rocha",
  "phone": "+5511988887777",
  "interestType": "simulacao",
  "monthlyIncome": 18000,
  "utm": { "source": "instagram" },
  "consent": { "granted": true, "textVersion": "2026-08-19.v1" }
}
```

**Contrato de campos do lead de aquisição** (item 8) — todos opcionais na
captura, persistidos em `lead.financeProfile` (`FinancialLeadProfile`) e
repassados ao parceiro pelo envelope `FINANCE_DEFAULT`:

| Campo do requisito | Coluna `FinancialLeadProfile` | Payload `FINANCE_DEFAULT` |
| --- | --- | --- |
| valor do imóvel | `propertyValue` | `financial.property_value` |
| valor aproximado de entrada | `downPayment` | `financial.down_payment` |
| valor pretendido para contratação | `financingAmount` | `financial.financing_amount` |
| renda aproximada | `monthlyIncome` | `financial.monthly_income` |
| faixa de parcela | `monthlyInstallmentLimit` | `financial.monthly_installment_limit` |
| prazo pretendido | `termMonths` | `financial.term_months` |
| cidade / UF | `city`, `state` | `location.city/state` |
| imóvel de interesse | `lead.propertyId` | `lead.property` (id/código) |
| nome / telefone / e-mail | `lead.name/phone/email` | `contact.name/phone/email` |

O fluxo é **capturar → registrar (Lead + perfil + consentimento) → qualificar
(regras de roteamento) → encaminhar ao sistema externo autorizado** — sem motor
próprio de aprovação financeira nesta versão. Não havendo regra correspondente,
o lead permanece interno (nunca é perdido) e fica visível no painel.

### 2.4 Imóveis

| Método | Rota | Ação RBAC | Descrição |
| --- | --- | --- | --- |
| GET/POST | `/api/properties` | `properties:read` / `properties:create` | listar/criar |
| GET/PATCH/DELETE | `/api/properties/{id}` | `properties:*` | ler/atualizar/excluir |
| POST | `/api/properties/{id}/duplicate` | `properties:create` | duplicar com código novo (`externalCode` zerado, flags reset) |
| POST | `/api/properties/{id}/media` | `properties:update` | registrar upload (retorna presigned PUT + `mediaId`/`objectKey`) |
| PATCH | `/api/properties/{id}/gallery` | `properties:update` | reordenar galeria e/ou definir capa (`orderedIds` + `primaryId`) |
| PATCH | `/api/properties/{id}/status` | `properties:update` | status (`ACTIVE/INACTIVE/SOLD/RENTED`) e publicar/ocultar (`isActive`) |
| PATCH | `/api/properties/{id}/featured` | `properties:update` | ativar/remover destaque do imóvel (flag; créditos de destaque comprados são um fluxo de billing separado — §2.8) |
| POST | `/api/properties/{id}/view` | `properties:read` | registrar visualização (autenticado) |
| POST | `/api/properties/sync` | `properties:create` | sincronizar catálogo via API/webhook (XML/CSV/JSON → lote assíncrono) — ver §2.6 |
| PATCH | `/api/media/{mediaId}/primary` | `properties:update` | definir imagem principal da galeria |
| GET/POST | `/api/media/{mediaId}/bytes` | `properties:read` / `properties:update` | servir/armazenar bytes da mídia (renderização local + fallback upload sem S3) |
| DELETE | `/api/media/{mediaId}` | `properties:update` | remover mídia |

`POST /api/properties/{id}/media` e `PATCH /api/properties/{id}/gallery`:

```jsonc
// 1) registrar upload → resposta 202:
// { "mediaId", "uploadUrl", "objectKey" }
{ "kind": "IMAGE", "mimeType": "image/jpeg", "sizeBytes": 204800 }
// uploadUrl presigned p/ cliente fazer PUT direto no object storage. Sem S3
// configurado (dev local), envie os bytes ao servidor:
// POST /api/media/{mediaId}/bytes  (body = arquivo cru)

// 2) galeria:
{ "orderedIds": ["m1", "m2"], "primaryId": "m2" }
```

### 2.5 Leads (geração e qualificação)

| Método | Rota | Ação RBAC | Descrição |
| --- | --- | --- | --- |
| GET/POST | `/api/leads` | `leads:read` / `leads:create` | listar/criar (painel; `GET` aceita `?type=` e `?status=`, retornando `financeProfile` quando presente) |
| GET | `/api/leads/{id}` | `leads:read` | detalhe: payload completo, consent, perfil financeiro, entregas |
| PATCH | `/api/leads/{id}` | `leads:update` | **qualificar**: `status` (`NEW→CONTACTED/QUALIFIED/PROPOSAL_SENT/NEGOTIATION/WON/LOST`), `note`, `assignedToId` (exige `leads:assign`) |
| DELETE | `/api/leads/{id}` | `leads:delete` | remover lead (cascade consent/entregas) |
| — | roteamento | `leads:route` | regras de roteamento p/ CRMs (ver §3) |

**Contrato de campos do lead** (gravado na captura/"quando disponível"): nome,
telefone, e-mail, imóvel (`property.id`/`code`), valor, cidade, imobiliária,
corretor, origem, data/hora (`createdAt`/`capturedAt`), UTM/campanha, tipo de
interesse (`interestType`), mensagem e consentimentos (LGPD 1:1). Os campos
derivados do anúncio ficam em `payload.propertySnapshot` — imutáveis mesmo se o
imóvel for editado/excluído depois.

### 2.6 Importação e sincronização de imóveis

| Método | Rota | Ação | Descrição |
| --- | --- | --- | --- |
| POST | `/api/imports?format=csv|xml|json&source=...` | `properties:create` | enviar catálogo (corpo cru, máx. 20 MB) |
| POST | `/api/properties/sync?format=...&source=...` | `properties:create` | **sincronização via API/webhook** — mesmo pipeline, `source` padrão `REST_API` |
| GET | `/api/imports` | `properties:read` | histórico com status/counters |
| GET | `/api/imports/{id}` | `properties:read` | detalhe do lote + erros por linha |
| GET | `/api/jobs/import:{batchId}` | `leads:read` | estado do job de processamento (observabilidade) |
| POST | `/api/jobs/{jobId}/replay` | `integrations:manage` | reprocessar lote falho a partir da DLQ (`queueName: "property-import-queue"`) |

**Modelo de processamento (em lote, assíncrono):**

1. O corpo é parseado e validado (síncrono, funções puras): CSV, XML
   (VivaReal/ZAP) ou JSON (`array` ou `{ "listings": [...] }`).
2. Um `ImportBatch` é persistido com resumo + erros de parse; a fila
   `property-import-queue` processa o upsert de cada linha.
3. **Dedupe**: linha casa por `(tenantId, externalCode)`; sem `externalCode`,
   por `(tenantId, code)`.
4. **Sincronização**: imóvel existente é **atualizado no lugar** (preço,
   situação/status, endereço, áreas, características) mantendo o `slug`
   público estável; inexistente é criado. Re-enviar o catálogo é idempotente.
5. **Status**: a coluna `status` (`ACTIVE|INACTIVE|SOLD|RENTED`) é aplicada no
   upsert — catálogo completo sincronizado a partir do arquivo.
6. Falha por linha não aborta o lote: `PARTIAL` + erros limitados (200) em
   `errors`. Falha de infra (fila indisponível) cai para processamento
   síncrono fail-open; em produção a resiliência é BullMQ (retry com backoff,
   DLQ + `replay`).

**Colunas reconhecidas (CSV/JSON/XML) — headers são case-insensitive:**

`code`, `externalCode` (aliases: `cod_externo`, `externoId`, `external_id`,
`idImovel`, `codigoImovel`), `title`/`titulo`/`nome`, `description`/`descricao`,
`target`/`finalidade`/`operacao`, `category`/`tipo`/`tipoImovel`,
`status`/`situacao`/`listingStatus`, `salePrice`/`valorVenda`/`preco_venda`,
`rentPrice`/`valorAluguel`/`preco_aluguel`, `condoFee`/`condominio`,
`propertyTax`/`iptu`, `address`/`endereco`/`rua`, `number`/`numero`,
`city`/`cidade`, `state`/`uf`/`estado`, `neighborhood`/`bairro`,
`zipCode`/`cep`, `latitude`/`lat`, `longitude`/`lng`/`lon`,
`area`/`areaM2`/`areautil`, `bedrooms`/`quartos`/`dormitorios`,
`suites`, `bathrooms`/`banheiros`, `parkingSpots`/`vagas`/`garagem`,
`isFurnished`/`mobiliado`, `isFeatured`/`destaque`, `images`/`fotos`.

Obrigatórios: `city`+`state` e pelo menos `code` **ou** `externalCode`
(guia a dedupe). Exemplo mínimo CSV:

```csv
code,title,city,state,target,salePrice,areaM2,bedrooms
APT-101,Apto Centro,São Paulo,SP,RENT,3900,85,2
```

### 2.7 Integrações e webhooks de saída

| Método | Rota | Ação | Descrição |
| --- | --- | --- | --- |
| GET/POST | `/api/webhook-endpoints` | `integrations:manage` | listar/criar endpoint |
| PATCH/DELETE | `/api/webhook-endpoints/{id}` | `integrations:manage` | editar/excluir |
| GET/POST | `/api/routing-rules` | `leads:route` | regras de roteamento |
| PATCH/DELETE | `/api/routing-rules/{id}` | `leads:route` | editar/excluir |
| GET | `/api/webhook-deliveries` | `integrations:manage` | entregas (filtro por status) |
| GET | `/api/webhook-deliveries/{id}` | `integrations:manage` | detalhe + tentativas |

**Roteamento (item 9):** leads imobiliários vão ao anunciante responsável do
imóvel (atribuição ao OWNER do anúncio + despacho a endpoints `REAL_ESTATE` do
próprio tenant/plataforma). Leads de produtos/serviços adicionais (`FINANCIAL`)
são roteados por regras configuráveis para destinos externos. **Isolamento
absoluto**: a consulta de regras é feita já no escopo `tenantId = NULL | <tenant
do lead>` e o `POST /api/routing-rules` rejeita anexar endpoint de outro
assinante — o destino é sempre identificado como pertencente ao contexto do
lead.

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

- **WebhookEndpoint**: URL, `scope` (`REAL_ESTATE` | `FINANCIAL`), `strategy`
  (`CUSTOM_JSON` | `FINANCE_DEFAULT` | `CRM_DEFAULT`), segredo de assinatura,
  `timeoutMs`, retries.
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
