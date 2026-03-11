**MlluizDev**

Claw Core --- Agente de IA Local

  ------------ -----------------------------------------------------------
  **Versão**   1.1

  ------------ -----------------------------------------------------------

  ------------ -----------------------------------------------------------
  **Status**   Aprovada

  ------------ -----------------------------------------------------------

  ----------- -----------------------------------------------------------
  **Autor**   MlluizDevClaw Agent

  ----------- -----------------------------------------------------------

  ----------- -----------------------------------------------------------
  **Data**    2026-03-06

  ----------- -----------------------------------------------------------

  -------------- -----------------------------------------------------------
  **Reviewer**   MlluizDev

  -------------- -----------------------------------------------------------

**1. Resumo Executivo**

O MlluizDevClaw é um agente pessoal de Inteligência Artificial projetado
para operar 100% localmente no desktop do usuário. Ele recebe comandos
exclusivamente pelo Telegram (via biblioteca Grammy), processa-os por
meio de um pipeline que suporta múltiplos LLMs de forma dinâmica
(Gemini, DeepSeek), e mantém memória persistente de contexto em SQLite.

A proposta central é oferecer autonomia total ao usuário sobre seus
dados, suas skills e seu fluxo de raciocínio --- sem dependência de
nuvem, sem lock-in e sem custos recorrentes de hospedagem.

**2. Contexto e Motivação**

**Problema**

Agentes hospedados em nuvem ou serviços de terceiros exigem exposição de
dados privados e têm custos recorrentes elevados. O usuário não tem
governança total sobre as próprias skills customizadas, e soluções como
o OpenClaw original, embora funcionais, adicionam complexidade
operacional ou criam dependência de infraestrutura externa.

**Evidências**

-   Iterações anteriores baseadas em OpenClaw funcionavam, mas
    demandavam gestão de nuvem e UIs web.

-   A intenção atual é uma base minimalista, sob controle total do
    usuário, rodando no próprio SO.

**Por que agora**

A ascensão de LLMs eficientes (Gemini 2.0+, DeepSeek R2) e a maturidade
da API do Telegram permitem construir um agente pessoal robusto sem os
atritos operacionais de interfaces web ou infraestrutura cloud.

**3. Objetivos (Goals)**

-   G-01: Operar recebendo e respondendo requisições pelo Telegram via
    Grammy (long polling).

-   G-02: Intercambiar LLMs dinamicamente usando padronização via
    ProviderFactory (DeepSeek, Gemini).

-   G-03: Reter contexto multi-turno com SQLite via repositórios
    TypeScript (better-sqlite3).

-   G-04: Respeitar limites rigorosos de autorização via User ID em
    whitelist configurável no .env.

-   G-05 (NOVO): Suportar hot-reload de Skills locais sem reiniciar o
    processo principal.

-   G-06 (NOVO): Emitir logs estruturados no stdout para facilitar
    observabilidade local.

**Métricas de Sucesso**

  ------------------------------------------------------------------------
  **Métrica**            **Baseline**    **Target**        **Prazo**
  ---------------------- --------------- ----------------- ---------------
  Uptime local do bot    0%              99% após testes   30 dias

  Troca dinâmica de      Sem suporte     Recarga \< 1      10 dias
  Skills (hot-reload)                    segundo           

  Latência de repasse de N/A             \< 1000ms (exc.   15 dias
  mensagem (p95)                         LLM)              

  Cobertura de testes    0%              \> 60%            30 dias
  unitários (AgentLoop)                                    
  ------------------------------------------------------------------------

**4. Fora do Escopo (Non-Goals)**

-   NG-01: Não terá interface Web (React/Vue/HTML). A única interface é
    o Telegram.

-   NG-02: Não suportará múltiplos usuários além da Whitelist. Não é
    SaaS.

-   NG-03: Sem suporte a bancos relacionais robustos (PostgreSQL,
    MySQL). Foco exclusivo em SQLite local.

