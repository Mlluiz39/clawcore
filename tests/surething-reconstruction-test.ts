import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "clawcore-reconstruction-"));
  process.env.DB_PATH = join(dir, "test.db");
  process.env.OPENAI_API_KEY = "test-only";
  process.env.WEB_AUTH_PASSWORD = "test-only";
  process.env.JWT_SECRET = "test-only";
  const { getDb } = await import("../src/memory/database");
  try {
    const repo = await import("../src/memory/repository");
    const first = repo.createNewConversation("owner", "cmo");
    repo.createNewConversation("owner", "cmo");
    assert.equal(repo.getConversationById(first.id, "owner", "cmo")?.id, first.id);
    assert.equal(repo.getConversationById(first.id, "other", "cmo"), null);
    assert.equal(repo.getConversationById(first.id, "owner", "coo"), null);
    const task = repo.createScheduledTask({ agent_id: "cmo", title: "Conteúdo", frequency: "daily", prompt: "Gere rascunho" });
    const updated = repo.updateScheduledTask(task.id, { frequency: "hourly" });
    assert(updated);
    assert(Math.abs(updated.next_run_at! - Math.floor(Date.now() / 1000) - 3600) < 3);
    assert.equal(repo.getAllScheduledTasks().find(t => t.id === task.id)?.next_run_at, updated.next_run_at);
    assert.throws(() => repo.createScheduledTask({ agent_id: "missing", title: "X", frequency: "daily", prompt: "X" }));
    assert.throws(() => repo.updateScheduledTask(task.id, { frequency: "invalid" as "daily" }));
    assert.throws(() => repo.updateScheduledTask(task.id, { prompt: " " }));
    assert.throws(() => repo.updateScheduledTask(task.id, { is_enabled: 2 }));
    repo.updateScheduledTask(task.id, { id: "injected", agent_id: "coo", is_enabled: 0 } as any);
    assert.equal(repo.getAllScheduledTasks().find(t => t.id === task.id)?.agent_id, "cmo");

    // Thread estável: rotinas reutilizam a conversa do agente em vez de abrir uma por execução.
    const threadA = repo.getOrCreateConversation("system-scheduler", "cmo");
    const threadB = repo.getOrCreateConversation("system-scheduler", "cmo");
    assert.equal(threadA.id, threadB.id);
    assert.notEqual(repo.getOrCreateConversation("system-scheduler", "coo").id, threadA.id);

    // Metadados de atribuição e ordenação de mensagens gravadas no mesmo segundo.
    const metadata = {
      source: "routine" as const,
      routine_id: task.id,
      routine_title: task.title,
      frequency: task.frequency,
      trigger: "schedule" as const,
      duration_ms: 0,
      steps: 0,
    };
    repo.saveMessage(threadA.id, "user", "primeira");
    repo.saveMessage(threadA.id, "assistant", "resposta", metadata);
    const messages = repo.getConversationMessages(threadA.id);
    assert.deepEqual(messages.map(m => m.content), ["primeira", "resposta"]);
    assert.equal(JSON.parse(messages[1].metadata_json!).routine_title, task.title);

    // Histórico de execução: início, conclusão e leitura por rotina.
    const run = repo.startRoutineRun({ task_id: task.id, agent_id: "cmo", trigger: "manual" });
    assert.equal(run.status, "running");
    const finished = repo.finishRoutineRun(run.id, { status: "success", steps: 4, duration_ms: 1500, output: "ok" });
    assert.equal(finished?.status, "success");
    assert.equal(finished?.steps, 4);
    assert(finished?.finished_at);
    assert.equal(repo.getRoutineRuns(task.id)[0]?.id, run.id);
    const failed = repo.startRoutineRun({ task_id: task.id, agent_id: "cmo", trigger: "schedule" });
    repo.finishRoutineRun(failed.id, { status: "error", error: "falha simulada" });
    assert.equal(repo.getRoutineRuns(task.id)[0]?.error, "falha simulada");
    assert.equal(repo.getRoutineRuns("task_inexistente").length, 0);
    assert.equal(repo.finishRoutineRun("run_inexistente", { status: "success" }), null);

    // Executor único: usada pelo agendador e pela API, deve publicar no thread com atribuição.
    const { executeScheduledTask } = await import("../src/scheduler/execute");
    let captured: any = null;
    const stub = {
      processMessage: async (_userId: string, _prompt: string, options: any) => {
        captured = options;
        return { text: "resultado da rotina", isFile: false, isAudio: false, steps: 7 };
      },
    };
    const scheduled = repo.getAllScheduledTasks().find(t => t.id === task.id)!;
    repo.updateScheduledTask(task.id, { is_enabled: 1 });
    const execution = await executeScheduledTask(stub as any, { ...scheduled, is_enabled: 1 }, "schedule");
    assert.equal(execution.status, "success");
    assert.equal(execution.steps, 7);
    assert.equal(captured.reuseThread, true);
    assert.equal(captured.messageMetadata.routine_id, task.id);
    assert.equal(captured.messageMetadata.source, "routine");
    assert(captured.messageMetadata.duration_ms >= 0);
    const afterRun = repo.getAllScheduledTasks().find(t => t.id === task.id)!;
    assert(afterRun.next_run_at && afterRun.next_run_at > Math.floor(Date.now() / 1000));
    assert.equal(repo.getRoutineRuns(task.id)[0]?.status, "success");

    // Falha do agente vira execução com erro, sem derrubar o agendador.
    const failing = { processMessage: async () => { throw new Error("provedor indisponível"); } };
    const failedExecution = await executeScheduledTask(failing as any, { ...scheduled, is_enabled: 1 }, "schedule");
    assert.equal(failedExecution.status, "error");
    assert.match(failedExecution.error ?? "", /provedor indisponível/);
    assert.equal(repo.getRoutineRuns(task.id)[0]?.status, "error");

    // Agente removido é recusado antes de executar.
    await assert.rejects(() => executeScheduledTask(stub as any, { ...scheduled, agent_id: "apagado" }, "schedule"));

    // Ferramenta declarada que não existe é removida do agente nativo (lista é exibida na UI).
    const db = getDb();
    db.prepare("UPDATE agents SET tools = ? WHERE id = 'cmo'").run(
      JSON.stringify(["create_deliverable", "publish_deliverable", "web_search"])
    );
    const custom = repo.createCustomAgent({
      name: "Custom",
      role: "Teste",
      description: "Agente do usuário",
      system_prompt: "teste",
      tools: ["ferramenta_inexistente"],
    } as any);
    const pruned = repo.pruneUnknownBuiltinTools(["create_deliverable", "web_search"]);
    assert.deepEqual(pruned.updated.find(u => u.id === "cmo")?.removed, ["publish_deliverable"]);
    assert.deepEqual(JSON.parse(repo.getAgentById("cmo")!.tools), ["create_deliverable", "web_search"]);
    // Agente do usuário é reportado, nunca alterado silenciosamente.
    assert(pruned.unknown.some(u => u.id === custom.id && u.tool === "ferramenta_inexistente"));
    assert.deepEqual(JSON.parse(repo.getAgentById(custom.id)!.tools), ["ferramenta_inexistente"]);
    assert.deepEqual(repo.pruneUnknownBuiltinTools(["create_deliverable", "web_search"]).updated, []);
    repo.deleteCustomAgent(custom.id);

    console.log("PASS: conversa exata, thread estável, rotinas, execuções, atribuição e falhas; DB temporário.");
  } finally {
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
