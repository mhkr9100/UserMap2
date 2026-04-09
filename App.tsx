import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import type { SidebarPage } from './components/Sidebar';
import { DashboardPage } from './components/DashboardPage';
import { DataStudioPage } from './components/DataStudioPage';
import { ConnectorsPage } from './components/ConnectorsPage';
import { PrismAgentPage } from './components/PrismAgentPage';
import { LogsPage } from './components/LogsPage';
import { DocsPage } from './components/DocsPage';
import { ContextSearchView } from './components/ContextSearchView';
import { ContextImportDialog } from './components/ContextImportDialog';
import { IntegrationsPanel } from './components/IntegrationsPanel';
import { PrismSetup } from './components/PrismSetup';

import { useAuth } from './hooks/useAuth';
import { useUserMap } from './hooks/useUserMap';
import { useIntegrations } from './hooks/useIntegrations';
import { ADAPTERS } from './services/integrations';
import { structurerService } from './services/structurerService';


const App: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    userMapTree,
    updateNode,
    deleteNode,
    addNode,
    consolidate,
    isConsolidating,
    ingestExternalMemory
  } = useUserMap(currentUser);
  const { integrations } = useIntegrations();

  const [activePage, setActivePage] = useState<SidebarPage>('dashboard');
  const [isMemoryImportOpen, setIsMemoryImportOpen] = useState(false);
  const [isMemoryImporting, setIsMemoryImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isIntegrationsPanelOpen, setIsIntegrationsPanelOpen] = useState(false);
  const [isPrismSetupVisible, setIsPrismSetupVisible] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'dark';
    try { return (localStorage.getItem('theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });

  useEffect(() => {
    if (!currentUser) return;
    const importHandled = localStorage.getItem('usermap_seen_memory_import_prompt') === 'true';
    if (!importHandled) setIsMemoryImportOpen(true);
  }, [currentUser]);

  const handleSkipMemoryImport = useCallback(() => {
    localStorage.setItem('usermap_seen_memory_import_prompt', 'true');
    setIsMemoryImportOpen(false);
  }, []);

  const handleImportMemory = useCallback(async (rawText: string) => {
    setIsMemoryImporting(true);
    setImportError(null);
    try {
      const count = await ingestExternalMemory(rawText);
      if (count > 0) {
        await consolidate();
      }
      localStorage.setItem('usermap_seen_memory_import_prompt', 'true');
      setIsMemoryImportOpen(false);
    } catch (err: unknown) {
      setImportError(`Memory import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsMemoryImporting(false);
    }
  }, [ingestExternalMemory, consolidate]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    localStorage.setItem('theme', nextTheme);
  }, [theme]);

  const connectedAICount = useMemo(() => {
    return integrations.filter((i) => i.isAIAssistant && i.status === 'connected').length;
  }, [integrations]);

  /** Show setup if no AI is connected on first launch */
  useEffect(() => {
    if (connectedAICount === 0 && !localStorage.getItem('prism_setup_complete')) {
      setIsPrismSetupVisible(true);
    }
  }, [connectedAICount]);

  const handleCompleteSetup = useCallback(() => {
    localStorage.setItem('prism_setup_complete', 'true');
    setIsPrismSetupVisible(false);
  }, []);

  // Initialize Continuous Structurer with the first connected AI Assistant
  useEffect(() => {
    const aiAdapterEntry = integrations.find(i => i.isAIAssistant && i.status === 'connected');
    if (aiAdapterEntry) {
      const adapter = ADAPTERS[aiAdapterEntry.id];
      if (adapter) {
        structurerService.init(adapter, {
          onSearchMap: async (query) => `Background search result for: ${query}`,
          onReadPrivate: async (_id) => ({ allowed: true, data: "Private data accessed by structurer." }),
          onCreateFact: async (label, value) => {
            addNode('root', {
              id: crypto.randomUUID(),
              label,
              value,
              nodeType: 'fact',
              source: 'Prism Structurer',
              sourceDate: new Date().toISOString().split('T')[0],
              children: []
            });
            return true;
          },
          onAgentThought: (thought) => console.log("[Prism Structurer]", thought)
        });
      }
    }
  }, [integrations, addNode]);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage tree={userMapTree} onNavigate={setActivePage} />;
      case 'context-search':
        return (
          <div className="flex-1 overflow-y-auto p-6">
            <ContextSearchView tree={userMapTree} />
          </div>
        );
      case 'data-studio':
        return (
          <DataStudioPage
            tree={userMapTree}
            onUpdateNode={updateNode}
            onDeleteNode={deleteNode}
            onAddNode={addNode}
          />
        );
      case 'connectors':
        return <ConnectorsPage />;
      case 'prism-agent':
        return (
          <PrismAgentPage
            tree={userMapTree}
            onAddNode={addNode}
            connectedAICount={connectedAICount}
            onOpenSetup={() => setIsPrismSetupVisible(true)}
          />
        );
      case 'logs':
        return <LogsPage />;
      case 'docs':
        return <DocsPage />;
      default:
        return <DashboardPage tree={userMapTree} onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="h-screen bg-[#F8F9FA] text-[#1A1A1A] dark:bg-[#1A1A1A] dark:text-[#FFFFFF] transition-colors duration-300 overflow-hidden flex">
      {/* Left sidebar */}
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Top action bar */}
        <div className="h-12 shrink-0 border-b border-black/5 dark:border-white/5 bg-white/50 dark:bg-black/10 backdrop-blur-xl px-4 flex items-center justify-end gap-2">
          {isConsolidating && (
            <span className="text-[10px] text-violet-500 font-semibold animate-pulse">Prism consolidating…</span>
          )}
          <button
            onClick={() => setIsIntegrationsPanelOpen(true)}
            className="h-8 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white/80 transition-colors"
            title="Manage connected tools"
          >
            Tools
          </button>
          <button
            onClick={() => setIsMemoryImportOpen(true)}
            className="h-8 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white/80 transition-colors"
          >
            Import
          </button>
        </div>

        {/* Page content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {renderPage()}
        </div>
      </main>

      <ContextImportDialog
        isOpen={isMemoryImportOpen}
        isImporting={isMemoryImporting}
        error={importError}
        onSkip={handleSkipMemoryImport}
        onImport={handleImportMemory}
      />

      <IntegrationsPanel
        isOpen={isIntegrationsPanelOpen}
        onClose={() => setIsIntegrationsPanelOpen(false)}
      />

      <PrismSetup
        isOpen={isPrismSetupVisible}
        onComplete={handleCompleteSetup}
      />
    </div>
  );
};

export default App;