-   NG-04 (NOVO): Sem orquestração multi-agente ou swarms nesta versão.
    Um agente único por instância.

**5. Usuários e Personas**

Usuário primário: Sandeco (proprietário), acessando via dispositivo
móvel ou desktop pelo cliente Telegram, com User ID registrado na
whitelist.

**Jornada Atual (sem o sistema)**

O usuário gerencia manualmente APIs ou faz login em múltiplas abas web
(ChatGPT, Gemini) para acionar skills em blocos de texto independentes,
sem integração com arquivos locais ou histórico de contexto entre
sessões.

**Jornada Futura (com o sistema)**

O usuário envia uma mensagem no Telegram; o MlluizDevClaw roda em
background no terminal, consulta o histórico SQLite, chama o LLM
configurado, executa a Tool necessária e responde no mesmo chat de forma
fluida --- sem trocar de janela.

**6. Requisitos Funcionais**

**6.1 Requisitos Principais**

  -----------------------------------------------------------------------------------
  **ID**   **Requisito**               **Prioridade**   **Critério de Aceite**
  -------- --------------------------- ---------------- -----------------------------
  RF-01    O sistema deve rodar via    Must             npm run dev inicia o listener
           loop de polling persistente                  e intercepta mensagens sem
           (Grammy)                                     fechar o processo.

  RF-02    Validar mensagens contra    Must             Usuário não cadastrado recebe
           TELEGRAM_ALLOWED_USER_IDS                    ignore imediato; nenhuma API
                                                        key é consumida.

  RF-03    Alternar LLMs via           Must             Trocar provider no config
           ProviderFactory                              redireciona prompts ao
                                                        endpoint correto e parseia a
                                                        resposta.

  RF-04    Hot-reload de Skills em     Should           Adicionar/editar arquivo na
  (NOVO)   pasta local                                  pasta skills/ recarrega a
                                                        skill sem reiniciar o bot.

  RF-05    Fallback automático de LLM  Should           AgentLoop tenta provider
  (NOVO)   em caso de erro 5xx                          secundário e notifica o
                                                        usuário via Telegram se ambos
                                                        falharem.

  RF-06    Comando /status no Telegram Could            Retorna uptime, provider
  (NOVO)                                                ativo, contagem de mensagens
                                                        na sessão e uso de memória.
  -----------------------------------------------------------------------------------

**6.2 Fluxo Principal (Happy Path)**

1.  Usuário envia \"resuma para mim\" no Telegram.

2.  AgentController intercepta via Facade.

3.  Middleware valida User ID contra whitelist (SIM → segue).

4.  AgentLoop carrega contexto da thread do SQLite.

5.  LLM selecionado processa e identifica Tool necessária (ou responde
    diretamente).

6.  OutputHandler envia resposta ao chat Telegram e persiste no SQLite.

**6.3 Fluxos Alternativos**

**Fluxo A --- Falha de API do LLM (503/429):**

-   AgentLoop detecta erro HTTP do provider primário.

-   Tenta fallback para provider secundário configurado no .env.

-   Se ambos falharem, envia mensagem de erro amigável via Telegram sem
    quebrar a Promise principal.

**Fluxo B --- Mensagem de usuário não autorizado (NOVO):**

-   Top-Level Middleware intercepta antes de qualquer lógica de negócio.

-   Ignora silenciosamente (sem log sensível, sem consumo de API key).

**7. Requisitos Não-Funcionais**

  -------------------------------------------------------------------------
  **ID**    **Requisito**         **Valor Alvo**    **Observação**
  --------- --------------------- ----------------- -----------------------
  RNF-01    Latência de repasse   \< 1000ms (p95)   Exclui latência do
            de mensagem                             provider LLM.

  RNF-02    Persistência ágil     Síncrono via      WAL mode habilitado
                                  better-sqlite3    para concorrência
                                                    segura.

  RNF-03    Startup do processo   \< 3 segundos     Tempo entre npm run dev
  (NOVO)                                            e primeiro listener
                                                    ativo.

  RNF-04    Uso de memória em     \< 150MB RAM      Medido sem Skills
  (NOVO)    idle                                    carregadas além do
                                                    core.

  RNF-05    Logs estruturados     JSON ou           Facilita grep e
  (NOVO)                          pino-compatible   monitoramento futuro.
  -------------------------------------------------------------------------

