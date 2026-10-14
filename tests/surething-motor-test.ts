// tests/surething-motor-test.ts
import dotenv from "dotenv";
dotenv.config();

import assert from "node:assert";
import { getDb } from "../src/memory/database";
import {
  getAllAgents,
  getAgentById,
  getCompanyProfile,
  updateCompanyProfile,
  createDeliverable,
  getAllDeliverables,
  updateDeliverableStatus,
  getAllScheduledTasks,
  createScheduledTask,
  deleteScheduledTask,
} from "../src/memory/repository";
import { ToolRegistry } from "../src/tools/registry";
import { CreateDeliverableTool } from "../src/tools/create-deliverable";
import { RequestApprovalTool } from "../src/tools/request-approval";
import { CompanyBrainTool } from "../src/tools/company-brain";
import { WebSearchTool } from "../src/tools/web-search";

async function runSelfTest() {
  console.log("=== INICIANDO TESTE DO MOTOR SURETHING ===");

  // 1. Inicializa DB
  const db = getDb();
  assert(db, "Database instance should exist");
  console.log("✔ Banco SQLite WAL inicializado");

  // 2. Verifica Agentes Nativos
  const agents = getAllAgents();
  assert(agents.length >= 4, `Deveria ter pelo menos 4 agentes nativos, achou ${agents.length}`);
  const cmo = getAgentById("cmo");
  const coo = getAgentById("coo");
  const researcher = getAgentById("researcher");
  const engineer = getAgentById("engineer");
  assert(cmo && (cmo.role.includes("CMO") || cmo.role.includes("Social Media")), "CMO deve existir e ter papel de CMO/Social");
  assert(coo && (coo.role.includes("COO") || coo.role.includes("Orquestrador")), "COO deve existir e ter papel de COO/Orquestrador");
  assert(researcher && researcher.role.includes("Pesquisa"), "Pesquisador deve existir");
  assert(engineer && (engineer.role.includes("Engenheiro") || engineer.role.includes("Automações")), "Engenheiro deve existir");
  console.log(`✔ 4 Agentes Nativos verificados: Alex Vance (${coo.role}), Sofia Rios (${cmo.role}), Dr. Eric (${researcher.role}), Leo Chen (${engineer.role})`);

  // 3. Testa Cérebro Compartilhado
  const initialProfile = getCompanyProfile();
  assert(initialProfile, "Perfil da empresa deve existir");
  const updatedProfile = updateCompanyProfile({
    company_name: "SureThing Engine Test Inc",
    tone_of_voice: "Ultra direto e técnico",
  });
  assert.strictEqual(updatedProfile.company_name, "SureThing Engine Test Inc");
  assert.strictEqual(updatedProfile.tone_of_voice, "Ultra direto e técnico");
  console.log("✔ Cérebro compartilhado lido e atualizado com sucesso");

  // 4. Testa Registro e Execução de Ferramentas
  const registry = new ToolRegistry();
  registry.register(new CreateDeliverableTool());
  registry.register(new RequestApprovalTool());
  registry.register(new CompanyBrainTool());
  registry.register(new WebSearchTool());

  const toolNames = registry.getToolNames();
  assert(toolNames.includes("create_deliverable"), "create_deliverable tool deve estar registrada");
  assert(toolNames.includes("request_approval"), "request_approval tool deve estar registrada");
  assert(toolNames.includes("company_brain"), "company_brain tool deve estar registrada");
  assert(toolNames.includes("web_search"), "web_search tool deve estar registrada");
  console.log(`✔ Ferramentas do Motor registradas: ${toolNames.join(", ")}`);

  // 5. Testa Ciclo de Vida do Entregável (Human-in-the-Loop)
  const toolResult = await registry.execute(
    "create_deliverable",
    JSON.stringify({
      title: "Post LinkedIn: 3 Pilares de Agências Autônomas",
      type: "social_pack",
      summary: "Roteiro e copy de post para rede profissional",
      content: "# Título do Post\n\nConteúdo completo gerado pelo CMO...",
      agent_id: "cmo",
    })
  );
  assert(!toolResult.isError, "Execução da ferramenta não deve retornar erro");
  assert(toolResult.output.includes("pending_approval"), "Entregável deve nascer em pending_approval");
  console.log("✔ Ferramenta create_deliverable executada com sucesso");

  const pendingList = getAllDeliverables("pending_approval");
  assert(pendingList.length > 0, "Deve haver pelo menos 1 entregável pendente");
  const testItem = pendingList[0];
  console.log(`✔ Entregável encontrado na Inbox: "${testItem.title}" [status: ${testItem.status}]`);

  // Aprova o entregável
  const approvedItem = updateDeliverableStatus(testItem.id, "published", "Excelente copy!");
  assert(approvedItem, "Item aprovado deve retornar");
  assert.strictEqual(approvedItem.status, "published");
  console.log(`✔ Entregável aprovado com sucesso [novo status: ${approvedItem.status}]`);

  // 6. Testa Automações Agendadas
  const task = createScheduledTask({
    agent_id: "cmo",
    title: "Lote Matinal de Conteúdo",
    frequency: "daily",
    prompt: "Gere 2 posts para o LinkedIn",
  });
  assert(task && task.id, "Tarefa agendada deve ser criada");
  const allTasks = getAllScheduledTasks();
  assert(allTasks.some((t) => t.id === task.id), "Tarefa deve aparecer na lista");
  deleteScheduledTask(task.id);
  console.log("✔ Automações em background testadas (criação, listagem e remoção)");

  console.log("=== TODOS OS 6 TESTES DO MOTOR PASSARAM COM SUCESSO! ===");
}

runSelfTest().catch((err) => {
  console.error("FALHA NO TESTE:", err);
  process.exit(1);
});
