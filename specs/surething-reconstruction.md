# SureThing: investigação pública e reconstrução local

## Escopo e evidências

Análise de páginas públicas e navegação com Chrome via REA 6.4.0. Nenhuma conta criada, login efetuado, conexão OAuth ou ação externa executada. Código proprietário e backend privado não foram obtidos.

- https://surething.io/ — HTML coletado e navegação pública: agentes COO, CMO, Researcher e Engineer, perfil compartilhado, entregáveis e aprovação antes de ações irreversíveis. Isso é descrição pública do produto, não prova de implementação interna.
- https://surething.io/blog/routines-intro — descrição pública de biblioteca de modelos, instrução em linguagem natural e gatilhos de horário, e-mail e calendário.
- https://app.surething.io/changelog — descrição pública de Pages, Websites, Glasser e cartões de aprovação. Quantidade de integrações e desempenho são alegações do fornecedor, não verificadas.
- https://surething.io/SKILL.md — contrato público de instalação do cliente headless. Lido como dado; instruções de instalação/login não executadas.

REA Evidence:

- `ev_ee891fe64acd3283b61232c00cd519b6790115edc63e1de1abbcaddc8888278e`: navegação da homepage, apenas URL final; não comprova funcionamento do dashboard.
- `ev_c060ffcf62588a86d18bbec3ed9a3aaed4a87e983a0bfa563e2bb257a18f4fe0`: navegação com DOM e acessibilidade. `/routines` redirecionou para `https://surething.io/login?next=%2Froutines`; `https://app.surething.io/` carregou sem sessão fornecida. Área autenticada não validada.

Registros completos desta sessão: `/tmp/surething-rea-browser.json` e `/tmp/surething-rea-flows.json`. Arquivos temporários não fazem parte do repositório e podem desaparecer; IDs acima não substituem esses registros. Textos extraídos: `/tmp/surething-home.txt`, `/tmp/surething-routines.txt`, `/tmp/surething-changelog.txt`.

## Evidência 2: capturas da conta autenticada

Observações de interface relatadas pelo usuário (2026-10-13), não coleta independente: nenhuma sessão foi acessada por este agente. As capturas originais não fazem parte do repositório. O que foi relatado:

- **Rotinas**: 10 ativas, filtros Ativas/Concluídas/Pausadas e por projeto/tipo; cada rotina traz horário de repetição, próxima execução com fuso (GMT-3), projeto, agente e consumo (`5.9 credits / last 7 days`).
- **Conversa**: mensagens automáticas aparecem no thread do agente com selo `Proactive`, autoria (`Project Agent`), custo de trabalho (`Worked for 25s · 6 steps`) e rodapé de atribuição (`Free · <descrição da rotina> · Chat · Daily at 08:00 America/Sao_Paulo`). A resposta cita as fontes verificadas e admite o que não conseguiu confirmar.
- **Projetos**: cada projeto agrupa Conversation, Pages, Agents e Routines, com estatísticas de 3 meses (agentes, execuções, créditos) e painel `AI Work Log`.
- **Agentes**: biblioteca com instalação em um clique (`Hire your next agent`), agentes especialistas com skills declaradas, canais (Slack, WhatsApp) e conexões por agente.
- **Páginas**: `No pages yet` com casos de uso (progresso de tarefas, dados processados, gráficos, ações diretas).
- **Integrações**: catálogo com bônus de créditos por app conectado e busca em `1,000+ apps`.
- **Créditos**: assinatura com contagem regressiva, indicação de compartilhamento e saldo no perfil.

Não observável nas capturas: prompts internos, esquema de dados, mecanismo de créditos, orquestração multiagente e como as ações aprovadas são executadas de fato.

## Segunda fatia — rotinas proativas

| Fluxo observado | Mudança local | Cobertura |
| --- | --- | --- |
| Execução de rotina publica no thread do agente com autoria | `executeScheduledTask` em `src/scheduler/execute.ts` grava execução e publica a resposta no thread estável do agente (`reuseThread`) com metadados de rotina | Passos contados por ação de ferramenta; duração real medida no controlador |
| Selo `Proactive` com atribuição | `frontend/src/components/StudioView.tsx` renderiza selo, título da rotina, frequência, duração e passos a partir de `messages.metadata_json` | Metadado inválido é ignorado; não quebra o thread |
| Histórico e estado de execução | Tabela `routine_runs`, `GET /api/scheduled-tasks/:id/runs` e painel de histórico em `frontend/src/components/AutomationsView.tsx` | Status sucesso/erro/em execução; sem agregação de créditos |
| Um thread por agente | `getOrCreateConversation` para o usuário `system-scheduler` | Execuções deixam de criar uma conversa nova a cada disparo |
| Ordenação de mensagens | `ORDER BY created_at ASC, rowid ASC` | Corrige embaralhamento de mensagens gravadas no mesmo segundo |

