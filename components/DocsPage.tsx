import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

interface DocSection {
  title: string;
  content: React.ReactNode;
}

interface AccordionProps {
  section: DocSection;
}

const Accordion: React.FC<AccordionProps> = ({ section }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white dark:bg-white/[0.03] hover:bg-gray-50 dark:hover:bg-white/[0.05] text-left transition-colors"
      >
        <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{section.title}</span>
        {open ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 bg-white dark:bg-white/[0.02] text-[12px] text-gray-500 dark:text-white/40 leading-relaxed space-y-3">
          {section.content}
        </div>
      )}
    </div>
  );
};

const Code: React.FC<{ children: string }> = ({ children }) => (
  <code className="bg-gray-100 dark:bg-white/5 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded text-[11px] font-mono">
    {children}
  </code>
);

const Pre: React.FC<{ children: string }> = ({ children }) => (
  <pre className="bg-gray-50 dark:bg-black/30 rounded-xl p-3 text-[10px] text-gray-500 dark:text-white/30 overflow-x-auto font-mono whitespace-pre-wrap">
    {children}
  </pre>
);

const DOC_SECTIONS: DocSection[] = [
  {
    title: '🚀 Getting Started — Phase 5 Final',
    content: (
      <>
        <p>UserMap Phase 5 Final introduces a complete redesign of the application with the following capabilities:</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li><strong>Left sidebar navigation</strong>: Dashboard, Context Search, Data Studio, Connectors, Prism Agent, Logs, Docs</li>
          <li><strong>MindMap-only Data Studio</strong>: NotebookLM-style full-CRUD knowledge graph visualization</li>
          <li><strong>Connectors (Pull &amp; Push)</strong>: Continuous data ingestion + webhook push to n8n/Make</li>
          <li><strong>Prism Agent</strong>: Always-on, checkpoint-resilient classification pipeline</li>
          <li><strong>Logs</strong>: End-to-end lifecycle timeline for every event</li>
          <li><strong>Multi-DB architecture</strong>: SQLite (canonical) + Chroma (semantic retrieval)</li>
        </ul>
        <p className="mt-3 font-semibold text-gray-600 dark:text-white/50">Quick start:</p>
        <Pre>{`git clone https://github.com/mhkr9100/UserMap.git
cd UserMap
npm install
npm run dev        # Frontend: http://localhost:3000
npm run dev:server # Backend API: http://localhost:5185`}</Pre>
      </>
    ),
  },
  {
    title: '🔌 How to connect Pull Connectors (Slack, Instagram, Facebook)',
    content: (
      <>
        <p>Pull connectors continuously fetch data from external platforms on a schedule (default: every 60 seconds). UserMap checks the last checkpoint and only imports new data.</p>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">Slack</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to <strong>api.slack.com/apps</strong> and create a new Slack App.</li>
          <li>Add OAuth scopes: <Code>channels:read</Code> <Code>channels:history</Code> <Code>users:read</Code></li>
          <li>Install the app to your workspace and copy the <strong>Bot Token</strong> (starts with <Code>xoxb-</Code>).</li>
          <li>In UserMap → Connectors → Pull into UserMap → Slack → <strong>Connect</strong>.</li>
          <li>Paste your Bot Token and set sync frequency. Click <strong>Save &amp; Connect</strong>.</li>
        </ol>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">Instagram / Facebook</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to <strong>developers.facebook.com</strong> and create a Meta App.</li>
          <li>Add the <strong>Instagram Basic Display API</strong> or <strong>Facebook Graph API</strong> product.</li>
          <li>Generate a <strong>User Access Token</strong> with required permissions (<Code>user_media</Code>, <Code>user_profile</Code> for Instagram; <Code>user_posts</Code> for Facebook).</li>
          <li>In UserMap → Connectors → Slack/Instagram/Facebook → <strong>Connect</strong>, paste your token.</li>
        </ol>

        <p className="mt-2 text-amber-600 dark:text-amber-400">⚠️ Note: Meta API requires app review for production access. For personal testing, use the app in Development mode with your own accounts.</p>
      </>
    ),
  },
  {
    title: '⚡ How Push Webhooks work (n8n, Make, Custom)',
    content: (
      <>
        <p>Push connectors send structured JSON events from UserMap to external automation tools whenever your knowledge graph changes.</p>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">n8n setup</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>In n8n, add a <strong>Webhook</strong> trigger node. Copy the Webhook URL.</li>
          <li>In UserMap → Connectors → Push from UserMap → n8n → <strong>Connect</strong>.</li>
          <li>Paste your n8n Webhook URL and click <strong>Save &amp; Connect</strong>.</li>
          <li>UserMap will POST a JSON payload to this URL on every relevant event.</li>
        </ol>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">Make (Integromat) setup</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Create a scenario in Make with a <strong>Custom Webhook</strong> module. Copy its URL.</li>
          <li>In UserMap → Connectors → Push from UserMap → Make → <strong>Connect</strong>.</li>
          <li>Paste the webhook URL and save.</li>
        </ol>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">Sample payload</p>
        <Pre>{`POST https://your-endpoint.com/webhook
Content-Type: application/json

{
  "event": "user.update",
  "actor": "user",
  "object": "node:abc123",
  "summary": "Career node updated",
  "before": "Software Engineer",
  "after": "Senior Software Engineer",
  "timestamp": "2025-01-15T10:30:00.000Z"
}`}</Pre>
      </>
    ),
  },
  {
    title: '📊 Data Studio — MindMap CRUD',
    content: (
      <>
        <p>Data Studio shows your entire knowledge graph as a <strong>NotebookLM-style MindMap</strong>. Tree, Flow, and List views are planned for a future release.</p>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">Interactions</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Scroll</strong> to zoom in/out</li>
          <li><strong>Drag</strong> to pan across the map</li>
          <li><strong>Hover a node</strong> to reveal Edit (✏️), Add child (+), and Delete (🗑️) buttons</li>
          <li><strong>Click the expand/collapse arrow</strong> to hide/show a branch</li>
          <li><strong>Click the root + button</strong> to add a new category</li>
        </ul>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">Node types</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Category</strong> (purple): Top-level groupings like Work, Social, Personal</li>
          <li><strong>Cluster</strong> (blue): Sub-groupings within a category</li>
          <li><strong>Fact</strong> (white): Individual data points with a label and optional value</li>
        </ul>
        <p className="mt-2">Collapse state is saved in your browser so your view persists across sessions.</p>
      </>
    ),
  },
  {
    title: '📋 Logs — Event Semantics &amp; Troubleshooting',
    content: (
      <>
        <p>The Logs page shows a complete lifecycle timeline. Every event has a <strong>type</strong>, <strong>actor</strong>, <strong>source tool</strong>, and optional before/after state.</p>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">Event types</p>
        <div className="space-y-1">
          {[
            ['connector.pull.success', 'A connector successfully pulled new data'],
            ['connector.pull.error', 'A connector failed during data pull'],
            ['prism.classify', 'Prism Agent classified an item into a category'],
            ['prism.structure', 'Prism updated the knowledge graph structure'],
            ['prism.feedback.learned', 'User edited a node; Prism logged the preference'],
            ['user.create', 'User manually created a node'],
            ['user.update', 'User edited a node'],
            ['user.delete', 'User deleted a node'],
            ['push.webhook.sent', 'A push event was successfully sent to an external webhook'],
            ['push.webhook.failed', 'A push event failed to deliver'],
          ].map(([type, desc]) => (
            <div key={type} className="flex gap-2">
              <Code>{type}</Code>
              <span>{desc}</span>
            </div>
          ))}
        </div>

        <p className="font-semibold text-gray-600 dark:text-white/50 mt-3">Troubleshooting</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Filter by <Code>severity: error</Code> to see only failures.</li>
          <li>Filter by <Code>actor: prism</Code> to see Prism's activity log.</li>
          <li>Click any log row to expand and see full before/after detail.</li>
          <li>Use the date range filter to narrow to a specific incident window.</li>
        </ul>
      </>
    ),
  },
  {
    title: '🗄️ Multi-DB Architecture',
    content: (
      <>
        <p>UserMap uses a <strong>polyglot storage pattern</strong> — different databases optimized for different jobs:</p>

        <div className="space-y-3 mt-3">
          <div>
            <p className="font-semibold text-gray-700 dark:text-white/60">1. SQLite (Canonical DB — source of truth)</p>
            <p>Stores all entities, relationships, connections, logs, sync checkpoints, and connector configs. Every write goes here first. Fast, local, transactional.</p>
            <p className="mt-1">Location: <Code>~/.usermap/usermap.db</Code></p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 dark:text-white/60">2. Chroma (Vector DB — semantic retrieval)</p>
            <p>Stores semantic embeddings of your context items for AI-powered search and Prism's context understanding. Updated asynchronously after every SQLite write. Never the source of truth.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 dark:text-white/60">3. Rule: canonical first</p>
            <p>All writes target SQLite first. Vector DB and any future cache/queue layers are derived, async, and replaceable. This keeps the app fast, consistent, and local-first.</p>
          </div>
        </div>
      </>
    ),
  },
  {
    title: '🔒 Privacy &amp; Local-First Design',
    content: (
      <>
        <p>UserMap is built for complete data sovereignty:</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li><strong>No cloud account required</strong>: UserMap has no central login or sign-up. You just install and run it locally.</li>
          <li><strong>No data leaves your machine</strong>: All data is stored in <Code>~/.usermap/</Code> on your device.</li>
          <li><strong>OAuth only for tool connections</strong>: Each connected tool (Slack, GitHub, etc.) uses its own OAuth flow. Tokens are stored only in your browser localStorage.</li>
          <li><strong>You control what AI can access</strong>: Prism only sees what you've connected. Private nodes are flagged and excluded from context exports.</li>
        </ul>
      </>
    ),
  },
];

export const DocsPage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen size={18} className="text-blue-500" />
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Documentation</h1>
          <p className="text-[13px] text-gray-400 dark:text-white/30 mt-1">
            Help, guides, and architecture reference for UserMap.
          </p>
        </div>
      </div>

      {/* Tagline */}
      <div className="rounded-2xl border border-violet-400/20 bg-violet-50/50 dark:bg-violet-500/5 p-5 text-[13px] text-violet-700 dark:text-violet-300">
        <p className="font-semibold">The key idea behind UserMap</p>
        <p className="mt-1 text-[12px] font-normal text-violet-600 dark:text-violet-400 leading-relaxed">
          General AI knows the world — it knows "the US president is Trump" because it has access to public data. But it doesn't know your favorite color, your career goals, or your personal relationships, because it doesn't have your data. <strong>UserMap is a Personal Knowledge Permission Layer for AI</strong>: it stores, structures, and controls access to your personal context so any AI can know <em>you</em>.
        </p>
      </div>

      {/* Accordion sections */}
      <div className="space-y-3">
        {DOC_SECTIONS.map((section, i) => (
          <Accordion key={i} section={section} />
        ))}
      </div>
    </div>
  );
};
