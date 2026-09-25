import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, ChevronDown, ChevronRight, Plus, GitBranch } from 'lucide-react';
import { useApi } from '../hooks/useApi';

/**
 * What is running on this host that Orqy doesn't manage.
 *
 * Compose stamps its project name and directory onto every container it
 * starts, so the backend can match what's running against the projects table
 * rather than guess. What's left is either something worth adopting or
 * something deliberately outside Orqy — which is why nothing here acts on its
 * own: each row only offers to open the Add Project form, filled in.
 */
export default function UnmanagedContainers() {
  const [open, setOpen] = useState(false);
  // Scanned once when the dashboard loads, then kept fresh only while the
  // list is actually open: each group with a directory costs a `git remote`
  // on the deploy host, and this is a section most visits never unfold.
  const { data, loading } = useApi('/containers/scan', [], { pollInterval: open ? 30000 : 0 });

  const groups = data?.groups || [];
  if (loading || groups.length === 0) return null;

  return (
    <div className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-left group"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
        <Boxes className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
          Running here, not in Orqy
        </h2>
        <span className="text-xs text-gray-600">
          {groups.length} {groups.length === 1 ? 'stack' : 'stacks'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {groups.map((g) => {
            // Everything the Add Project form would otherwise have to be told
            // by hand. repo_url is only there when the directory is a
            // checkout, so a stack deployed some other way just leaves it out.
            const params = new URLSearchParams({ name: g.suggested_name });
            if (g.working_dir) params.set('local_path', g.working_dir);
            if (g.compose_file) params.set('compose_file', g.compose_file);
            if (g.repo_url) params.set('repo_url', g.repo_url);

            return (
              <div
                key={g.suggested_name + (g.working_dir || '')}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{g.suggested_name}</span>
                    {!g.compose_project && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700 shrink-0">
                        no compose
                      </span>
                    )}
                  </div>

                  {g.working_dir && (
                    <p className="mt-0.5 text-xs text-gray-500 font-mono truncate" title={g.working_dir}>
                      {g.working_dir}
                      {g.compose_file ? `/${g.compose_file}` : ''}
                    </p>
                  )}

                  {g.repo_url && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 truncate">
                      <GitBranch className="w-3 h-3 shrink-0" />
                      <span className="truncate" title={g.repo_url}>{g.repo_url}</span>
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.containers.map((c) => (
                      <span
                        key={c.name}
                        title={c.image}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-gray-800 text-gray-400 border border-gray-700"
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>

                <Link
                  to={`/projects/new?${params}`}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-indigo-600 hover:text-white transition-colors text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add as project
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
