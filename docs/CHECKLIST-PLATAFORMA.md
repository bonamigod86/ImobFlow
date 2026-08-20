# Saas Imob — Checklist de Implementação

> Documento de rastreabilidade dos checklists passados pelo cliente. Cada item
> abaixo foi auditado no código e **está implementado e funcional** na branch
> `main`.

---

## Item 2 — Portal Público (site institucional + imóveis)

Status: **100% implementado**. Divergências identificadas na auditoria foram
corrigidas (detalhes na seção "Correções" ao final).

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 2.1 | Página inicial (hero, destaques, cidades, recém-chegados, selos de confiança) | OK | `src/app/page.tsx` |
| 2.2 | Busca de imóveis (grid + paginação + contagem) | OK | `/imoveis` + `src/components/portal/SearchFilters.tsx`, `Pagination.tsx` |
| 2.3 | Venda e locação (SALE / RENT / BOTH) | OK | Filtro, badges e URLs `/imoveis/venda`, `/imoveis/aluguel` |
| 2.4 | Filtros por cidade | OK | Páginas por slug `/imoveis/sao-paulo/…` + seção Cidades |
| 2.5 | Filtros por bairro | OK | Campo "Bairro" no painel de filtros (`neighborhood`) |
| 2.6 | Filtros por código | OK | Busca por texto inclui `code` no índice `searchText` |
| 2.7 | Filtros por tipo | OK | Select "Qualquer categoria" (8 categorias) |
| 2.8 | Filtros por faixa de preço | OK | 5 bandas (`minPrice`/`maxPrice`) |
| 2.9 | Filtros por dormitórios | OK | Select "Quartos" 1+…4+ |
| 2.10 | Filtros por suítes | OK | Select "Suítes" 1+…3+ |
| 2.11 | Filtros por banheiros | OK | Select "Banheiros" 1+…4+ |
| 2.12 | Filtros por vagas de garagem | OK | Select "Vagas" 1+…3+ |
| 2.13 | Filtros por área | OK | Select "Área mínima" 50–200 m² |
| 2.14 | Filtros por características (mobiliado) | OK | Checkbox "Mobiliado" (`isFurnished`) |
| 2.15 | Imóveis em destaque | OK | Badge "Destaque" + lista na home (`isFeatured`) |
| 2.16 | Imóveis recentes | OK | "Recém-chegados" + ordenação `newest` |
| 2.17 | Página individual do imóvel (PDP) | OK | `/imovel/[slug]` |
| 2.18 | Galeria de fotos | OK | `Gallery.tsx` (miniaturas + lightbox) |
| 2.19 | Vídeos do imóvel | OK | `VideoGallery.tsx` (players HTML5 com poster) |
| 2.20 | Descrição do imóvel | OK | Seção "Descrição" no PDP |
| 2.21 | Localização / mapa | OK | Leaflet (`ListingMap`, carregado dinamicamente) |
| 2.22 | Dados do anunciante | OK | Nome do corretor + imobiliária + **e-mail** + **telefone** |
| 2.23 | Botão de WhatsApp | OK | Deep-link `wa.me/<número>` com mensagem preenchida |
| 2.24 | Formulário de interesse | OK | `ContactModal` → `POST /api/public/leads` (consentimento LGPD) |
| 2.25 | Solicitação de visita | OK | Mesmo modal (formato "Agendar visita"); notifica o corretor |
| 2.26 | Compartilhamento | OK | `ShareButtons.tsx` (Web Share + Copiar link + WhatsApp/Facebook/X/E-mail) |
| 2.27 | Favoritos | OK | `FavoriteButton.tsx` em cards/PDP + página `/favoritos` + API `GET /api/public/listings` |
| 2.28 | Imóveis semelhantes | OK | `listSimilar` (mesma categoria e cidade) |
| 2.29 | Performance (desktop/tablet/smartphone) | OK | `next/image` (`sizes`/`priority`), ISR `revalidate`, mapa dinâmico, grids responsivos, `sitemap.xml` |

### Filtros sincronizados com a URL (SEO)

Cada filtro atualiza a query string — páginas compartilháveis e indexáveis:
`/imoveis?target=RENT&category=APARTMENT&minBedrooms=2&neighborhood=Moema&minArea=80&furnished=true&sort=newest`.

---

## Item 3 — Cadastro de imobiliárias e corretores

