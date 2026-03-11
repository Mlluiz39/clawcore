// src/utils/logger.ts
type Level = "info" | "warn" | "error" | "debug";

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ?? {}),
  };
  const output = JSON.stringify(entry);
  if (level === "error") process.stderr.write(output + "\n");
  else process.stdout.write(output + "\n");
}

export const logger = {
  info:  (msg: string, meta?: Record<string, unknown>) => log("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
};
