// frontend/src/components/SettingsView.tsx
import { useState, useEffect, type FormEvent } from "react";
import type { SystemStats } from "../types";
import { getSettings, updateSettings, testSettings, getStatus } from "../api";
import {
  Settings,
  Cpu,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";

export function SettingsView() {
  const [settings, setSettings] = useState<{ baseURL: string; model: string; apiKeyMasked: string; source: string } | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);

  // Edit fields
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [sRes, stRes] = await Promise.all([getSettings(), getStatus()]);
      setSettings(sRes);
      setStats(stRes);
      setBaseURL(sRes.baseURL);
      setModel(sRes.model);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const payload: any = { baseURL, model };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();

      const res = await updateSettings(payload);
      setSettings(res);
      setApiKey("");
      alert("✅ Configurações salvas com sucesso!");
      loadAll();
    } catch (err) {
      alert("Erro ao salvar: " + String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload: any = { baseURL };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();

      const res = await testSettings(payload);
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, message: "Erro de comunicação: " + String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#07090e] overflow-y-auto p-8 custom-scrollbar">
      {/* Header */}
      <div className="pb-6 border-b border-white/[0.06] max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-purple-400" />
          <h2 className="text-xl font-bold text-white tracking-tight">Configurações & Provedor LLM</h2>
        </div>
        <p className="text-xs text-[#94a3b8] mt-1">
          Ajuste as credenciais do motor de inteligência artificial compatível com OpenAI, DeepSeek, Claude ou Ollama.
        </p>
      </div>

      <div className="max-w-4xl mx-auto w-full mt-8 space-y-6">
        {/* System Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-[#0b0f17] border border-white/[0.06]">
              <span className="text-[10px] text-[#64748b] uppercase font-semibold">Uptime</span>
              <p className="text-base font-bold text-white mt-1">{Math.floor(stats.uptime / 60)} min</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0b0f17] border border-white/[0.06]">
              <span className="text-[10px] text-[#64748b] uppercase font-semibold">Memória RSS</span>
              <p className="text-base font-bold text-white mt-1">{stats.memory} MB</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0b0f17] border border-white/[0.06]">
              <span className="text-[10px] text-[#64748b] uppercase font-semibold">Ferramentas Ativas</span>
              <p className="text-base font-bold text-purple-400 mt-1">{stats.tools} tools</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0b0f17] border border-white/[0.06]">
              <span className="text-[10px] text-[#64748b] uppercase font-semibold">Entregáveis Totais</span>
              <p className="text-base font-bold text-emerald-400 mt-1">{stats.deliverables || 0}</p>
            </div>
          </div>
        )}

        {/* LLM Config Form */}
        <form onSubmit={handleSave} className="p-6 rounded-2xl bg-[#0b0f17] border border-white/[0.06] space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            <span>Motor de Inferência (OpenAI-compatible)</span>
          </h3>

          <div>
            <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Base URL do Provedor</label>
            <input
              type="text"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.openai.com/v1 ou http://localhost:11434/v1"
              required
              className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
            />
            <p className="text-[10px] text-[#64748b] mt-1">
              Aceita OpenAI oficial, OpenRouter, DeepSeek, Groq, Ollama local ou gateway FreeLLMAPI.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Nome do Modelo</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o, deepseek-chat, claude-3-5-sonnet, llama3..."
              required
              className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">
              Chave de API (Atual: <span className="font-mono text-purple-400">{settings?.apiKeyMasked}</span>)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Deixe em branco para manter a atual ou insira nova chave"
              className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                testResult.ok
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-300 border border-red-500/20"
              }`}
            >
              {testResult.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
            <button
              type="button"
              disabled={testing}
              onClick={handleTestConnection}
              className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Testar Conexão</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar Configurações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
