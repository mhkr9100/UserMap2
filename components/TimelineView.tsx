/**
 * TimelineView — Phase 3 visualisation: chronological list of context entries.
 *
 * Flattens the UserMap tree and groups entries by their `sourceDate`.
 * Entries without a date are grouped under "Undated".
 * Renders a vertical timeline with date headers and importance indicators.
 */

import React, { useMemo } from 'react';
import { PageNode, UserMapImportance } from '../types';

interface TimelineViewProps {
    tree: PageNode;
}

interface TimelineEntry {
    id: string;
    category: string;
    label: string;
    value: string;
    importance: UserMapImportance;
    sourceDate?: string;
}

function normalizeImportance(value?: string): UserMapImportance {
    return value === 'high' || value === 'low' ? value : 'medium';
}

function flattenEntries(node: PageNode, category = 'General Context'): TimelineEntry[] {
    const entries: TimelineEntry[] = [];
    const cat = node.nodeType === 'category' ? node.label : category;

    if (node.nodeType === 'fact' || (!node.nodeType && (node.children ?? []).length === 0)) {
        if (node.value?.trim()) {
            entries.push({
                id: node.id,
                category: cat,
                label: node.label,
                value: node.value.trim(),
                importance: normalizeImportance(node.importance),
                sourceDate: node.sourceDate
            });
        }
    }

    for (const child of node.children ?? []) {
        entries.push(...flattenEntries(child, cat));
    }

    return entries;
}

const IMPORTANCE_COLOR: Record<UserMapImportance, string> = {
    high: 'bg-emerald-500',
    medium: 'bg-amber-400',
    low: 'bg-gray-300 dark:bg-white/20'
};

const IMPORTANCE_LABEL: Record<UserMapImportance, string> = {
    high: 'High',
    medium: 'Med',
    low: 'Low'
};

function formatDate(iso?: string): string {
    if (!iso) return 'Undated';
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return iso;
    }
}

function groupByDate(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
    const map = new Map<string, TimelineEntry[]>();
    const sorted = [...entries].sort((a, b) => {
        if (!a.sourceDate && !b.sourceDate) return 0;
        if (!a.sourceDate) return 1;
        if (!b.sourceDate) return -1;
        return b.sourceDate.localeCompare(a.sourceDate);
    });

    for (const entry of sorted) {
        const key = formatDate(entry.sourceDate);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(entry);
    }

    return map;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ tree }) => {
    const grouped = useMemo(() => {
        const entries = flattenEntries(tree);
        return groupByDate(entries);
    }, [tree]);

    if (grouped.size === 0) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-white/30 text-sm">
                No entries to display in Timeline view.
            </div>
        );
    }

    return (
        <div className="relative pl-8">
            {/* Vertical spine */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-black/10 dark:bg-white/10" />

            {Array.from(grouped.entries()).map(([date, entries]) => (
                <div key={date} className="mb-8">
                    {/* Date marker */}
                    <div className="flex items-center gap-3 mb-3">
                        <div className="absolute left-[7px] w-3 h-3 rounded-full bg-gray-900 dark:bg-white border-2 border-white dark:border-[#1a1a1a]" />
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-700 dark:text-white/70">
                            {date}
                        </div>
                    </div>

                    <div className="space-y-2 ml-2">
                        {entries.map((entry) => (
                            <div
                                key={entry.id}
                                className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] p-3 flex items-start gap-3"
                            >
                                <div className="flex-shrink-0 mt-0.5">
                                    <span
                                        className={`inline-flex items-center justify-center w-8 h-4 rounded-full text-[8px] font-black uppercase tracking-wide text-white ${IMPORTANCE_COLOR[entry.importance]}`}
                                    >
                                        {IMPORTANCE_LABEL[entry.importance]}
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30">
                                            {entry.category}
                                        </span>
                                        <span className="text-[10px] font-bold text-gray-800 dark:text-white/80 truncate">
                                            {entry.label}
                                        </span>
                                    </div>
                                    <p className="text-[11px] leading-5 text-gray-600 dark:text-white/55 mt-0.5">
                                        {entry.value}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