**8. Design e Interface**

Componentes afetados: terminal (log output) e chat do Telegram do
usuário whitelisted.

**Estados no Telegram**

-   Processando: O bot envia Chat Action \'typing\' continuamente até a
    resposta ser concluída.

-   Erro gracioso: Mensagem de texto amigável descrevendo o problema
    (sem stack trace exposto ao usuário).

-   Comando /status (NOVO): Resposta formatada em Markdown com métricas
    operacionais do agente.

**9. Modelo de Dados**

Entidades persistidas em ./data/ (SQLite via better-sqlite3, WAL mode
habilitado):

  -----------------------------------------------------------------------------
  **Tabela**      **Campo**         **Tipo**        **Descrição**
  --------------- ----------------- --------------- ---------------------------
  conversations   id                TEXT (UUID)     Identificador único da
                                                    thread do usuário

  conversations   user_id           TEXT            Telegram User ID do
                                                    originador (whitelisted)

  conversations   provider          TEXT            Ex: \'gemini\',
                                                    \'deepseek\'

  conversations   created_at (NOVO) INTEGER (epoch) Timestamp de criação da
                                                    thread

  messages        id (NOVO)         TEXT (UUID)     Identificador único da
                                                    mensagem

  messages        conversation_id   TEXT (FK)       Referência à thread pai

  messages        role              TEXT            \'user\' \| \'assistant\'
                                                    \| \'system\'

  messages        content           TEXT            Payload da mensagem

  messages        created_at (NOVO) INTEGER (epoch) Timestamp de envio
  -----------------------------------------------------------------------------

**10. Integrações e Dependências**

  ---------------------------------------------------------------------------------
  **Dependência**   **Tipo**        **Impacto se           **Versão recomendada**
                                    indisponível**         
  ----------------- --------------- ---------------------- ------------------------
  Telegram API      Obrigatória     Agente inutilizável.   Bot API 7.x

  Grammy (npm)      Obrigatória     Sem polling.           \^1.x
                                    Arquitetura core       
                                    depende.               

  Gemini API        Obrigatória\*   Sem raciocínio. Tenta  SDK
                                    fallback.              \@google/generative-ai
                                                           \^0.x

  DeepSeek API      Obrigatória\*   Idem. Tenta fallback   REST direto ou
                                    para Gemini.           openai-compat SDK

  better-sqlite3    Obrigatória     Sem memória            \^9.x
                                    persistente.           

  Node.js           Obrigatória     Processo não inicia.   \>= 20 LTS
  ---------------------------------------------------------------------------------

(\*) Pelo menos um provider LLM deve estar disponível e configurado no
.env.

**11. Edge Cases e Tratamento de Erros**

  -------------------------------------------------------------------------
  **ID**    **Cenário**   **Trigger**        **Comportamento Esperado**
  --------- ------------- ------------------ ------------------------------
  EC-01     Injeção por   Request de         Top-Level Middleware ignora
            usuário falso bot/crawler não    silenciosamente. Nenhum log
                          whitelisted        sensível.

  EC-02     Banco de      Dois loops         Espera via WAL timeout do
            dados         simultâneos em     driver; descarta soft e avisa
            bloqueado     escrita intensa    o LLM se persistir.

  EC-03     API Key       Arquivo .env       Loga erro fatal no terminal.
            inválida ou   corrompido ou key  Notifica no Telegram que o
            expirada      descontinuada      provider X falhou.

  EC-04     Arquivo muito Payload            Verifica tamanho antes de
            grande para   CPU-intensivo      processar; responde: \'Arquivo
            summary       enviado pelo       excede limites locais
                          usuário            suportados.\'

  EC-05     Mensagem      Usuário envia      Responde pedindo texto ou
  (NOVO)    vazia ou só   sticker/foto sem   instrução. Não chama o LLM sem
            mídia         contexto           payload textual.

  EC-06     Loop infinito LLM chama Tool que AgentLoop limita a N iterações
  (NOVO)    de Tool calls retorna erro       (configurável). Encerra e
                          recursivamente     notifica o usuário.
  -------------------------------------------------------------------------

