// src/utils/errors.ts

/** Erro com os campos que as libs de HTTP costumam anexar (openai, fetch). */
interface ErrorWithMeta {
  message?: string;
  status?: number;
  code?: string;
  response?: { status?: number };
}

/**
 * Lê um valor lançado como se fosse um erro, sem `any`.
 *
 * `catch` recebe `unknown` sob `strict`, e as libs anexam `status`/`code` ao
 * objeto de erro sem que isso apareça no tipo. Isto faz a leitura de forma
 * segura, devolvendo `undefined` quando o campo não existe.
 */
export function asErrorMeta(err: unknown): ErrorWithMeta {
  if (typeof err !== "object" || err === null) return {};
  const e = err as Record<string, unknown>;
  const response = e.response;
  return {
    message: typeof e.message === "string" ? e.message : undefined,
    status: typeof e.status === "number" ? e.status : undefined,
    code: typeof e.code === "string" ? e.code : undefined,
    response:
      typeof response === "object" && response !== null
        ? { status: (response as Record<string, unknown>).status as number | undefined }
        : undefined,
  };
}

/** Código HTTP do erro, quando houver. */
export function errorStatus(err: unknown): number | undefined {
  const meta = asErrorMeta(err);
  return meta.status ?? meta.response?.status;
}

/** Mensagem legível de qualquer valor lançado. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/** Erro do `child_process.exec`: além de `message`, traz stdout/stderr. */
export interface ExecError {
  message: string;
  stdout?: string;
  stderr?: string;
}

export function asExecError(err: unknown): ExecError {
  const meta = asErrorMeta(err);
  if (typeof err !== "object" || err === null) {
    return { message: errorMessage(err) };
  }
  const e = err as Record<string, unknown>;
  return {
    message: meta.message ?? errorMessage(err),
    stdout: typeof e.stdout === "string" ? e.stdout : undefined,
    stderr: typeof e.stderr === "string" ? e.stderr : undefined,
  };
}
