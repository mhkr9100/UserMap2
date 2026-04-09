import React, { useState } from 'react';
import { Bot, Zap, RefreshCw, CheckCircle } from 'lucide-react';
import { PrismInterface } from './PrismInterface';
import type { PageNode } from '../types';

interface PrismAgentPageProps {
  tree: PageNode;
  onAddNode: (parentId: string, newNode: PageNode) => void;
  connectedAICount: number;
  onOpenSetup: () => void;
}

const PIPELINE_STEPS = [
  { icon: '📥', label: 'Data Pull', desc: 'Connectors continuously pull new data from Slack, Instagram, Facebook, etc.' },
  { icon: '🤖', label: 'Prism Reads', desc: 'Prism Agent reads each new data item and understands its context.' },
  { icon: '🗂️', label: 'Classify & Structure', desc: 'Prism classifies into categories (Work, Social, Personal…) and structures nodes.' },
  { icon: '💾', label: 'DB Update', desc: 'Canonical DB is updated with structured nodes. Vector DB synced asynchronously.' },
  { icon: '✅', label: 'Checkpoint', desc: 'Pipeline progress is checkpointed. On restart, Prism resumes from last position.' },
];

export const PrismAgentPage: React.FC<PrismAgentPageProps> = ({
  tree,
  onAddNode,
  connectedAICount,
  onOpenSetup,
}) => {
  const [isPrismOpen, setIsPrismOpen] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0">
          <Bot size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Prism Agent</h1>
          <p className="text-[13px] text-gray-400 dark:text-white/30 mt-1">
            Your always-on personal AI that reads, classifies, and structures your world.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {connectedAICount === 0 && (
            <button
              onClick={onOpenSetup}
              className="px-4 py-2 rounded-xl bg-violet-500 text-white text-[12px] font-semibold hover:bg-violet-600 transition-colors flex items-center gap-2"
            >
              <Zap size={14} />
              Connect AI
            </button>
          )}
          <button
            onClick={() => setIsPrismOpen(true)}
            className="px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 text-[12px] font-medium text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-2 transition-colors"
          >
            <Bot size={14} className={connectedAICount > 0 ? 'text-violet-500' : ''} />
            Open Chat
          </button>
        </div>
      </div>

      {/* Status card */}
      <div className={`rounded-2xl border p-5 ${connectedAICount > 0 ? 'border-emerald-400/30 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-amber-400/30 bg-amber-50/50 dark:bg-amber-500/5'}`}>
        <div className="flex items-center gap-3">
          {connectedAICount > 0 ? (
            <>
              <CheckCircle size={18} className="text-emerald-500" />
              <div>
                <div className="text-[13px] font-semibold text-gray-900 dark:text-white">Prism is active</div>
                <div className="text-[11px] text-gray-500 dark:text-white/40 mt-0.5">
                  {connectedAICount} AI model{connectedAICount !== 1 ? 's' : ''} connected. Prism is continuously reading and structuring your data.
                </div>
              </div>
            </>
          ) : (
            <>
              <RefreshCw size={18} className="text-amber-500" />
              <div>
                <div className="text-[13px] font-semibold text-gray-900 dark:text-white">Prism needs an AI model</div>
                <div className="text-[11px] text-gray-500 dark:text-white/40 mt-0.5">
                  Connect ChatGPT, Claude, Gemini, or Ollama (local) to activate Prism Agent.
                </div>
              </div>
              <button onClick={onOpenSetup} className="ml-auto px-3 py-1.5 rounded-xl bg-amber-500 text-white text-[11px] font-semibold hover:bg-amber-600 transition-colors">
                Set up
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6">
        <h2 className="text-[13px] font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-5">
          Continuous Pipeline
        </h2>
        <div className="space-y-3">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-lg">
                  {step.icon}
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-9 h-3 w-px bg-gray-200 dark:bg-white/10" />
                )}
              </div>
              <div className="pt-1.5">
                <div className="text-[12px] font-semibold text-gray-900 dark:text-white">{step.label}</div>
                <div className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5 leading-relaxed">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resilience note */}
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6">
        <h2 className="text-[13px] font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4">
          Resilience &amp; Checkpointing
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px] text-gray-500 dark:text-white/40 leading-relaxed">
          <div className="flex gap-3">
            <span className="text-xl">🔄</span>
            <div>
              <div className="font-semibold text-gray-700 dark:text-white/60 mb-1">Auto-resume</div>
              If Prism stops (crash, restart, internet outage), it saves a checkpoint after each processed batch. On next start, it reads the checkpoint and continues exactly where it left off — no data lost, no double-processing.
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-xl">🏷️</span>
            <div>
              <div className="font-semibold text-gray-700 dark:text-white/60 mb-1">Deduplication</div>
              Every source event is tracked by a unique ID hash. Even if the same event appears twice (e.g. from webhook + polling), Prism only processes it once.
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-xl">📊</span>
            <div>
              <div className="font-semibold text-gray-700 dark:text-white/60 mb-1">Multi-DB architecture</div>
              Canonical SQLite DB is source of truth. Chroma Vector DB is updated asynchronously for semantic search. This keeps the app fast and consistent.
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-xl">📝</span>
            <div>
              <div className="font-semibold text-gray-700 dark:text-white/60 mb-1">Prism learns from you</div>
              When you edit, move, or delete a node in Data Studio, Prism logs a <code className="text-violet-500">prism.feedback.learned</code> event and factors your preference into future classifications.
            </div>
          </div>
        </div>
      </div>

      {/* Chat interface */}
      <PrismInterface
        isOpen={isPrismOpen}
        onClose={() => setIsPrismOpen(false)}
        tree={tree}
        onAddNode={onAddNode}
      />
    </div>
  );
};
