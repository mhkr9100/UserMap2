import React from 'react';
import { Network } from 'lucide-react';
import { MindMapView } from './MindMapView';
import type { PageNode } from '../types';

interface DataStudioPageProps {
  tree: PageNode;
  onUpdateNode: (nodeId: string, updates: Partial<PageNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddNode: (parentId: string, newNode: PageNode) => void;
}

export const DataStudioPage: React.FC<DataStudioPageProps> = ({
  tree,
  onUpdateNode,
  onDeleteNode,
  onAddNode,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Page header */}
      <div className="shrink-0 px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-center gap-3">
        <Network size={18} className="text-violet-500" />
        <div>
          <h1 className="text-[14px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Data Studio</h1>
          <p className="text-[11px] text-gray-400 dark:text-white/30">
            MindMap — your entire knowledge graph, visually. Hover a node for edit/delete/add options.
          </p>
        </div>
        <div className="ml-auto">
          <span className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-300 border border-violet-400/20 px-2 py-0.5 rounded-full font-semibold uppercase tracking-widest">
            MindMap
          </span>
          <span className="ml-2 text-[10px] text-gray-300 dark:text-white/20 border border-dashed border-gray-200 dark:border-white/10 px-2 py-0.5 rounded-full">
            Tree · Flow · List — future scope
          </span>
        </div>
      </div>

      {/* MindMap canvas */}
      <MindMapView
        tree={tree}
        onUpdateNode={onUpdateNode}
        onDeleteNode={onDeleteNode}
        onAddNode={onAddNode}
      />
    </div>
  );
};
