// tests/stream-filter-test.ts
//
// O filtro existe para a tag [ARQUIVO: nome.md] nunca vazar no streaming, em
// nenhuma forma de fatiamento. Estes testes cobrem os casos que já quebraram
// (tag partida entre chunks) e os que NÃO devem ser tratados como tag.
import assert from "node:assert/strict";
import { createFileMarkerFilter } from "../src/agent/output-filter";

/** Alimenta o filtro pedaço a pedaço e devolve o que saiu. */
function stream(deltas: string[]): string {
  const filter = createFileMarkerFilter();
  let out = "";
  for (const d of deltas) out += filter.push(d);
  out += filter.flush();
  return out;
}

/** Fatia um texto em pedaços de tamanho fixo (todas as posições de corte). */
function sliceEvery(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

async function main() {
  // 1. Texto sem tag passa intacto, char a char.
  assert.equal(stream(["olá ", "mundo"]), "olá mundo");
  assert.equal(stream([..."texto simples"]), "texto simples");

  // 2. A tag é removida — e o texto ao redor é preservado.
  assert.equal(stream(["[ARQUIVO: relatorio.md]Segue o relatório."]), "Segue o relatório.");
  assert.equal(
    stream(["Segue o relatório.\n\n[ARQUIVO: relatorio.md]"]),
    "Segue o relatório.\n\n"
  );

  // 3. O caso crítico: a tag partida em QUALQUER posição não vaza.
  const withTag = "Antes [ARQUIVO: doc.md] depois";
  for (let size = 1; size <= withTag.length; size++) {
    const got = stream(sliceEvery(withTag, size));
    assert.equal(got, "Antes  depois", `vazou com chunks de ${size}: ${JSON.stringify(got)}`);
    assert(!got.includes("[ARQUIVO"), `tag visível com chunks de ${size}`);
  }

  // 4. Caixa da tag não importa (o extrator usa /i).
  assert.equal(stream(["[arquivo: x.md]ok"]), "ok");
  assert.equal(stream(["[ArQuIvO: x.md]ok"]), "ok");
  for (let size = 1; size <= 18; size++) {
    assert.equal(stream(sliceEvery("[arquivo: x.md]ok", size)), "ok");
  }

  // 5. Colchete solto no fim do texto é conteúdo, não tag.
  assert.equal(stream(["veja isso ["]), "veja isso [");
  assert.equal(stream(["veja isso [ARQ"]), "veja isso [ARQ");
  assert.equal(stream(["array[i] e [ARQ"]), "array[i] e [ARQ");

  // 6. "[ARQUIVO:]" sem nome NÃO é tag (o regex exige conteúdo) — passa literal.
  assert.equal(stream(["[ARQUIVO:]"]), "[ARQUIVO:]");
  assert.equal(stream(sliceEvery("[ARQUIVO:] texto", 3)), "[ARQUIVO:] texto");

  // 7. Tag com quebra de linha não casa o regex do extrator — passa literal.
  assert.equal(stream(["[ARQUIVO: nome\nquebrado]"]), "[ARQUIVO: nome\nquebrado]");

  // 8. Múltiplas tags na mesma resposta.
  assert.equal(stream(["[ARQUIVO: a.md]corpo[ARQUIVO: b.md]fim"]), "corpofim");

  // 9. Stream vazio não quebra.
  assert.equal(stream([]), "");
  assert.equal(stream([""]), "");

  // 10. Nada é perdido quando o filtro é alimentado com um único delta grande.
  assert.equal(stream([withTag]), "Antes  depois");

  console.log("✅ Todos os testes do filtro de streaming passaram.");
}

main().catch((err) => {
  console.error("❌ Falha no teste do filtro de streaming:", err);
  process.exit(1);
});
