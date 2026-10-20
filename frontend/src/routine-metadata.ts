// frontend/src/routine-metadata.ts
//
// Metadados de mensagem publicada por rotina proativa.
//
// Estava duplicado em ProjectWorkspaceView e StudioView — as duas cópias
// precisavam concordar sobre o que conta como "publicado por rotina".
import type { Message, MessageMetadata } from "./types";

/**
 * Devolve os metadados se a mensagem veio de uma rotina, senão `null`.
 *
 * Metadado inválido (JSON quebrado, `source` diferente, sem título) é tratado
 * como ausente: o thread continua renderizando normalmente.
 */
export function parseRoutineMetadata(msg: Message): MessageMetadata | null {
  if (!msg.metadata_json) return null;
  try {
    const parsed = JSON.parse(msg.metadata_json) as MessageMetadata;
    return parsed?.source === "routine" && parsed.routine_title ? parsed : null;
  } catch {
    return null;
  }
}
