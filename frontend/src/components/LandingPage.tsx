// frontend/src/components/LandingPage.tsx
import { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Briefcase,
  Share2,
  Search,
  Code,
  Target,
  ChevronDown,
} from "lucide-react";

interface LandingPageProps {
  onEnterDashboard: () => void;
  isAuthenticated: boolean;
}

export function LandingPage({ onEnterDashboard, isAuthenticated }: LandingPageProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const agents = [
    {
      id: "coo",
      name: "Alex Vance",
      role: "COO & Orquestrador",
      icon: Briefcase,
      color: "from-blue-500/20 to-indigo-500/10 border-blue-500/30",
      desc: "Supervisiona a operação, define prioridades de crescimento, delega tarefas entre agentes e sintetiza relatórios executivos.",
      badge: "Operações",
    },
    {
      id: "cmo",
      name: "Sofia Rios",
      role: "CMO & Social Media",
      icon: Share2,
      color: "from-pink-500/20 to-purple-500/10 border-pink-500/30",
      desc: "Gera lotes completos de conteúdo pronto para redes (LinkedIn, Instagram carrossel, threads para X), scripts de anúncios e copy de vendas.",
      badge: "Marketing",
    },
    {
      id: "researcher",
      name: "Dr. Eric Hunt",
      role: "Pesquisador & Inteligência",
      icon: Search,
      color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
      desc: "Varre concorrentes, estuda tendências de mercado e cria dossiês com dados sólidos para apoiar decisões estratégicas.",
      badge: "Inteligência",
    },
    {
      id: "engineer",
      name: "Leo Chen",
      role: "Engenheiro & Automações",
      icon: Code,
      color: "from-amber-500/20 to-orange-500/10 border-amber-500/30",
      desc: "Desenvolve automações, integrações de APIs, scripts e melhorias técnicas direto na base de código do projeto.",
      badge: "Engenharia",
    },
    {
      id: "prospector",
      name: "Marcus Cole",
      role: "Prospector & B2B Intelligence",
      icon: Target,
      color: "from-cyan-500/20 to-blue-500/10 border-cyan-500/30",
      desc: "Mapeia empresas no Google Maps, audita sites com Lighthouse, verifica anúncios ativos na Meta e enriquece decisores no LinkedIn/PDL.",
      badge: "Aquisição B2B",
    },
  ];

  const steps = [
    {
      step: "01",
      title: "Cérebro Central Compartilhado",
      desc: "Todos os agentes compartilham o mesmo conhecimento da sua empresa: nicho, tom de voz, público-alvo e regras de marca.",
    },
    {
      step: "02",
      title: "Geração de Entregáveis Reais",
      desc: "Sem respostas superficiais. Os agentes produzem posts completos, cópias de landing page, pesquisas e campanhas estruturadas.",
    },
    {
      step: "03",
      title: "Human-in-the-Loop (Inbox de Aprovação)",
      desc: "Nada irreversível acontece sem seu aval. Revise os entregáveis na Inbox, solicite ajustes com 1 clique ou aprove para publicação.",
    },
    {
      step: "04",
      title: "Automações em Segundo Plano",
      desc: "Agendamentos automáticos geram lotes de conteúdo e auditorias periódicas enquanto você cuida do que realmente importa.",
    },
  ];

  const faqs = [
    {
      q: "Qual a diferença entre o SureThing e um chatbot comum como o ChatGPT?",
      a: "Chatbots tradicionais dão apenas conselhos em texto solto que você precisa copiar, colar e formatar. O SureThing é uma agência autônoma com agentes especializados que entregam materiais prontos (entregáveis estruturados) que entram numa fila de aprovação e podem ser disparados automaticamente.",
    },
    {
      q: "O que é o sistema de Human-in-the-Loop?",
      a: "Entregáveis e solicitações de ação ficam com status 'pending_approval' na Inbox para revisão humana. Aprovar registra sua decisão; não publica posts nem envia e-mails. Publicação externa ainda é manual.",
    },
    {
      q: "Os agentes compartilham o mesmo contexto?",
      a: "Sim. O COO, CMO, Pesquisador e Engenheiro compartilham o 'Cérebro da Empresa' configurado na plataforma, garantindo que o tom de voz e os objetivos da sua marca sejam uniformes em qualquer canal.",
    },
    {
      q: "Quais modelos de IA o motor suporta?",
      a: "O motor é compatível com OpenAI, DeepSeek, Claude, Groq e modelos locais como Ollama via endpoint OpenAI-compatible configurável em tempo real no painel.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#07090e] text-[#e6edf3] selection:bg-purple-500/30 selection:text-white">
      {/* Background Glows & Grid */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#2d3748_1px,transparent_1px)] [background-size:24px_24px]"></div>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-purple-600/10 blur-[140px] pointer-events-none rounded-full"></div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#07090e]/80 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20 font-bold text-white text-base">
              ✦
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight text-white">SureThing</span>
              <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
                AI Agency
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-[#9ca3af]">
            <a href="#agentes" className="hover:text-white transition-colors">Agentes</a>
            <a href="#motor" className="hover:text-white transition-colors">Como Funciona</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={onEnterDashboard}
              className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-neutral-200 transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <span>{isAuthenticated ? "Ir ao Painel" : "Acessar Plataforma"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 px-6 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-[#c4b5fd] mb-8">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Motor Multi-Agente Autônomo com Human-in-the-Loop</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.12]">
          Não é um chatbot. <br />
          <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-white bg-clip-text text-transparent">
            Agentes de IA que entregam trabalho feito.
          </span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-[#94a3b8] max-w-2xl mx-auto leading-relaxed">
          Escale seu negócio com uma agência completa de IA: COO, CMO, Pesquisador e Engenheiro compartilhando o mesmo cérebro central e gerando entregáveis prontos para aprovação.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onEnterDashboard}
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-base shadow-xl shadow-purple-600/25 hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <span>Abrir Studio de Agentes</span>
            <ArrowRight className="w-5 h-5" />
          </button>
          <a
            href="#motor"
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] text-white font-medium text-base transition-all flex items-center justify-center gap-2"
          >
            <span>Ver como o motor opera</span>
          </a>
        </div>

        {/* Dashboard Preview Card Mockup */}
        <div className="mt-16 p-2 rounded-3xl bg-gradient-to-b from-white/[0.12] to-transparent border border-white/[0.1] shadow-2xl">
          <div className="bg-[#0b0f17] rounded-2xl p-6 text-left border border-white/[0.05]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                <span className="ml-3 text-xs font-mono text-[#64748b]">surething-studio // inbox // queue: 3 pending</span>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                ● Agentes Operando
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-purple-500/30 transition-all">
                <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-2">
                  <span className="font-medium text-purple-300">CMO • Sofia Rios</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]">Aprovação Pendente</span>
                </div>
                <h4 className="text-sm font-semibold text-white">Carrossel Instagram: 5 Erros de Tráfego Pago</h4>
                <p className="text-xs text-[#64748b] mt-1 line-clamp-2">Lote com 6 slides prontos com copy de gancho, design notes e CTA para direct.</p>
                <div className="mt-4 flex gap-2">
                  <button onClick={onEnterDashboard} className="flex-1 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-medium border border-purple-500/30 cursor-pointer">
                    Aprovar
                  </button>
                  <button onClick={onEnterDashboard} className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-xs text-[#94a3b8] cursor-pointer">
                    Revisar
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-blue-500/30 transition-all">
                <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-2">
                  <span className="font-medium text-blue-300">Pesquisador • Dr. Eric</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px]">Concluído</span>
                </div>
                <h4 className="text-sm font-semibold text-white">Inteligência Competitiva: Top 3 Concorrentes</h4>
                <p className="text-xs text-[#64748b] mt-1 line-clamp-2">Análise de preços, canais de aquisição e falhas no atendimento dos líderes.</p>
                <div className="mt-4">
                  <button onClick={onEnterDashboard} className="w-full py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs text-white cursor-pointer">
                    Ver Relatório
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-amber-500/30 transition-all">
                <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-2">
                  <span className="font-medium text-amber-300">Engenheiro • Leo Chen</span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px]">Agendado 09:00</span>
                </div>
                <h4 className="text-sm font-semibold text-white">Auditoria Diária de Performance & SEO</h4>
                <p className="text-xs text-[#64748b] mt-1 line-clamp-2">Verificação automática de Core Web Vitals e integridade dos endpoints.</p>
                <div className="mt-4">
                  <button onClick={onEnterDashboard} className="w-full py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs text-white cursor-pointer">
                    Configurar Cron
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agents Section */}
      <section id="agentes" className="py-24 px-6 max-w-6xl mx-auto border-t border-white/[0.06]">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Especialização Real</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mt-2">Os 4 Agentes da sua Agência</h2>
          <p className="text-[#94a3b8] mt-3">Cada agente é treinado para uma função executiva e colabora em um pipeline unificado.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {agents.map((a) => {
            const Icon = a.icon;
            return (
              <div
                key={a.id}
                className={`p-6 rounded-2xl bg-gradient-to-br ${a.color} bg-[#0b0f17] border transition-all hover:scale-[1.01]`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{a.name}</h3>
                      <p className="text-xs text-[#94a3b8]">{a.role}</p>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/[0.06] text-[#cbd5e1] font-medium">
                    {a.badge}
                  </span>
                </div>
                <p className="mt-4 text-sm text-[#94a3b8] leading-relaxed">{a.desc}</p>
                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs text-[#64748b]">Pronto para produzir entregáveis</span>
                  <button
                    onClick={onEnterDashboard}
                    className="text-xs font-medium text-white hover:text-purple-300 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Iniciar Chat</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it Works / Motor Section */}
      <section id="motor" className="py-24 px-6 max-w-6xl mx-auto border-t border-white/[0.06]">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Arquitetura</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mt-2">Como o Motor Opera</h2>
          <p className="text-[#94a3b8] mt-3">Do briefing ao entregável publicado com controle humano absoluto.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div key={s.step} className="p-6 rounded-2xl bg-[#0b0f17] border border-white/[0.06] relative">
              <span className="text-3xl font-black text-white/10">{s.step}</span>
              <h3 className="text-base font-bold text-white mt-3">{s.title}</h3>
              <p className="text-xs text-[#94a3b8] mt-2 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 px-6 max-w-4xl mx-auto border-t border-white/[0.06]">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Dúvidas Frequentes</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mt-2">Perguntas & Respostas</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((f, i) => (
            <div
              key={i}
              className="rounded-xl bg-[#0b0f17] border border-white/[0.06] overflow-hidden"
            >
              <button
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                className="w-full px-6 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.02]"
              >
                <span className="font-medium text-sm sm:text-base text-white">{f.q}</span>
                <ChevronDown
                  className={`w-5 h-5 text-[#94a3b8] transition-transform ${activeFaq === i ? "rotate-180" : ""}`}
                />
              </button>
              {activeFaq === i && (
                <div className="px-6 pb-4 text-sm text-[#94a3b8] leading-relaxed border-t border-white/[0.04] pt-3">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/[0.06] text-center text-xs text-[#64748b]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">SureThing AI</span>
            <span>— Clonado com Motor Completo & ReAct Multi-Agente</span>
          </div>
          <button
            onClick={onEnterDashboard}
            className="px-4 py-2 rounded-xl bg-white text-black font-semibold hover:bg-neutral-200 transition-all cursor-pointer"
          >
            Abrir Painel
          </button>
        </div>
      </footer>
    </div>
  );
}
