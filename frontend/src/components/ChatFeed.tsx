// frontend/src/components/ChatFeed.tsx
//
// Lista de mensagens + caixa de entrada do chat do projeto.
//
// Extraído de ProjectWorkspaceView: é um bloco autocontido que só depende das
// mensagens, do agente selecionado e de alguns callbacks.
import type { RefObject, FormEvent } from "react";
import { Bot, Check, Copy, ThumbsUp, ThumbsDown, Loader2, Send, ArrowRight, FileSpreadsheet } from "lucide-react";
import type { Agent, Deliverable, Message } from "../types";
import { renderMarkdown } from "../markdown";
import { parseRoutineMetadata } from "../routine-metadata";

interface ChatFeedProps {
  messages: Message[];
  agents: Agent[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  deliverables: Deliverable[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isStreaming: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  copiedMsgId: string | null;
  onCopyMessage: (id: string, text: string) => void;
  onGoToInbox?: () => void;
  onGoToStudio?: (agentId?: string) => void;
}

export function ChatFeed({
  messages,
  agents,
  selectedAgentId,
  onSelectAgent,
  deliverables,
  input,
  onInputChange,
  onSubmit,
  isStreaming,
  messagesEndRef,
  copiedMsgId,
  onCopyMessage,
  onGoToInbox,
  onGoToStudio,
}: ChatFeedProps) {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0d14]/60">
      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-[#64748b] text-xs">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-400" />
            <p>Nenhuma mensagem nesta conversa ainda.</p>
            <p className="mt-1 text-[11px] text-[#475569]">
              Pergunte algo ou solicite uma tarefa para a equipe do projeto.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const meta = parseRoutineMetadata(msg);
          const isAssistant = msg.role === "assistant";
          const msgKey = msg.id || `msg-${idx}`;

          return (
            <div
              key={msgKey}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              {/* Badge Proactive */}
              {meta && (
                <div className="flex items-center gap-2 mb-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold">Proactive</span>
                  <span className="text-[#64748b]">·</span>
                  <span>Worked for {Math.round(meta.duration_ms / 1000)}s</span>
                  <span className="text-[#64748b]">·</span>
                  <span>{meta.steps} steps</span>
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                    : "bg-[#121622] text-[#e2e8f0] border border-white/[0.06]"
                }`}
              >
                {/* Cabeçalho de rotina */}
                {meta && (
                  <div className="mb-2 pb-2 border-b border-white/[0.08] flex items-center justify-between text-[11px] text-[#94a3b8]">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px]">
                        Fired
                      </span>
                      <span className="font-semibold text-white">{meta.routine_title}</span>
                    </div>
                  </div>
                )}

                {/* Conteúdo Markdown (sanitizado em ../markdown) */}
                <div
                  className="prose prose-invert prose-xs max-w-none break-words"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />

                {/* Card de Entregável Acoplado (caso haja entregáveis no projeto) */}
                {isAssistant && deliverables.length > 0 && idx === messages.length - 1 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="p-2.5 rounded-xl bg-[#0f172a] border border-emerald-500/30 flex items-center justify-between hover:border-emerald-500/50 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-white truncate font-medium">
                            {deliverables[0].title}.csv
                          </p>
                          <span className="text-[10px] text-emerald-400 font-mono uppercase">
                            CSV · Pronto
                          </span>
                        </div>
                      </div>
                      {onGoToInbox && (
                        <button
                          onClick={onGoToInbox}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold transition-colors cursor-pointer"
                        >
                          Ver Inbox
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Ações da Mensagem */}
              {isAssistant && !msg.isStreaming && (
                <div className="flex items-center gap-1 mt-1 px-1 text-[#64748b]">
                  <button
                    onClick={() => onCopyMessage(msgKey, msg.content)}
                    title="Copiar resposta"
                    className="p-1 hover:text-white rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
                    {copiedMsgId === msgKey ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    title="Útil"
                    className="p-1 hover:text-white rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    title="Não foi útil"
                    className="p-1 hover:text-white rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() =>
                      alert("Credit Rescue: verificação de execução sem débito registrada.")
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded text-[#94a3b8] hover:text-purple-300 hover:bg-purple-500/10 transition-colors cursor-pointer"
                  >
                    ✦ Credit Rescue
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de Chat */}
      <div className="p-3 border-t border-white/[0.06] bg-[#0c101a]">
        <div className="flex items-center justify-between mb-2 text-[11px] text-[#94a3b8]">
          <div className="flex items-center gap-1.5">
            <span>Talk to:</span>
            <select
              value={selectedAgentId}
              onChange={(e) => onSelectAgent(e.target.value)}
              className="bg-[#161b26] border border-white/[0.08] text-white text-[11px] rounded-lg px-2 py-0.5 cursor-pointer outline-none focus:border-purple-500"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </div>
          {onGoToStudio && (
            <button
              onClick={() => onGoToStudio(selectedAgentId)}
              className="hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
            >
              <span>Abrir no Studio</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <form onSubmit={onSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            disabled={isStreaming}
            placeholder="Boss, what stresses you out? Hand it over."
            className="w-full bg-[#121622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 pr-20 text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500/50"
          />
          <div className="absolute right-1.5 flex items-center gap-1">
            <span className="text-[10px] font-mono text-[#64748b] px-1.5 py-0.5 rounded bg-white/[0.02]">
              Smart ▾
            </span>
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors cursor-pointer"
            >
              {isStreaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
