import React from 'react';
import { Hash, Calendar } from 'lucide-react';
import type { Connection } from '../services/api.js';

const TOOL_LABELS: Record<string, string> = {
  slack: 'Slack',
  github: 'GitHub',
  gmail: 'Gmail',
  gdrive: 'Google Drive',
};

const TOOL_COLORS: Record<string, string> = {
  slack: 'bg-[#611f69] text-white',
  github: 'bg-gray-800 text-white',
  gmail: 'bg-red-500 text-white',
  gdrive: 'bg-blue-500 text-white',
};

interface Props {
  connection: Connection;
}

export const ConnectionCard: React.FC<Props> = ({ connection }) => {
  const label = TOOL_LABELS[connection.tool] ?? connection.tool;
  const colorClass = TOOL_COLORS[connection.tool] ?? 'bg-gray-500 text-white';
  const connectedDate = new Date(connection.connected_at).toLocaleDateString();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold uppercase ${colorClass}`}>
        {label.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900">{label}</div>
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
          <span className="flex items-center gap-1">
            <Hash size={10} />
            {connection.account_id}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={10} />
            {connectedDate}
          </span>
        </div>
      </div>
      <div className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        Active
      </div>
    </div>
  );
};
