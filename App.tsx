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
import { PrismSetup } from './components/PrismSetup';
import { UserFilesPage } from './components/UserFilesPage';

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
  const [isPrismSetupVisible, setIsPrismSetupVisible] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'dark';
    try { return (localStorage.getItem('theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });

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
          onReadPrivate: async (_id) => ({ allowed: true, data: 'Private data accessed by structurer.' }),
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
          onCheckSystemStatus: async () => 'Structurer running.',
          onReadLogs: async () => '',
          onAgentThought: (thought) => console.log('[Prism Structurer]', thought)
        });
      }
    }
  }, [integrations, addNode]);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage tree={userMapTree} onNavigate={setActivePage} />;
      case 'data-studio':
        return (
          <DataStudioPage
            tree={userMapTree}
            onUpdateNode={updateNode}
            onDeleteNode={deleteNode}
            onAddNode={addNode}
            onIngestMemory={ingestExternalMemory}
            onConsolidate={consolidate}
            isConsolidating={isConsolidating}
          />
        );
      case 'data-studio-context':
        return (
          <div className="flex-1 overflow-y-auto p-6">
            <ContextSearchView tree={userMapTree} />
          </div>
        );
      case 'data-studio-files':
        return <UserFilesPage />;
      case 'connectors':
        return <ConnectorsPage onOpenAISetup={() => setIsPrismSetupVisible(true)} />;
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
        {/* Top action bar — consolidation status only */}
        {isConsolidating && (
          <div className="h-8 shrink-0 border-b border-black/5 dark:border-white/5 bg-white/50 dark:bg-black/10 backdrop-blur-xl px-4 flex items-center">
            <span className="text-[10px] text-violet-500 font-semibold animate-pulse">Prism consolidating…</span>
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {renderPage()}
        </div>
      </main>

      <PrismSetup
        isOpen={isPrismSetupVisible}
        onComplete={handleCompleteSetup}
      />
    </div>
  );
};

export default App;
