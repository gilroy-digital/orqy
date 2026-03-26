import { useState, useEffect } from 'react';

export default function PathPicker({ value, onChange, mode = 'directory', placeholder }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('/');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const browse = async (path) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const data = await res.json();
      setCurrent(data.current);
      setEntries(data.entries);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      if (value && (value.startsWith('/') || value.match(/^[A-Za-z]:\\/))) {
        const dir = mode === 'file' ? value.substring(0, value.lastIndexOf('/')) || value.substring(0, value.lastIndexOf('\\')) : value;
        if (dir) { browse(dir); return; }
      }
      // Fetch default home directory from server
      fetch('/api/homedir').then(r => r.json()).then(data => browse(data.path)).catch(() => browse('/'));
    }
  }, [open]);

  const handleSelect = (entry) => {
    if (entry.is_dir) {
      browse(entry.path);
    } else if (mode === 'file') {
      onChange(entry.path);
      setOpen(false);
    }
  };

  const selectCurrentDir = () => {
    onChange(current);
    setOpen(false);
  };

  const selectFile = (entry) => {
    onChange(entry.name);
    setOpen(false);
  };

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm';

  return (
    <div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm whitespace-nowrap"
        >
          Browse
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">
                  {mode === 'directory' ? 'Select Folder' : 'Select File'}
                </h3>
                <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-white text-lg">&times;</button>
              </div>
              <div className="text-xs text-gray-400 font-mono bg-gray-800 rounded px-2 py-1 truncate">
                {current}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {loading && <p className="text-gray-500 text-sm p-2">Loading...</p>}
              {error && <p className="text-red-400 text-sm p-2">{error}</p>}
              {!loading && !error && entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => {
                    if (mode === 'file' && !entry.is_dir && entry.name !== '..') {
                      selectFile(entry);
                    } else {
                      handleSelect(entry);
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-800 flex items-center gap-2 text-sm transition-colors"
                >
                  <span className="text-gray-500 w-4 text-center">
                    {entry.name === '..' ? '\u2191' : entry.is_dir ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}
                  </span>
                  <span className={entry.is_dir ? 'text-indigo-400' : 'text-gray-300'}>
                    {entry.name}
                  </span>
                </button>
              ))}
              {!loading && !error && entries.length === 0 && (
                <p className="text-gray-500 text-sm p-2">Empty directory</p>
              )}
            </div>

            {mode === 'directory' && (
              <div className="p-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={selectCurrentDir}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors text-sm font-medium"
                >
                  Select This Folder
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