Status: **100% implementado**. Divergências identificadas na auditoria foram
corrigidas e o fluxo foi testado de ponta a ponta via HTTP.

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 3.1 | Perfil de imobiliária (AGENCY) | OK | `TenantType` enum + campos em `Tenant` (`legalName`, `document`, `creci`, `responsibleName`, etc.) |
| 3.2 | Perfil de corretor autônomo (BROKER) | OK | Mesmo enum; `User.document`/`creci`/`photoUrl`/`whatsapp` recebem os dados do corretor |
| 3.3 | Perfil Master (super-admin) | OK | Role `MASTER` (administradora); não possui tenant de cadastro — sem página de perfil próprio |
| 3.4 | Campos de cadastro completos | OK | Nome fantasia, razão social, CPF/CNPJ (máscara via label), CRECI, responsável, telefone, WhatsApp, e-mail, endereço, cidade, UF, descrição, site, redes sociais |
| 3.5 | Cadastro público (self-service) | OK | `POST /api/register` + `/register` (`RegisterForm.tsx`): seleção AGENCY/BROKER, validação Zod, rate limit por IP |
| 3.6 | Assinatura TRIAL automática | OK | `registerTenant` cria tenant `TRIAL` + `tenantSubscription` TRIAL (plano ativo mais barato, `trialDays` padrão 14) |
| 3.7 | Isolamento de dados por inquilino | OK | Tenant novo é linha independente; a extensão ORM com falha-fechada escopa toda query (teste de segregação verde) |
| 3.8 | Auto-login pós-cadastro | OK | Sessão JWT emitida (cookie `saas_session`, role OWNER) e redirecionamento para `/dashboard` |
| 3.9 | Edição de perfil | OK | `GET/PATCH /api/tenant/profile` + `/dashboard/profile` (`TenantProfileForm.tsx`); whitelist de campos, `displayName`→`name` |
| 3.10 | Logo / foto | OK | Upload via FileReader (Data URL, ≤1 MB, tipo imagem) no formulário de perfil; persistido em `logoUrl`/`photoUrl` |
| 3.11 | Redes sociais | OK | Campos Instagram/Facebook/LinkedIn; valores vazios/nulos removidos antes de persistir |
| 3.12 | E-mail de boas-vindas | OK | `notifyWelcomeAccount` disparado (fila/console, não-bloqueante) após o cadastro |
| 3.13 | Auditoria do ciclo de conta | OK | `TENANT_REGISTERED` e `TENANT_PROFILE_UPDATED` em `src/lib/audit/actions.ts` |

### Testes manuais realizados (via HTTP)

1. `POST /api/register` (AGENCY, CNPJ, com site) → **201**, tenant `TRIAL`,
   slug gerado `imobiliaria-teste-smoke`, cookie de sessão OWNER emitido.
2. `GET /api/tenant/profile` com a sessão → retorna dados completos do tenant
   + owner (telefone, whatsapp, CRECI, redes sociais).
3. `PATCH /api/tenant/profile` → atualizou telefone/whatsapp/descrição do tenant
   e telefone/whatsapp/CRECI do owner; UF normalizada para maiúsculas.
4. `POST /api/register` com e-mail duplicado → **409 `EMAIL_TAKEN`** com mensagem
   em pt-BR.
5. Dados de teste removidos ao final (tenant e usuários deletados em cascata).

---

## Item 4 — Painel do assinante

Status: **100% implementado**. Divergências identificadas na auditoria foram
corrigidas e o fluxo foi testado via HTTP (KPIs com dados reais de demo).

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 4.1 | Imóveis ativos, inativos, vendidos, alugados | OK | Cartão "Imóveis ativos" + badges por status (`statusBreakdown` no snapshot) |
| 4.2 | Visualizações | OK | Cartão "Visitas ao portal" (7d/30d); agora o PDP público registra a impressão (`POST /api/public/views` + `ViewTracker`) |
| 4.3 | Leads recebidos | OK | Cartão "Funil de leads" (30d + 7d + conversão) |
| 4.4 | Solicitações de visita | OK | Novo cartão "Visitas solicitadas" — leads com `payload.schedule` (7d/30d) |
| 4.5 | Contatos por WhatsApp | OK | Novo cartão "Contatos por WhatsApp" — CTA `wa.me` registra lead anônimo (`payload.channel = "whatsapp"`) |
| 4.6 | Imóveis mais visualizados | OK | "Destaques · 7 dias" (`topProperties` por views 30d) |
| 4.7 | Imóveis com maior geração de leads | OK | Novo ranking "Geração de leads" (`topByLeads` por leads 30d) |
| 4.8 | Plano contratado + status da assinatura | OK | Cartão "Plano e utilização": nome, código, badge de status (Ativo/Avaliação/Inadimplente/…) |
| 4.9 | Próximo vencimento | OK | Bloco de assinatura com `nextInvoiceDueAt`/`currentPeriodEnd` e fim de trial (TRIAL) |
| 4.10 | Limites: imóveis, usuários e destaques | OK | Barras de utilização (imóveis, usuários, leads/mês, destaques) + créditos de destaque disponíveis; limites lidos dos campos tipados do plano |

### Testes manuais realizados (via HTTP)

1. `POST /api/public/views` → **201** (registra impressão de imóvel público).
2. `POST /api/public/leads` com `channel:"whatsapp"` (sem nome) → **201**, lead
   anônimo criado e roteado (interno/externo).
3. `GET /api/analytics/dashboard` com a sessão do assinante → retornou
   `statusBreakdown`, `utilization` (pro: 500 imóveis/10 usuários/5000 leads/30
   destaques), `subscription` (ACTIVE, R$499/mês, próximo vencimento),
   `visits30d`, `whatsapp30d`, `topProperties` e `topByLeads`.
4. `/dashboard` renderizando **200** com os novos cards.

---

## Item 5 — Gestão de imóveis (CRUD completo)

