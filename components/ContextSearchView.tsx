import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PageNode, UserMapImportance } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchEntry {
    id: string;
    label: string;
    value: string;
    category: string;
    importance: UserMapImportance;
    sourceDate?: string;
    source?: string;
    confidence?: number;
}

type ImportanceFilter = 'all' | UserMapImportance;
type DateRangeFilter = 'any' | '7d' | '30d' | '90d' | '365d';

interface SearchFilters {
    keyword: string;
    category: string;
    importance: ImportanceFilter;
    source: string;
    dateRange: DateRangeFilter;
}

const DEFAULT_FILTERS: SearchFilters = {
    keyword: '',
    category: 'all',
    importance: 'all',
    source: 'all',
    dateRange: 'any',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeImportance(v?: string): UserMapImportance {
    return v === 'high' || v === 'low' ? v : 'medium';
}

function summarizeValue(node: PageNode): string {
    if (typeof node.value === 'string' && node.value.trim()) return node.value.trim();
    if (!node.children || node.children.length === 0) return '';
    return node.children
        .slice(0, 4)
        .map((c) => `${c.label}${c.value ? `: ${c.value}` : ''}`)
        .join(' · ');
}

function flattenEntries(node: PageNode, category?: string, out: SearchEntry[] = []): SearchEntry[] {
    if (node.id === 'root') {
        (node.children || []).forEach((c) => flattenEntries(c, c.label, out));
        return out;
    }

    const isCategory = node.nodeType === 'category';
    const activeCategory = isCategory ? node.label : (category || 'General Context');

    if (!isCategory) {
        const value = summarizeValue(node);
        if (value) {
            out.push({
                id: node.id,
                label: node.label,
                value,
                category: activeCategory,
                importance: normalizeImportance(node.importance),
                sourceDate: node.sourceDate,
                source: node.source,
                confidence: node.confidence,
            });
        }
    }
    (node.children || []).forEach((c) => flattenEntries(c, activeCategory, out));
    return out;
}

function isWithinDateRange(dateStr: string | undefined, range: DateRangeFilter): boolean {
    if (range === 'any') return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const now = Date.now();
    const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[range];
    return now - d.getTime() <= days * 24 * 60 * 60 * 1000;
}

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlight matched keyword in text, wrapping matches in <mark> spans.
 */
function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
    if (!keyword.trim()) return <>{text}</>;
    const re = new RegExp(`(${escapeRegex(keyword.trim())})`, 'gi');
    const parts = text.split(re);
    return (
        <>
            {parts.map((part, i) =>
                re.test(part) ? (
                    <mark
                        key={i}
                        className="bg-amber-200 dark:bg-amber-500/30 text-amber-900 dark:text-amber-200 rounded px-0.5"
                    >
                        {part}
                    </mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const FilterPill: React.FC<{
    label: string;
    active: boolean;
    onClick: () => void;
}> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.16em] border transition-all ${
            active
                ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-transparent'
                : 'bg-white dark:bg-white/[0.04] border-black/10 dark:border-white/10 text-gray-500 dark:text-white/50 hover:border-black/20 dark:hover:border-white/20'
        }`}
    >
        {label}
    </button>
);

interface SearchResultCardProps {
    entry: SearchEntry;
    keyword: string;
}

const SearchResultCard: React.FC<SearchResultCardProps> = ({ entry, keyword }) => {
    const importanceCls =
        entry.importance === 'high'
            ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
            : entry.importance === 'low'
                ? 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-gray-500 dark:text-white/40'
                : 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';

    return (
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-white/[0.03] p-4 hover:border-black/15 dark:hover:border-white/15 transition-colors group">
            <div className="flex flex-wrap items-start gap-2 mb-2">
                <h4 className="text-[11px] font-black text-gray-900 dark:text-white flex-1 min-w-0 leading-snug">
                    <HighlightedText text={entry.label} keyword={keyword} />
                </h4>
                <div className="flex flex-wrap gap-1 shrink-0">
                    {/* Category */}
                    <span className="rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-white/40">
                        {entry.category}
                    </span>
                    {/* Importance */}
                    <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] ${importanceCls}`}>
                        {entry.importance}
                    </span>
                    {/* Source */}
                    {entry.source && entry.source !== 'manual' && (
                        <span className="rounded-full border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-indigo-600 dark:text-indigo-300">
                            {entry.source}
                        </span>
                    )}
                </div>
            </div>

            <p className="text-[11px] leading-5 text-gray-600 dark:text-white/55 line-clamp-3">
                <HighlightedText text={entry.value} keyword={keyword} />
            </p>

            {(entry.sourceDate || entry.confidence !== undefined) && (
                <div className="mt-3 flex items-center gap-3 pt-3 border-t border-black/5 dark:border-white/5">
                    {typeof entry.confidence === 'number' && (
                        <span className="text-[9px] text-gray-400 dark:text-white/25">
                            {Math.round(entry.confidence * 100)}% confidence
                        </span>
                    )}
                    {entry.sourceDate && (
                        <span className="ml-auto text-[9px] text-gray-400 dark:text-white/25">
                            {entry.sourceDate}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Summary panel
// ---------------------------------------------------------------------------

const SummaryPanel: React.FC<{
    results: SearchEntry[];
    keyword: string;
}> = ({ results, keyword }) => {
    const byImportance = useMemo(
        () => ({
            high: results.filter((r) => r.importance === 'high').length,
            medium: results.filter((r) => r.importance === 'medium').length,
            low: results.filter((r) => r.importance === 'low').length,
        }),
        [results]
    );

    const byCategory = useMemo(() => {
        const map = new Map<string, number>();
        results.forEach((r) => map.set(r.category, (map.get(r.category) ?? 0) + 1));
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [results]);

    const bySources = useMemo(() => {
        const map = new Map<string, number>();
        results.forEach((r) => {
            if (r.source) map.set(r.source, (map.get(r.source) ?? 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [results]);

    return (
        <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-5">
            <div>
                <div className="text-[8px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-white/30 mb-1">Results</div>
                <div className="text-2xl font-black text-gray-900 dark:text-white">{results.length}</div>
                {keyword && (
                    <div className="text-[10px] text-gray-500 dark:text-white/40 mt-1">
                        matching "<span className="font-bold text-gray-700 dark:text-white/70">{keyword}</span>"
                    </div>
                )}
            </div>

            {/* Signal breakdown */}
            <div>
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 mb-2.5">By Signal</div>
                <div className="space-y-2">
                    {([['high', 'bg-amber-400', byImportance.high], ['medium', 'bg-emerald-400', byImportance.medium], ['low', 'bg-gray-300 dark:bg-gray-600', byImportance.low]] as [string, string, number][]).map(([label, color, count]) => (
                        <div key={label} className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-white/40 w-14">{label}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-black/5 dark:bg-white/8 overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${color} transition-all`}
                                    style={{ width: results.length > 0 ? `${(count / results.length) * 100}%` : '0%' }}
                                />
                            </div>
                            <span className="text-[9px] font-bold text-gray-500 dark:text-white/40 w-6 text-right">{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top categories */}
            {byCategory.length > 0 && (
                <div>
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 mb-2">Top Categories</div>
                    <ul className="space-y-1">
                        {byCategory.map(([cat, count]) => (
                            <li key={cat} className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-gray-600 dark:text-white/55 truncate">{cat}</span>
                                <span className="text-[9px] font-bold text-gray-400 dark:text-white/30 shrink-0">{count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Sources */}
            {bySources.length > 0 && (
                <div>
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 mb-2">Sources</div>
                    <ul className="space-y-1">
                        {bySources.map(([src, count]) => (
                            <li key={src} className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-indigo-600 dark:text-indigo-300 uppercase font-bold">{src}</span>
                                <span className="text-[9px] font-bold text-gray-400 dark:text-white/30">{count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main ContextSearchView
// ---------------------------------------------------------------------------

interface ContextSearchViewProps {
    tree: PageNode;
}

export const ContextSearchView: React.FC<ContextSearchViewProps> = ({ tree }) => {
    const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
    const inputRef = useRef<HTMLInputElement>(null);

    const allEntries = useMemo(() => flattenEntries(tree), [tree]);

    // Unique categories and sources for filter pills
    const categories = useMemo(() => {
        const set = new Set(allEntries.map((e) => e.category));
        return Array.from(set).sort();
    }, [allEntries]);

    const sources = useMemo(() => {
        const set = new Set(allEntries.map((e) => e.source).filter(Boolean) as string[]);
        return Array.from(set).sort();
    }, [allEntries]);

    const results = useMemo(() => {
        return allEntries.filter((entry) => {
            // Keyword
            if (filters.keyword.trim()) {
                const kw = filters.keyword.trim().toLowerCase();
                const match =
                    entry.label.toLowerCase().includes(kw) ||
                    entry.value.toLowerCase().includes(kw) ||
                    entry.category.toLowerCase().includes(kw);
                if (!match) return false;
            }
            // Category
            if (filters.category !== 'all' && entry.category !== filters.category) return false;
            // Importance
            if (filters.importance !== 'all' && entry.importance !== filters.importance) return false;
            // Source
            if (filters.source !== 'all' && entry.source !== filters.source) return false;
            // Date range
            if (!isWithinDateRange(entry.sourceDate, filters.dateRange)) return false;
            return true;
        });
    }, [allEntries, filters]);

    const setKeyword = useCallback((v: string) => setFilters((f) => ({ ...f, keyword: v })), []);
    const hasActiveFilters =
        filters.keyword !== '' ||
        filters.category !== 'all' ||
        filters.importance !== 'all' ||
        filters.source !== 'all' ||
        filters.dateRange !== 'any';

    const clearFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
        inputRef.current?.focus();
    }, []);

    return (
        <div className="w-full">
            {/* Search bar */}
            <div className="mb-5">
                <div className="relative">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/30 pointer-events-none"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={filters.keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="Search your context… e.g. 'React', 'budget', 'team'"
                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[12px] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-400/20 dark:focus:ring-indigo-500/20 transition-all"
                        autoFocus
                    />
                    {filters.keyword && (
                        <button
                            onClick={() => setKeyword('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/10 dark:bg-white/10 text-gray-500 dark:text-white/50 flex items-center justify-center text-xs hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Filters row */}
            <div className="space-y-3 mb-6 pb-5 border-b border-black/8 dark:border-white/8">
                {/* Importance filter */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 w-16 shrink-0">Signal</span>
                    {(['all', 'high', 'medium', 'low'] as ImportanceFilter[]).map((f) => (
                        <FilterPill
                            key={f}
                            label={f === 'all' ? 'All' : f}
                            active={filters.importance === f}
                            onClick={() => setFilters((prev) => ({ ...prev, importance: f }))}
                        />
                    ))}
                </div>

                {/* Date range filter */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 w-16 shrink-0">Date</span>
                    {([
                        ['any', 'Any time'],
                        ['7d', 'Last 7 days'],
                        ['30d', 'Last 30 days'],
                        ['90d', 'Last 90 days'],
                        ['365d', 'Last year'],
                    ] as [DateRangeFilter, string][]).map(([val, label]) => (
                        <FilterPill
                            key={val}
                            label={label}
                            active={filters.dateRange === val}
                            onClick={() => setFilters((prev) => ({ ...prev, dateRange: val }))}
                        />
                    ))}
                </div>

                {/* Category filter (only shown when categories exist) */}
                {categories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 w-16 shrink-0">Category</span>
                        <FilterPill
                            label="All"
                            active={filters.category === 'all'}
                            onClick={() => setFilters((prev) => ({ ...prev, category: 'all' }))}
                        />
                        {categories.slice(0, 8).map((cat) => (
                            <FilterPill
                                key={cat}
                                label={cat}
                                active={filters.category === cat}
                                onClick={() => setFilters((prev) => ({ ...prev, category: prev.category === cat ? 'all' : cat }))}
                            />
                        ))}
                    </div>
                )}

                {/* Source filter (only shown when multiple sources exist) */}
                {sources.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 w-16 shrink-0">Source</span>
                        <FilterPill
                            label="All"
                            active={filters.source === 'all'}
                            onClick={() => setFilters((prev) => ({ ...prev, source: 'all' }))}
                        />
                        {sources.map((src) => (
                            <FilterPill
                                key={src}
                                label={src}
                                active={filters.source === src}
                                onClick={() => setFilters((prev) => ({ ...prev, source: prev.source === src ? 'all' : src }))}
                            />
                        ))}
                    </div>
                )}

                {/* Clear filters */}
                {hasActiveFilters && (
                    <div className="flex items-center">
                        <button
                            onClick={clearFilters}
                            className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white/70 transition-colors flex items-center gap-1.5"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                            Clear all filters
                        </button>
                    </div>
                )}
            </div>

            {/* Results + summary */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem] gap-6">
                {/* Results list */}
                <div>
                    {results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/[0.01]">
                            <div className="text-3xl mb-3">🔍</div>
                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-700 dark:text-white/60 mb-2">
                                {allEntries.length === 0 ? 'No Context Yet' : 'No Matches'}
                            </h3>
                            <p className="text-[11px] text-gray-400 dark:text-white/30 max-w-xs">
                                {allEntries.length === 0
                                    ? 'Import or sync memories to start searching your context.'
                                    : 'Try different keywords or adjust your filters.'}
                            </p>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="mt-4 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500 dark:text-indigo-300 hover:underline"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-white/30 mb-4">
                                {results.length} {results.length === 1 ? 'result' : 'results'}
                                {hasActiveFilters && <span className="ml-2 text-indigo-400 dark:text-indigo-300">(filtered)</span>}
                            </div>
                            {results.map((entry) => (
                                <SearchResultCard key={entry.id} entry={entry} keyword={filters.keyword} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Summary panel */}
                <aside className="hidden xl:block">
                    <SummaryPanel results={results} keyword={filters.keyword} />
                </aside>
            </div>
        </div>
    );
};