**12. Segurança e Privacidade**

-   Autenticação: Baseada exclusivamente no Telegram User ID declarado
    em TELEGRAM_ALLOWED_USER_IDS no .env.

-   Autorização: User ID na whitelist = Admin total. Demais = rejeitados
    no middleware, antes de qualquer processamento.

-   NOVO --- Secrets management: Nenhuma API key deve aparecer em logs,
    stack traces ou respostas ao usuário.

-   NOVO --- .env no .gitignore: Obrigatório. Adicionar template
    .env.example sem valores reais no repositório.

-   NOVO --- Sanitização de input: Conteúdo de mensagens do usuário não
    deve ser interpolado diretamente em prompts sem tratamento de
    injection.

**13. Arquitetura Sugerida (NOVO)**

Camadas principais recomendadas:

  ---------------------------------------------------------------------------
  **Camada**         **Responsabilidade**         **Tecnologia sugerida**
  ------------------ ---------------------------- ---------------------------
  Transport          Receber/enviar mensagens do  Grammy (long polling)
                     Telegram                     

  Middleware         Validação de whitelist, rate Grammy middleware chain
                     limiting leve                

  AgentController    Facade de entrada --- roteia TypeScript class
                     para AgentLoop               

  AgentLoop          Ciclo ReAct: think → act →   TypeScript loop com Tool
                     observe                      registry

  ProviderFactory    Abstração de LLMs (Gemini,   Factory pattern +
                     DeepSeek)                    adaptadores

  ToolRegistry       Catálogo de Skills/Tools     TS Map com hot-reload
                     disponíveis                  watcher

  MemoryRepository   CRUD de conversations e      better-sqlite3 + TS
                     messages                     repository

  OutputHandler      Formata e envia resposta     Grammy ctx.reply + Markdown
                     final ao Telegram            
  ---------------------------------------------------------------------------

**14. Plano de Rollout**

-   Estratégia: Deploy local via npm run dev na máquina do usuário.

-   Monitoramento: Log no stdout (JSON estruturado) para acompanhar
    transições do AgentLoop e falhas.

-   NOVO --- Checklist de pré-deploy: .env configurado, Node \>= 20, DB
    migrado, pelo menos um provider LLM validado.

-   NOVO --- Smoke test: Enviar /status pelo Telegram e verificar
    resposta com uptime e provider ativo.

**15. Questões em Aberto**

  -----------------------------------------------------------------------------
  **\#**   **Questão**                    **Impacto**       **Responsável**
  -------- ------------------------------ ----------------- -------------------
  OQ-01    Qual o limite de iterações do  Alto --- evita    MlluizDev
           AgentLoop antes de encerrar    loops infinitos e 
           (EC-06)?                       custos de API     

  OQ-02    Hot-reload de Skills será      Médio --- afeta   MlluizDev
           baseado em file watcher        UX de             
           (chokidar) ou comando          desenvolvimento   
           explícito?                     de skills         

  OQ-03    Haverá suporte a arquivos      Médio --- define  MlluizDev
           (PDF, imagem) via Telegram na  escopo de EC-04   
           v1 ou apenas texto?                              

  OQ-04    O fallback de LLM deve ser     Baixo ---         MlluizDev
           automático ou exigir           preferência de UX 
           confirmação do usuário?                          
  -----------------------------------------------------------------------------
