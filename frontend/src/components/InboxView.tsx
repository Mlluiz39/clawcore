// frontend/src/components/InboxView.tsx
import { useState } from "react";
import type { Deliverable } from "../types";
import { approveDeliverable, rejectDeliverable, deleteDeliverable } from "../api";
import {
  Inbox,
  Check,
  X,
  Layers,
  Trash2,
  ExternalLink,
  Copy,
} from "lucide-react";
import { marked } from "marked";

interface InboxViewProps {
  deliverables: Deliverable[];
  onRefresh: () => void;
  onGoToStudio: (agentId?: string) => void;
}

export function InboxView({ deliverables, onRefresh, onGoToStudio }: InboxViewProps) {
  const [selectedItem, setSelectedItem] = useState<Deliverable | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const pending = deliverables.filter((d) => d.status === "pending_approval");
  const processed = deliverables.filter((d) => d.status !== "pending_approval");

  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  const list = activeTab === "pending" ? pending : processed;

  const handleApprove = async (id: string, publishNow: boolean) => {
    setActionLoading(true);
    try {
      await approveDeliverable(id, publishNow);
      onRefresh();
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch (err) {
      alert("Erro ao aprovar entregável: " + String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedItem) return;
    setActionLoading(true);
    try {
      await rejectDeliverable(selectedItem.id, rejectNotes);
      setShowRejectModal(false);
      setRejectNotes("");
      onRefresh();
      setSelectedItem(null);
    } catch (err) {
      alert("Erro ao rejeitar: " + String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este entregável permanentemente?")) return;
    try {
      await deleteDeliverable(id);
      onRefresh();
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch (err) {
      alert("Erro ao excluir: " + String(err));
    }
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const getAgentLabel = (agentId: string) => {
    switch (agentId) {
      case "cmo":
        return { name: "Sofia Rios", role: "CMO", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" };
      case "coo":
        return { name: "Alex Vance", role: "COO", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
      case "researcher":
        return { name: "Dr. Eric Hunt", role: "Pesquisador", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
      case "engineer":
        return { name: "Leo Chen", role: "Engenheiro", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
      case "prospector":
        return { name: "Marcus Cole", role: "Prospector B2B", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" };
      default:
        return { name: agentId, role: "Agente", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" };
    }
  };

  const renderContentFormatted = (contentRaw: string) => {
    try {
      const parsed = JSON.parse(contentRaw);
      return (
        <pre className="text-xs font-mono bg-black/40 p-4 rounded-xl overflow-x-auto text-[#cbd5e1] border border-white/[0.06]">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return (
        <div
          className="prose prose-invert max-w-none text-sm text-[#cbd5e1] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: marked.parse(contentRaw) as string }}
        />
      );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#07090e] overflow-hidden">
      {/* Top Header */}
      <div className="p-6 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Inbox de Aprovações</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
              Human-in-the-Loop
            </span>
          </div>
          <p className="text-xs text-[#94a3b8] mt-1">
            Revise, edite e aprove os entregáveis produzidos pelos seus agentes antes da publicação ou execução.
          </p>
        </div>

        {/* Tab Filter */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "pending"
                ? "bg-purple-600 text-white font-semibold shadow-sm"
                : "text-[#94a3b8] hover:text-white"
            }`}
          >
            Pendentes ({pending.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "history"
                ? "bg-purple-600 text-white font-semibold shadow-sm"
                : "text-[#94a3b8] hover:text-white"
            }`}
          >
            Histórico ({processed.length})
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Deliverables List */}
        <div className="w-1/2 border-r border-white/[0.06] overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {list.length === 0 ? (
            <div className="text-center py-24 text-[#64748b]">
              <Inbox className="w-12 h-12 mx-auto stroke-1 opacity-50 mb-3" />
              <p className="text-sm font-medium text-white">
                {activeTab === "pending" ? "Nenhum entregável pendente na fila!" : "Nenhum histórico registrado."}
              </p>
              <p className="text-xs mt-1 max-w-xs mx-auto">
                {activeTab === "pending"
                  ? "Peça para o CMO gerar posts ou o Pesquisador analisar o mercado no Studio."
                  : "Os materiais aprovados ou rejeitados aparecerão aqui."}
              </p>
              {activeTab === "pending" && (
                <button
                  onClick={() => onGoToStudio("cmo")}
                  className="mt-4 px-4 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-medium border border-purple-500/30 transition-all cursor-pointer"
                >
                  Pedir entregável no Studio
                </button>
              )}
            </div>
          ) : (
            list.map((item) => {
              const agent = getAgentLabel(item.agent_id);
              const isSelected = selectedItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-purple-600/15 border-purple-500/40 shadow-lg shadow-purple-500/5"
                      : "bg-[#0b0f17] border-white/[0.06] hover:border-white/[0.15]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${agent.color}`}>
                      {agent.name} • {agent.role}
                    </span>
                    <span className="text-[11px] text-[#64748b]">
                      {new Date(item.created_at * 1000).toLocaleDateString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white tracking-tight">{item.title}</h3>
                  <p className="text-xs text-[#94a3b8] mt-1 line-clamp-2 leading-relaxed">{item.summary}</p>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/[0.04]">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[#64748b]">
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
                        ? "Aguardando Aprovação"
                        : item.status === "published"
                        ? "Publicado"
                        : item.status === "approved"
                        ? "Aprovado"
                        : "Rejeitado"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Deliverable Details & Actions */}
        <div className="w-1/2 flex flex-col bg-[#080b11] overflow-y-auto custom-scrollbar">
          {selectedItem ? (
            <div className="p-6 flex flex-col h-full justify-between">
              <div>
                {/* Header of Item */}
                <div className="flex items-start justify-between pb-4 border-b border-white/[0.06]">
                  <div>
                    <span className="text-xs font-mono uppercase text-[#64748b]">ID: {selectedItem.id}</span>
                    <h2 className="text-lg font-bold text-white mt-1">{selectedItem.title}</h2>
                    <p className="text-xs text-[#94a3b8] mt-1">{selectedItem.summary}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(selectedItem.id)}
                    className="p-2 rounded-lg text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Content Box */}
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white uppercase tracking-wider">Conteúdo do Entregável</span>
                    <button
                      onClick={() => copyContent(selectedItem.content_json)}
                      className="text-xs text-[#94a3b8] hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copySuccess ? "Copiado!" : "Copiar"}</span>
                    </button>
                  </div>

                  <div className="p-5 rounded-2xl bg-black/30 border border-white/[0.06] max-h-[460px] overflow-y-auto custom-scrollbar">
                    {renderContentFormatted(selectedItem.content_json)}
                  </div>
                </div>

                {selectedItem.review_notes && (
                  <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                    <strong>Motivo da rejeição/ajuste:</strong> {selectedItem.review_notes}
                  </div>
                )}
              </div>

              {/* Action Buttons for Pending Items */}
              {selectedItem.status === "pending_approval" ? (
                <div className="pt-6 border-t border-white/[0.06] flex items-center gap-3">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleApprove(selectedItem.id, false)}
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Aprovar entregável</span>
                  </button>

                  <p className="text-xs text-[#94a3b8]">Aprovação salva decisão. Publicação externa deve ser feita manualmente.</p>

                  <button
                    disabled={actionLoading}
                    onClick={() => setShowRejectModal(true)}
                    className="py-3 px-4 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 font-medium text-xs transition-all border border-red-500/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    <span>Rejeitar</span>
                  </button>
                </div>
              ) : (
                <div className="pt-6 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#64748b]">
                  <span>Status atual: <strong className="text-white capitalize">{selectedItem.status}</strong></span>
                  <button
                    onClick={() => onGoToStudio(selectedItem.agent_id)}
                    className="text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <span>Conversar com o Agente no Studio</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#64748b]">
              <Layers className="w-12 h-12 stroke-1 opacity-40 mb-3" />
              <p className="text-sm font-medium text-white">Selecione um entregável na lista</p>
              <p className="text-xs mt-1 max-w-xs">
                Visualize os dados completos, copie o material ou execute a decisão humana de aprovação.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f17] border border-white/[0.1] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Rejeitar ou Solicitar Ajustes</h3>
            <p className="text-xs text-[#94a3b8] mt-1">
              Descreva o motivo da recusa ou quais alterações você gostaria que o agente fizesse.
            </p>

            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Ex: O gancho do 1º post ficou muito genérico, reescrever focando no público de SaaS..."
              className="mt-4 w-full h-28 p-3 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500 resize-none"
            />

            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#94a3b8] hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={actionLoading}
                onClick={handleReject}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs cursor-pointer disabled:opacity-50"
              >
                Confirmar Rejeição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
