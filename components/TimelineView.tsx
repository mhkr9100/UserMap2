import React, { useMemo, useState } from 'react';
import { PageNode, UserMapImportance } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineEntry {
    id: string;
    label: string;
    value: string;
    category: string;
    importance: UserMapImportance;
    sourceDate?: string;
    source?: string;
    confidence?: number;
    parsedDate: Date | null;
}

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
        .slice(0, 3)
        .map((c) => `${c.label}${c.value ? `: ${c.value}` : ''}`)
        .join(' · ');
}

function parseDate(s?: string): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupKey(d: Date): string {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function flattenEntries(node: PageNode, category?: string, out: TimelineEntry[] = []): TimelineEntry[] {
    if (node.id === 'root') {
        (node.children || []).forEach((c) => flattenEntries(c, c.label, out));
        return out;
    }

    const isCategory = node.nodeType === 'category';
    const activeCategory = isCategory ? node.label : (category || 'General Context');

    if (!isCategory) {
        const value = summarizeValue(node);
        if (value) {
            const parsedDate = parseDate(node.sourceDate);
            out.push({
                id: node.id,
                label: node.label,
                value,
                category: activeCategory,
                importance: normalizeImportance(node.importance),
                sourceDate: node.sourceDate,
                source: node.source,
                confidence: node.confidence,
                parsedDate,
            });
        }
    }

    (node.children || []).forEach((c) => flattenEntries(c, activeCategory, out));
    return out;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ImportanceDot: React.FC<{ importance: UserMapImportance }> = ({ importance }) => {
    const cls =
        importance === 'high'
            ? 'bg-amber-500'
            : importance === 'low'
                ? 'bg-gray-300 dark:bg-gray-600'
                : 'bg-emerald-500';
    return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls}`} />;
};

const CategoryBadge: React.FC<{ label: string }> = ({ label }) => (
    <span className="rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-gray-500 dark:text-white/40">
        {label}
    </span>
);

const SourceBadge: React.FC<{ source?: string }> = ({ source }) => {
    if (!source || source === 'manual') return null;
    return (
        <span className="rounded-full border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-indigo-600 dark:text-indigo-300">
            {source}
        </span>
    );
};

interface TimelineCardProps {
    entry: TimelineEntry;
}

const TimelineCard: React.FC<TimelineCardProps> = ({ entry }) => {
    const [expanded, setExpanded] = useState(false);
    const isLong = entry.value.length > 100;

    return (
        <div className="group relative ml-6 pl-6 pb-6">
            {/* Timeline line */}
            <div className="absolute left-0 top-0 bottom-0 w-px bg-black/10 dark:bg-white/10 group-last:bg-gradient-to-b group-last:from-black/10 group-last:to-transparent dark:group-last:from-white/10 dark:group-last:to-transparent" />
            {/* Timeline dot */}
            <div className={`absolute left-0 top-2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-[#1A1A1A] ring-1 ${
                entry.importance === 'high'
                    ? 'bg-amber-400 ring-amber-300'
                    : entry.importance === 'low'
                        ? 'bg-gray-300 ring-gray-200 dark:ring-gray-600'
                        : 'bg-emerald-400 ring-emerald-300'
            }`} />

            <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-white/[0.03] p-4 hover:shadow-sm transition-shadow">
                {/* Header */}
                <div className="flex flex-wrap items-start gap-2 mb-2">
                    <h4 className="text-[11px] font-black text-gray-900 dark:text-white flex-1 min-w-0 leading-snug">
                        {entry.label}
                    </h4>
                    <div className="flex flex-wrap gap-1 shrink-0">
                        <CategoryBadge label={entry.category} />
                        <SourceBadge source={entry.source} />
                    </div>
                </div>

                {/* Value */}
                <p className={`text-[11px] leading-5 text-gray-600 dark:text-white/55 ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
                    {entry.value}
                </p>
                {isLong && (
                    <button
                        onClick={() => setExpanded((v) => !v)}
                        className="mt-1 text-[9px] font-bold text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white/60 transition-colors"
                    >
                        {expanded ? 'Show less' : 'Show more'}
                    </button>
                )}

                {/* Footer */}
                <div className="mt-3 flex items-center gap-3">
                    <ImportanceDot importance={entry.importance} />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/30">
                        {entry.importance} signal
                    </span>
                    {typeof entry.confidence === 'number' && (
                        <span className="text-[9px] text-gray-400 dark:text-white/25">
                            {Math.round(entry.confidence * 100)}% confident
                        </span>
                    )}
                    {entry.sourceDate && (
                        <span className="ml-auto text-[9px] text-gray-400 dark:text-white/25 shrink-0">
                            {entry.parsedDate ? formatDate(entry.parsedDate) : entry.sourceDate}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main TimelineView
// ---------------------------------------------------------------------------

interface TimelineViewProps {
    tree: PageNode;
}

type SortOrder = 'newest' | 'oldest';
type SignalFilter = 'all' | UserMapImportance;

export const TimelineView: React.FC<TimelineViewProps> = ({ tree }) => {
    const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
    const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');

    const allEntries = useMemo(() => flattenEntries(tree), [tree]);

    const filtered = useMemo(() => {
        let entries = allEntries;
        if (signalFilter !== 'all') {
            entries = entries.filter((e) => e.importance === signalFilter);
        }
        return entries;
    }, [allEntries, signalFilter]);

    const { dated, undated } = useMemo(() => {
        const dated = filtered.filter((e) => e.parsedDate !== null);
        const undated = filtered.filter((e) => e.parsedDate === null);

        dated.sort((a, b) => {
            const diff = a.parsedDate!.getTime() - b.parsedDate!.getTime();
            return sortOrder === 'newest' ? -diff : diff;
        });

        return { dated, undated };
    }, [filtered, sortOrder]);

    // Group dated entries by month-year
    const groups = useMemo(() => {
        const map = new Map<string, TimelineEntry[]>();
        dated.forEach((e) => {
            const key = groupKey(e.parsedDate!);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(e);
        });
        return Array.from(map.entries());
    }, [dated]);

    const totalCount = dated.length + undated.length;

    return (
        <div className="w-full">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-4 mb-6 pb-4 border-b border-black/8 dark:border-white/8">
                <div>
                    <div className="text-[8px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-white/30 mb-1.5">Sort</div>
                    <div className="flex gap-1.5">
                        {(['newest', 'oldest'] as SortOrder[]).map((o) => (
                            <button
                                key={o}
                                onClick={() => setSortOrder(o)}
                                className={`rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] border transition-all ${
                                    sortOrder === o
                                        ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-transparent'
                                        : 'bg-white dark:bg-white/[0.04] border-black/10 dark:border-white/10 text-gray-500 dark:text-white/50'
                                }`}
                            >
                                {o}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="text-[8px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-white/30 mb-1.5">Signal</div>
                    <div className="flex gap-1.5">
                        {(['all', 'high', 'medium', 'low'] as SignalFilter[]).map((f) => (
                            <button
                                key={f}
                                onClick={() => setSignalFilter(f)}
                                className={`rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] border transition-all ${
                                    signalFilter === f
                                        ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-transparent'
                                        : 'bg-white dark:bg-white/[0.04] border-black/10 dark:border-white/10 text-gray-500 dark:text-white/50'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="ml-auto text-[9px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-white/30">
                    {totalCount} {totalCount === 1 ? 'entry' : 'entries'}
                </div>
            </div>

            {/* Timeline */}
            {groups.length === 0 && undated.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="text-2xl mb-3">🗓️</div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-700 dark:text-white/60 mb-2">No Entries</h3>
                    <p className="text-[11px] text-gray-400 dark:text-white/30 max-w-xs">
                        {allEntries.length > 0
                            ? 'Try adjusting your signal filter.'
                            : 'Add context to your UserMap to see it on the timeline.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Dated groups */}
                    {groups.map(([monthYear, entries]) => (
                        <section key={monthYear}>
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-[9px] font-black uppercase tracking-[0.24em] text-gray-500 dark:text-white/40 bg-gray-100 dark:bg-white/8 rounded-full px-3 py-1.5 border border-black/10 dark:border-white/10">
                                    {monthYear}
                                </span>
                                <span className="text-[8px] text-gray-400 dark:text-white/25">
                                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                                </span>
                            </div>
                            <div>
                                {entries.map((entry) => (
                                    <TimelineCard key={entry.id} entry={entry} />
                                ))}
                            </div>
                        </section>
                    ))}

                    {/* Undated entries */}
                    {undated.length > 0 && (
                        <section>
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-[9px] font-black uppercase tracking-[0.24em] text-gray-400 dark:text-white/30 bg-gray-50 dark:bg-white/[0.03] rounded-full px-3 py-1.5 border border-dashed border-black/10 dark:border-white/10">
                                    No Date
                                </span>
                                <span className="text-[8px] text-gray-400 dark:text-white/25">
                                    {undated.length} {undated.length === 1 ? 'entry' : 'entries'}
                                </span>
                            </div>
                            <div>
                                {undated.map((entry) => (
                                    <TimelineCard key={entry.id} entry={entry} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};
