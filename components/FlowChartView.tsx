/**
 * FlowChartView — Phase 3 visualisation: an SVG-based, pannable flow-chart/graph.
 *
 * Renders every category as a top-level node connected by directed edges to its
 * child clusters and facts, giving users a bird's-eye overview of their knowledge
 * graph.  Supports mouse-drag panning and scroll-wheel zoom.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageNode } from '../types';

interface FlowChartViewProps {
    tree: PageNode;
}

interface GraphNode {
    id: string;
    label: string;
    value?: string;
    depth: number;
    x: number;
    y: number;
    width: number;
    height: number;
    nodeType?: string;
}

interface GraphEdge {
    from: string;
    to: string;
}

/** Horizontal and vertical spacing between nodes. */
const H_GAP = 60;
const V_GAP = 40;
const NODE_HEIGHT = 48;
const MIN_NODE_WIDTH = 120;
const CHAR_PX = 7; // approx px per character for label sizing

function buildGraph(tree: PageNode): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Build a layered layout: root at left, categories in next column, etc.
    // We use a simple depth-first layout for simplicity.
    let yOffset = 0;

    function visit(node: PageNode, depth: number, parentId: string | null) {
        const width = Math.max(MIN_NODE_WIDTH, node.label.length * CHAR_PX + 32);
        const x = depth * (MIN_NODE_WIDTH + H_GAP);
        const myY = yOffset;
        yOffset += NODE_HEIGHT + V_GAP;

        const gn: GraphNode = {
            id: node.id,
            label: node.label,
            value: node.value,
            depth,
            x,
            y: myY,
            width,
            height: NODE_HEIGHT,
            nodeType: node.nodeType
        };
        nodes.push(gn);

        if (parentId) {
            edges.push({ from: parentId, to: node.id });
        }

        for (const child of node.children ?? []) {
            visit(child, depth + 1, node.id);
        }
    }

    // Skip the root node itself; render its children as top-level.
    for (const child of tree.children ?? []) {
        visit(child, 0, null);
    }

    return { nodes, edges };
}

function nodeColor(nodeType?: string): { fill: string; stroke: string; text: string } {
    switch (nodeType) {
        case 'category':
            return { fill: '#1f2937', stroke: '#374151', text: '#f9fafb' };
        case 'cluster':
            return { fill: '#0f766e', stroke: '#0d9488', text: '#f0fdfa' };
        case 'fact':
            return { fill: '#f1f5f9', stroke: '#cbd5e1', text: '#1e293b' };
        default:
            return { fill: '#6366f1', stroke: '#4f46e5', text: '#fff' };
    }
}

export const FlowChartView: React.FC<FlowChartViewProps> = ({ tree }) => {
    const { nodes, edges } = buildGraph(tree);

    const svgRef = useRef<SVGSVGElement>(null);
    const [pan, setPan] = useState({ x: 20, y: 20 });
    const [zoom, setZoom] = useState(1);
    const dragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    // Build a lookup map for edge drawing.
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        dragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragging.current) return;
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    }, []);

    const onMouseUp = useCallback(() => {
        dragging.current = false;
    }, []);

    const onWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        setZoom((z) => Math.min(3, Math.max(0.25, z - e.deltaY * 0.001)));
    }, []);

    useEffect(() => {
        const el = svgRef.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [onWheel]);

    if (nodes.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-white/30 text-sm">
                No data to display in Flow Chart view.
            </div>
        );
    }

    return (
        <div className="relative w-full h-full overflow-hidden bg-[#f8f9fa] dark:bg-[#0d0f11] rounded-2xl border border-black/10 dark:border-white/10">
            {/* Hint */}
            <div className="absolute top-3 right-3 z-10 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/25 select-none">
                Drag to pan · Scroll to zoom
            </div>

            <svg
                ref={svgRef}
                className="w-full h-full cursor-grab active:cursor-grabbing select-none"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
            >
                <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                    {/* Draw edges first so nodes render on top */}
                    {edges.map((edge) => {
                        const from = nodeMap.get(edge.from);
                        const to = nodeMap.get(edge.to);
                        if (!from || !to) return null;
                        const x1 = from.x + from.width;
                        const y1 = from.y + from.height / 2;
                        const x2 = to.x;
                        const y2 = to.y + to.height / 2;
                        const cx = (x1 + x2) / 2;
                        return (
                            <path
                                key={`${edge.from}-${edge.to}`}
                                d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth={1.5}
                                opacity={0.6}
                            />
                        );
                    })}

                    {/* Draw nodes */}
                    {nodes.map((n) => {
                        const { fill, stroke, text } = nodeColor(n.nodeType);
                        return (
                            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                                <rect
                                    width={n.width}
                                    height={n.height}
                                    rx={10}
                                    ry={10}
                                    fill={fill}
                                    stroke={stroke}
                                    strokeWidth={1.5}
                                />
                                <text
                                    x={n.width / 2}
                                    y={n.height / 2}
                                    dominantBaseline="middle"
                                    textAnchor="middle"
                                    fontSize={11}
                                    fontWeight={700}
                                    fill={text}
                                    style={{ userSelect: 'none' }}
                                >
                                    {n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
};
