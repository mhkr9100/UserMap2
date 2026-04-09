import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Network, Plug, Bot, ScrollText, BookOpen, Sun, Moon, ChevronDown, Search } from 'lucide-react';
import { BrandMark } from './icons/BrandMark';

export type SidebarPage =
  | 'dashboard'
  | 'prism-agent'
  | 'data-studio'
  | 'data-studio-context'
  | 'connectors'
  | 'logs'
  | 'docs';

interface SidebarProps {
  activePage: SidebarPage;
  onNavigate: (page: SidebarPage) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate, theme, onToggleTheme }) => {
  const isDataStudio = activePage === 'data-studio' || activePage === 'data-studio-context';
  const [dataStudioOpen, setDataStudioOpen] = useState(isDataStudio);

  // Sync open state when activePage changes externally
  useEffect(() => {
    if (isDataStudio) setDataStudioOpen(true);
  }, [isDataStudio]);

  const navItemClass = (active: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-[12px] font-medium ${
      active
        ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 font-semibold'
        : 'text-gray-600 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white/80'
    }`;

  const navIconClass = (active: boolean) =>
    active ? 'text-violet-500' : 'text-gray-400 dark:text-white/25';

  return (
    <aside className="w-56 shrink-0 h-full flex flex-col border-r border-black/5 dark:border-white/5 bg-white/70 dark:bg-black/30 backdrop-blur-xl">
      {/* Brand */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-black/5 dark:border-white/5">
        <BrandMark size={24} className="text-gray-900 dark:text-white" />
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.26em] text-gray-900 dark:text-white">UserMap</div>
          <div className="text-[9px] text-gray-400 dark:text-white/30">Personal Context OS</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {/* Dashboard */}
        <button onClick={() => onNavigate('dashboard')} className={navItemClass(activePage === 'dashboard')}>
          <span className={navIconClass(activePage === 'dashboard')}><LayoutDashboard size={16} /></span>
          Dashboard
        </button>

        {/* Prism Agent */}
        <button onClick={() => onNavigate('prism-agent')} className={navItemClass(activePage === 'prism-agent')}>
          <span className={navIconClass(activePage === 'prism-agent')}><Bot size={16} /></span>
          Prism Agent
        </button>

        {/* Data Studio (collapsible) */}
        <div>
          <button
            onClick={() => {
              setDataStudioOpen((o) => !o);
              if (!isDataStudio) onNavigate('data-studio');
            }}
            className={navItemClass(isDataStudio)}
          >
            <span className={navIconClass(isDataStudio)}><Network size={16} /></span>
            <span className="flex-1 text-left">Data Studio</span>
            <ChevronDown
              size={12}
              className={`transition-transform ${dataStudioOpen ? 'rotate-180' : ''} ${navIconClass(isDataStudio)}`}
            />
          </button>
          {dataStudioOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 border-l border-black/5 dark:border-white/5 pl-2">
              <button
                onClick={() => onNavigate('data-studio')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-[11px] font-medium transition-all ${
                  activePage === 'data-studio'
                    ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 font-semibold'
                    : 'text-gray-500 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-800 dark:hover:text-white/70'
                }`}
              >
                <Network size={12} />
                UserMap
              </button>
              <button
                onClick={() => onNavigate('data-studio-context')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-[11px] font-medium transition-all ${
                  activePage === 'data-studio-context'
                    ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 font-semibold'
                    : 'text-gray-500 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-800 dark:hover:text-white/70'
                }`}
              >
                <Search size={12} />
                Context
              </button>
            </div>
          )}
        </div>

        {/* Connectors */}
        <button onClick={() => onNavigate('connectors')} className={navItemClass(activePage === 'connectors')}>
          <span className={navIconClass(activePage === 'connectors')}><Plug size={16} /></span>
          Connectors
        </button>

        {/* Logs */}
        <button onClick={() => onNavigate('logs')} className={navItemClass(activePage === 'logs')}>
          <span className={navIconClass(activePage === 'logs')}><ScrollText size={16} /></span>
          Logs
        </button>

        {/* Docs */}
        <button onClick={() => onNavigate('docs')} className={navItemClass(activePage === 'docs')}>
          <span className={navIconClass(activePage === 'docs')}><BookOpen size={16} /></span>
          Docs
        </button>
      </nav>

      {/* Theme toggle */}
      <div className="px-2 pb-4">
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] text-gray-500 dark:text-white/30 hover:text-gray-900 dark:hover:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </aside>
  );
};