Status: **100% implementado**. Divergências identificadas na auditoria foram
corrigidas e o fluxo foi testado via HTTP (CRUD completo, ciclo de vida e
galeria de mídia).

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 5.1 | Cadastro de imóvel com código e referência interna | OK | `POST /api/properties` + `FormDialog` (código + código externo) |
| 5.2 | Finalidade (venda/aluguel/ambos) e tipo/categoria | OK | `target`/`category` no schema de formulário e na validação (`propertySchema`) |
| 5.3 | Situação (ativo, inativo, vendido, alugado) | OK | Enum `PropertyStatus` + ações de menu e `/status` |
| 5.4 | Endereço completo, CEP e coordenadas | OK | Campos `address`, `number`, `city`, `state`, `neighborhood`, `zipCode`, `latitude`, `longitude` no formulário e na API |
| 5.5 | Preços de venda/aluguel, condomínio e IPTU | OK | `salePrice`, `rentPrice`, `condoFee`, `propertyTax` (Decimal) |
| 5.6 | Área, dormitórios, suítes, banheiros, vagas | OK | Campos numéricos no formulário e no grid de detalhes |
| 5.7 | Características (mobiliado, etc.) | OK | `isFurnished` (checkbox) + `isFeatured`/`isActive` no mesmo formulário |
| 5.8 | Imagens e vídeos (galeria) | OK | `MediaManagerDialog` (upload, lista, remoção) — caminho presigned (S3) e fallback local `/api/media/[id]/bytes` |
| 5.9 | Definir imagem principal | OK | `PATCH /api/media/[mediaId]/primary` (nova rota) + estrela no gerenciador |
| 5.10 | Destaques | OK | `PATCH /api/properties/[id]/featured` + menu "Destacar/Remover destaque" |
| 5.11 | Editar imóvel | OK | `PATCH /api/properties/[id]` + `FormDialog` preenchido com todos os campos |
| 5.12 | Duplicar imóvel | OK | `POST /api/properties/[id]/duplicate` + menu "Duplicar" (novo código, `externalCode` zerado, flags resetados) |
| 5.13 | Ativar/desativar (publicar/ocultar) | OK | `PATCH /status` `{ isActive }` (soft delete/restore) + badge "Oculto" |
| 5.14 | Vender/alugar (situação) | OK | `PATCH /status` `{ status: SOLD | RENTED }` + itens de menu condicionais |
| 5.15 | Excluir imóvel | OK | `DELETE /api/properties/[id]` (com confirmação; remove mídia em cascata) |

### Testes manuais realizados (via HTTP)

1. `POST /api/properties` com todos os campos (código externo, endereço, CEP,
   coordenadas, condomínio, IPTU, cômodos, mobiliado) → **201**; `GET` refletiu
   os dados.
2. `PATCH /api/properties/[id]` → atualização de título/IPTU **200** (slug/`searchText` recalculados).
3. `PATCH /api/properties/[id]/featured` `{ featured: true }` → `isFeatured: true`.
4. `PATCH /api/properties/[id]/status` `{ status: "SOLD" }` → `SOLD`;
   `{ isActive: false }` → `INACTIVE` (oculto) e `{ isActive: true }` → restaurado.
5. `POST /api/properties/[id]/duplicate` → **201**, novo código `AUD5-001-01`,
   `externalCode: null`, `isFeatured: false`, `isActive: true`.
6. Galeria de mídia local: `POST …/media` (registro) → `POST /api/media/[id]/bytes`
   (armazenou) → media `READY` com `url` interna → `GET …/bytes` **200** com bytes
   corretos → `PATCH /api/media/[id]/primary` → `isPrimary: true` no `GET` do imóvel.
7. `DELETE /api/properties/[id]` → **200**; media removida (bytes → **404** após).

---

## Item 6 — Importação e sincronização de imóveis

Status: **100% implementado**. Divergências identificadas na auditoria foram
corrigidas (detalhes na seção "Correções" ao final).

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 6.1 | Importação via REST | OK | `POST /api/imports?format=csv\|xml\|json` (corpo cru ≤ 20 MB, autenticado) |
| 6.2 | Importação por webhooks/arquivo | OK | XML (VivaReal/ZAP), CSV e JSON + `POST /api/properties/sync` (ingestão por callback/API) |
| 6.3 | Processamento em lote (assíncrono) | OK | `ImportBatch` persistido + fila `property-import-queue` (BullMQ); fail-open síncrono sem Redis |
| 6.4 | Dedupe e atualização por código | OK | `(tenantId, externalCode)` com fallback `(tenantId, code)`; reenviar catálogo → `UPDATED` idempotente, `slug` público estável |
| 6.5 | Sincronização de status | OK | Coluna `status` aplicada no upsert (`ACTIVE/INACTIVE/SOLD/RENTED`) |
| 6.6 | Resultado e erros por linha | OK | `GET /api/imports` (histórico) e `GET /api/imports/{id}` (contadores + erros ≤ 200) |
| 6.7 | Resiliência/observabilidade | OK | Retry com backoff + DLQ + `POST …/replay`; `GET /api/jobs/import:{batchId}` |
| 6.8 | Documentação | OK | `docs/API_AND_WEBHOOK_SPECIFICATION.md` §2.6 e `docs/ARCHITECTURE_AND_DATABASE_MANUAL.md` |

### Testes manuais realizados (via HTTP)

1. `POST /api/imports?format=json&source=REST_API` (2 imóveis novos) → **202**,
   lote `COMPLETED` com `importedRows: 2`.
2. Reenvio do mesmo JSON com `status: RENTED` e `areaM2: 100` → **202**, lote
   `COMPLETED` com `updatedRows: 2`; imóvel `IMP-JSON-1` passou para
   `status=RENTED` e `area=100` com o `slug` público **estável** (idempotência +
   sincronização de status).
3. Import CSV (source `VIVA_REAL`) com colunas `areaM2` e `isFurnished` → 2/2
   válidos; `area: 320`, `isFurnished: true`, `status: SOLD` aplicados.
