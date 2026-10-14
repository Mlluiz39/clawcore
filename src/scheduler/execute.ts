// src/scheduler/execute.ts
import { AgentController } from "../agent/controller";
import { ScheduledTask, startRoutineRun, finishRoutineRun, updateTaskRun, getAgentById } from "../memory/repository";
import { logger } from "../utils/logger";

export type RoutineTrigger = "schedule" | "manual";

export interface RoutineExecution {
  run_id: string;
  status: "success" | "error";
  text: string;
  steps: number;
  duration_ms: number;
  error?: string;
}

/**
 * Executa uma rotina e devolve o resultado observável (status, passos e duração).
 *
 * Único caminho de execução: o agendador e o disparo manual pela API usam a mesma
 * função, garantindo histórico consistente e thread estável por agente.
 */
export async function executeScheduledTask(
  controller: AgentController,
  task: ScheduledTask,
  trigger: RoutineTrigger
): Promise<RoutineExecution> {
  if (!getAgentById(task.agent_id)) {
    throw new Error(`Agente "${task.agent_id}" da rotina não existe mais.`);
  }

  const run = startRoutineRun({ task_id: task.id, agent_id: task.agent_id, trigger });
  const startedAt = Date.now();

  // Reserva o próximo horário antes de executar, evitando disparo repetido.
  if (trigger === "schedule") {
    updateTaskRun(task.id, Math.floor(startedAt / 1000), task.frequency);
  }

  try {
    const result = await controller.processMessage("system-scheduler", task.prompt, {
      agentId: task.agent_id,
      reuseThread: true,
      messageMetadata: {
        source: "routine",
        routine_id: task.id,
        routine_title: task.title,
        frequency: task.frequency,
        trigger,
        duration_ms: 0,
        steps: 0,
      },
    });

    const durationMs = Date.now() - startedAt;
    finishRoutineRun(run.id, {
      status: "success",
      steps: result.steps,
      duration_ms: durationMs,
      output: result.text.slice(0, 2000),
    });

    logger.info("Routine executed", {
      id: task.id,
      runId: run.id,
      trigger,
      steps: result.steps,
      durationMs,
    });

    return {
      run_id: run.id,
      status: "success",
      text: result.text,
      steps: result.steps,
      duration_ms: durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    finishRoutineRun(run.id, { status: "error", duration_ms: durationMs, error: message });

    logger.error("Routine execution failed", { id: task.id, runId: run.id, trigger, error: message });

    return {
      run_id: run.id,
      status: "error",
      text: "",
      steps: 0,
      duration_ms: durationMs,
      error: message,
    };
  }
}
