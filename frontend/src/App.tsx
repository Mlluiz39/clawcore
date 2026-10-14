// frontend/src/App.tsx
import { useState, useEffect } from "react";
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
import { getAgents, getDeliverables, getStatus, getProjects, createProject } from "./api";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem("token"));
  const [viewMode, setViewMode] = useState<"landing" | "dashboard">(
    localStorage.getItem("token") ? "dashboard" : "landing"
  );
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("project");

  // Global state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | undefined>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    "4cf69f0b-b47f-4c10-8312-b50579b4b69c"
  );
  const [targetStudioAgentId, setTargetStudioAgentId] = useState<string>("cmo");

  useEffect(() => {
    const handleAuthChange = () => {
      const auth = !!localStorage.getItem("token");
      setIsAuthenticated(auth);
      if (!auth) setViewMode("landing");
    };

    window.addEventListener("auth-changed", handleAuthChange);
    return () => window.removeEventListener("auth-changed", handleAuthChange);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      const interval = setInterval(loadData, 15000); // Poll every 15s
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const loadData = async () => {
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
      if (!activeProjectId && projRes.projects.length > 0) {
        setActiveProjectId(projRes.projects[0].id);
      }
    } catch (err) {
      console.error("Error loading dashboard data", err);
    }
  };

  const handleEnterDashboard = () => {
    if (isAuthenticated) {
      setViewMode("dashboard");
    } else {
      setShowLoginModal(true);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setShowLoginModal(false);
    setViewMode("dashboard");
    loadData();
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
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

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ||
    projects[0] || {
      id: "4cf69f0b-b47f-4c10-8312-b50579b4b69c",
      name: "Leads Generation",
      description: "Potential customers found each week",
      icon: "target",
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };

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