4. Import XML (source `ZAP`) estilo `<lista><imovel>` com `codigoImovel` → 1/1
   válido; `externalCode: SYNC-XML-001` extraído via alias.
5. `POST /api/properties/sync?format=json&source=REST_API` (ingestão por API) →
   **202** e lote `COMPLETED`.
6. `GET /api/imports` → histórico com 4 lotes `COMPLETED` e contadores corretos.
7. `GET /api/jobs/import:{batchId}` → com Redis ativo expõe o estado do job; em
   dev local (fila indisponível) retorna **404** pois o lote já foi processado
   de forma síncrona fail-open (`jobId` `sync:{batchId}`).
8. Limpeza: os 6 imóveis de teste (`IMP-*`, `SYNC-*`) excluídos após a validação.

---

## Correções aplicadas após a auditoria (Item 6)

1. **Observabilidade de jobs quebrada** — `[jobId]/route.ts` e
   `[jobId]/replay/route.ts` liam `params.id` num segmento de rota `[jobId]`
   (o parâmetro nunca vinha → `jobId is required.`); corrigido para
   `params.jobId` (exposto pelo smoke test do item 6).
2. **Alias `areaM2` ausente** — CSV/JSON com a coluna `areaM2` (e variações
   `area_m2`/`aream2`) não mapeava para `area`; aliases adicionados em `parsers.ts`.
3. **`POST /api/properties/sync` inexistente** — criado endpoint dedicado de
   sincronização via API/webhook reutilizando o pipeline de import
   (`ImportEngine.submit`), com `source` padrão `REST_API`.
4. **Ingestão fragmentada** — REST/webhook/portal agora convergem em
   `ImportEngine.submit` (parse → `ImportBatch` → enqueue), garantindo semântica
   idêntica de dedupe/status entre formatos e origens.
5. **Fila indisponível derrubava o import** — `enqueue()` cai para processamento
   síncrono fail-open com `jobId` `sync:{batchId}`, mantendo o fluxo em dev local.
6. **Docs divergentes** — `API_AND_WEBHOOK_SPECIFICATION.md` §2.4 ampliada
   (media, featured, sync, bytes, primary) e nova §2.6 documentando o modelo de
   processamento, dedupe, sync de status, colunas/aliases e exemplo CSV.

---

## Item 7 — Geração e qualificação de leads

Status: **100% implementado**. Divergências identificadas na auditoria foram
corrigidas (detalhes na seção "Correções" ao final).

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 7.1 | CTAs de geração no imóvel | OK | `src/components/portal/ContactModal.tsx` expõe os 7 CTAs no PDP |
| 7.2 | CTA "tenho interesse neste imóvel" | OK | Formulário → `POST /api/public/leads`, `interestType: tenho_interesse` |
| 7.3 | CTA "quero agendar visita" | OK | Formulário com data/horário → `schedule` + e-mail `visit_request` |
| 7.4 | CTA "falar com o anunciante" | OK | Deep-link `wa.me` + captura anônima `channel: whatsapp`, `interestType: falar_anunciante` |
| 7.5 | CTA "quero saber mais" | OK | Formulário → lead com mensagem do visitante |
| 7.6 | CTA "avaliar opções de financiamento" | OK | Captura financeira leve → `interestType: financiamento` |
| 7.7 | CTA "conhecer alternativas para aquisição" | OK | Captura financeira leve → `interestType: alternativas_aquisicao` |
| 7.8 | CTA "receber uma simulação" | OK | Captura financeira leve → `interestType: simulacao` |
| 7.9 | Campos do lead (quando disponível) | OK | nome, telefone, e-mail, imóvel/código, **valor**, **cidade**, **imobiliária**, **corretor**, origem, **data/hora**, **UTM/campanha**, **tipo de interesse**, mensagem, consentimentos — em `payload` + `LeadConsent` 1:1 (ver 7.10) |
| 7.10 | Snapshot imutável do anúncio | OK | `payload.propertySnapshot` (código, valor, cidade, imobiliária, corretor) capturado na submissão |
| 7.11 | UTM/campanha | OK | `utm` aceito via API e **anexado pelo portal** (lido da URL) |
| 7.12 | Qualificação (funil) | OK | `GET/PATCH/DELETE /api/leads/{id}`: status `NEW→CONTACTED/QUALIFIED/PROPOSAL_SENT/NEGOTIATION/WON/LOST`, `note`, `assignedToId` (exige `leads:assign`) |
| 7.13 | Roteamento/qualificação | OK | Worker `lead-routing-queue` agenda OWNER + tier hot/warm/cold; financeiro → parceiro via `RoutingRule`; e-mails `new_lead_alert`/`visit_request` |
| 7.14 | Observabilidade de geração | OK | KPIs do painel: funil de leads, visitas solicitadas, WhatsApp, ranking "Geração de leads" |

### Testes manuais realizados (via HTTP)

1. **7 CTAs**: `POST /api/public/leads` com `interestType`
   tenho_interesse/saber_mais/agendar_visita/falar_anunciante e
   `/api/public/financial-leads` com financiamento/alternativas_aquisicao/
   simulacao → **201** em todos; `type` e `interestType` gravados.
2. **Campos**: o lead persistido contém `propertySnapshot` com `code`, `value`
   (NRT-102 rent @ 4200), `city`, `estateName` (ACME Imóveis) e `broker` (acme
   Owner), além de `capturedAt`, `utm` (`campaign: winter`) e `interestType`.
