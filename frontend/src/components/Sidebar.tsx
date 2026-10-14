// frontend/src/components/Sidebar.tsx
import type { ElementType } from "react";
import {
  Inbox,
  MessageSquare,
  Bot,
  Layers,
  Clock,
  Building2,
  Settings,
  LogOut,
  ExternalLink,
  Plug,
  Plus,
  Mail,
  Target,
  TrendingUp,
  UserCheck,
  FileText,
  Briefcase,
  Sparkles,
  Gift,
  Download,
  Terminal,
} from "lucide-react";
import type { Project } from "../types";

export type ActiveTab =
  | "project"
  | "inbox"
  | "studio"
  | "agents"
  | "deliverables"
  | "automations"
  | "brand"
  | "integrations"
  | "settings";

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  pendingCount: number;
  onViewLanding: () => void;
  onLogout: () => void;
  systemStats?: { model?: string; provider?: string };
  projects?: Project[];
  activeProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onCreateProject?: () => void;
}

function getProjectIcon(name: string, iconKey: string): ElementType {
  const lower = (name + " " + iconKey).toLowerCase();
  if (lower.includes("email") || lower.includes("mail")) return Mail;
  if (lower.includes("lead") || lower.includes("target")) return Target;
  if (lower.includes("ad") || lower.includes("trending")) return TrendingUp;
  if (lower.includes("influencer") || lower.includes("user")) return UserCheck;
  if (lower.includes("seo") || lower.includes("content") || lower.includes("file")) return FileText;
  return Briefcase;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  pendingCount,
  onViewLanding,
  onLogout,
  systemStats,
  projects = [],
  activeProjectId,
  onSelectProject,
  onCreateProject,
}: SidebarProps) {
  const topNavItems: { id: ActiveTab; label: string; icon: ElementType; badge?: number }[] = [
    { id: "automations", label: "Routines", icon: Clock },
    { id: "integrations", label: "Integrations", icon: Plug },
    { id: "agents", label: "Browse Agents", icon: Bot },
    { id: "inbox", label: "Inbox de Aprovação", icon: Inbox, badge: pendingCount },
    { id: "brand", label: "Cérebro da Empresa", icon: Building2 },
    { id: "settings", label: "Configurações & LLM", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0a0d14] border-r border-white/[0.06] flex flex-col justify-between shrink-0 h-screen select-none overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Brand Header */}
        <div className="p-4 flex items-center justify-between border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md shadow-emerald-500/20 text-xs">
              ✦
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                SureThing
              </h1>
            </div>
          </div>
          <button
            onClick={onViewLanding}
            title="Ver Landing Page pública"
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Global Navigation list */}
        <nav className="p-3 space-y-0.5 shrink-0">
          {topNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? "bg-white/[0.08] text-white border border-white/[0.1] font-semibold"
                    : "text-[#94a3b8] hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-purple-400" : "text-[#64748b]"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Projects Section */}
        <div className="flex-1 flex flex-col min-h-0 px-3 pt-2 pb-1 border-t border-white/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-2 mb-1.5 shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] font-semibold">
              PROJECTS
            </span>
            {onCreateProject && (
              <button
                onClick={onCreateProject}
                title="Criar novo projeto"
                className="p-1 rounded hover:bg-white/[0.06] text-[#64748b] hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
            {projects.map((proj) => {
              const Icon = getProjectIcon(proj.name, proj.icon);
              const isSelected = activeTab === "project" && activeProjectId === proj.id;
              const routinesCount = proj.routines_count ?? 2;

              return (
                <button
                  key={proj.id}
                  onClick={() => {
                    if (onSelectProject) onSelectProject(proj.id);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#141a26] text-white border border-purple-500/30 shadow-sm"
                      : "text-[#94a3b8] hover:bg-white/[0.03] hover:text-white"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? "text-purple-400" : "text-[#64748b]"}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-xs truncate leading-snug">{proj.name}</p>
                      <p className="text-[10px] text-[#64748b] truncate leading-tight mt-0.5 font-mono">
                        1 agent · {routinesCount} {routinesCount === 1 ? "routine" : "routines"} · 21h ago
                      </p>
                    </div>
                  </div>
                  {proj.name.includes("Email") && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Section: Credits promo, share, user profile */}
      <div className="p-3 border-t border-white/[0.06] space-y-2 shrink-0 bg-[#090c12]">
        {/* Double credits promo banner */}
        <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-purple-500/10 border border-amber-500/20 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-amber-300 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> FIRST SUBSCRIPTION
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
              02:51:16
            </span>
          </div>
          <p className="font-bold text-white text-xs mt-1">Double credits</p>
        </div>

        {/* Share SureThing card */}
        <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs hover:bg-white/[0.04] transition-colors cursor-pointer">
          <div className="flex items-center gap-2">
            <Gift className="w-3.5 h-3.5 text-purple-400" />
            <div>
              <p className="font-medium text-white text-[11px]">Share SureThing</p>
              <p className="text-[10px] text-[#64748b]">Each get 500 credits</p>
            </div>
          </div>
          <span className="text-[#64748b] text-xs">→</span>
        </div>

        {/* User Profile Card */}
        <div className="pt-1 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-orange-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
              M
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-xs text-white truncate">Marcelo Luiz</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-white/[0.08] text-[#94a3b8] font-mono">
                  Free
                </span>
              </div>
              <p className="text-[10px] text-purple-300 font-mono flex items-center gap-1">
                ✦ 1.419 credits
              </p>
            </div>
          </div>

          <button
            onClick={onLogout}
            title="Sair"
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
