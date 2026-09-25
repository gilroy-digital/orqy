import { useState } from 'react';
import { FolderPlus, Pencil, Trash2, Check, X } from 'lucide-react';
import { apiPost, apiPut, apiDelete } from '../hooks/useApi';

/**
 * The header of one bucket on the dashboard, and the control that makes new
 * ones. Renaming and deleting live here rather than in Settings because this
 * is where buckets are actually looked at.
 */
export function BucketHeading({ bucket, count, onChanged }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(bucket.name);
  const [error, setError] = useState(null);

  const save = async () => {
    if (!name.trim() || name.trim() === bucket.name) {
      setRenaming(false);
      setName(bucket.name);
      return;
    }
    try {
      await apiPut(`/buckets/${bucket.id}`, { name: name.trim() });
      setRenaming(false);
      setError(null);
      onChanged();
    } catch (e) {
      setError(e.message || 'Could not rename');
    }
  };

  const remove = async () => {
    // Worth spelling out that this is not a way to delete projects, because a
    // bin icon next to a heading full of them reads like it might be.
    const msg = count
      ? `Delete the bucket "${bucket.name}"? The ${count} ${count === 1 ? 'project' : 'projects'} in it stay, and become ungrouped.`
      : `Delete the bucket "${bucket.name}"?`;
    if (!confirm(msg)) return;
    try {
      await apiDelete(`/buckets/${bucket.id}`);
      onChanged();
    } catch (e) {
      setError(e.message || 'Could not delete');
    }
  };

  return (
    <div className="flex items-center gap-2 mb-3 group/heading">
      {renaming ? (
        <>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setRenaming(false); setName(bucket.name); }
            }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
          <button type="button" onClick={save} title="Save" className="p-1 text-gray-400 hover:text-emerald-400">
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { setRenaming(false); setName(bucket.name); }}
            title="Cancel"
            className="p-1 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-gray-300">{bucket.name}</h2>
          <span className="text-xs text-gray-600">{count}</span>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            title={`Rename "${bucket.name}"`}
            className="p-1 text-gray-700 hover:text-gray-300 opacity-0 group-hover/heading:opacity-100 transition-opacity"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={remove}
            title={`Delete the bucket "${bucket.name}"`}
            className="p-1 text-gray-700 hover:text-red-400 opacity-0 group-hover/heading:opacity-100 transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function NewBucketButton({ onCreated }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  const create = async () => {
    if (!name.trim()) { setAdding(false); return; }
    try {
      await apiPost('/buckets', { name: name.trim() });
      setName('');
      setAdding(false);
      setError(null);
      onCreated();
    } catch (e) {
      setError(e.message || 'Could not create');
    }
  };

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        title="Group projects into a bucket"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
      >
        <FolderPlus className="w-4 h-4" />
        New bucket
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        placeholder="Bucket name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') create();
          if (e.key === 'Escape') { setAdding(false); setName(''); setError(null); }
        }}
        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      />
      <button type="button" onClick={create} className="p-1 text-gray-400 hover:text-emerald-400" title="Create">
        <Check className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => { setAdding(false); setName(''); setError(null); }}
        className="p-1 text-gray-400 hover:text-white"
        title="Cancel"
      >
        <X className="w-4 h-4" />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