3. **Visita**: lead com `schedule {date, time}` → `payload.schedule` presente
   (+ e-mail `visit_request` enfileirado).
4. **WhatsApp**: clique → lead anônimo `channel: whatsapp`,
   `interestType: falar_anunciante`, `origin: SITE_FORM`.
5. **Financeiro leve**: captura sem perfil (`simulacao`) → **201**; perfil
   derivado do anúncio (`propertyValue` 750000 → 4200 no RENT, cidade/UF do
   imóvel); roteado ao parceiro `CredFácil` via `seed-rule-fallback`.
6. **Qualificação**: `PATCH /api/leads/[id]` `{status: QUALIFIED, note, assignedToId}`
   → `status: QUALIFIED`, `qualifiedAt`, `lastNote`, `assignedTo` populados.
7. **Detalhe**: `GET /api/leads/[id]` → snapshot, `consent` (textVersion, IP,
   UA, `grantedAt`) e entregas (`endpoint.scope`) retornados.
8. **Exclusão**: `DELETE /api/leads/[id]` → `{deleted: true}`; os leads de teste
   criados no smoke foram removidos ao final.

---

## Correções aplicadas após a auditoria (Item 7)

1. **Campos derivados do anúncio não eram capturados** — valor, cidade,
   imobiliária e corretor só existiam vivos no imóvel. Criado
   `payload.propertySnapshot` (código, `value` por target SALE/RENT, cidade,
   `estateName`, `broker` {id, name, email, phone}) capturado na submissão,
   além de `capturedAt`.
2. **UTM não fluía do portal** — o `ContactModal` nunca lia a URL; agora lê
   `utm_*` e anexa nos formulários e no clique do WhatsApp (via API).
3. **Apenas 2 CTAs no PDP** — faltavam "tenho interesse", "saber mais",
   "financiamento", "alternativas para aquisição" e "simulação". O modal agora
   expõe os 7 CTAs; a intenção é gravada como `interestType`.
4. **Captura financeira exigia perfil completo** — schema relaxado (valor,
   renda, entrada, prazo, cidade/UF opcionais); valor/cidade são derivados do
   anúncio e faltas não bloqueiam o roteamento (regras avaliam o que existe).
5. **Sem qualificação de leads** — não havia como abrir/promover/excluir um
   lead. Criado `GET/PATCH/DELETE /api/leads/{id}` (status de funil, `note`,
   `assignedToId` com validade de usuário + gate `leads:assign`,
   `qualifiedAt`/`statusUpdatedAt`, auditoria `LEAD_UPDATED`/`LEAD_DELETED`).
6. **§3.1 da API doc divergia** — `scope REAL_ESTATE|PLATFORM` e
   `strategy PUSH|PULL|MANUAL` corrigidos para `REAL_ESTATE|FINANCIAL` e
   `CUSTOM_JSON|FINANCE_DEFAULT|CRM_DEFAULT`.
7. **WhatsApp sem intenção** — clique registrava lead anônimo sem CTA; agora
   grava `interestType: falar_anunciante`.

---

## Item 8 — Leads relacionados à aquisição do imóvel

Status: **100% implementado**. Já na primeira versão a plataforma capta
interessados em soluções financeiras e **encaminha ao sistema externo
autorizado** — sem motor próprio de aprovação financeira.

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 8.1 | Captação de interessados em soluções financeiras | OK | 3 CTAs no PDP (financiamento, alternativas, simulação) → `POST /api/public/financial-leads` |
| 8.2 | Valor do imóvel | OK | `financeProfile.propertyValue` (derivado do anúncio na captura leve) |
| 8.3 | Valor aproximado de entrada | OK | `downPayment` |
| 8.4 | Valor pretendido para contratação | OK | `financingAmount` (default `valor − entrada`) |
| 8.5 | Renda aproximada | OK | `monthlyIncome` |
| 8.6 | Faixa de parcela | OK | `monthlyInstallmentLimit` |
| 8.7 | Prazo pretendido | OK | `termMonths` (1–480) |
| 8.8 | Cidade / UF | OK | `financeProfile.city/state` (derivados do imóvel quando ausentes) |
| 8.9 | Imóvel de interesse | OK | `lead.propertyId` + snapshot no `payload` |
| 8.10 | Nome, telefone e e-mail | OK | `lead.name/phone/email` (+ consentimento LGPD 1:1) |
| 8.11 | Qualificar / encaminhar ao sistema externo autorizado | OK | `RoutingRule` (geo/renda/valor/prazo) → endpoint `FINANCIAL` com webhook `FINANCE_DEFAULT` (todos os campos acima), HMAC, idempotência e DLQ |
| 8.12 | Registrar | OK | `Lead` + `FinancialLeadProfile` + `LeadConsent` + auditoria `LEAD_CREATED`; listável via `GET /api/leads?type=FINANCIAL` |
| 8.13 | Sem motor próprio de aprovação | OK | Sem lógica de decisão de crédito; o lead é repassado ao parceiro |

### Testes manuais realizados (via HTTP)

1. `POST /api/public/financial-leads` com **perfil completo** (11 campos) →
   **201**; `type: FINANCIAL`, `status: NEW`; perfil persistido com
   `propertyValue/downPayment/financingAmount/monthlyIncome/
   monthlyInstallmentLimit/termMonths/city/state`.
