// src/memory/database.ts
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "../utils/logger";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(DATA_DIR, "clawcore.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      provider   TEXT NOT NULL DEFAULT 'openai',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      title      TEXT NOT NULL DEFAULT 'Nova Conversa'
    );

    -- Migration: Add title column if it doesn't exist (for existing DBs)
    BEGIN;
    SELECT 1 FROM pragma_table_info('conversations') WHERE name = 'title';
    -- This is a bit tricky with raw SQLite in this context, 
    -- but usually we can check table_info. 
    -- For simplicity in this script, we'll try to add it and ignore error if it exists.
    -- Or more robustly:
    COMMIT;
  `);

  try {
    _db.exec("ALTER TABLE conversations ADD COLUMN title TEXT NOT NULL DEFAULT 'Nova Conversa'");
  } catch (e) {
    // Column already exists or other error we can ignore if it's just 'duplicate column'
  }

  _db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role            TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content         TEXT NOT NULL,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS routine_runs (
      id           TEXT PRIMARY KEY,
      task_id      TEXT NOT NULL,
      agent_id     TEXT NOT NULL,
      trigger      TEXT NOT NULL DEFAULT 'schedule',
      status       TEXT NOT NULL DEFAULT 'running',
      steps        INTEGER NOT NULL DEFAULT 0,
      duration_ms  INTEGER NOT NULL DEFAULT 0,
      output       TEXT NOT NULL DEFAULT '',
      error        TEXT,
      started_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at  INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_routine_runs_task ON routine_runs(task_id, started_at);

    CREATE TABLE IF NOT EXISTS agents (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL,
      avatar        TEXT NOT NULL,
      description   TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      tools         TEXT NOT NULL DEFAULT '[]',
      is_builtin    INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS company_profile (
      id              TEXT PRIMARY KEY DEFAULT 'default',
      company_name    TEXT NOT NULL DEFAULT 'Minha Empresa',
      niche           TEXT NOT NULL DEFAULT 'Tecnologia & B2B SaaS',
      target_audience TEXT NOT NULL DEFAULT 'Empreendedores e Líderes de Negócios',
      tone_of_voice   TEXT NOT NULL DEFAULT 'Profissional, direto, persuasivo e fundamentado em dados',
      value_prop      TEXT NOT NULL DEFAULT 'Automação inteligente e crescimento com IA',
      guidelines      TEXT NOT NULL DEFAULT 'Nunca prometa resultados irreais. Entregue materiais prontos para publicação.',
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS deliverables (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT,
      agent_id        TEXT NOT NULL,
      title           TEXT NOT NULL,
      type            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending_approval',
      summary         TEXT NOT NULL DEFAULT '',
      content_json    TEXT NOT NULL,
      review_notes    TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_deliverables_status ON deliverables(status, created_at);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id              TEXT PRIMARY KEY,
      agent_id        TEXT NOT NULL,
      title           TEXT NOT NULL,
      frequency       TEXT NOT NULL DEFAULT 'daily',
      prompt          TEXT NOT NULL,
      is_enabled      INTEGER NOT NULL DEFAULT 1,
      last_run_at     INTEGER,
      next_run_at     INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      category         TEXT NOT NULL,
      icon             TEXT NOT NULL,
      description      TEXT NOT NULL,
      is_connected     INTEGER NOT NULL DEFAULT 0,
      credentials_json TEXT NOT NULL DEFAULT '{}',
      updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon        TEXT NOT NULL DEFAULT 'briefcase',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Migration for conversation agent_id
  try {
    _db.exec("ALTER TABLE conversations ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'coo'");
  } catch (e) {
    // Column already exists
  }

  // Migrations for project_id
  try {
    _db.exec("ALTER TABLE conversations ADD COLUMN project_id TEXT");
  } catch (e) {
    // Column already exists
  }
  try {
    _db.exec("ALTER TABLE scheduled_tasks ADD COLUMN project_id TEXT");
  } catch (e) {
    // Column already exists
  }
  try {
    _db.exec("ALTER TABLE deliverables ADD COLUMN project_id TEXT");
  } catch (e) {
    // Column already exists
  }

  // Origem e atribuição da mensagem (ex.: rotina que publicou no thread do agente).
  try {
    _db.exec("ALTER TABLE messages ADD COLUMN metadata_json TEXT");
  } catch (e) {
    // Column already exists
  }

  // Seed default company profile
  _db.exec(`
    INSERT OR IGNORE INTO company_profile (id, company_name, niche, target_audience, tone_of_voice, value_prop, guidelines, updated_at)
    VALUES ('default', 'Minha Empresa', 'Tecnologia & B2B SaaS', 'Empreendedores, Líderes de Marketing e Vendas', 'Profissional, inovador, focado em entregas reais', 'Agentes autônomos que realizam trabalho de agência completo', 'Gerar sempre entregáveis estruturados prontos para aprovação humana.', unixepoch());
  `);

  // Seed builtin SureThing agents
  const seedAgents = [
    {
      id: "coo",
      name: "Alex Vance",
      role: "COO & Orquestrador",
      avatar: "briefcase",
      description: "Supervisiona a operação, define prioridades, revisa entregáveis e orquestra outros agentes.",
      system_prompt: "Você é o COO (Chief Operating Officer) da empresa. Sua função é orquestrar equipes, avaliar viabilidade, revisar entregas, criar planos estratégicos e delegar tarefas para o CMO, Pesquisador ou Engenheiro.",
      tools: JSON.stringify(["create_deliverable", "request_approval", "company_brain", "web_search"]),
      is_builtin: 1,
    },
    {
      id: "cmo",
      name: "Sofia Rios",
      role: "CMO & Social Media",
      avatar: "share2",
      description: "Planeja e gera lotes completos de posts sociais (LinkedIn, X, Instagram), anúncios e cópias de vendas.",
      system_prompt: "Você é o CMO e Diretor de Redes Sociais. Seu foco é gerar entregáveis reais e acionáveis: carrosséis para Instagram, posts para LinkedIn de alta conversão, threads para X, scripts de vídeo e campanhas de anúncios. Utilize sempre a ferramenta create_deliverable para entregar conteúdo estruturado pronto para aprovação.",
      tools: JSON.stringify(["create_deliverable", "request_approval", "company_brain", "web_search"]),
      is_builtin: 1,
    },
    {
      id: "researcher",
      name: "Dr. Eric Hunt",
      role: "Pesquisador & Inteligência",
      avatar: "search",
      description: "Investiga concorrentes, analisa tendências de mercado e resume relatórios analíticos profundos.",
      system_prompt: "Você é o Pesquisador e Analista de Mercado. Sua responsabilidade é fornecer inteligência competitiva, análises de mercado aprofundadas, validação de hipóteses e relatórios com dados consistentes. Quando concluir uma análise substancial, empacote como um entregável usando create_deliverable.",
      tools: JSON.stringify(["create_deliverable", "web_search", "company_brain", "glasser_tool"]),
      is_builtin: 1,
    },
    {
      id: "engineer",
      name: "Leo Chen",
      role: "Engenheiro & Automações",
      avatar: "code",
      description: "Cria automações, scripts, especificações técnicas e revisões de infraestrutura.",
      system_prompt: "Você é o Engenheiro de Software e Automação da empresa. Você cria especificações técnicas, automações, scripts de integração, melhorias de código e arquitetura. Entregue soluções funcionais com código limpo e testes.",
      tools: JSON.stringify(["create_deliverable", "request_approval", "run_command", "create_file", "company_brain"]),
      is_builtin: 1,
    },
    {
      id: "prospector",
      name: "Marcus Cole",
      role: "Prospector & Inteligência B2B",
      avatar: "target",
      description: "Especialista em prospecção ativa de clientes B2B, mapeamento de decisores via PDL/LinkedIn, qualificação de leads por anúncios e auditoria técnica de sites.",
      system_prompt: "Você é o Prospector e Head de Aquisição B2B da empresa. Sua função é prospectar clientes qualificados, mapear empresas no Google Maps e na Web, checar se elas investem em anúncios na Meta e no Google Ads, auditar a performance e o SEO de seus websites e mapear os decisores (CEOs, sócios, fundadores) no LinkedIn e People Data Labs (PDL). Sempre que gerar uma lista qualificada ou dossiê de prospecção, use create_deliverable com o tipo 'prospect_list' para enviar a lista estruturada à Inbox para aprovação.",
      tools: JSON.stringify(["create_deliverable", "request_approval", "b2b_prospector", "glasser_tool", "web_search", "company_brain"]),
      is_builtin: 1,
    },
  ];

  const insertTx = _db.transaction(() => {
    const insertAgent = _db!.prepare(`
      INSERT OR IGNORE INTO agents (id, name, role, avatar, description, system_prompt, tools, is_builtin, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `);
    for (const a of seedAgents) {
      insertAgent.run(a.id, a.name, a.role, a.avatar, a.description, a.system_prompt, a.tools, a.is_builtin);
    }
  });
  insertTx();

  const seedIntegrations = [
    { id: "gmail", name: "Gmail", category: "Colaboração", icon: "Mail", description: "Leitura e envio de e-mails, triagem de caixa de entrada e rascunhos automáticos." },
    { id: "outlook", name: "Outlook", category: "Colaboração", icon: "Mail", description: "Integração corporativa com Microsoft Exchange e Outlook Mail." },
    { id: "slack", name: "Slack", category: "Colaboração", icon: "MessageSquare", description: "Notificações em tempo real, monitoramento de canais e execução de bots." },
    { id: "notion", name: "Notion", category: "Produtividade", icon: "FileText", description: "Criação de páginas, sincronização de bases de dados e documentação de projetos." },
    { id: "microsoft", name: "Microsoft 365", category: "Produtividade", icon: "Layers", description: "Suite Office, OneDrive, Teams e ecossistema corporativo Microsoft." },
    { id: "discord", name: "Discord", category: "Colaboração", icon: "MessageCircle", description: "Gestão de servidores, moderação de comunidade e webhooks automáticos." },
    { id: "asana", name: "Asana", category: "Produtividade", icon: "CheckSquare", description: "Gestão de tarefas, prazos, fluxos ágeis e projetos em equipe." },
    { id: "airtable", name: "Airtable", category: "Produtividade", icon: "Database", description: "Bancos de dados relacionais low-code, planilhas inteligentes e automações." },
    { id: "linear", name: "Linear", category: "Engenharia", icon: "Code", description: "Acompanhamento de issues, sprints e ciclos de engenharia de software." },
    { id: "figma", name: "Figma", category: "Design", icon: "Palette", description: "Inspeção de layouts, exportação de ativos e sincronização com design systems." },
    { id: "canva", name: "Canva", category: "Design", icon: "Image", description: "Geração de peças gráficas, carrosséis e templates de marketing." },
    { id: "calendar", name: "Google Calendar", category: "Produtividade", icon: "Calendar", description: "Agendamento autônomo de reuniões e conferência de disponibilidade de agenda." },
    { id: "adobe", name: "Adobe Creative", category: "Design", icon: "Sparkles", description: "Fluxos de trabalho com Photoshop, Illustrator e ativos de marca." },
    { id: "miro", name: "Miro", category: "Produtividade", icon: "Layout", description: "Quadros brancos visuais, mapas mentais e ideação estratégica de produtos." },
    { id: "salesforce", name: "Salesforce", category: "CRM & Vendas", icon: "Briefcase", description: "CRM corporativo para gestão de pipelines, leads empresariais e contratos." },
    { id: "hubspot", name: "HubSpot", category: "CRM & Vendas", icon: "Users", description: "Automação de marketing, CRM de vendas e sincronização de contatos." },
    { id: "zendesk", name: "Zendesk", category: "Atendimento", icon: "Headphones", description: "Gestão de tickets, central de ajuda e respostas para clientes." },
    { id: "intercom", name: "Intercom", category: "Atendimento", icon: "MessageCircle", description: "Chat ao vivo no site, qualificação de leads e mensagens proativas." },
    { id: "stripe", name: "Stripe", category: "Finanças", icon: "CreditCard", description: "Processamento de pagamentos globais, assinaturas recorrentes e faturamento." },
    { id: "paypal", name: "PayPal", category: "Finanças", icon: "DollarSign", description: "Recebimentos internacionais e conciliação financeira simplificada." },
    { id: "quickbooks", name: "QuickBooks", category: "Finanças", icon: "Receipt", description: "Contabilidade automatizada, fluxo de caixa e relatórios fiscais." },
    { id: "shopify", name: "Shopify", category: "E-commerce", icon: "ShoppingBag", description: "Gestão de catálogo, pedidos, inventário e rastreio de e-commerce." },
    { id: "gumroad", name: "Gumroad", category: "E-commerce", icon: "Package", description: "Venda de produtos digitais, cursos, e-books e payouts." },
    { id: "amazon", name: "Amazon", category: "E-commerce", icon: "ShoppingCart", description: "Marketplace, acompanhamento de pedidos e gestão de vendas." },
    { id: "zapier", name: "Zapier", category: "Automação", icon: "Zap", description: "Disparo de webhooks e conexão com mais de 5.000 aplicativos externos." },
    { id: "make", name: "Make", category: "Automação", icon: "Cpu", description: "Cenários visuais avançados de automação e integração de dados." },
    { id: "pdl", name: "People Data Labs (PDL)", category: "Prospecção", icon: "Users", description: "Enriquecimento de dados B2B, perfis profissionais, e-mails verificados e telefones corporativos via Glasser." },
    { id: "google_maps", name: "Google Maps & Local", category: "Prospecção", icon: "MapPin", description: "Varredura de empresas locais por nicho e cidade com telefones, endereços e sites." },
    { id: "meta_ads", name: "Meta Ad Library", category: "Marketing", icon: "Search", description: "Verificação de anúncios ativos no Facebook e Instagram para qualificação de investimento em mídia." },
    { id: "linkedin", name: "LinkedIn Intelligence", category: "Prospecção", icon: "Share2", description: "Mapeamento de decisores, CEOs, sócios e fundadores com cargos e perfis." },
    { id: "glasser", name: "Glasser AI Broker", category: "Prospecção", icon: "Sparkles", description: "Gateway unificado de 1.000+ endpoints de dados pagos (PDL, SerpApi, Web Scraping) com pay-per-call." },
  ];

  const seedIntTx = _db.transaction(() => {
    const insertInt = _db!.prepare(`
      INSERT OR IGNORE INTO integrations (id, name, category, icon, description, is_connected, credentials_json, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, '{}', unixepoch())
    `);
    for (const item of seedIntegrations) {
      insertInt.run(item.id, item.name, item.category, item.icon, item.description);
    }
  });
  seedIntTx();

  // Seed SureThing projects
  const seedProjects = [
    {
      id: "881cca65-ada6-4452-be77-ef6f2ee07aa1",
      name: "Email Management",
      description: "Your inbox, sorted and answered before you open it",
      icon: "mail",
    },
    {
      id: "4cf69f0b-b47f-4c10-8312-b50579b4b69c",
      name: "Leads Generation",
      description: "Potential customers found each week",
      icon: "target",
    },
    {
      id: "c6a8f845-7cdf-43ca-bb2d-4e6888f40f32",
      name: "Ads Optimization",
      description: "Advertising costs and performance monitored",
      icon: "trending-up",
    },
    {
      id: "98e555e5-fc27-442f-8f8e-3de5c145806b",
      name: "Influencer Search",
      description: "Creators who reach your customers, found and vetted",
      icon: "user-check",
    },
    {
      id: "3c9c4739-6e95-4db5-86eb-3b70837aea2c",
      name: "SEO & Content",
      description: "Get found by the people searching for you",
      icon: "file-text",
    },
  ];

  const seedProjectsTx = _db.transaction(() => {
    const insertProj = _db!.prepare(`
      INSERT OR IGNORE INTO projects (id, name, description, icon, created_at, updated_at)
      VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
    `);
    for (const p of seedProjects) {
      insertProj.run(p.id, p.name, p.description, p.icon);
    }
  });
  seedProjectsTx();

  logger.info("Database initialized", { path: DB_PATH });
  return _db;
}
