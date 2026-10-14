// frontend/src/components/AgentsView.tsx
import { useState, type FormEvent } from "react";
import type { Agent } from "../types";
import { createAgent, deleteAgent } from "../api";
import {
  Bot,
  Plus,
  Briefcase,
  Share2,
  Search,
  Code,
  Trash2,
  ArrowRight,
} from "lucide-react";

interface AgentsViewProps {
  agents: Agent[];
  onRefresh: () => void;
  onSelectAgentToChat: (agentId: string) => void;
}

export function AgentsView({ agents, onRefresh, onSelectAgentToChat }: AgentsViewProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !role || !description || !systemPrompt) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    try {
      await createAgent({
        name,
        role,
        avatar: "bot",
        description,
        system_prompt: systemPrompt,
      });
      setShowCreateModal(false);
      setName("");
      setRole("");
      setDescription("");
      setSystemPrompt("");
      onRefresh();
    } catch (err) {
      alert("Erro ao criar agente: " + String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este agente personalizado?")) return;
    try {
      await deleteAgent(id);
      onRefresh();
    } catch (err) {
      alert("Erro ao excluir agente: " + String(err));
    }
  };

  const getIcon = (id: string) => {
    switch (id) {
      case "coo":
        return Briefcase;
      case "cmo":
        return Share2;
      case "researcher":
        return Search;
      case "engineer":
        return Code;
      default:
        return Bot;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#07090e] overflow-y-auto p-8 custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-white/[0.06] max-w-6xl mx-auto w-full">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Diretório de Agentes</h2>
          </div>
          <p className="text-xs text-[#94a3b8] mt-1">
            Sua equipe executiva de inteligência artificial. Cada agente opera com especialização máxima e memória compartilhada.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Agente Customizado</span>
        </button>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto w-full mt-8">
        {agents.map((agent) => {
          const Icon = getIcon(agent.id);
          const tools = JSON.parse(agent.tools || "[]");

          return (
            <div
              key={agent.id}
              className="p-6 rounded-2xl bg-[#0b0f17] border border-white/[0.06] hover:border-purple-500/30 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-300">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        {agent.name}
                        {agent.is_builtin === 1 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[#cbd5e1] font-normal">
                            Nativo
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-purple-400 font-medium">{agent.role}</p>
                    </div>
                  </div>

                  {agent.is_builtin === 0 && (
                    <button
                      onClick={() => handleDelete(agent.id)}
                      className="p-1.5 rounded-lg text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <p className="mt-4 text-xs text-[#94a3b8] leading-relaxed">{agent.description}</p>

                {/* Active Tools List */}
                <div className="mt-4 pt-4 border-t border-white/[0.04]">
                  <span className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider block mb-2">
                    Ferramentas Conectadas ({tools.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((t: string) => (
                      <span
                        key={t}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.03] text-[#94a3b8] font-mono border border-white/[0.04]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-[11px] text-[#64748b]">Compartilha o cérebro da empresa</span>
                <button
                  onClick={() => onSelectAgentToChat(agent.id)}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-purple-600 hover:text-white text-xs font-semibold text-white transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Abrir no Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Criar Agente */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f17] border border-white/[0.1] rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Criar Agente Personalizado</h3>
            <p className="text-xs text-[#94a3b8] mt-1">
              Adicione um novo especialista à agência definindo seu foco e instruções comportamentais.
            </p>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Nome do Agente</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Clara Mendes"
                  required
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Cargo / Especialidade</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Ex: Copywriter de E-mail & Cold Outreach"
                  required
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Descrição Breve</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Cria sequências de e-mail de alta conversão para inbound e prospecção."
                  required
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Instruções do Sistema (Prompt)</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Defina como o agente deve agir, critérios de qualidade e quando chamar create_deliverable..."
                  rows={4}
                  required
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#94a3b8] hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  Salvar Agente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