2. Captura **leve** (sem perfil) → **201**; valor/cidade/UF derivados do
   imóvel; roteado ao parceiro `CredFácil Fintech` via `seed-rule-fallback`
   (entrega `FINANCE_DEFAULT` criada na `WebhookDelivery`).
3. `GET /api/leads?type=FINANCIAL` → lista somente financeiros com o
   `financeProfile` embutido.
4. `GET /api/leads/[id]` → detalhe com perfil financeiro, consentimento e
   entregas ao parceiro.
5. Qualificação: `PATCH /api/leads/[id]` `{status: "QUALIFIED"}` →
   `qualifiedAt` gravado; envio ao parceiro independe do estado do funil.
6. `DELETE /api/leads/[id]` → remove com cascade (leads de teste limpos).

---

## Correções aplicadas após a auditoria (Item 8)

1. **Listagem não expunha o perfil financeiro** — `GET /api/leads` agora aceita
   `?type=FINANCIAL` (e demais tipos/status) e retorna `financeProfile` na lista
   para o painel qualificar sem abrir lead a lead.
2. **Contrato de campos não estava documentado** — adicionadas a tabela
   requisito→coluna→payload em `API_AND_WEBHOOK_SPECIFICATION.md` (§2.3) e a
   descrição do **funil de aquisição** no manual do assinante (`B.3`), com a
   garantia de ausência de motor próprio de aprovação.
3. **Checklist sem rastreabilidade** — seção Item 8 criada em
   `CHECKLIST-PLATAFORMA.md` (requisitos 8.1–8.13, testes manuais).

---

## Item 9 — Roteamento de leads

Status: **100% implementado**. Camada configurável de roteamento com destino
correto e isolamento absoluto entre clientes.

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 9.1 | Camada configurável de roteamento | OK | `RoutingRule` + `GET/POST/PATCH/DELETE /api/routing-rules` (regras por prioridade e filtros: cidade/UF, renda, valor, prazo) |
| 9.2 | Leads imobiliários → anunciante responsável | OK | Captura anexa ao imóvel/tenant do anúncio; worker `lead-routing-queue` atribui ao OWNER do anúncio (`payload.routing.tier`) + e-mail `new_lead_alert`; despacho para endpoints `REAL_ESTATE` do tenant/plataforma |
| 9.3 | Produtos/serviços adicionais → destinos externos configurados | OK | Leads `FINANCIAL` (financiamento/simulação/alternativas) roteados por regras para endpoints `FINANCIAL` (parceiros) via webhook assinado |
| 9.4 | Identificação correta do destino | OK | `selectRoutingEndpoint` puro (tenant → platform, prioridade); entrega registra `matchedRuleId` + `endpointId`; endpoint validado como ativo e do escopo certo |
| 9.5 | Isolamento absoluto entre clientes | OK | Regras consultadas já no escopo `tenantId = NULL | <tenant do lead>`; tenant A nunca vê/usa regra ou endpoint do tenant B; `POST` rejeita anexar endpoint de outro assinante |

### Testes manuais realizados (via HTTP)

1. `GET /api/routing-rules` (acme) → somente regras da plataforma + próprias.
2. `POST /api/routing-rules` (regra do tenant, cidade Campinas) → criada com o
   `tenantId` do assinante; `GET` seguinte a exibe.
3. `POST` com endpoint `REAL_ESTATE` numa regra → **400 `INVALID_ENDPOINT`**
   (regras financeiras exigem endpoint `FINANCIAL` ativo).
4. Lead financeiro **sem** cidade (herda São Paulo do imóvel) → regra do tenant
   de Campinas **não** casa; cai na regra de plataforma correta (SP).
5. Lead financeiro com `city=Campinas` → **regra do tenant vencera a de
   plataforma** (`matchedRuleId` = regra Acme-Campinas), destino `CredFácil`.
6. `DELETE /api/routing-rules/[id]` → regra desativada.
7. Isolamento: regra de outro tenant nunca é considerada (teste unitário).

---

## Correções aplicadas após a auditoria (Item 9)

1. **Consulta de regras carregava todos os tenants** — `resolveFinancialEndpoint`
   buscava toda a tabela e filtrava em memória. Agora a query filtra no banco
   (`tenantId = NULL | <tenant do lead>`) — o lead de um cliente nunca carrega
   nem avalia regra de outro ("isolamento absoluto" por construção).
2. **Teste de isolamento ausente** — adicionado caso em que a regra de outro
   tenant (mesmo com prioridade 1) é ignorada para o lead, com fallback para
   regra própria/plataforma e correta destinação para o dono da regra.
3. **Checklist sem rastreabilidade** — seção Item 9 criada em
   `CHECKLIST-PLATAFORMA.md` (requisitos 9.1–9.5, testes manuais).

---

## Item 10 — Integração com sistemas externos

Status: **100% implementado**. Integração via API/webhook com identificação de
origem/imóvel/interesse, transmissão de dados autorizados, tenant de destino e
registro de sucesso/falha. Credenciais de sistemas externos **não** fazem parte
do entregável (fornecidas só ao profissional selecionado).

