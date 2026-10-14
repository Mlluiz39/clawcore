// frontend/src/components/LoginModal.tsx
import { useState, type FormEvent } from "react";
import { login } from "../api";
import { ArrowRight, Loader2 } from "lucide-react";

interface LoginModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function LoginModal({ onSuccess, onCancel }: LoginModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { token } = await login(password);
      localStorage.setItem("token", token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senha incorreta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0b0f17] border border-white/[0.1] rounded-3xl max-w-sm w-full p-8 shadow-2xl relative">
        <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 mx-auto mb-4 font-bold text-lg">
          ✦
        </div>

        <h2 className="text-xl font-bold text-white text-center tracking-tight">Acesso ao Studio</h2>
        <p className="text-xs text-[#94a3b8] text-center mt-1">
          Insira a senha mestra para desbloquear a agência SureThing.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a senha..."
              required
              autoFocus
              className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500"
            />
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Entrar</span><ArrowRight className="w-4 h-4" /></>}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full text-center text-xs text-[#64748b] hover:text-[#94a3b8] cursor-pointer pt-2"
          >
            Voltar para a página inicial
          </button>
        </form>
      </div>
    </div>
  );
}
