# 🐾 ClawCore — Agente Pessoal de IA

> Agente de Inteligência Artificial pessoal que opera localmente, com um Painel Web (PWA) moderno em React e backend Express. Compatível com APIs OpenAI (OpenAI oficial ou gateways como OmniRoute/OpenRouter), skills hot-reload e capacidades multimodais.

---

## ✨ Features

| Feature | Descrição |
|---------|-----------|
| 💻 **Painel Web (PWA)** | Interface frontend em React + Vite puro, com PWA instalável em smartphones |
| 🚀 **API Backend** | Express Server servindo APIs REST + SSE (Server-Sent Events) |
| 🤖 **LLM (OpenAI-compatible)** | OpenAI oficial ou qualquer gateway compatível (`OPENAI_BASE_URL`) |
| 🧠 **ReAct Engine** | Agent Loop com padrão Thought → Action → Observation → Answer |
| 🔧 **Tool System** | Registry dinâmico de ferramentas (criação de arquivos, shell opcional, WhatsApp) |
| 📦 **Skills Hot-Reload** | Skills em `.agents/skills/*/SKILL.md` com YAML frontmatter — sem reiniciar |
| 🎯 **Skill Router** | Roteamento inteligente via LLM para acionar a skill certa |
| 💾 **Memória Persistente** | SQLite com WAL para o histórico de conversas |
| 🔒 **Segurança** | Autenticação via JWT, Helmet, rate limit, CORS restrito e trust proxy |
| 🌐 **TLS automático** | Caddy na borda com certificado Let's Encrypt automático |

---

## 🏗️ Arquitetura

A aplicação é dividida em três serviços Docker:

| Serviço | Imagem | Porta | Função |
|---------|--------|-------|--------|
| `backend` | Node 20 + `tsc` | 8080 (interna) | API Express + ReAct loop + SQLite |
| `frontend` | build Vite + Nginx | 80 (interna) | SPA React + proxy `/api` → `backend:8080` |
| `caddy` | `caddy:2-alpine` | 80/443 (pública) | TLS automático + proxy para `frontend:80` |

```text
src/
├── agent/       # ReAct Engine (Loop e Controle)
├── bot/         # Integração Telegram (excluída do build — ver nota abaixo)
├── memory/      # Singleton do SQLite
├── providers/   # Cliente OpenAI-compatible
├── skills/      # Hot-reload de YAML/Markdown para injetar comportamentos
├── tools/       # Ferramentas disponíveis (create_file, run_command, whatsapp)
├── utils/       # Logger e variáveis de ambiente
└── web/         # Rotas do Express.js e middlewares de Auth/CORS
```

```text
frontend/
├── public/      # Ícones PWA e Webmanifest
├── src/         # App.tsx + Tailwind V4
├── nginx.conf   # SPA + proxy /api (otimizado para SSE)
└── vite.config.ts
```

---

## 🚀 Quick Start (desenvolvimento)

### 1. Configure o Backend (.env)

```bash
cp .env.example .env
```

Variáveis obrigatórias:

```env
OPENAI_API_KEY=sk-...            # chave da OpenAI ou do seu gateway
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

JWT_SECRET=...                   # use algo longo e aleatório
WEB_AUTH_PASSWORD=...            # senha do painel
WEB_PORT=8080

SITE_DOMAIN=clawcore.seudominio.com   # usado pelo Caddy (produção)
CORS_ORIGIN=https://clawcore.seudominio.com

ENABLE_SHELL_TOOL=false          # true só em ambiente local/confiável
```

> **Dev local vs Docker:** rodando `npm run dev` na máquina, aponte
> `OPENAI_BASE_URL` para o gateway na sua host (ex: `http://localhost:30128/v1`).
> Em Docker use `http://host.docker.internal:<porta>/v1` (o compose já
> configura `extra_hosts`).

### 2. Backend

```bash
npm install
npm run dev     # hot-reload (tsx)
# ou
npm run build && npm start
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173 (proxy /api → 8080)
```

---

## 🐳 Docker (com TLS)

```bash
docker compose up -d --build
```

- O `SITE_DOMAIN` vem do `.env` e é obrigatório (o compose falha sem ele).
- Certificado Let's Encrypt emitido automaticamente pelo Caddy (portas 80/443 precisam estar livres e o domínio apontando para a VPS).
- Healthchecks ativos: o `frontend` só sobe depois do `backend` saudável.
- A porta 8080 **não** é publicada — só o Nginx interno acessa a API.
- Logs com rotação automática (`max-size 10m`, `max-file 3`).

Volumes persistidos:

- `./data` — banco SQLite + sessão do WhatsApp
- `./.agents/skills` — skills (hot-reload)
- `./tmp` e `./outputs` — arquivos temporários/gerados
- `caddy_data` / `caddy_config` — certificados e config do Caddy

---

## 🚀 Deploy em produção (VPS)

1. Clone o repositório na VPS (ex: `~/clawcore`) e crie o `.env` a partir do `.env.example` (com `ENABLE_SHELL_TOOL=false`).
2. Aponte o DNS `clawcore.mlluizdevtech.qzz.io` (ou o seu domínio) para a VPS.
3. Configure os secrets do GitHub Actions: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
4. Faça push na branch `main` — o workflow `.github/workflows/deploy.yml` faz `git pull`, `docker compose up -d --build --wait` e valida o `/api/health`.

### 🔐 Segurança em produção

- `ENABLE_SHELL_TOOL=false` — desabilita a ferramenta `run_command` (shell arbitrário).
- `CORS_ORIGIN` restrito ao domínio do painel.
- JWT via HTTPS (Caddy força HSTS); senha do painel em `WEB_AUTH_PASSWORD`.
- Rate limit por IP real (`trust proxy` habilitado atrás do proxy).

### 💾 Backup do banco

```bash
./scripts/backup-db.sh            # gera ./backups/clawcore-<data>.db (rotação: 14)
# ou
npm run backup
```

Cron sugerido (todo dia às 03:00):

```cron
0 3 * * * cd /home/$USER/clawcore && ./scripts/backup-db.sh >> /var/log/clawcore-backup.log 2>&1
```

---

## 🧩 Criando SKILLS Personalizadas

Crie uma pasta em `.agents/skills/` com um arquivo `SKILL.md`:

```
.agents/skills/
└── minha-skill/
    └── SKILL.md
```

Formato do `SKILL.md`:

```markdown
---
name: codificador_expert
description: Especialista em arquitetura de dados e React.
---

# Instruções para o LLM

[Insira o system prompt, instruções e regras aqui.]
```

O **SkillRouter** usa LLM para identificar a skill necessária e só a carrega quando necessário, para manter baixo o consumo de tokens.

---

## 📄 Licença

Uso pessoal — MlluizDev.

---

### Notas técnicas

- `src/bot/` (Telegram/grammy) está **excluído do build** (`tsconfig.json`) e `grammy` não é dependência — é código legado. Para reativar, adicione `grammy` em `dependencies` e remova o `exclude`.
- `npm audit`: execute periodicamente; use `overrides` no `package.json` para forçar versões corrigidas de dependências transitivas.
