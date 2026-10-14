// tests/prospector-test.ts
import assert from "node:assert";
import { B2BProspectorTool } from "../src/tools/prospector";

async function testProspector() {
  console.log("=== INICIANDO TESTE DO MOTOR DE PROSPECÇÃO B2B ===");
  const prospector = new B2BProspectorTool();

  // 1. Teste de Busca de Empresas no Google/Web
  console.log("-> 1. Testando busca de empresas locais (Clínicas em Fortaleza)...");
  const searchRes = await prospector.execute({
    action: "search_businesses",
    niche: "clínica de estética",
    location: "Fortaleza - CE",
    limit: "5",
  });
  assert(!searchRes.isError, "Busca não deve retornar erro");
  const searchData = JSON.parse(searchRes.output);
  assert(searchData.leads && searchData.leads.length > 0, "Deve encontrar leads");
  console.log(`✔ Encontrados ${searchData.leads.length} leads no nicho`);
  console.log(`  Exemplo de lead: ${searchData.leads[0].title} (${searchData.leads[0].link})`);

  // 2. Teste de Auditoria Técnica e SEO
  console.log("-> 2. Testando auditoria de website (SEO & Lighthouse mobile)...");
  const auditRes = await prospector.execute({
    action: "audit_website",
    url: "https://example.com",
  });
  assert(!auditRes.isError, "Auditoria não deve falhar");
  const auditData = JSON.parse(auditRes.output);
  assert(auditData.seo_checks, "Deve conter checagens de SEO");
  console.log(`✔ Auditoria concluída: Score Mobile estimado ${auditData.estimated_mobile_score}, Latência ${auditData.response_time_ms}ms`);

  // 3. Teste de Checagem de Anúncios na Meta
  console.log("-> 3. Testando checagem de anúncios Meta Ad Library...");
  const adsRes = await prospector.execute({
    action: "check_meta_ads",
    company_name: "Clínica Teste",
  });
  assert(!adsRes.isError, "Checagem de anúncios não deve falhar");
  const adsData = JSON.parse(adsRes.output);
  assert(adsData.meta_ads_library_link, "Deve gerar link da biblioteca de anúncios");
  console.log(`✔ Link da biblioteca de anúncios gerado: ${adsData.meta_ads_library_link}`);

  // 4. Teste de Enriquecimento PDL & Decisores no LinkedIn
  console.log("-> 4. Testando enriquecimento de decisores via PDL & LinkedIn...");
  const enrichRes = await prospector.execute({
    action: "enrich_pdl",
    company_name: "Resultados Digitais",
    domain: "rdstation.com",
  });
  assert(!enrichRes.isError, "Enriquecimento não deve falhar");
  const enrichData = JSON.parse(enrichRes.output);
  assert(enrichData.source, "Deve retornar fonte de inteligência");
  console.log(`✔ Enriquecimento executado via ${enrichData.source}: ${enrichData.identified_deciders?.length || 0} decisores mapeados`);

  console.log("=== TODOS OS TESTES DO PROSPECTOR PASSARAM COM SUCESSO! ===");
}

testProspector().catch((err) => {
  console.error("FALHA:", err);
  process.exit(1);
});
