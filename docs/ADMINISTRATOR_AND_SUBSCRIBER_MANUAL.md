# Manual do Administrador e do Assinante — SaaS Imob

Versão: 1.0 · Fase 6 · Público: operador do SaaS (Administrador) e imobiliárias (Assinantes)

---

## Parte A — Administrador do SaaS (papel MASTER)

### A.1 Acesso

O administrador da plataforma acessa o **console do operador** com a conta de
papel `MASTER` (semeada pelo `db:seed`). O console é acessível nas rotas
`/admin/**`. Apenas `MASTER` enxerga essas telas/endpoints.

### A.2 Gestão de imobiliárias (tenants)

- **Listar** tenants: `/admin/tenants`.
- **Editar / trocar status**: `/admin/tenants/{id}` — status:
  `ACTIVE`, `SUSPENDED`, `CANCELLED`, ...

> Ao suspender um tenant, o portal público e o painel deixam de operar para
> ele, mas os dados **não** são apagados (quarentena).

### A.3 Planos e assinaturas

- **Planos**: `/admin/billing/plans` (criar/editar código e valores) e
  `/admin/billing/plans/{code}/status` (ativar/desativar).
- **Assinatura de um tenant**: `/admin/billing/tenants/{id}` (visualizar) e
  `/admin/billing/tenants/{id}/provision` para provisionar assinatura manual.
- **Simular evento de cobrança**: `/admin/billing/tenants/{id}/simulate` —
  útil para testar e-mails e dunning em staging.
- **Scan de cobrança**: `/admin/billing/scan` dispara a verificação do
  dunning (faturas vencidas, carência, bloqueio) fora do ciclo automático.

### A.4 Eventos e métricas de cobrança

- `/admin/billing/events` — histórico imutável dos eventos recebidos de
  gateways (Stripe/Asaas/custom).
- `/admin/billing/metrics` — MRR/receita por status.

### A.5 Filas mortas (DLQ) e jobs

Jobs que esgotaram as retentativas caem no DLQ de cada fila
(`<fila>-dlq`): `lead-routing`, `webhook-transmission`, `media-processing`,
`property-import`, `billing-sync`, `email-send`.

- **Listar DLQ**: `/admin/dlq`.
- **Status do job**: `/api/jobs/{jobId}`.
- **Reprocessar**: `/api/jobs/{jobId}/replay` (volta para a fila original).

> Operação típica: ao notar DLQ de e-mail ou webhook com acúmulo, corrija a
> causa (ex.: credencial de e-mail, segredo do endpoint) e replique os jobs.

### A.6 E-mail transacional

O transporte ativo é definido por `EMAIL_PROVIDER` (`console` para teste;
`resend`, `sendgrid` ou `ses` em produção). Verifique que `EMAIL_FROM` tem
SPF/DKIM/DMARC antes do primeiro launch. Em `console`, os e-mails são logados
no stdout — nenhum e-mail real é enviado.

---

## Parte B — Manual do Assinante (imobiliária)

### B.1 Acesso e primeira sessão

1. Você recebe as credenciais da sua imobiliária (usuário + senha).
2. Entre em `https://<empresa>.saas.local/login`.
3. Esqueceu a senha? Clique em **“Esqueci minha senha”**: informe o e-mail e
   você receberá um **link único de redefinição** (válido por 15 minutos por
   padrão, configurável via `RESET_TOKEN_TTL_SECONDS`). O link só pode ser
   usado **uma vez**.

> Por segurança: a plataforma não informa se um e-mail existe ou não ao pedir
> redefinição — a mensagem é sempre a mesma, evitando que terceiros descubram
> contas cadastradas.

### B.2 Imóveis

- **Cadastro/edição**: lista em `/dashboard`, rotas `pending/app` conforme o
  painel. Cada imóvel tem código único, status, preço de venda/aluquel,
  localização, característica, mídia e **destaque** (créditos).
- **Mídia**: envie fotos por imóvel; o sistema gera variantes otimizadas
  (WebP). Remova arquivos desnecessários pela galeria.
