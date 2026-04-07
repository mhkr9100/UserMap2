/**
 * ContextSearchView — Phase 3 feature: full-text search + filter UI.
 *
 * - Keyword search across all context entries (label + value + category).
 * - Filter by importance (high / medium / low) and category.
 * - Highlights matched substrings in the results.
 */

import React, { useMemo, useState } from 'react';
import { PageNode, UserMapImportance } from '../types';

interface ContextSearchViewProps {
    tree: PageNode;
}

interface SearchEntry {
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

function flattenAll(node: PageNode, category = 'General Context'): SearchEntry[] {
    const entries: SearchEntry[] = [];
    const cat = node.nodeType === 'category' ? node.label : category;

    if (node.nodeType === 'fact' || (!node.nodeType && (node.children ?? []).length === 0)) {
        if (node.label || node.value?.trim()) {
            entries.push({
                id: node.id,
                category: cat,
                label: node.label,
                value: node.value?.trim() ?? '',
                importance: normalizeImportance(node.importance),
                sourceDate: node.sourceDate
            });
        }
    }

    for (const child of node.children ?? []) {
        entries.push(...flattenAll(child, cat));
    }

    return entries;
}

function highlight(text: string, keyword: string): React.ReactNode {
    if (!keyword.trim()) return text;
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
        regex.test(part) ? (
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 text-gray-900 dark:text-white rounded-sm px-0.5">
                {part}
            </mark>
        ) : (
            part
        )
    );
}

const IMPORTANCE_BADGE: Record<UserMapImportance, string> = {
    high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    low: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/40'
};

export const ContextSearchView: React.FC<ContextSearchViewProps> = ({ tree }) => {
    const [keyword, setKeyword] = useState('');
    const [importanceFilter, setImportanceFilter] = useState<UserMapImportance | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    const allEntries = useMemo(() => flattenAll(tree), [tree]);

    const categories = useMemo(() => {
        const cats = Array.from(new Set(allEntries.map((e) => e.category))).sort();
        return ['all', ...cats];
    }, [allEntries]);

    const results = useMemo(() => {
        const kw = keyword.toLowerCase().trim();
        return allEntries.filter((entry) => {
            if (importanceFilter !== 'all' && entry.importance !== importanceFilter) return false;
            if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
            if (!kw) return true;
            return (
                entry.label.toLowerCase().includes(kw) ||
                entry.value.toLowerCase().includes(kw) ||
                entry.category.toLowerCase().includes(kw)
            );
        });
    }, [allEntries, keyword, importanceFilter, categoryFilter]);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Search bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/30 pointer-events-none"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search context…"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[12px] text-gray-800 dark:text-white/80 placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none focus:border-emerald-500 dark:focus:border-emerald-400 transition-colors"
                    />
                </div>

                {/* Importance filter */}
                <div className="flex gap-1.5 flex-wrap">
                    {(['all', 'high', 'medium', 'low'] as const).map((imp) => (
                        <button
                            key={imp}
                            onClick={() => setImportanceFilter(imp)}
                            className={`rounded-full px-3 py-2 text-[9px] font-black uppercase tracking-widest border transition-all ${importanceFilter === imp
                                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-transparent'
                                    : 'bg-white dark:bg-white/[0.04] border-black/10 dark:border-white/10 text-gray-600 dark:text-white/55'
                                }`}
                        >
                            {imp === 'all' ? 'All' : imp}
                        </button>
                    ))}
                </div>
            </div>

            {/* Category filter */}
            <div className="flex gap-1.5 flex-wrap">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-all ${categoryFilter === cat
                                ? 'bg-emerald-600 dark:bg-emerald-400 text-white dark:text-black border-transparent'
                                : 'bg-white dark:bg-white/[0.04] border-black/10 dark:border-white/10 text-gray-600 dark:text-white/55'
                            }`}
                    >
                        {cat === 'all' ? 'All Categories' : cat}
                    </button>
                ))}
            </div>

            {/* Result count */}
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30">
                {results.length} result{results.length !== 1 ? 's' : ''}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-auto space-y-2 pb-4">
                {results.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-gray-400 dark:text-white/30 text-sm">
                        No matching entries found.
                    </div>
                ) : (
                    results.map((entry) => (
                        <div
                            key={entry.id}
                            className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] p-3"
                        >
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${IMPORTANCE_BADGE[entry.importance]}`}>
                                    {entry.importance}
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-white/30">
                                    {entry.category}
                                </span>
                                <span className="text-[10px] font-bold text-gray-800 dark:text-white/80">
                                    {highlight(entry.label, keyword)}
                                </span>
                            </div>
                            {entry.value && (
                                <p className="text-[11px] leading-5 text-gray-600 dark:text-white/55">
                                    {highlight(entry.value, keyword)}
                                </p>
                            )}
                            {entry.sourceDate && (
                                <div className="mt-1 text-[9px] text-gray-400 dark:text-white/25">
                                    {new Date(entry.sourceDate).toLocaleDateString()}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
