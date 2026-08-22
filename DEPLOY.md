# Deploy — MonkeysCloud (free) → Hostinger VPS (produção)

Guia para colocar a aplicação no ar **sem custo** no MonkeysCloud e, depois,
migrar para o VPS da Hostinger reaproveitando a mesma configuração Docker.

---

## Parte 1 — MonkeysCloud (grátis, sem cartão)

O plano gratuito fornece 4 instâncias por projeto (dormem após ~30 min sem
tráfego; acordam em ~5s). Usaremos todas:

| Instância | Papel | Stack/Imagem |
|---|---|---|
| Free server 1 | App Next.js | Next.js (Node 22) |
| Free database 1 | Banco de dados | PostgreSQL 16 |
| Free database 2 | Cache/filas BullMQ | Redis 7 |
| Free server 2 | Workers (`npm run worker`) | Docker |

### Passo a passo

1. Crie a conta em monkeyscloud.com e um novo projeto.
2. Adicione as instâncias na ordem: **PostgreSQL 16**, **Redis 7**, **Next.js**
   (conecte o repositório GitHub) e por último o **worker**.
3. Copie as *connection strings* que o painel gera para Postgres e Redis —
   serão usadas nas variáveis abaixo.
4. No serviço do app, configure as variáveis de ambiente (seção seguinte) e faça
   o deploy a partir do branch `main`.
5. No serviço do worker, use a mesma imagem/repo com comando:
   `node src/workers/index.ts` via tsx — ou simplesmente `npm run worker`
   (o build empacota `tsx` como dependência).

### Variáveis de ambiente (app e worker)

```env
# Banco — use a connection string do PostgreSQL 16 do MonkeysCloud
DATABASE_URL=postgresql://usuario:senha@host:5432/saas_imob?schema=public&sslmode=require

# Filas/cache — connection string do Redis 7 do MonkeysCloud
REDIS_URL=rediss://default:senha@host:6379

# Segredo das sessões JWT — gere com: openssl rand -hex 32
JWT_SECRET=<64+ caracteres aleatórios>
JWT_EXPIRES_IN=8h
SESSION_COOKIE=saas_session

# Domínio público (URL gerada pelo MonkeysCloud, ex.: https://imobflow.monkeyscloud.com)
APP_DOMAIN=monkeyscloud.com
APP_URL=https://<seu-subdominio>.monkeyscloud.com

# Seed (apenas no primeiro deploy, para criar usuários demo)
SEED_ADMIN_PASSWORD=<senha forte>

# E-mail transacional (console = só loga; troque por resend/sendgrid depois)
EMAIL_PROVIDER=console
EMAIL_FROM=naoresponda@seudominio.com
EMAIL_FROM_NAME="imobFlow"
```

> **Atenção ao `APP_DOMAIN`:** é o domínio raiz usado na resolução de tenants
> por subdomínio. Se o app ficar em `https://xyz.monkeyscloud.com`, use
> `APP_DOMAIN=monkeyscloud.com`.

### Após o primeiro deploy

Rode as migrações uma única vez (console/SSH da instância do app):

```bash
npx prisma migrate deploy
npm run db:seed   # opcional: usuários/plano demo
```

Verifique a saúde em `<APP_URL>/api/health`.

### Limitações conhecidas do free tier

- Instâncias dormem após 30 min sem tráfego (primeira request demora ~5s).
- Disco pequeno (~1 GB): o storage local de mídias é efêmero/pequeno — para
  fotos de imóveis em produção real, configure S3 compatível (Cloudflare R2:
  `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).
- Plataforma nova — mantenha backup regular do banco (`pg_dump`) antes de
  qualquer mudança.

---

## Parte 2 — Migração futura para o VPS Hostinger

Quando contratar o VPS (recomendado KVM 2+, Ubuntu 24.04):

1. Instale Docker + plugin Compose:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. Clone o repo e suba a stack (Postgres + Redis já estão no compose):
   ```bash
   docker compose up -d postgres redis
   ```
3. Rode o app de produção com o `Dockerfile` existente (multi-stage, standalone)
   ou instale Node 20 nativamente + PM2:
   ```bash
   npm ci && npx prisma generate && npx prisma migrate deploy && npm run build
   pm2 start npm --name saas-imob -- start
   pm2 start npm --name saas-imob-worker -- run worker
   ```
4. Nginx como reverse proxy (80/443 → :3000) + `certbot` para TLS:
   ```nginx
   location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
                 proxy_set_header X-Forwarded-Proto $scheme; }
   ```
5. Restaure os dados exportados do MonkeysCloud:
   ```bash
   pg_dump -h <host-monkey> -U <user> -Fc <db> > dump.sql     # origem
   pg_restore -h localhost -U saas -d saas_imob --clean dump.sql  # destino
   ```
6. Aponte o DNS do seu domínio para o IP do VPS e atualize
   `APP_DOMAIN`/`APP_URL`.

---

## Checklist pós-deploy

- [ ] `/api/health` responde 200
- [ ] Login MASTER funciona (`/login`)
- [ ] Cadastro novo fica pendente e aparece no painel MASTER (`/admin/dashboard`)
- [ ] Aprovação de tenant libera o acesso do assinante
- [ ] Workers processando filas (leads/webhooks/mídia/billing/email)
- [ ] Backup do banco agendado (cron `pg_dump`)