- **Duplicar**: cria cópia com código novo, útil para imóveis semelhantes.
- **Importação em lote (XML/CSV/JSON)**: envie o catálogo (VivaReal/ZAP ou
  CSV/JSON próprio) em `POST /api/imports` (formato via `?format=`). O
  processamento é assíncrono: acompanhe status em **Importações**. Limite de
  20 MB por lote.
- **Status público**: altere o status para controlar o que aparece no portal.

### B.3 Leads e integrações

- **Leads do portal** chegam ao painel com nome, contato, mensagem, origem e
  consentimento LGPD registrado. O dono da imobiliária recebe **e-mail de novo
  lead** na hora; se o lead pediu agendamento, um **e-mail de pedido de visita**
  é enviado.
- **Roteamento para CRMs**: cadastre endpoints (URL + segredo) em
  **Integrações / Webhooks** e monte **regras de roteamento** (tipo/origem/
  cidade/prioridade). Cada entrega é assinada com HMAC-SHA256 no header
  `X-Saas-Imob-Signature` e tem retentativas com backoff exponencial.
- **Acompanhe entregas**: histórico em **Webhook Deliveries** (status, latência,
  tentativas). Para falhas persistentes o registro cai na fila morta — acione o
  administrador da plataforma para reprocessar.
- **Funil de aquisição (financiamento)**: os CTAs "avaliar opções de
  financiamento", "conhecer alternativas para aquisição" e "receber uma
  simulação" geram leads financeiros registrados com o perfil completo quando
  preenchido — valor do imóvel, entrada, valor a contratar, renda, faixa de
  parcela, prazo, cidade e imóvel de interesse (sem motor próprio de aprovação:
  o lead é **qualificado por regras** e **encaminhado ao parceiro autorizado**
  via webhook `FINANCE_DEFAULT`, que entrega esses campos ao sistema externo).

### B.4 Assinatura e cobrança (subtensas de destaque)

- Centro de cobrança: `/dashboard/billing`.
- **Créditos e destaque**: compre créditos, use em “destaque” de imóveis e
  acompanhe o saldo.
- **Faturas**: você recebe **e-mail de fatura paga** e, se atrasar, **e-mail de
  aviso de atraso** indicando o prazo de carência. Esgotada a carência sem
  pagamento, a conta é **bloqueada** (e-mail de bloqueio); assim que o
  pagamento confirmar, a conta é **reativada** automaticamente (e-mail de
  reativação).

### B.5 Boas práticas de segurança

- Use senha forte (mín. 8 caracteres; a plataforma valida o tamanho na
  redefinição).
- Não compartilhe a sessão; cada usuário tem papel próprio (`OWNER`/`AGENT`).
- Mantenha e-mails de recuperação atualizados — os links de reset são de uso
  único e expiram.
- Webhooks: guarde o segredo do endpoint em segurança; o receptor **deve**
  validar `X-Saas-Imob-Signature`.

---

## Parte C — Perguntas frequentes (FAQ)

**O lead do portal não apareceu no CRM.**
Verifique a entrega em *Webhook Deliveries* e se a regra de roteamento
corresponde ao lead (tipo/origem). Se a entrega estiver como falha, peça o
reprocessamento via DLQ.

**Vários e-mails por engano?**
O sistema deduplica por chave estável; reenvios acidentais de jobs não geram
duplicidade de envio.

**Recebi link de reset mas já expirou.**
Solicite novamente pelo fluxo de “Esqueci minha senha”. Cada link é válido uma
única vez e por 15 minutos (configurável).

**O processamento de 429 (muitas requisições) me afeta?**
Os limites públicos (`public-leads`) existem para absorver picos sem derrubar o
portal. Em picos legítimos, ajuste os limites de ambiente (veja o manual de
implantação).

**Posso recuperar um imóvel excluído?**
Exclusões registram auditoria ; não há restaurar automático — confirme antes
de excluir.