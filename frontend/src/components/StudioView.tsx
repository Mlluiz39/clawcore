// frontend/src/components/StudioView.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import type { Agent, Conversation, Message } from "../types";
import { getConversations, createConversation, getMessages, deleteConversation } from "../api";
import {
  Send,
  PlusCircle,
  Trash2,
  Sparkles,
  Loader2,
  ArrowRight,
  Inbox,
  Zap,
} from "lucide-react";
import { renderMarkdown } from "../markdown";
import { parseRoutineMetadata } from "../routine-metadata";

interface StudioViewProps {
  agents: Agent[];
  initialAgentId?: string;
  onGoToInbox: () => void;
}

/** Lê a atribuição gravada pelo backend; metadado inválido é ignorado em vez de quebrar o thread. */
export function StudioView({ agents, initialAgentId, onGoToInbox }: StudioViewProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgentId || "cmo");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  useEffect(() => {
    if (initialAgentId) {
      setSelectedAgentId(initialAgentId);
    }
  }, [initialAgentId]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await getConversations(selectedAgentId);
      setConversations(res.conversations);
      if (res.conversations.length > 0) {
        setActiveConvId(res.conversations[0].id);
      } else {
        setActiveConvId(null);
      }
    } catch (err) {
      console.error("Error loading conversations", err);
    }
  }, [selectedAgentId]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await getMessages(convId);
      // Não sobrescreve o envio em andamento com o estado antigo do servidor.
      if (isStreamingRef.current) return;
      setMessages(res.messages);
    } catch (err) {
      console.error("Error loading messages", err);
    }
  }, []);

  // Load conversations when agent changes
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Load messages when activeConvId changes
  useEffect(() => {
    if (activeConvId) {
      void loadMessages(activeConvId);
    } else {
      setMessages([]);
    }
  }, [activeConvId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Rotinas publicam no thread do agente em segundo plano: sem isso, a mensagem
  // proativa só apareceria ao recarregar a conversa.
  useEffect(() => {
    if (isStreaming) return;

    const interval = setInterval(() => {
      if (isStreamingRef.current) return;
      if (activeConvId) {
        void loadMessages(activeConvId);
      } else {
        void loadConversations();
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [activeConvId, isStreaming, loadMessages, loadConversations]);

  const handleNewConversation = async () => {
    try {
      const res = await createConversation(selectedAgentId);
      setConversations([res.conversation, ...conversations]);
      setActiveConvId(res.conversation.id);
      setMessages([]);
    } catch (err) {
      alert("Erro ao criar conversa: " + String(err));
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Excluir esta conversa?")) return;
    try {
      await deleteConversation(convId);
      const updated = conversations.filter((c) => c.id !== convId);
      setConversations(updated);
      if (activeConvId === convId) {
        setActiveConvId(updated.length > 0 ? updated[0].id : null);
      }
    } catch (err) {
      alert("Erro ao excluir conversa: " + String(err));
    }
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isStreaming) return;

    setInput("");
    const userMsg: Message = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    isStreamingRef.current = true;
    setIsStreaming(true);

    try {
      // A sessão vai no cookie HttpOnly — `credentials: "include"` o anexa.
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          conversationId: activeConvId,
          agentId: selectedAgentId,
        }),
      });

      if (!response.ok) {
        throw new Error("Erro no servidor");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMsgContent = "";

      // Add placeholder assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", isStreaming: true, agentId: selectedAgentId },
      ]);

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "conv_id" && !activeConvId) {
                  setActiveConvId(data.conversationId);
                  loadConversations();
                } else if (data.type === "chunk") {
                  assistantMsgContent += data.content;
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant") {
                      last.content = assistantMsgContent;
                    }
                    return next;
                  });
                } else if (data.type === "discard") {
                  // O texto transmitido era raciocínio interno de uma rodada que
                  // acabou chamando ferramenta — não é a resposta final.
                  assistantMsgContent = "";
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant") {
                      last.content = "";
                    }
                    return next;
                  });
                } else if (data.type === "done") {
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant") {
                      last.isStreaming = false;
                    }
                    return next;
                  });
                } else if (data.type === "error" && data.message) {
                  assistantMsgContent = data.message;
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant") {
                      last.content = data.message;
                      last.isStreaming = false;
                    }
                    return next;
                  });
                }
              } catch {
                // Ignore parse errors on SSE
              }
            }
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Erro ao processar mensagem. Verifique a chave de API nas Configurações.",
        },
      ]);
    } finally {
      isStreamingRef.current = false;
      setIsStreaming(false);
    }
  };

  // Starters by Agent
  const getPromptStarters = () => {
    switch (selectedAgentId) {
      case "cmo":
        return [
          "Gere 3 posts para o LinkedIn focados em conversão B2B com gancho forte",
          "Crie uma campanha de anúncios do Meta com 3 variações de copy e criativo",
          "Produza um roteiro de carrossel para Instagram de 6 slides sobre nosso nicho",
        ];
      case "coo":
        return [
          "Elabore o plano operacional desta semana priorizando as metas de crescimento",
          "Analise o status dos entregáveis recentes e aponte gargalos",
          "Crie uma pauta de alinhamento estratégico para o time de marketing e vendas",
        ];
      case "researcher":
        return [
          "Faça uma pesquisa de inteligência sobre os 3 maiores concorrentes do nosso mercado",
          "Quais são as principais dores do nosso público-alvo e como podemos atacá-las?",
          "Identifique 5 tendências em alta para o nosso nicho nos próximos meses",
        ];
      case "engineer":
        return [
          "Especifique uma arquitetura de automação para capturar leads e enviar para o CRM",
          "Crie um script em Python para enriquecer contatos com dados públicos da web",
          "Audite nosso fluxo de publicação de conteúdo e sugira melhorias técnicas",
        ];
      case "prospector":
        return [
          "Prospectar clínicas de estética em Fortaleza-CE: busque 15 no Google Maps, filtre quem anuncia na Meta e audite sites",
          "Mapear 10 empresas de SaaS B2B e identificar decisores (CEOs/Sócios) via PDL e LinkedIn com contatos",
          "Fazer auditoria técnica de velocidade mobile (Lighthouse) e SEO básico nos concorrentes do nosso nicho",
        ];
      default:
        return [
          "Como você pode me ajudar a acelerar a operação hoje?",
          "Gere um entregável com uma proposta acionável para o nosso negócio",
        ];
    }
  };

  return (
    <div className="flex-1 flex h-screen bg-[#07090e] overflow-hidden">
      {/* Conversations Sub-Sidebar */}
      <div className="w-64 border-r border-white/[0.06] bg-[#090c13] flex flex-col justify-between shrink-0">
        <div>
          {/* Agent Picker Header */}
          <div className="p-4 border-b border-white/[0.06]">
            <span className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider block mb-2">
              Agente em Foco
            </span>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-[#121824] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </div>

          {/* Conversations header */}
          <div className="p-3 flex items-center justify-between">
            <span className="text-xs font-medium text-[#94a3b8]">Conversas</span>
            <button
              onClick={handleNewConversation}
              className="p-1 rounded-lg hover:bg-white/[0.05] text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
              title="Nova conversa"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>

          {/* Conversations list */}
          <div className="px-2 space-y-1 overflow-y-auto max-h-[calc(100vh-180px)] custom-scrollbar">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#64748b]">Nenhuma conversa gravada.</div>
            ) : (
              conversations.map((c) => {
                const isActive = activeConvId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveConvId(c.id)}
                    className={`group w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                      isActive
                        ? "bg-purple-600/15 text-purple-200 border border-purple-500/30 font-medium"
                        : "text-[#94a3b8] hover:bg-white/[0.03] hover:text-white"
                    }`}
                  >
                    <span className="truncate pr-2">{c.title}</span>
                    <button
                      onClick={(e) => handleDeleteConversation(c.id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Link to Inbox */}
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={onGoToInbox}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border border-purple-500/20 text-xs font-medium transition-all cursor-pointer"
          >
            <Inbox className="w-4 h-4" />
            <span>Ver Fila na Inbox</span>
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-[#07090e]">
        {/* Chat Top Banner */}
        <div className="p-4 px-6 border-b border-white/[0.06] flex items-center justify-between bg-[#080b11]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold">
              ✦
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                {selectedAgent?.name}
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[#cbd5e1] font-normal">
                  {selectedAgent?.role}
                </span>
              </h2>
              <p className="text-xs text-[#94a3b8]">{selectedAgent?.description}</p>
            </div>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="max-w-xl mx-auto py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mx-auto mb-4">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-white">Como o {selectedAgent?.name} pode ajudar agora?</h3>
              <p className="text-xs text-[#94a3b8] mt-2 leading-relaxed">
                Este agente é configurado para gerar entregáveis estruturados. Se você pedir conteúdo ou relatórios,
                ele enviará o resultado final para a sua Inbox de aprovação.
              </p>

              {/* Starters */}
              <div className="mt-8 space-y-2 text-left">
                <span className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider block mb-2">
                  Sugestões de Ação Rápida
                </span>
                {getPromptStarters().map((starter, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(starter)}
                    className="w-full p-3 rounded-xl bg-[#0e131d] hover:bg-[#141b29] border border-white/[0.06] hover:border-purple-500/30 text-xs text-[#cbd5e1] transition-all flex items-center justify-between cursor-pointer group"
                  >
                    <span>{starter}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#64748b] group-hover:text-purple-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const routine = parseRoutineMetadata(msg);
              return (
                <div
                  key={i}
                  className={`flex gap-3 max-w-3xl ${isUser ? "ml-auto justify-end" : "mr-auto justify-start"}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold shrink-0 text-xs">
                      ✦
                    </div>
                  )}

                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? "bg-purple-600 text-white rounded-tr-none shadow-md"
                        : "bg-[#0d121c] text-[#e2e8f0] border border-white/[0.06] rounded-tl-none shadow-sm"
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <>
                        <div
                          className="prose prose-invert max-w-none text-xs sm:text-sm"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                        {msg.isStreaming && (
                          <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1 align-middle" />
                        )}

                        {/* Atribuição de execução automática, no formato observado no SureThing */}
                        {routine && (
                          <div className="mt-3 pt-3 border-t border-white/[0.08] text-[11px] text-[#8194ad] flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                              <Zap className="w-3 h-3" aria-hidden="true" />
                              Proativo
                            </span>
                            <span>
                              {routine.trigger === "manual" ? "Disparo manual" : "Rotina"} · {routine.routine_title}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{routine.frequency === "hourly" ? "A cada hora" : routine.frequency === "daily" ? "Diária" : "Semanal"}</span>
                            {routine.duration_ms > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Trabalhou por {Math.round(routine.duration_ms / 1000)}s</span>
                              </>
                            )}
                            {routine.steps > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{routine.steps} {routine.steps === 1 ? "passo" : "passos"}</span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Hint for Deliverable Created */}
                        {msg.content.includes("create_deliverable") || msg.content.includes("pending_approval") ? (
                          <div className="mt-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
                            <span className="text-xs text-purple-300 font-medium">
                              📦 Novo entregável registrado na Inbox!
                            </span>
                            <button
                              onClick={onGoToInbox}
                              className="text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors cursor-pointer"
                            >
                              Ver e Aprovar
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-white/[0.06] bg-[#080b11]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 max-w-4xl mx-auto"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Mensagem para ${selectedAgent?.name}... (ex: Gere 3 posts ou analise concorrentes)`}
              disabled={isStreaming}
              className="flex-1 bg-[#0f1420] border border-white/[0.1] rounded-2xl px-4 py-3.5 text-xs sm:text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500 disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
            >
              {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
