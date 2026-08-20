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
- `vitest run` — 208/208 testes passando
- Testes de segregação de dados (tenant A nunca lê dados de B) — verdes,
  incluindo as rotas públicas de itens 3 e 4
- Seed demo: KPIs do painel populados (views, visitas, WhatsApp) de forma idempotente
- Item 5 (imóveis): CRUD completo, duplicar, publicar/ocultar, vender/alugar,
  destaque e galeria de mídia (com fallback local) validados via HTTP
- Item 6 (importação/sincronização): CSV/XML/JSON e `/api/properties/sync` com
  dedupe, atualização idempotente e sync de status validados via HTTP