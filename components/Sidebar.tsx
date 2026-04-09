import React from 'react';
import { LayoutDashboard, Search, Network, Plug, Bot, ScrollText, BookOpen, Sun, Moon } from 'lucide-react';
import { BrandMark } from './icons/BrandMark';

export type SidebarPage =
  | 'dashboard'
  | 'context-search'
  | 'data-studio'
  | 'connectors'
  | 'prism-agent'
  | 'logs'
  | 'docs';

interface SidebarProps {
  activePage: SidebarPage;
  onNavigate: (page: SidebarPage) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const NAV_ITEMS: Array<{ id: SidebarPage; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { id: 'context-search', label: 'Context Search', icon: <Search size={16} /> },
  { id: 'data-studio', label: 'Data Studio', icon: <Network size={16} /> },
  { id: 'connectors', label: 'Connectors', icon: <Plug size={16} /> },
  { id: 'prism-agent', label: 'Prism Agent', icon: <Bot size={16} /> },
  { id: 'logs', label: 'Logs', icon: <ScrollText size={16} /> },
  { id: 'docs', label: 'Docs', icon: <BookOpen size={16} /> },
];

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate, theme, onToggleTheme }) => {
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
        {NAV_ITEMS.map(({ id, label, icon }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-[12px] font-medium ${
                isActive
                  ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 font-semibold'
                  : 'text-gray-600 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white/80'
              }`}
            >
              <span className={isActive ? 'text-violet-500' : 'text-gray-400 dark:text-white/25'}>
                {icon}
              </span>
              {label}
            </button>
          );
        })}
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
