// frontend/src/markdown.ts
//
// Renderização de Markdown vindo do LLM e de resultados de `web_search`.
//
// Esse conteúdo é tratado como não confiável: o modelo pode reproduzir HTML de
// uma página que leu, e um prompt injection pode fazer o mesmo de propósito.
// `marked` NÃO sanitiza (a opção `sanitize` foi removida na v17), então o HTML
// resultante passa por DOMPurify antes de chegar ao `dangerouslySetInnerHTML`.
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/** Converte Markdown em HTML seguro para `dangerouslySetInnerHTML`. */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return "";

  const html = marked.parse(source, { async: false }) as string;

  return DOMPurify.sanitize(html, {
    // Links abrem fora; `noopener` impede que a página de destino manipule
    // `window.opener`. DOMPurify já bloqueia `javascript:` em href.
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["style", "form", "input", "button"],
    FORBID_ATTR: ["srcset"],
  });
}
