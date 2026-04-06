import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { PageNode, UserMapImportance } from '../types';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const NODE_W = 180;
const NODE_H = 64;
const H_GAP = 40;
const V_GAP = 60;

const IMPORTANCE_COLORS: Record<UserMapImportance, { bg: string; border: string; dot: string }> = {
    high: { bg: '#FFFBEB', border: '#F59E0B', dot: '#F59E0B' },
    medium: { bg: '#ECFDF5', border: '#10B981', dot: '#10B981' },
    low: { bg: '#F9FAFB', border: '#D1D5DB', dot: '#9CA3AF' },
};

const DARK_IMPORTANCE_COLORS: Record<UserMapImportance, { bg: string; border: string; dot: string }> = {
    high: { bg: '#1C1400', border: '#D97706', dot: '#D97706' },
    medium: { bg: '#022C22', border: '#059669', dot: '#059669' },
    low: { bg: '#111827', border: '#374151', dot: '#6B7280' },
};

function normalizeImportance(v?: string): UserMapImportance {
    return v === 'high' || v === 'low' ? v : 'medium';
}

function truncate(s: string, max: number) {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ---------------------------------------------------------------------------
// Layout algorithm: place nodes in a layered top-down graph
// ---------------------------------------------------------------------------

interface LayoutNode {
    id: string;
    label: string;
    value?: string;
    importance: UserMapImportance;
    nodeType?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    children: string[];
    parentId?: string;
}

function layoutTree(root: PageNode): { nodes: LayoutNode[]; edges: { from: string; to: string }[] } {
    const nodes: LayoutNode[] = [];
    const edges: { from: string; to: string }[] = [];

    // Assign positions layer by layer (BFS)
    const posMap = new Map<string, { x: number; y: number }>();
    const layerMap = new Map<number, PageNode[]>();
    const parentMap = new Map<string, string>();

    function collectLayers(node: PageNode, depth: number) {
        if (!layerMap.has(depth)) layerMap.set(depth, []);
        layerMap.get(depth)!.push(node);
        (node.children || []).forEach((child) => {
            parentMap.set(child.id, node.id);
            collectLayers(child, depth + 1);
        });
    }
    collectLayers(root, 0);

    const maxDepth = Math.max(...layerMap.keys());

    for (let depth = 0; depth <= maxDepth; depth++) {
        const layer = layerMap.get(depth) || [];
        const totalW = layer.length * NODE_W + (layer.length - 1) * H_GAP;
        layer.forEach((n, i) => {
            posMap.set(n.id, {
                x: i * (NODE_W + H_GAP) - totalW / 2 + NODE_W / 2,
                y: depth * (NODE_H + V_GAP),
            });
        });
    }

    function buildNodes(node: PageNode) {
        const pos = posMap.get(node.id) || { x: 0, y: 0 };
        nodes.push({
            id: node.id,
            label: node.label,
            value: node.value,
            importance: normalizeImportance(node.importance),
            nodeType: node.nodeType,
            x: pos.x,
            y: pos.y,
            w: NODE_W,
            h: NODE_H,
            children: (node.children || []).map((c) => c.id),
            parentId: parentMap.get(node.id),
        });
        (node.children || []).forEach((child) => {
            edges.push({ from: node.id, to: child.id });
            buildNodes(child);
        });
    }
    buildNodes(root);

    return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FlowNodeProps {
    node: LayoutNode;
    isDark: boolean;
    selected: boolean;
    onClick: (id: string) => void;
}

const FlowNode: React.FC<FlowNodeProps> = ({ node, isDark, selected, onClick }) => {
    const colors = isDark ? DARK_IMPORTANCE_COLORS[node.importance] : IMPORTANCE_COLORS[node.importance];
    const isRoot = node.nodeType === 'root';
    const isCategory = node.nodeType === 'category';
    const isCluster = node.nodeType === 'cluster';

    const rx = isRoot ? 32 : isCategory ? 16 : isCluster ? 12 : 8;

    return (
        <g
            transform={`translate(${node.x - node.w / 2}, ${node.y})`}
            onClick={() => onClick(node.id)}
            style={{ cursor: 'pointer' }}
            role="button"
            aria-label={node.label}
        >
            <rect
                x={0}
                y={0}
                width={node.w}
                height={node.h}
                rx={rx}
                ry={rx}
                fill={isRoot ? (isDark ? '#111827' : '#F9FAFB') : colors.bg}
                stroke={selected ? '#6366F1' : colors.border}
                strokeWidth={selected ? 2.5 : isRoot ? 2 : 1.5}
                opacity={0.97}
            />
            {/* importance dot */}
            {!isRoot && (
                <circle cx={14} cy={node.h / 2} r={4} fill={colors.dot} />
            )}
            {/* label */}
            <text
                x={isRoot ? node.w / 2 : 26}
                y={node.h / 2 - (node.value && !isCategory ? 8 : 0)}
                fontSize={isRoot ? 11 : isCategory ? 10 : 9}
                fontWeight={isRoot || isCategory ? '800' : '600'}
                fill={isDark ? '#F9FAFB' : '#111827'}
                textAnchor={isRoot ? 'middle' : 'start'}
                dominantBaseline="middle"
                fontFamily="Inter, sans-serif"
            >
                {truncate(node.label, isRoot ? 22 : 20)}
            </text>
            {/* value */}
            {node.value && !isCategory && !isRoot && (
                <text
                    x={26}
                    y={node.h / 2 + 9}
                    fontSize={8}
                    fontWeight="400"
                    fill={isDark ? '#9CA3AF' : '#6B7280'}
                    textAnchor="start"
                    dominantBaseline="middle"
                    fontFamily="Inter, sans-serif"
                >
                    {truncate(node.value, 22)}
                </text>
            )}
            {/* child count badge */}
            {node.children.length > 0 && (
                <g transform={`translate(${node.w - 20}, 8)`}>
                    <circle cx={8} cy={8} r={8} fill={isDark ? '#374151' : '#E5E7EB'} />
                    <text
                        x={8}
                        y={8}
                        fontSize={7}
                        fontWeight="800"
                        fill={isDark ? '#D1D5DB' : '#374151'}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontFamily="Inter, sans-serif"
                    >
                        {node.children.length}
                    </text>
                </g>
            )}
        </g>
    );
};

// ---------------------------------------------------------------------------
// Main FlowChartView
// ---------------------------------------------------------------------------

interface FlowChartViewProps {
    tree: PageNode;
}

export const FlowChartView: React.FC<FlowChartViewProps> = ({ tree }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [selected, setSelected] = useState<string | null>(null);
    const [isDark, setIsDark] = useState(() =>
        document.documentElement.classList.contains('dark')
    );

    // Keep isDark in sync with theme changes applied via the <html> class.
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const { nodes, edges } = useMemo(() => layoutTree(tree), [tree]);

    // Bounding box
    const bounds = useMemo(() => {
        if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 400 };
        const xs = nodes.flatMap((n) => [n.x - n.w / 2, n.x + n.w / 2]);
        const ys = nodes.flatMap((n) => [n.y, n.y + n.h]);
        return {
            minX: Math.min(...xs) - 40,
            minY: Math.min(...ys) - 40,
            maxX: Math.max(...xs) + 40,
            maxY: Math.max(...ys) + 40,
        };
    }, [nodes]);

    const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

    const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if ((e.target as Element).closest('[role="button"]')) return;
        setDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }, [pan]);

    const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!dragging) return;
        setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }, [dragging, dragStart]);

    const onMouseUp = useCallback(() => setDragging(false), []);

    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setScale((s) => Math.min(3, Math.max(0.3, s - e.deltaY * 0.001)));
    }, []);

    const handleReset = () => {
        setPan({ x: 0, y: 0 });
        setScale(1);
    };

    const viewW = bounds.maxX - bounds.minX;
    const viewH = bounds.maxY - bounds.minY;

    const selectedNode = selected ? nodeMap.get(selected) : null;

    return (
        <div className="relative w-full h-full flex">
            {/* SVG canvas */}
            <div className="flex-1 relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/20">
                <svg
                    ref={svgRef}
                    className="w-full h-full select-none"
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    onWheel={onWheel}
                >
                    <defs>
                        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                            <path d="M0,0 L8,4 L0,8 Z" fill={isDark ? '#4B5563' : '#9CA3AF'} />
                        </marker>
                    </defs>
                    <g transform={`translate(${pan.x + (svgRef.current?.clientWidth ?? 900) / 2}, ${pan.y + 60}) scale(${scale})`}>
                        {/* Edges */}
                        {edges.map(({ from, to }) => {
                            const fn = nodeMap.get(from);
                            const tn = nodeMap.get(to);
                            if (!fn || !tn) return null;
                            const x1 = fn.x;
                            const y1 = fn.y + fn.h;
                            const x2 = tn.x;
                            const y2 = tn.y;
                            const mx = (x1 + x2) / 2;
                            const my = (y1 + y2) / 2;
                            const isHighlighted = selected && (from === selected || to === selected);
                            return (
                                <path
                                    key={`${from}-${to}`}
                                    d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                                    fill="none"
                                    stroke={isHighlighted ? '#6366F1' : (isDark ? '#374151' : '#D1D5DB')}
                                    strokeWidth={isHighlighted ? 2 : 1}
                                    strokeDasharray={isHighlighted ? undefined : '4,3'}
                                    markerEnd="url(#arrowhead)"
                                    opacity={0.8}
                                />
                            );
                        })}
                        {/* Nodes */}
                        {nodes.map((node) => (
                            <FlowNode
                                key={node.id}
                                node={node}
                                isDark={isDark}
                                selected={selected === node.id}
                                onClick={(id) => setSelected((prev) => prev === id ? null : id)}
                            />
                        ))}
                    </g>
                </svg>

                {/* Controls */}
                <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                    <button
                        onClick={() => setScale((s) => Math.min(3, s + 0.2))}
                        className="w-9 h-9 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 text-gray-600 dark:text-white/60 flex items-center justify-center text-lg font-bold hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        title="Zoom in"
                    >+</button>
                    <button
                        onClick={() => setScale((s) => Math.max(0.3, s - 0.2))}
                        className="w-9 h-9 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 text-gray-600 dark:text-white/60 flex items-center justify-center text-lg font-bold hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        title="Zoom out"
                    >−</button>
                    <button
                        onClick={handleReset}
                        className="w-9 h-9 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 text-gray-600 dark:text-white/60 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        title="Reset view"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                    </button>
                </div>

                {/* Hint */}
                <div className="absolute top-3 left-3 text-[8px] font-black uppercase tracking-[0.14em] text-gray-400 dark:text-white/25 bg-white/80 dark:bg-black/40 rounded-lg px-2 py-1 border border-black/5 dark:border-white/5">
                    Drag to pan · Scroll to zoom · Click node to highlight
                </div>
            </div>

            {/* Detail panel */}
            {selectedNode && (
                <aside className="w-64 ml-4 shrink-0 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 flex flex-col gap-4 overflow-auto custom-scrollbar">
                    <div>
                        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 mb-1">Selected Node</div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-white leading-snug">{selectedNode.label}</h3>
                    </div>
                    {selectedNode.value && (
                        <div>
                            <div className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-white/30 mb-1">Value</div>
                            <p className="text-[11px] leading-5 text-gray-600 dark:text-white/60">{selectedNode.value}</p>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <div className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-white/30 mb-1">Type</div>
                            <span className="text-[9px] font-bold text-gray-700 dark:text-white/60 bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5">
                                {selectedNode.nodeType || 'node'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-white/30 mb-1">Signal</div>
                            <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 ${
                                selectedNode.importance === 'high'
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                    : selectedNode.importance === 'low'
                                        ? 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40'
                                        : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                            }`}>
                                {selectedNode.importance}
                            </span>
                        </div>
                    </div>
                    {selectedNode.children.length > 0 && (
                        <div>
                            <div className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-white/30 mb-2">Connects To</div>
                            <ul className="space-y-1">
                                {selectedNode.children.slice(0, 5).map((cid) => {
                                    const cn = nodeMap.get(cid);
                                    return cn ? (
                                        <li key={cid} className="text-[10px] text-gray-600 dark:text-white/55 truncate">
                                            → {cn.label}
                                        </li>
                                    ) : null;
                                })}
                                {selectedNode.children.length > 5 && (
                                    <li className="text-[9px] text-gray-400 dark:text-white/30">
                                        +{selectedNode.children.length - 5} more
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                    <button
                        onClick={() => setSelected(null)}
                        className="mt-auto text-[9px] font-black uppercase tracking-[0.18em] text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                        ✕ Deselect
                    </button>
                </aside>
            )}
        </div>
    );
};
