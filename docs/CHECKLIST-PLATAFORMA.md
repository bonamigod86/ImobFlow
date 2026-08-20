# Saas Imob — Checklist de Implementação (Portal Público)

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

## Correções aplicadas após a auditoria

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
- `next build` — build de produção OK (inclui `/favoritos` e `/api/public/listings`)
- Testes de segregação de dados (tenant A nunca lê dados de B) — verdes