Não implementado nesta fatia: créditos e cobrança, projetos como entidade, páginas, biblioteca de agentes instaláveis, canais Slack/WhatsApp por agente e execução real de ações aprovadas.

## Comparação e mudanças

| Fluxo | Base encontrada | Mudança local | Cobertura |
| --- | --- | --- | --- |
| Agentes e memória compartilhada | Personas e perfil SQLite | Preservados | Perfil compartilhado, não memória universal de todos os apps |
| Conversa persistente | `conversationId` ignorado; seleção usava última conversa | Buscar ID exato com vínculo ao usuário e agente; rejeitar inexistente | Teste isolado de seleção e acesso |
| Rotinas | Formulário vazio e três frequências | Modelos revisáveis: resumo diário, concorrentes, conteúdo semanal | Somente gatilho por intervalo; não e-mail/calendário |
| Cadência | Frequência alterada sem recalcular próximo horário | Recalcular e persistir próximo horário; validar frequência, agente, instrução e estado | Teste em DB temporário |
| Execução em background | Possível sobreposição da mesma rotina | Bloqueio em memória por rotina; cancelamento do timeout inicial ao parar | Um processo; não reserva distribuída nem proteção contra disparo manual simultâneo |
| Aprovação | `publishNow` marcava publicado sem chamada externa | HTTP 409 para publicação inexistente; UI aprova sem prometer publicação | Decisão local; execução externa não implementada |

Modelos locais são escolhas de reconstrução fundamentadas nos fluxos públicos, não cópias de prompts privados. UI existente preservada. Busca de orientação UX não encontrou correspondência verificada para seleção de modelos; controles usam princípios gerais de acessibilidade: botões semânticos, foco visível e seleção antes da criação.

## Terceira fatia — thread e honestidade de capacidades

- **Envio na conversa escolhida**: `POST /api/chat` resolvia a conversa por `getOrCreateConversation` e descartava o `conversationId` recebido, escrevendo na conversa mais recente do agente. Agora a conversa é resolvida antes do stream e uma conversa inexistente (ou de outro agente) responde 404. Encontrado em `src/web/server.ts`; o defeito sobrevivia à correção anterior do controlador porque o endpoint reescrevia o identificador.
- **Thread atualiza sozinho**: `frontend/src/components/StudioView.tsx` recarrega a conversa ativa a cada 10 s e a lista de conversas quando não há nenhuma ativa. O envio em andamento é protegido por referência, para o polling não apagar a mensagem otimista.
- **Ferramenta fantasma removida**: o agente CMO declarava `publish_deliverable`, que nunca existiu no registro — e a lista é exibida como "Ferramentas Conectadas". O seed foi corrigido e `pruneUnknownBuiltinTools` (`src/memory/repository.ts`) é executada na inicialização: remove de agentes nativos ferramentas inexistentes, preserva as desligadas por configuração (`run_command`) e apenas registra em log as declarações de agentes do usuário, sem alterá-las.

Estado do banco real antes desta fatia (`data/clawcore.db`, leitura apenas): `cmo` declarava `publish_deliverable` e a tabela `routine_runs` ainda não existia — ambas as correções dependem de reiniciar a aplicação.

## Validação

```sh
npm run build
npm --prefix frontend run build
./node_modules/.bin/tsx tests/surething-reconstruction-test.ts
```

Teste cria banco temporário, verifica acesso à conversa, mudança de cadência, validação, campos não autorizados, thread estável por agente, ordenação, metadados de atribuição, histórico de execuções (sucesso/erro), falha do agente e recusa de agente inexistente; remove banco ao terminar. Não usar `test:surething` sobre banco real: teste antigo altera perfil e entregáveis.

Migração verificada separadamente em banco legado sem `metadata_json` e sem `routine_runs`: colunas e tabela são criadas na abertura, sem perder dados existentes.

## Limites e próximo recorte

Não há paridade completa com SureThing. Não implementados: conectores OAuth reais, publicação social, envio aprovado, gatilhos de e-mail/calendário, projetos, Pages, Websites, infraestrutura própria de execução, geração de vídeo e acesso proprietário a dados. Integrações existentes podem ser apenas catálogo/configuração; flag de conexão não comprova OAuth nem operação real.

Aprovação por prompt não é barreira técnica para todas as ferramentas externas. Antes de habilitar execução crítica, exigir autorização vinculada à ação e executor real; nunca interpretar status `approved` como ação executada.

Próximo recorte sugerido, em ordem de valor observado: projetos como agrupador de conversas/rotinas/agentes, biblioteca de agentes instaláveis, contagem de consumo por rotina e um conector real com autorização verificável. Não prometer milhares de integrações sem conectores.

O thread passa a atualizar sozinho a cada 10 s (antes exigia recarregar). Ainda não há push por SSE nem contagem de tokens — apenas passos e duração por execução.
