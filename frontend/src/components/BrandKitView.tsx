// frontend/src/components/BrandKitView.tsx
import { useState, useEffect, type FormEvent } from "react";
import type { CompanyProfile } from "../types";
import { getCompanyProfile, updateCompanyProfile } from "../api";
import { Building2, Save, Sparkles, CheckCircle2 } from "lucide-react";

export function BrandKitView() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await getCompanyProfile();
      setProfile(res.profile);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    try {
      const res = await updateCompanyProfile(profile);
      setProfile(res.profile);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      alert("Erro ao salvar perfil: " + String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#07090e] text-[#64748b]">
        Carregando cérebro da empresa...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#07090e] overflow-y-auto p-8 custom-scrollbar">
      {/* Header */}
      <div className="pb-6 border-b border-white/[0.06] max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-purple-400" />
          <h2 className="text-xl font-bold text-white tracking-tight">Cérebro Compartilhado da Empresa</h2>
        </div>
        <p className="text-xs text-[#94a3b8] mt-1">
          Essas diretrizes são injetadas em tempo real na memória de todos os agentes (Alex Vance, Sofia Rios, Dr. Eric e Leo Chen).
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto w-full mt-8 space-y-6">
        <div className="p-6 rounded-2xl bg-[#0b0f17] border border-white/[0.06] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Nome da Empresa / Marca</label>
              <input
                type="text"
                value={profile.company_name}
                onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                required
                className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Nicho / Setor de Atuação</label>
              <input
                type="text"
                value={profile.niche}
                onChange={(e) => setProfile({ ...profile, niche: e.target.value })}
                required
                className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Público-Alvo (ICP & Persona)</label>
            <input
              type="text"
              value={profile.target_audience}
              onChange={(e) => setProfile({ ...profile, target_audience: e.target.value })}
              required
              className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Tom de Voz da Marca</label>
            <input
              type="text"
              value={profile.tone_of_voice}
              onChange={(e) => setProfile({ ...profile, tone_of_voice: e.target.value })}
              required
              className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Proposta Única de Valor</label>
            <textarea
              value={profile.value_prop}
              onChange={(e) => setProfile({ ...profile, value_prop: e.target.value })}
              rows={3}
              required
              className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Diretrizes & Restrições da Marca</label>
            <textarea
              value={profile.guidelines}
              onChange={(e) => setProfile({ ...profile, guidelines: e.target.value })}
              rows={3}
              required
              className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-xs text-[#64748b]">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Atualizações refletem instantaneamente no próximo prompt de todos os agentes.</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg shadow-purple-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Salvo no Cérebro!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Configurações</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