| # | Requisito | Status | Implementação |
|---|-----------|--------|----------------|
| 10.1 | Integração via API e/ou webhook com sistemas externos | OK | `WebhookEndpoint` (`REAL_ESTATE`/`FINANCIAL`) + `POST/GET/PATCH/DELETE /api/webhook-endpoints`; transmissão em fila `webhook-transmission-queue` |
| 10.2 | Registrar o lead quando atender às regras | OK | Captura persiste `Lead` + consentimento; `createDeliveryAndEnqueue` cria entrega durável por destino quando regra casa |
| 10.3 | Identificar origem | OK | `origin` (SITE_FORM/…) + `payload.source`/`channel`; `CRM_DEFAULT`/`FINANCE_DEFAULT` transmitem `origin` |
| 10.4 | Identificar imóvel | OK | `propertyId` + `payload.propertySnapshot`; adapters transmitem `property.{id,code}` |
| 10.5 | Identificar tipo de interesse | OK | `type` (BUYER/RENTER/FINANCIAL) + `interestType`; adapters transmitem `interest_type` |
| 10.6 | Transmitir apenas dados autorizados | OK | `strategy` governa o subconjunto (contato, imóvel, perfil financeiro); IP/UA/consentimento **não** saem do servidor |
| 10.7 | Identificar conta/tenant de destino | OK | `WebhookDelivery.tenantId` + `endpointId` (endpoint do tenant ou plataforma; nunca de outro assinante) + `tenant_id` no envelope |
| 10.8 | Registrar sucesso ou falha | OK | `WebhookDelivery.status` (`PENDING→IN_FLIGHT→DELIVERED/FAILED/DEAD_LETTERED`), `attemptsCount`, `lastError`, tentativas detalhadas; observabilidade via `GET /api/webhook-deliveries(/{id})`, DLQ + `replay` |
| 10.9 | Docs/credenciais só ao profissional selecionado | OK | Contrato de integração público em `API_AND_WEBHOOK_SPECIFICATION.md` **§3.4**; nenhuma credencial no repo |

### Testes manuais realizados (via HTTP)

1. `GET /api/webhook-deliveries` (acme) → N entregas corretas (assinante apenas;
   `MASTER` vê tudo), com endpoint/scope/`_count.attempts`.
2. `GET /api/webhook-deliveries/[id]` → detalhe da entrega (endpoint, estado).
3. Lead imobiliário → entrega para `CRM Vivo Sales (central)` (scope
   `REAL_ESTATE`, estratégia `CRM_DEFAULT`).
4. Lead financeiro → entrega para `CredFácil Fintech (parceiro)` (scope
   `FINANCIAL`, estratégia `FINANCE_DEFAULT`) com `matchedRuleId` correto.
5. Assinatura/dedupe: `x-idempotency-key` e `X-Saas-Imob-Signature` (HMAC)
   documentados e testados por unidade; sem Redis local as entregas ficam
   `PENDING` (em produção o worker transmite, registrando `DELIVERED`/`FAILED`).

---

## Correções aplicadas após a auditoria (Item 10)

1. **`FINANCE_DEFAULT` não identificava origem/imóvel/interesse** — o envelope
   do parceiro não trazia `origin`, `interest_type` nem `property.{id,code}`;
   adicionados (§10.3–10.5) em `src/lib/integrations/strategies.ts`.
2. **`CRM_DEFAULT` sem `interest_type`** — passou a transmitir a intenção de
   CTA junto com `interest` (rent/buy).
3. **Contrato de integração não explicado** — nova seção **§3.4** na
   `API_AND_WEBHOOK_SPECIFICATION.md`: registro, disparo por regras, dados
   autorizados por estratégia, sucesso/falha e a nota de que credenciais de
   sistemas externos são provisionadas apenas ao profissional selecionado.
4. **Checklist sem rastreabilidade** — seção Item 10 criada (10.1–10.9 + testes).

---

## Correções aplicadas após a auditoria (Item 5)

1. **Duplicar conflitava no `externalCode`** — `duplicateProperty` copiava o
   `externalCode` da origem, violando `@@unique([tenantId, externalCode])` (P2002).
   Agora a cópia começa com `externalCode: null` e código novo (sufixo `-NN`).
2. **Sem rota de "imagem principal"** — `setPrimaryMedia` existia no serviço, mas
   nenhum endpoint expunha; criado `PATCH /api/media/[mediaId]/primary` (com evento
   `property.media_primary` no barramento).
3. **Galeria não funcionava em dev local** — sem S3 configurado, o upload
   presignado é inviável e o worker (processo separado) não vê o objeto. Criado
   `GET/POST /api/media/[mediaId]/bytes`: `registerUpload` só enfileira o job de
   transcodificação quando há armazenamento real; no modo local o navegador envia
   os bytes ao servidor e a linha é finalizada READY com `url` interna.
4. **Relativo não renderizava em `<img>`** — `PropertyThumb` aceita apenas CDN
   HTTPS; passou a renderizar URLs relativas (bytes route) com `<img>` simples
   (o otimizador next/image perderia o cookie da sessão).
5. **Formulário incompleto** — faltavam código externo, endereço, número, CEP,
   coordenadas, condomínio, IPTU, dormitórios, suítes, banheiros, vagas e
   mobiliado; todos adicionados ao `FormDialog` (com parse de inteiros).
6. **Ações de ciclo de vida ausentes na tabela** — menu de linha ganhou
   Duplicar, Destacar/Remover destaque, Publicar/Ocultar, Marcar vendido e
   Marcar alugado (gate por permissão `properties:update`).
