// src/scheduler/runner.ts
import { getAllScheduledTasks } from "../memory/repository";
import { AgentController } from "../agent/controller";
import { executeScheduledTask } from "./execute";
import { logger } from "../utils/logger";

let intervalId: NodeJS.Timeout | null = null;
let startupTimeout: NodeJS.Timeout | null = null;
const runningTasks = new Set<string>();

export function startScheduler(controller: AgentController, intervalMs: number = 60_000): void {
  if (intervalId) return;

  logger.info("Background Task Scheduler started", { intervalMs });

  const runCheck = async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const tasks = getAllScheduledTasks();

      for (const task of tasks) {
        if (!task.is_enabled || runningTasks.has(task.id)) continue;

        // If next_run_at is reached or missing
        if (!task.next_run_at || task.next_run_at <= now) {
          logger.info("Executing scheduled task", {
            id: task.id,
            title: task.title,
            agentId: task.agent_id,
          });

          // ponytail: um processo; usar reserva persistida no DB antes de executar múltiplos workers.
          runningTasks.add(task.id);
          executeScheduledTask(controller, task, "schedule")
            .catch((err) => {
              // executeScheduledTask já isola falhas da rotina; aqui só sobra erro inesperado.
              logger.error("Routine dispatch failed", { id: task.id, error: String(err) });
            })
            .finally(() => runningTasks.delete(task.id));
        }
      }
    } catch (err) {
      logger.error("Error during scheduler check", { error: String(err) });
    }
  };

  // Run initial check after 5s, then on regular interval
  startupTimeout = setTimeout(runCheck, 5_000);
  intervalId = setInterval(runCheck, intervalMs);
}

export function stopScheduler(): void {
  if (startupTimeout) clearTimeout(startupTimeout);
  startupTimeout = null;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Background Task Scheduler stopped");
  }
}
