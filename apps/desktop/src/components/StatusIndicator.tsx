import React from 'react';
import { CheckCircle, XCircle, Loader } from 'lucide-react';

interface Props {
  status: 'ok' | 'error' | 'loading';
  connections?: number;
}

export const StatusIndicator: React.FC<Props> = ({ status, connections }) => {
  return (
    <div className="flex items-center gap-2 text-sm">
      {status === 'loading' && (
        <Loader size={16} className="animate-spin text-gray-400" />
      )}
      {status === 'ok' && (
        <CheckCircle size={16} className="text-green-500" />
      )}
      {status === 'error' && (
        <XCircle size={16} className="text-red-500" />
      )}
      <span className={
        status === 'ok' ? 'text-green-700' :
        status === 'error' ? 'text-red-600' : 'text-gray-500'
      }>
        {status === 'loading' && 'Connecting to local server…'}
        {status === 'ok' && `Server running · ${connections ?? 0} connection${connections !== 1 ? 's' : ''}`}
        {status === 'error' && 'Server not reachable — is it running?'}
      </span>
    </div>
  );
};
