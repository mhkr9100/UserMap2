import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Moon, Sun, Plug, Bot } from 'lucide-react';
import { AIChatPanel } from './components/AIChatPanel';
import { ContextImportDialog } from './components/ContextImportDialog';
import { IntegrationsPanel } from './components/IntegrationsPanel';
import { LoginScreen } from './components/LoginScreen';
import { UserMapView } from './components/UserMapView';
import { BrandMark } from './components/icons/BrandMark';
import { useAuth } from './hooks/useAuth';
import { useUserMap } from './hooks/useUserMap';
import { useIntegrations } from './hooks/useIntegrations';
import { queryContext } from './services/contextQuery';
import type { ToolContextItem } from './types';

const App: React.FC = () => {
  const { currentUser, isInitializing, login, logout } = useAuth();
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

  const [isMemoryImportOpen, setIsMemoryImportOpen] = useState(false);
  const [isMemoryImporting, setIsMemoryImporting] = useState(false);
  const [isIntegrationsPanelOpen, setIsIntegrationsPanelOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [aiContextItems, setAiContextItems] = useState<ToolContextItem[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'dark';
    return 'light';
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
    try {
      const count = await ingestExternalMemory(rawText);
      if (count > 0) {
        await consolidate();
      }
      localStorage.setItem('usermap_seen_memory_import_prompt', 'true');
      setIsMemoryImportOpen(false);
    } catch (err: any) {
      alert(`Memory import failed: ${err.message || 'Unknown error'}`);
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

  const userLabel = useMemo(() => currentUser?.name || currentUser?.email || 'Architect', [currentUser]);
  const connectedCount = useMemo(
    () => integrations.filter((i) => i.status === 'connected').length,
    [integrations]
  );
  const connectedAICount = useMemo(
    () => integrations.filter((i) => i.isAIAssistant && i.status === 'connected').length,
    [integrations]
  );

  /** Open the AI chat panel, refreshing context from all connected data-source adapters. */
  const handleOpenAIChat = useCallback(async () => {
    setIsAIChatOpen(true);
    try {
      const response = await queryContext({ query: '' });
      setAiContextItems(response.results);
    } catch {
      setAiContextItems([]);
    }
  }, []);

  if (isInitializing) {
    return (
      <div className="h-screen w-screen bg-[#F8F9FA] dark:bg-[#1A1A1A] flex items-center justify-center transition-colors duration-300">
        <div className="text-gray-900 dark:text-white font-bold animate-pulse uppercase tracking-[0.5em] text-xs">
          Initializing UserMap...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={login} onRegister={login} />;
  }

  return (
    <div className="h-screen bg-[#F8F9FA] text-[#1A1A1A] dark:bg-[#1A1A1A] dark:text-[#FFFFFF] transition-colors duration-300 overflow-hidden">
      <div className="h-full flex flex-col">
        <header className="h-16 shrink-0 border-b border-black/5 dark:border-white/5 bg-white/70 dark:bg-black/20 backdrop-blur-xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark size={28} className="text-gray-900 dark:text-white" />
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.26em] text-gray-900 dark:text-white">UserMap</div>
              <div className="text-[10px] text-gray-500 dark:text-white/40 truncate">{userLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Chat button */}
            <button
              onClick={handleOpenAIChat}
              className="h-10 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[10px] font-black uppercase tracking-[0.14em] text-gray-700 dark:text-white/70 flex items-center gap-2"
              title="AI Chat — context auto-injected from UserMap"
            >
              <Bot size={14} className={connectedAICount > 0 ? 'text-violet-500' : ''} />
              <span className="hidden sm:inline">AI</span>
              {connectedAICount > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-violet-500 text-white text-[9px] font-black flex items-center justify-center">
                  {connectedAICount}
                </span>
              )}
            </button>
            {/* Connected tools indicator + panel trigger */}
            <button
              onClick={() => setIsIntegrationsPanelOpen(true)}
              className="h-10 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[10px] font-black uppercase tracking-[0.14em] text-gray-700 dark:text-white/70 flex items-center gap-2"
              title="Connected Tools"
            >
              <Plug size={14} />
              <span className="hidden sm:inline">Tools</span>
              {connectedCount > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center">
                  {connectedCount}
                </span>
              )}
            </button>
            <button
              onClick={toggleTheme}
              className="h-10 w-10 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] flex items-center justify-center text-gray-600 dark:text-white/60"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => logout()}
              className="h-10 px-4 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[10px] font-black uppercase tracking-[0.18em] text-gray-700 dark:text-white/70 flex items-center gap-2"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </header>

        <UserMapView
          tree={userMapTree}
          isConsolidating={isConsolidating}
          onUpdateNode={updateNode}
          onDeleteNode={deleteNode}
          onAddNode={addNode}
          onConsolidate={consolidate}
          onImportContext={() => setIsMemoryImportOpen(true)}
        />
      </div>

      <ContextImportDialog
        isOpen={isMemoryImportOpen}
        isImporting={isMemoryImporting}
        onSkip={handleSkipMemoryImport}
        onImport={handleImportMemory}
      />

      <IntegrationsPanel
        isOpen={isIntegrationsPanelOpen}
        onClose={() => setIsIntegrationsPanelOpen(false)}
      />

      <AIChatPanel
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        contextItems={aiContextItems}
      />
    </div>
  );
};

export default App;
