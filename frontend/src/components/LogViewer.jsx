import { useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

const streamColors = {
  stdout: 'text-gray-400',
  stderr: 'text-red-400',
  system: 'text-indigo-400 font-medium',
};

export default function LogViewer({ logs }) {
  const bottomRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const copyLogs = () => {
    const text = logs.map(l => {
      const time = l.created_at ? new Date(l.created_at).toLocaleTimeString() : '';
      return `${time} ${l.content}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!logs || logs.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 text-gray-500 text-xs text-center">
        No logs yet...
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-gray-800">
        <button
          onClick={copyLogs}
          className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-white rounded text-xs transition-colors"
          title="Copy logs to clipboard"
        >
          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <div className="log-viewer overflow-y-auto max-h-[600px] p-3 font-mono text-xs leading-relaxed">
        {logs.map((log, i) => (
          <div key={log.id || i} className={`py-px ${streamColors[log.stream] || 'text-gray-400'}`}>
            <span className="text-gray-600 select-none mr-2 text-[10px]">
              {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}
            </span>
            {log.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
