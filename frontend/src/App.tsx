// frontend/src/App.tsx
import { useState, useEffect, useCallback } from "react";
import { LandingPage } from "./components/LandingPage";
import { Sidebar, type ActiveTab } from "./components/Sidebar";
import { InboxView } from "./components/InboxView";
import { StudioView } from "./components/StudioView";
import { AgentsView } from "./components/AgentsView";
import { DeliverablesView } from "./components/DeliverablesView";
import { AutomationsView } from "./components/AutomationsView";
import { BrandKitView } from "./components/BrandKitView";
import { IntegrationsView } from "./components/IntegrationsView";
import { SettingsView } from "./components/SettingsView";
import { ProjectWorkspaceView } from "./components/ProjectWorkspaceView";
import { LoginModal } from "./components/LoginModal";
import type { Agent, Deliverable, SystemStats, Project } from "./types";
import { getAgents, getDeliverables, getStatus, getProjects, createProject, checkSession, logout } from "./api";

/**
 * Projeto exibido enquanto `/api/projects` não responde.
 *
 * `created_at`/`updated_at` são fixos de propósito: chamar `Date.now()` durante
 * a renderização torna o componente impuro (o React Compiler rejeita).
 */
const FALLBACK_PROJECT: Project = {
  id: "4cf69f0b-b47f-4c10-8312-b50579b4b69c",
  name: "Leads Generation",
  description: "Potential customers found each week",
  icon: "target",
  created_at: 0,
  updated_at: 0,
};

function App() {
  // A sessão é um cookie HttpOnly, invisível para JS: só o servidor sabe se ela
  // vale. Começa em "unknown" para não piscar a landing page antes da resposta.
  const [authState, setAuthState] = useState<"unknown" | "authenticated" | "anonymous">("unknown");
  const [viewMode, setViewMode] = useState<"landing" | "dashboard">("landing");
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("project");

  const isAuthenticated = authState === "authenticated";

  // Global state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | undefined>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    "4cf69f0b-b47f-4c10-8312-b50579b4b69c"
  );
  const [targetStudioAgentId, setTargetStudioAgentId] = useState<string>("cmo");

  // `useCallback` sem dependências: usa só setters (estáveis) e atualização
  // funcional, então a identidade é constante e o efeito abaixo pode listá-la
  // sem reexecutar a cada render.
  const loadData = useCallback(async () => {
    try {
      const [agRes, delRes, stRes, projRes] = await Promise.all([
        getAgents(),
        getDeliverables(),
        getStatus().catch(() => undefined),
        getProjects().catch(() => ({ projects: [] })),
      ]);
      setAgents(agRes.agents);
      setDeliverables(delRes.deliverables);
      if (stRes) setSystemStats(stRes);
      setProjects(projRes.projects);
      setActiveProjectId((current) => current ?? projRes.projects[0]?.id ?? null);
    } catch (err) {
      console.error("Error loading dashboard data", err);
    }
  }, []);

  // Sessão expirada ou inválida: o apiFetch dispara este evento no 401.
  useEffect(() => {
    const handleAuthChange = () => {
      setAuthState("anonymous");
      setViewMode("landing");
    };

    window.addEventListener("auth-changed", handleAuthChange);
    return () => window.removeEventListener("auth-changed", handleAuthChange);
  }, []);

  // Pergunta ao servidor se o cookie ainda vale (única fonte da verdade).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await checkSession();
      if (cancelled) return;
      setAuthState(ok ? "authenticated" : "anonymous");
      if (ok) setViewMode("dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void loadData();
    };

    // O primeiro fetch sai no próximo tick: chamá-lo direto no corpo do efeito
    // dispara um render em cascata logo após a montagem.
    const initial = setTimeout(run, 0);
    const interval = setInterval(run, 15000); // Poll every 15s

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [isAuthenticated, loadData]);

  const handleEnterDashboard = () => {
    if (isAuthenticated) {
      setViewMode("dashboard");
    } else {
      setShowLoginModal(true);
    }
  };

  const handleLoginSuccess = () => {
    setAuthState("authenticated");
    setShowLoginModal(false);
    setViewMode("dashboard");
    loadData();
  };

  const handleLogout = async () => {
    // Limpa o cookie no servidor — sem isso a sessão seguiria válida.
    try {
      await logout();
    } catch {
      // Mesmo se a chamada falhar, o estado local é encerrado abaixo.
    }
    setAuthState("anonymous");
    setViewMode("landing");
  };

  const pendingCount = deliverables.filter((d) => d.status === "pending_approval").length;

  const handleGoToStudio = (agentId?: string) => {
    if (agentId) setTargetStudioAgentId(agentId);
    setActiveTab("studio");
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveTab("project");
  };

  const handleCreateProject = async () => {
    const name = prompt("Nome do novo projeto:");
    if (!name?.trim()) return;
    try {
      const res = await createProject({ name: name.trim() });
      await loadData();
      handleSelectProject(res.project.id);
    } catch (err) {
      alert("Erro ao criar projeto: " + String(err));
    }
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || FALLBACK_PROJECT;

  if (viewMode === "landing") {
    return (
      <>
        <LandingPage
          onEnterDashboard={handleEnterDashboard}
          isAuthenticated={isAuthenticated}
        />
        {showLoginModal && (
          <LoginModal
            onSuccess={handleLoginSuccess}
            onCancel={() => setShowLoginModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#07090e] text-white">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingCount={pendingCount}
        onViewLanding={() => setViewMode("landing")}
        onLogout={handleLogout}
        systemStats={systemStats}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === "project" && (
          <ProjectWorkspaceView
            project={activeProject}
            agents={agents}
            onGoToStudio={handleGoToStudio}
            onGoToInbox={() => setActiveTab("inbox")}
          />
        )}

        {activeTab === "inbox" && (
          <InboxView
            deliverables={deliverables}
            onRefresh={loadData}
            onGoToStudio={handleGoToStudio}
          />
        )}

        {activeTab === "studio" && (
          <StudioView
            agents={agents}
            initialAgentId={targetStudioAgentId}
            onGoToInbox={() => setActiveTab("inbox")}
          />
        )}

        {activeTab === "agents" && (
          <AgentsView
            agents={agents}
            onRefresh={loadData}
            onSelectAgentToChat={handleGoToStudio}
          />
        )}

        {activeTab === "deliverables" && (
          <DeliverablesView
            deliverables={deliverables}
            onRefresh={loadData}
            onGoToStudio={handleGoToStudio}
          />
        )}

        {activeTab === "automations" && (
          <AutomationsView
            agents={agents}
            onGoToInbox={() => setActiveTab("inbox")}
          />
        )}

        {activeTab === "brand" && <BrandKitView />}

        {activeTab === "integrations" && (
          <IntegrationsView onGoToStudio={handleGoToStudio} />
        )}

        {activeTab === "settings" && <SettingsView />}
      </main>
    </div>
  );
}

export default App;
