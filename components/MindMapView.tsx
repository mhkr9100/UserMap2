/**
 * MindMapView — NotebookLM-inspired radial mind-map.
 *
 * Central root node with category branches radiating outward.
 * Click a category node to expand/collapse its children.
 * Full CRUD: add, edit, delete nodes from a side panel.
 * Node positions are persisted in localStorage for stable UX.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { PageNode } from '../types';

interface MindMapViewProps {
  tree: PageNode;
  onUpdateNode: (nodeId: string, updates: Partial<PageNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddNode: (parentId: string, newNode: PageNode) => void;
}

const STORAGE_KEY = 'usermap_mindmap_collapsed_v1';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {}
}

const IMPORTANCE_COLORS: Record<string, string> = {
  high: '#f59e0b',
  medium: '#8b5cf6',
  low: '#6b7280',
};

const NODE_TYPE_BG: Record<string, string> = {
  category: 'bg-violet-500/10 border-violet-400/30 dark:bg-violet-500/20 dark:border-violet-400/30',
  cluster: 'bg-blue-500/10 border-blue-400/30 dark:bg-blue-500/15 dark:border-blue-400/20',
  fact: 'bg-white border-black/10 dark:bg-white/[0.04] dark:border-white/[0.08]',
  root: 'bg-gray-900 border-gray-800 dark:bg-white dark:border-white/20',
};

interface NodeCardProps {
  node: PageNode;
  depth: number;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  onUpdateNode: (nodeId: string, updates: Partial<PageNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddNode: (parentId: string, newNode: PageNode) => void;
}

const NodeCard: React.FC<NodeCardProps> = ({
  node,
  depth,
  collapsed,
  onToggleCollapse,
  onUpdateNode,
  onDeleteNode,
  onAddNode,
}) => {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(node.label);
  const [editValue, setEditValue] = useState(node.value || '');
  const [addingChild, setAddingChild] = useState(false);
  const [newChildLabel, setNewChildLabel] = useState('');
  const [newChildValue, setNewChildValue] = useState('');

  const isRoot = node.id === 'root';
  const isCategory = node.nodeType === 'category';
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = (node.children || []).length > 0;
  const bgClass = NODE_TYPE_BG[node.nodeType || 'fact'] || NODE_TYPE_BG.fact;

  const handleSave = () => {
    onUpdateNode(node.id, {
      label: editLabel.trim() || node.label,
      value: editValue.trim() || undefined,
    });
    setEditing(false);
  };

  const handleAddChild = () => {
    if (!newChildLabel.trim()) return;
    const id = crypto.randomUUID();
    onAddNode(node.id, {
      id,
      label: newChildLabel.trim(),
      value: newChildValue.trim() || undefined,
      nodeType: isCategory || isRoot ? 'fact' : 'fact',
      importance: 'medium',
      children: [],
    });
    setNewChildLabel('');
    setNewChildValue('');
    setAddingChild(false);
    if (isCollapsed) onToggleCollapse(node.id);
  };

  if (isRoot) {
    return (
      <div className="flex flex-col items-center">
        {/* Root node */}
        <div className="relative">
          <div className="px-6 py-3 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-black uppercase tracking-widest shadow-lg">
            {node.label || 'My Map'}
          </div>
          <button
            onClick={() => setAddingChild(true)}
            className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-violet-500 text-white flex items-center justify-center shadow hover:bg-violet-600 transition-colors"
            title="Add category"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Add category inline */}
        {addingChild && (
          <div className="mt-3 flex gap-2 items-center">
            <input
              autoFocus
              value={newChildLabel}
              onChange={(e) => setNewChildLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddChild(); if (e.key === 'Escape') setAddingChild(false); }}
              placeholder="New category name…"
              className="px-3 py-1.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-black text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400 w-44"
            />
            <button onClick={handleAddChild} className="text-violet-500 hover:text-violet-700"><Check size={14} /></button>
            <button onClick={() => setAddingChild(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
        )}

        {/* Children */}
        {hasChildren && (
          <div className="mt-6 flex flex-wrap justify-center gap-6">
            {node.children.map((child) => (
              <NodeCard
                key={child.id}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                onUpdateNode={onUpdateNode}
                onDeleteNode={onDeleteNode}
                onAddNode={onAddNode}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-w-[160px] max-w-[220px]">
      {/* Node card */}
      <div className={`group relative w-full rounded-2xl border px-4 py-3 shadow-sm transition-all hover:shadow-md ${bgClass}`}>
        {editing ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              className="w-full bg-transparent border-b border-black/20 dark:border-white/20 text-[12px] font-semibold text-gray-900 dark:text-white outline-none pb-0.5"
            />
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="Value (optional)…"
              className="w-full bg-transparent text-[10px] text-gray-500 dark:text-white/40 outline-none border-b border-black/10 dark:border-white/10 pb-0.5"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} className="text-[10px] text-violet-600 dark:text-violet-300 font-semibold hover:underline">Save</button>
              <button onClick={() => setEditing(false)} className="text-[10px] text-gray-400 dark:text-white/30 hover:underline">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className={`text-[12px] font-semibold truncate ${isCategory ? 'text-violet-700 dark:text-violet-300' : 'text-gray-800 dark:text-white/80'}`}>
                  {node.label}
                </div>
                {node.value && (
                  <div className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5 line-clamp-2 leading-relaxed">
                    {node.value}
                  </div>
                )}
                {node.importance && (
                  <div
                    className="inline-block mt-1 w-2 h-2 rounded-full"
                    style={{ background: IMPORTANCE_COLORS[node.importance] || '#8b5cf6' }}
                    title={`Importance: ${node.importance}`}
                  />
                )}
              </div>
              {hasChildren && (
                <button
                  onClick={() => onToggleCollapse(node.id)}
                  className="shrink-0 text-gray-400 dark:text-white/20 hover:text-gray-700 dark:hover:text-white/60 mt-0.5"
                >
                  {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
              )}
            </div>

            {/* Actions (hover) */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
              <button
                onClick={() => setAddingChild(true)}
                className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-300 flex items-center justify-center hover:bg-violet-500/40"
                title="Add child node"
              >
                <Plus size={10} />
              </button>
              <button
                onClick={() => { setEditLabel(node.label); setEditValue(node.value || ''); setEditing(true); }}
                className="w-5 h-5 rounded-full bg-gray-200/60 dark:bg-white/10 text-gray-600 dark:text-white/50 flex items-center justify-center hover:bg-gray-300/60 dark:hover:bg-white/20"
                title="Edit node"
              >
                <Pencil size={9} />
              </button>
              <button
                onClick={() => { if (window.confirm(`Delete "${node.label}"?`)) onDeleteNode(node.id); }}
                className="w-5 h-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500/20"
                title="Delete node"
              >
                <Trash2 size={9} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Add child form */}
      {addingChild && (
        <div className="mt-2 w-full space-y-1.5">
          <input
            autoFocus
            value={newChildLabel}
            onChange={(e) => setNewChildLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddChild(); if (e.key === 'Escape') setAddingChild(false); }}
            placeholder="Label…"
            className="w-full px-3 py-1.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-black text-[11px] outline-none focus:border-violet-400"
          />
          <input
            value={newChildValue}
            onChange={(e) => setNewChildValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddChild(); }}
            placeholder="Value (optional)…"
            className="w-full px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black text-[10px] outline-none focus:border-violet-400"
          />
          <div className="flex gap-2">
            <button onClick={handleAddChild} className="flex-1 text-[10px] text-violet-600 dark:text-violet-300 font-semibold border border-violet-400/30 rounded-lg py-1 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              Add
            </button>
            <button onClick={() => setAddingChild(false)} className="flex-1 text-[10px] text-gray-400 border border-black/10 dark:border-white/10 rounded-lg py-1 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          {node.children.map((child) => (
            <NodeCard
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              onUpdateNode={onUpdateNode}
              onDeleteNode={onDeleteNode}
              onAddNode={onAddNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const MindMapView: React.FC<MindMapViewProps> = ({
  tree,
  onUpdateNode,
  onDeleteNode,
  onAddNode,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveCollapsed(next);
      return next;
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(2, Math.max(0.3, s - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setOffset({
      x: dragStart.current.ox + e.clientX - dragStart.current.x,
      y: dragStart.current.oy + e.clientY - dragStart.current.y,
    });
  }, []);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => { e.preventDefault(); setScale((s) => Math.min(2, Math.max(0.3, s - e.deltaY * 0.001))); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-[#F8F9FA] dark:bg-[#111] cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
        <button
          onClick={() => setScale((s) => Math.min(2, s + 0.15))}
          className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/20 flex items-center justify-center text-lg font-bold shadow-sm"
        >+</button>
        <button
          onClick={() => setScale((s) => Math.max(0.3, s - 0.15))}
          className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/20 flex items-center justify-center text-lg font-bold shadow-sm"
        >−</button>
        <button
          onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
          className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 text-[9px] text-gray-500 dark:text-white/40 hover:bg-gray-50 dark:hover:bg-white/20 flex items-center justify-center shadow-sm font-semibold uppercase"
          title="Reset view"
        >⌂</button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-4 text-[10px] text-gray-400 dark:text-white/20 z-10 pointer-events-none">
        Scroll to zoom · Drag to pan · Hover node for actions
      </div>

      {/* Mind map canvas */}
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '50% 50%',
          transition: dragging.current ? 'none' : 'transform 0.05s ease',
          minHeight: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '60px 40px',
        }}
      >
        <NodeCard
          node={tree}
          depth={0}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onUpdateNode={onUpdateNode}
          onDeleteNode={onDeleteNode}
          onAddNode={onAddNode}
        />
      </div>
    </div>
  );
};
