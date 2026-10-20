// src/agent/output-filter.ts
//
// O agente sinaliza "isto é um documento" com a tag [ARQUIVO: nome.md], que é
// removida do texto antes de exibir/salvar. Com streaming isso vira um problema:
// a tag chegaria ao usuário em pedaços antes de qualquer limpeza.
//
// Este filtro repassa o texto em tempo real, mas retém a cauda mínima que ainda
// pode virar uma tag — inclusive o prefixo parcial ("[ARQ") no fim de um chunk.

const MARKER = "[arquivo:";

/** Maior k tal que `text` termina com um prefixo de MARKER (case-insensitive). */
function markerPrefixSuffixLength(text: string): number {
  const lower = text.toLowerCase();
  const max = Math.min(lower.length, MARKER.length - 1);
  for (let k = max; k > 0; k--) {
    if (lower.endsWith(MARKER.slice(0, k))) return k;
  }
  return 0;
}

export interface FileMarkerFilter {
  /** Consome um delta e devolve o texto seguro para exibir agora. */
  push(delta: string): string;
  /** Devolve o que ainda estava retido — chamar quando o stream termina. */
  flush(): string;
}

export function createFileMarkerFilter(): FileMarkerFilter {
  let pending = "";

  function drain(final: boolean): string {
    let out = "";

    for (;;) {
      const lower = pending.toLowerCase();
      const start = lower.indexOf(MARKER);

      if (start === -1) {
        if (final) {
          out += pending;
          pending = "";
        } else {
          // Retém só a cauda que pode ser o começo de uma tag.
          const keep = markerPrefixSuffixLength(pending);
          out += pending.slice(0, pending.length - keep);
          pending = pending.slice(pending.length - keep);
        }
        return out;
      }

      // Texto antes da tag é sempre seguro.
      out += pending.slice(0, start);

      const close = pending.indexOf("]", start);
      if (close === -1) {
        if (final) {
          // Tag aberta e nunca fechada: não é uma tag, devolve como texto.
          out += pending.slice(start);
          pending = "";
          return out;
        }
        pending = pending.slice(start);
        return out;
      }

      const body = pending.slice(start + MARKER.length, close);
      // Só é a tag se tiver nome e for de uma linha só — espelha exatamente o
      // regex de `detectOutputType` (`\[ARQUIVO:\s*(.+?)\]`, sem flag `s`).
      // Qualquer outra forma é texto legítimo e passa inteira.
      if (!body.trim() || body.includes("\n")) {
        out += pending.slice(start, close + 1);
      }
      pending = pending.slice(close + 1);
    }
  }

  return {
    push: (delta: string) => {
      pending += delta;
      return drain(false);
    },
    flush: () => drain(true),
  };
}
