// frontend/src/components/DeliverablesView.tsx
import { useState } from "react";
import type { Deliverable } from "../types";
import { approveDeliverable, deleteDeliverable } from "../api";
import {
  Layers,
  Check,
  X,
  Trash2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { renderMarkdown } from "../markdown";

interface DeliverablesViewProps {
  deliverables: Deliverable[];
  onRefresh: () => void;
  onGoToStudio: (agentId?: string) => void;
}

export function DeliverablesView({ deliverables, onRefresh, onGoToStudio }: DeliverablesViewProps) {
  const [selectedItem, setSelectedItem] = useState<Deliverable | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [copySuccess, setCopySuccess] = useState(false);

  const filtered = deliverables.filter((d) => {
    const matchSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.summary.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchType = typeFilter === "all" || d.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleApprove = async (id: string) => {
    try {
      await approveDeliverable(id, true);
      onRefresh();
      if (selectedItem?.id === id) {
        setSelectedItem({ ...selectedItem, status: "published" });
      }
    } catch (err) {
      alert("Erro ao aprovar: " + String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir entregável?")) return;
    try {
      await deleteDeliverable(id);
      onRefresh();
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch (err) {
      alert("Erro ao excluir: " + String(err));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#07090e] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Biblioteca de Entregáveis</h2>
          </div>
          <p className="text-xs text-[#94a3b8] mt-1">
            Todo o acervo de conteúdo, relatórios, campanhas e documentos gerados pelos agentes.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar entregáveis..."
            className="w-48 bg-black/40 border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-black/40 border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
          >
            <option value="all">Todos os Status</option>
            <option value="pending_approval">Pendentes</option>
            <option value="approved">Aprovados</option>
            <option value="published">Publicados</option>
            <option value="rejected">Rejeitados</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-black/40 border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
          >
            <option value="all">Todos os Tipos</option>
            <option value="social_pack">Redes Sociais</option>
            <option value="ad_campaign">Campanhas</option>
            <option value="research_brief">Pesquisa</option>
            <option value="prospect_list">Prospecção B2B</option>
            <option value="landing_page_copy">Landing Page</option>
            <option value="email_sequence">E-mails</option>
            <option value="custom">Outros</option>
          </select>
        </div>
      </div>

      {/* Grid List */}
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-24 text-[#64748b]">
            <Layers className="w-12 h-12 mx-auto stroke-1 opacity-50 mb-3" />
            <p className="text-sm font-medium text-white">Nenhum entregável encontrado</p>
            <p className="text-xs mt-1">Crie posts com o CMO ou relatórios com o Pesquisador no Studio.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="p-5 rounded-2xl bg-[#0b0f17] border border-white/[0.06] hover:border-purple-500/30 transition-all flex flex-col justify-between cursor-pointer group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-[#cbd5e1] font-mono uppercase">
                    {item.type.replace("_", " ")}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                      item.status === "pending_approval"
                        ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                        : item.status === "approved" || item.status === "published"
                        ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-300 border border-red-500/20"
                    }`}
                  >
                    {item.status === "pending_approval"
                      ? "Pendente"
                      : item.status === "published"
                      ? "Publicado"
                      : item.status === "approved"
                      ? "Aprovado"
                      : "Rejeitado"}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-[#94a3b8] mt-1 line-clamp-3 leading-relaxed">{item.summary}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px] text-[#64748b]">
                <span>Agente: <strong className="text-white uppercase">{item.agent_id}</strong></span>
                <span>{new Date(item.created_at * 1000).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Details Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f17] border border-white/[0.1] rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between pb-4 border-b border-white/[0.06]">
                <div>
                  <span className="text-[11px] font-mono text-purple-400 uppercase">
                    {selectedItem.type.replace("_", " ")} • {selectedItem.agent_id}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">{selectedItem.title}</h3>
                  <p className="text-xs text-[#94a3b8] mt-1">{selectedItem.summary}</p>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1.5 rounded-lg text-[#94a3b8] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-black/40 border border-white/[0.06] max-h-[420px] overflow-y-auto custom-scrollbar text-xs text-[#cbd5e1] leading-relaxed">
                <div
                  className="prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedItem.content_json) }}
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyContent(selectedItem.content_json)}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copySuccess ? "Copiado!" : "Copiar"}</span>
                </button>
                <button
                  onClick={() => handleDelete(selectedItem.id)}
                  className="p-2 rounded-xl text-[#64748b] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedItem.status === "pending_approval" && (
                  <button
                    onClick={() => handleApprove(selectedItem.id)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Aprovar Agora</span>
                  </button>
                )}
                <button
                  onClick={() => onGoToStudio(selectedItem.agent_id)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Abrir no Studio</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
