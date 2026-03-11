# 🐾 ClawCore — Agente Pessoal de IA

> Agente de Inteligência Artificial pessoal que opera localmente, com um Painel Web (PWA) moderno em React e backend Express. Suporte a múltiplos LLMs, skills hot-reload e capacidades multimodais.

---

## ✨ Features

| Feature | Descrição |
|---------|-----------|
| 💻 **Painel Web (PWA)** | Interface frontend em React + Vite puro, com PWA instalável em smartphones |
| 🚀 **API Backend** | Express Server servindo APIs REST + SSE (Server-Sent Events) |
| 🤖 **Multi-LLM** | Suporte a Gemini, DeepSeek, Groq e Cerebras com fallback automático |
| 🧠 **ReAct Engine** | Agent Loop com padrão Thought → Action → Observation → Answer |
| 🔧 **Tool System** | Registry dinâmico de ferramentas (ex: criação de arquivos no FS) |
| 📦 **Skills Hot-Reload** | Skills em `.agents/skills/*/SKILL.md` com YAML frontmatter — sem reiniciar |
| 🎯 **Skill Router** | Roteamento inteligente via LLM para acionar a skill certa |
| 💾 **Memória Persistente** | SQLite com WAL para o histórico de conversas |
| 🔒 **Segurança** | Autenticação via JWT para a API Web |

---

## 🏗️ Arquitetura (Separada)

A aplicação agora é dividida em dois projetos independentes para maior escalabilidade:

### 1. Backend (Express API) — Porta 8080
O coração do agente, que coordena as *skills*, o ReAct loop com o LLM e gerencia o banco SQLite. As rotas HTTP (`/api/*`) alimentam o Painel Web.

```text
src/
├── agent/       # ReAct Engine (Loop e Controle)
├── memory/      # Singleton do SQLite
├── providers/   # Integração com APIs LLM (OpenAI, Gemini, Groq, etc)
├── skills/      # Hot-reload de YAML/Markdown para injetar comportamentos
├── tools/       # Instâncias das ferramentas disponíveis (executam localmente)
├── utils/       # Logger e variáveis de ambiente
└── web/         # Rotas do Express.js e middlewares de Auth/CORS
```

### 2. Frontend (React + Vite) — Porta 5173
Uma Interface *Single Page Application* moderna construída para simular os painéis premium das Big Techs, consumindo o *streaming* (SSE) do agente inteligente.

```text
frontend/
├── public/      # Ícones PWA e Webmanifest
├── src/
│   ├── App.tsx  # Lógica principal, gerência do layout e AuthGuard
│   ├── index.css# Tailwind V4 com Glassmorphism Utilities
│   └── vite-env.d.ts
└── vite.config.ts # Proxy /api para 8080 e PWA config
```

---

## 🚀 Quick Start

### 1. Clone o projeto e instale raízes

```bash
git clone <repo-url> clawcore
cd clawcore
```

### 2. Configure o Backend (.env)

Copie o arquivo de exemplo e preencha suas chaves (pelo menos uma Key como Groq ou Gemini é obrigatória):

```bash
cp .env.example .env
```

```env
# Provedores de IA
GROQ_API_KEY=sua_key_aqui
GEMINI_API_KEY=sua_key_aqui
PRIMARY_PROVIDER=groq

# Web Panel Auth
WEB_PORT=8080
WEB_AUTH_PASSWORD=senha_do_seu_painel
JWT_SECRET=super_secret_para_tokens
```

Instale e inicie o Backend:
```bash
npm install
npm run dev
```

### 3. Inicie o Frontend (React)

Abra outro terminal e rode:

```bash
cd frontend
npm install
npm run dev
```

Abra o seu navegador em **`http://localhost:5173/`**, entre com a senha definida no seu `.env` e aproveite!

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

[Insira seu system prompt inteiro, instruções e regras aqui.]
```

O **SkillRouter** usa LLM para identificar de qual skill o usuário necessita e só a carrega na memória quando for extremamente necessária para manter a sanidade do Token count.

---

## 🐳 Docker (Backend)

```bash
# Build e run (o docker-compose default levanta o servidor express)
docker compose up -d
```

Volumes automaticamente criados/persistidos:
- `./data` — banco em SQLite persistente
- `./tmp` — área de arrasto e edição de arquivos rápidos
- `./outputs` — *dump* padrão das ferramentas do agende como o `create_file`

---

## 📄 Licença

Uso pessoal — MlluizDev.
