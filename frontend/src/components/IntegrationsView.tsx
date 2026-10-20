// frontend/src/components/IntegrationsView.tsx
import { useState, useEffect, type FormEvent } from "react";
import type { Integration } from "../types";
import { getIntegrations, updateIntegration } from "../api";
import {
  Search,
  Plug,
  X,
} from "lucide-react";

interface IntegrationsViewProps {
  /** Reservado para navegação ao Studio a partir de um card de integração. */
  onGoToStudio?: (agentId?: string) => void;
}

export function IntegrationsView(props: IntegrationsViewProps) {
  void props;
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activeModalApp, setActiveModalApp] = useState<Integration | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [webhookInput, setWebhookInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const res = await getIntegrations();
      setIntegrations(res.integrations);
    } catch (err) {
      console.error("Error loading integrations", err);
    }
  };

  const categories = [
    { id: "all", label: "Todas" },
    { id: "Prospecção", label: "Prospecção & B2B" },
    { id: "Colaboração", label: "Colaboração" },
    { id: "CRM & Vendas", label: "CRM & Vendas" },
    { id: "Produtividade", label: "Produtividade" },
    { id: "Design", label: "Design & Criativo" },
    { id: "Finanças", label: "Finanças" },
    { id: "E-commerce", label: "E-commerce" },
    { id: "Automação", label: "Automação" },
  ];

  const filtered = integrations.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenConfig = (item: Integration) => {
    setActiveModalApp(item);
    try {
      const creds = JSON.parse(item.credentials_json || "{}");
      setApiKeyInput(creds.apiKey || creds.token || "");
      setWebhookInput(creds.webhookUrl || "");
    } catch {
      setApiKeyInput("");
      setWebhookInput("");
    }
  };

  const handleSaveConnection = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeModalApp) return;

    setSaving(true);
    try {
      const credsObj = { apiKey: apiKeyInput, webhookUrl: webhookInput };
      const isConnected = apiKeyInput.trim() || webhookInput.trim() ? 1 : 0;
      await updateIntegration(activeModalApp.id, {
        is_connected: isConnected,
        credentials_json: JSON.stringify(credsObj),
      });
      setActiveModalApp(null);
      loadIntegrations();
    } catch (err) {
      alert("Erro ao salvar integração: " + String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await updateIntegration(id, { is_connected: 0, credentials_json: "{}" });
      setActiveModalApp(null);
      loadIntegrations();
    } catch (err) {
      alert("Erro ao desconectar: " + String(err));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#07090e] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Conectar Aplicativos & Dados</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
              Ecossistema Aberto
            </span>
          </div>
          <p className="text-xs text-[#94a3b8] mt-1">
            Conecte suas fontes de prospecção (People Data Labs, LinkedIn, Google Maps, Meta Ads), CRMs, e-mails e automações aos agentes.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar aplicativo..."
            className="w-full bg-black/40 border border-white/[0.1] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="px-6 py-3 border-b border-white/[0.04] bg-[#090c13] flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === c.id
                ? "bg-purple-600 text-white font-semibold shadow-sm"
                : "text-[#94a3b8] hover:text-white hover:bg-white/[0.03]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid of Integrations */}
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 custom-scrollbar">
        {filtered.map((item) => {
          const isConnected = item.is_connected === 1;
          return (
            <div
              key={item.id}
              onClick={() => handleOpenConfig(item)}
              className="p-5 rounded-2xl bg-[#0b0f17] border border-white/[0.06] hover:border-purple-500/30 transition-all flex flex-col justify-between cursor-pointer group hover:bg-[#0e1320]"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-300 font-bold text-sm">
                    {item.name.charAt(0)}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      isConnected
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                        : "bg-white/[0.04] text-[#64748b] border-white/[0.06]"
                    }`}
                  >
                    {isConnected ? "● Conectado" : "Disponível"}
                  </span>
                </div>

                <div className="mt-3">
                  <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                    {item.name}
                  </h3>
                  <span className="text-[10px] text-purple-400 font-medium">{item.category}</span>
                  <p className="text-xs text-[#94a3b8] mt-2 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-white/[0.04] flex items-center justify-between text-xs">
                <span className="text-[11px] text-[#64748b]">
                  {isConnected ? "Ativo no pipeline" : "Clique para conectar"}
                </span>
                <span className="text-xs font-semibold text-purple-400 group-hover:translate-x-0.5 transition-transform">
                  Configurar →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Conexão / Credenciais */}
      {activeModalApp && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f17] border border-white/[0.1] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold">
                  {activeModalApp.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{activeModalApp.name}</h3>
                  <p className="text-xs text-[#94a3b8]">{activeModalApp.category}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalApp(null)}
                className="p-1 rounded-lg text-[#94a3b8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#94a3b8] mt-4 leading-relaxed">
              {activeModalApp.description}
            </p>

            <form onSubmit={handleSaveConnection} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">
                  Chave de API / Token de Acesso
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Insira sua chave (ex: sk_live_... / gl_... / token)"
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">
                  Webhook URL (Opcional)
                </label>
                <input
                  type="text"
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                  placeholder="https://hooks.zapier.com/... ou https://hook.make.com/..."
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
                {activeModalApp.is_connected === 1 ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(activeModalApp.id)}
                    className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    Desconectar
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveModalApp(null)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-[#94a3b8] hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Salvar & Conectar"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
