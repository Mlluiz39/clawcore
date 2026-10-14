import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "clawcore-project-test-"));
  process.env.DB_PATH = join(dir, "test.db");
  process.env.OPENAI_API_KEY = "test-only";
  process.env.WEB_AUTH_PASSWORD = "test-only";
  process.env.JWT_SECRET = "test-only";

  try {
    const { getDb } = await import("../src/memory/database");
    getDb(); // Inicializa tabelas e seeds
    const repo = await import("../src/memory/repository");

    // 1. Verifica se os 5 projetos foram semeados
    const projects = repo.getAllProjects();
    assert.equal(projects.length >= 5, true);

    const leadsGen = repo.getProjectById("4cf69f0b-b47f-4c10-8312-b50579b4b69c");
    assert(leadsGen);
    assert.equal(leadsGen.name, "Leads Generation");

    const emailMgmt = repo.getProjectById("881cca65-ada6-4452-be77-ef6f2ee07aa1");
    assert(emailMgmt);
    assert.equal(emailMgmt.name, "Email Management");

    // 2. Teste de criação e atualização de projeto
    const custom = repo.createProject({
      name: "Custom Testing Project",
      description: "Projeto de teste unitário",
      icon: "briefcase",
    });
    assert(custom.id);
    assert.equal(custom.name, "Custom Testing Project");

    const updated = repo.updateProject(custom.id, { description: "Nova descrição" });
    assert.equal(updated?.description, "Nova descrição");

    // 3. Conversa vinculada ao projeto
    const conv = repo.createNewConversation("test-user", "coo", leadsGen.id);
    assert.equal(conv.project_id, leadsGen.id);

    const projectConvs = repo.getAllConversations("test-user", undefined, leadsGen.id);
    assert.equal(projectConvs.length >= 1, true);
    assert.equal(projectConvs.some((c) => c.id === conv.id), true);

    // 4. Rotina vinculada ao projeto
    const task = repo.createScheduledTask({
      agent_id: "prospector",
      project_id: leadsGen.id,
      title: "Finds new leads looking for what you sell",
      frequency: "weekly",
      prompt: "Buscar novos leads B2B",
    });
    assert.equal(task.project_id, leadsGen.id);

    const projectTasks = repo.getAllScheduledTasks(leadsGen.id);
    assert.equal(projectTasks.some((t) => t.id === task.id), true);

    // 5. Entregável vinculado ao projeto
    const deliv = repo.createDeliverable({
      agent_id: "prospector",
      project_id: leadsGen.id,
      conversation_id: conv.id,
      title: "leads_sp_estetica_odonto",
      type: "prospect_list",
      summary: "Lista com 40 leads de estética e odontologia",
      content: { leads: [{ name: "Clinica A" }] },
    });
    assert.equal(deliv.project_id, leadsGen.id);

    const projectDelivs = repo.getAllDeliverables(undefined, leadsGen.id);
    assert.equal(projectDelivs.some((d) => d.id === deliv.id), true);

    // 6. Remoção de projeto
    const delOk = repo.deleteProject(custom.id);
    assert.equal(delOk, true);
    assert.equal(repo.getProjectById(custom.id), null);

    console.log("✅ Todos os testes do workspace de projetos passaram com sucesso.");
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

main().catch((err) => {
  console.error("❌ Falha nos testes:", err);
  process.exit(1);
});
