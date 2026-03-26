import { useEffect, useRef } from 'react';

const streamColors = {
  stdout: 'text-gray-300',
  stderr: 'text-red-400',
  system: 'text-indigo-400 font-semibold',
};

export default function LogViewer({ logs }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!logs || logs.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 text-gray-500 text-sm text-center">
        No logs yet...
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="log-viewer overflow-y-auto max-h-[600px] p-4 font-mono text-sm">
        {logs.map((log, i) => (
          <div key={log.id || i} className={`py-0.5 ${streamColors[log.stream] || 'text-gray-300'}`}>
            <span className="text-gray-600 select-none mr-3">{String(log.line_num).padStart(4)}</span>
            {log.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
