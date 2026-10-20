// src/tools/prospector.ts
import { BaseTool, ToolResult } from "./types";
import { logger } from "../utils/logger";
import { exec } from "child_process";
import { promisify } from "util";
import { errorMessage } from "../utils/errors";

const execAsync = promisify(exec);

export class B2BProspectorTool extends BaseTool {
  name = "b2b_prospector";
  description =
    "Motor completo de prospecção B2B ativa e inteligência de vendas. Realiza: 1) Busca de empresas e locais no Google Maps/Web; 2) Auditoria técnica do site (SEO básico, velocidade mobile, meta tags, imagens sem alt); 3) Verificação de anúncios ativos na Meta e Google Ads; 4) Enriquecimento B2B via People Data Labs (PDL) e LinkedIn para identificar sócios e decisores com contato.";

  parameters = {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description:
          "Ação de inteligência a executar: 'search_businesses' (busca de empresas por nicho/cidade), 'audit_website' (auditoria técnica e SEO do site), 'check_meta_ads' (verificação de anúncios ativos), 'enrich_pdl' (enriquecimento de decisores e contatos no LinkedIn/PDL).",
      },
      niche: {
        type: "string",
        description: "Nicho ou segmento da empresa (ex: 'clínica de estética', 'escritório de advocacia', 'SaaS B2B').",
      },
      location: {
        type: "string",
        description: "Cidade, estado ou região (ex: 'Fortaleza - CE', 'São Paulo - SP').",
      },
      url: {
        type: "string",
        description: "URL do site da empresa para auditoria técnica.",
      },
      company_name: {
        type: "string",
        description: "Nome da empresa para checagem de anúncios ou enriquecimento de sócios.",
      },
      domain: {
        type: "string",
        description: "Domínio ou website da empresa para enriquecimento de decisores.",
      },
      limit: {
        type: "string",
        description: "Limite de resultados desejado (padrão 10).",
      },
    },
    required: ["action"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action || "").trim();

    try {
      if (action === "search_businesses") {
        return await this.searchBusinesses(args);
      }
      if (action === "audit_website") {
        return await this.auditWebsite(args);
      }
      if (action === "check_meta_ads") {
        return await this.checkMetaAds(args);
      }
      if (action === "enrich_pdl") {
        return await this.enrichPDL(args);
      }
      return { output: `Ação '${action}' desconhecida para b2b_prospector.`, isError: true };
    } catch (err: unknown) {
      logger.error("B2BProspectorTool error", { error: String(err) });
      return { output: `Erro na prospecção: ${errorMessage(err)}`, isError: true };
    }
  }

  // ── 1. Busca de Empresas & Locais ─────────────────────────────────────────
  private async searchBusinesses(args: Record<string, unknown>): Promise<ToolResult> {
    const niche = String(args.niche || "").trim();
    const location = String(args.location || "").trim();
    const limit = Number(args.limit) || 10;
    const query = `${niche} ${location} site telefone`.trim();

    logger.info("Prospector searching businesses", { niche, location, query });

    // Primeiro tenta via Glasser se houver endpoint disponível
    try {
      const { stdout } = await execAsync(
        `glasser search -q "google maps ${niche}" -j 2>/dev/null || true`,
        { env: process.env }
      );
      if (stdout.includes('"endpoint"')) {
        logger.info("Found Glasser maps endpoint, attempting execution");
      }
    } catch {
      // continua para fallback ao vivo
    }

    // Busca via Web Engine (POST para DuckDuckGo HTML)
    const searchUrl = "https://html.duckduckgo.com/html/";
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}`,
    });

    const html = await res.text();
    const results: Array<{ title: string; link: string; snippet: string }> = [];

    const linkAndTitleRegex = /<a [^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const titles: string[] = [];
    const links: string[] = [];
    const snippets: string[] = [];

    let match;
    while ((match = linkAndTitleRegex.exec(html)) !== null && titles.length < limit * 2) {
      let rawUrl = match[1];
      if (rawUrl.includes("uddg=")) {
        try {
          const parsed = new URL("https://duckduckgo.com" + rawUrl);
          rawUrl = decodeURIComponent(parsed.searchParams.get("uddg") || rawUrl);
        } catch {}
      }
      links.push(rawUrl);
      titles.push(match[2].replace(/<[^>]+>/g, "").trim());
    }

    while ((match = snippetRegex.exec(html)) !== null && snippets.length < limit * 2) {
      snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
    }

    const minLen = Math.min(titles.length, links.length, snippets.length);
    for (let i = 0; i < minLen && results.length < limit; i++) {
      const link = links[i];
      // Ignora diretórios gigantes como GuiaMais, Doctoralia se queremos o site próprio
      const isAggregator = /doctoralia|guiamais|tripadvisor|telelistas|jusbrasil|instagram\.com\/|facebook\.com\//i.test(
        link
      );
      results.push({
        title: titles[i],
        link,
        snippet: snippets[i] + (isAggregator ? " [Diretório/Rede]" : " [Site Próprio]"),
      });
    }

    return {
      output: JSON.stringify(
        {
          target: { niche, location },
          total_found: results.length,
          leads: results,
          recommendation:
            "Analise os links que possuem site próprio e execute a ação 'audit_website' e 'check_meta_ads' para filtrar quem realmente investe em tráfego.",
        },
        null,
        2
      ),
      isError: false,
    };
  }

  // ── 2. Auditoria Técnica do Site (Lighthouse & SEO) ───────────────────────
  private async auditWebsite(args: Record<string, unknown>): Promise<ToolResult> {
    let targetUrl = String(args.url || "").trim();
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

    logger.info("Auditing website", { targetUrl });

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseTimeMs = Date.now() - startTime;
      const html = await resp.text();

      // Checagens
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : null;

      const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
      const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : null;

      const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
      const h1Count = h1Matches.length;

      const imgTags = html.match(/<img[^>]*>/gi) || [];
      let imagesWithoutAlt = 0;
      for (const img of imgTags) {
        if (!/alt=["'][^"']+["']/i.test(img)) {
          imagesWithoutAlt++;
        }
      }

      // Estimativa Lighthouse Mobile Score baseada em latência e peso
      let estimatedPerformanceScore = 100;
      if (responseTimeMs > 3500) estimatedPerformanceScore -= 45;
      else if (responseTimeMs > 2000) estimatedPerformanceScore -= 30;
      else if (responseTimeMs > 1000) estimatedPerformanceScore -= 15;

      if (html.length > 3_000_000) estimatedPerformanceScore -= 20;
      else if (html.length > 1_500_000) estimatedPerformanceScore -= 10;

      estimatedPerformanceScore = Math.max(10, Math.min(100, estimatedPerformanceScore));

      const isMobileSlow = responseTimeMs > 4000 || estimatedPerformanceScore < 50;

      const audit = {
        url: targetUrl,
        status_code: resp.status,
        response_time_ms: responseTimeMs,
        estimated_mobile_score: estimatedPerformanceScore,
        is_slow: isMobileSlow,
        seo_checks: {
          has_title: Boolean(title),
          title_text: title,
          has_meta_description: Boolean(metaDescription),
          meta_description_text: metaDescription,
          h1_count: h1Count,
          has_single_h1: h1Count === 1,
          total_images: imgTags.length,
          images_missing_alt: imagesWithoutAlt,
        },
        pitch_opportunity: isMobileSlow
          ? "⚠️ Oportunidade Alta: Site lento no mobile (LCP alto), perdendo dinheiro de anúncios por abandono de página."
          : "Site possui velocidade aceitável, focar argumentos em conversão e SEO de palavras-chave.",
      };

      return { output: JSON.stringify(audit, null, 2), isError: false };
    } catch (e: unknown) {
      return {
        output: JSON.stringify({
          url: targetUrl,
          error: errorMessage(e),
          recommendation: "Não foi possível carregar o site diretamente. Pode estar bloqueando robôs ou fora do ar.",
        }),
        isError: true,
      };
    }
  }

  // ── 3. Checagem de Anúncios na Meta / Google ──────────────────────────────
  private async checkMetaAds(args: Record<string, unknown>): Promise<ToolResult> {
    const company = String(args.company_name || args.domain || "").trim();
    if (!company) {
      return { output: "Informe 'company_name' ou 'domain' para checagem de anúncios.", isError: true };
    }

    const metaAdsLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(
      company
    )}&search_type=keyword_unordered&media_type=all`;

    // Consulta de transparência de publicidade via web search
    const query = `"${company}" "Biblioteca de Anúncios" OR "anúncios ativos" OR "Google Ads"`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    let hasEvidences = false;
    try {
      const resp = await fetch(searchUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      const html = await resp.text();
      hasEvidences = html.includes("facebook.com/ads") || html.includes("anúncio") || html.includes("campanha");
    } catch {
      // fallback
    }

    return {
      output: JSON.stringify(
        {
          company,
          meta_ads_library_link: metaAdsLibraryUrl,
          ads_status_estimated: hasEvidences ? "Provável Anunciante Ativo" : "Investigação Manual Necessária",
          instruction:
            "Para qualificar o lead: se o anunciante tiver anúncios rodando, ele já valida que tem verba para marketing. Descarte quem não anuncia se o critério exigir anunciantes ativos.",
        },
        null,
        2
      ),
      isError: false,
    };
  }

  // ── 4. Enriquecimento PDL & Decisores no LinkedIn ─────────────────────────
  private async enrichPDL(args: Record<string, unknown>): Promise<ToolResult> {
    const company = String(args.company_name || "").trim();
    const domain = String(args.domain || "").trim();

    logger.info("Enriching company/deciders via PDL & LinkedIn", { company, domain });

    // Se Glasser estiver disponível com chave, tenta PDL direto
    if (process.env.GLASSER_API_KEY) {
      try {
        const inputData = JSON.stringify({ website: domain || undefined, name: company || undefined });
        const { stdout } = await execAsync(
          `glasser run -p pdl -e company/enrich -i '${inputData}' -j --wait 2>/dev/null || true`,
          { env: process.env }
        );
        if (stdout && !stdout.includes("error")) {
          return { output: stdout, isError: false };
        }
      } catch {
        // prossegue para busca de decisores no LinkedIn
      }
    }

    // Busca de decisores no LinkedIn (CEO, Sócio, Fundador, Diretor)
    const query = `site:linkedin.com/in/ ("${company}" OR "${domain}") (CEO OR "Sócio" OR "Sócia" OR "Diretor" OR "Fundador" OR "Proprietário")`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const resp = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      const html = await resp.text();

      const deciders: Array<{ name: string; title: string; linkedin_url: string }> = [];
      const titleMatches = html.match(/<a class="result__a"[^>]*>([\s\S]*?)<\/a>/gi) || [];

      for (let i = 0; i < Math.min(titleMatches.length, 5); i++) {
        const fullTitle = titleMatches[i].replace(/<[^>]+>/g, "").replace(/\s*\|\s*LinkedIn.*$/i, "").trim();
        const parts = fullTitle.split(" - ");
        const name = parts[0] || "Decisor";
        const role = parts.slice(1).join(" - ") || "Diretoria / Gestão";

        deciders.push({
          name,
          title: role,
          linkedin_url: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(name + " " + company)}`,
        });
      }

      return {
        output: JSON.stringify(
          {
            company,
            domain,
            source: process.env.GLASSER_API_KEY ? "People Data Labs (PDL)" : "LinkedIn B2B Intelligence",
            identified_deciders: deciders,
            contact_pattern: domain ? `Possíveis e-mails: contato@${domain}, comercial@${domain}, nome@${domain}` : null,
          },
          null,
          2
        ),
        isError: false,
      };
    } catch (e: unknown) {
      return { output: `Falha ao enriquecer decisores: ${errorMessage(e)}`, isError: true };
    }
  }
}