7. **Gerenciador de mídia inexistente** — novo `MediaManagerDialog` (adicionar
   imagem/vídeo, remover, definir capa) na ação "Fotos e vídeos".
8. **`PropertyRow` sem campos novos** — adicionados `zipCode`, `latitude`,
   `longitude`, `isFurnished` e o tipo `PropertyMediaRow`.

---

## Correções aplicadas após a auditoria (Item 4)

1. **Visualizações não fluíam do portal** — o PDP público não registrava
   impressões (só existia o endpoint autenticado, nunca chamado). Criado
   `POST /api/public/views` (rate-limited, fingerprint de IP não reversível)
   e `ViewTracker.tsx` (1 impressão por imóvel por sessão, não-bloqueante).
2. **"Contatos por WhatsApp" não eram registrados** — o CTA era só um deep-link.
   Agora o clique também captura um lead anônimo (`channel:"whatsapp"`, sem PII),
   e o `publicRealEstateLeadSchema` aceita o canal (nome obrigatório apenas no
   formulário).
3. **Solicitações de visita** — passaram a ser contabilizadas nos novos funis
   `snapshot.visits7d/30d` (leads com `payload.schedule`).
4. **"Imóveis com maior geração de leads"** — novo ranking `topByLeads`
   (groupBy por `propertyId`, 30 dias) + widget "Geração de leads".
5. **Plano/assinatura/vencimento fora do painel** — o cartão de plano passou a
   exibir status da assinatura, próximo vencimento e fim de trial, além das
   barras de limite (incluindo destaques e créditos disponíveis).
6. **Limites lidos do JSON legado** — o snapshot lia `plan.features`
   (shape antigo); agora lê os campos tipados (`maxProperties/maxUsers/maxLeads/
   highlightCredits`) com fallback para o JSON.
7. **Bugg de isolamento no snapshot** — `prisma.tenant.findFirst({})` não é
   tenant-scoped (Tenant é modelo de plataforma) e retornava plano de outro
   assinante; corrigido para `findUnique({ where: { id: tenantId } })` usando o
   tenant da sessão.
8. **Nova rota pública no teste de segregação** — `public/views` adicionado a
   `PUBLIC_ROUTES` (`segregation-audit.test.ts`).

---

## Correções aplicadas após a auditoria (Item 3)

1. **Middleware bloqueando o cadastro** — `/register` e `/api/register` não
   estavam no whitelist público (`src/middleware.ts`), respondendo 401; foram
   adicionados.
2. **`displayName` vs `name`** — o formulário de perfil enviava `displayName`;
   `updateProfile` esperava `name`; o serviço passou a mapear `displayName → name`.
3. **`socialLinks`/valores nulos** — postos vazios/null eram persistidos no JSON;
   agora são removidos antes do salvamento no registro e na atualização.
4. **Rota pública em teste de segregação** — `register` adicionado a
   `PUBLIC_ROUTES` (`segregation-audit.test.ts`).

---

## Correções aplicadas após a auditoria (Item 2)

1. **Vídeos** — o repositório público passou a expor mídias `VIDEO` (`PublicProperty.videos`)
   e o PDP renderiza `VideoGallery` com poster da capa (`preload="none"` para performance).
2. **WhatsApp funcional** — novo campo `User.phone` (migração `20260820050000_user_phone`);
   o botão agora usa `wa.me/<número>` com mensagem pré-preenchida; seed e banco de demo
   receberam telefones.
3. **Favoritos** — toggle persistido em `localStorage` (`src/lib/public/favorites.ts`),
   botão em cards e PDP, link no header e página `/favoritos` consumindo
   `GET /api/public/listings?ids=…` (respeita o contrato de visibilidade pública).
4. **Compartilhamento** — `ShareButtons.tsx` com Web Share API nativa, cópia de link
   e deep-links para WhatsApp, Facebook, X e E-mail.
5. **Filtros completos** — bairro, suítes, banheiros, vagas, área mínima e mobiliado
   adicionados ao `SearchFilters` e ao parsing da página de busca.
6. **Dados do anunciante** — cartão do corretor no PDP passou a exibir e-mail (mailto)
   e telefone (tel), além do nome/imobiliária.

---

## Garantias de qualidade

- `npx tsc --noEmit` — sem erros
- `next lint` — sem warnings ou erros
- `vitest run` — 209/209 testes passando
- Testes de segregação de dados (tenant A nunca lê dados de B) — verdes,
  incluindo as rotas públicas de itens 3 e 4
- Seed demo: KPIs do painel populados (views, visitas, WhatsApp) de forma idempotente
- Item 5 (imóveis): CRUD completo, duplicar, publicar/ocultar, vender/alugar,
  destaque e galeria de mídia (com fallback local) validados via HTTP
- Item 6 (importação/sincronização): CSV/XML/JSON e `/api/properties/sync` com
  dedupe, atualização idempotente e sync de status validados via HTTP
- Item 7 (leads): 7 CTAs, snapshot de imóvel/imobiliária/corretor, UTM,
  consentimento LGPD, captura financeira leve e qualificação de funil
  (status/atribuição) validados via HTTP
- Item 8 (aquisição): captura financeira com os 11 campos, qualificação por
  regras e encaminhamento ao sistema externo autorizado (`FINANCE_DEFAULT`)
  validados via HTTP
- Item 9 (roteamento): camada configurável com preferência tenant→plataforma,
  destino correto e isolamento absoluto entre clientes validados via HTTP