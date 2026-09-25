import { Link } from 'react-router-dom';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import StatusBadge from '../components/StatusBadge';
import UnmanagedContainers from '../components/UnmanagedContainers';
import { BucketHeading, NewBucketButton } from '../components/BucketBar';
import { GitBranch, Clock, Rocket, RefreshCw, Trash2, Square, Play, RotateCw } from 'lucide-react';

export default function Dashboard() {
  const { data: projects, loading, error, refetch } = useApi('/projects', [], { pollInterval: 5000 });
  const { data: containerStatus } = useApi('/container-status', [], { pollInterval: 15000 });
  const { data: bucketData, refetch: refetchBuckets } = useApi('/buckets');

  const buckets = bucketData || [];
  // A project whose bucket has just been deleted still carries the old id
  // until the next poll, so "ungrouped" means "in no bucket that exists".
  const ungrouped = (projects || []).filter(
    (p) => !p.bucket_id || !buckets.some((b) => b.id === p.bucket_id),
  );

  const reload = () => {
    refetchBuckets();
    refetch();
  };

  const handleContainerAction = async (projectId, action) => {
    try {
      await apiPost(`/projects/${projectId}/containers`, { action });
    } catch (err) {
      alert(`${action} failed: ${err.message}`);
    }
  };

  const handleDelete = async (e, projectId, projectName) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${projectName}"? This cannot be undone.`)) return;
    try {
      await apiDelete(`/projects/${projectId}`);
      refetch();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400">
        Failed to load projects: {error}
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-20">
        <Rocket className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-300 mb-2">No projects yet</h2>
        <p className="text-gray-500 mb-6">Add your first project to start auto-deploying.</p>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
        >
          Add Project
        </Link>
        <div className="max-w-3xl mx-auto text-left">
          <UnmanagedContainers />
        </div>
      </div>
    );
  }

  const card = (project) => (
    <Link
      key={project.id}
      to={`/projects/${project.id}`}
      className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-indigo-500/50 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-white group-hover:text-indigo-400 transition-colors">
          {project.name}
        </h3>
        <div className="flex items-center gap-2">
          {project.last_deploy && <StatusBadge status={project.last_deploy.status} />}
          <button
            onClick={(e) => handleDelete(e, project.id, project.name)}
            className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Delete project"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4" />
          <span className="truncate">{project.branch}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 truncate">
          {project.repo_url}
        </div>
        {project.last_deploy && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            {new Date(project.last_deploy.started_at).toLocaleString()}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800 text-xs">
        <div className="flex items-center gap-3">
          {containerStatus && containerStatus[project.id] ? (
            <>
              <span className={containerStatus[project.id].healthy ? 'text-emerald-400' : 'text-red-400'}>
                {containerStatus[project.id].healthy ? 'Running' : 'Down'}
              </span>
              {containerStatus[project.id].uptime && (
                <span className="text-gray-500">{containerStatus[project.id].uptime}</span>
              )}
            </>
          ) : (
            <span className="text-gray-600">--</span>
          )}
          {project.polling_enabled && <span className="text-emerald-400">Polling</span>}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
          {containerStatus?.[project.id]?.healthy ? (
            <>
              <button onClick={(e) => { e.preventDefault(); handleContainerAction(project.id, 'restart'); }}
                className="p-1 text-gray-600 hover:text-amber-400 rounded transition-colors" title="Restart">
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => { e.preventDefault(); handleContainerAction(project.id, 'stop'); }}
                className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors" title="Stop">
                <Square className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button onClick={(e) => { e.preventDefault(); handleContainerAction(project.id, 'start'); }}
              className="p-1 text-gray-600 hover:text-emerald-400 rounded transition-colors" title="Start">
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </Link>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <div className="flex items-center gap-1">
        <NewBucketButton onCreated={reload} />
        <button
          onClick={refetch}
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
        </div>
      </div>

      {buckets.length === 0 ? (
        // Nobody has made a bucket yet, so there is nothing to group by and no
        // headings worth drawing — the dashboard stays exactly as it was.
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map(card)}</div>
      ) : (
        <div className="space-y-8">
          {buckets.map((bucket) => {
            const items = projects.filter((p) => p.bucket_id === bucket.id);
            return (
              <section key={bucket.id}>
                <BucketHeading bucket={bucket} count={items.length} onChanged={reload} />
                {items.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(card)}</div>
                ) : (
                  <p className="text-xs text-gray-600">
                    Empty — a project&rsquo;s bucket is set when you add or edit it.
                  </p>
                )}
              </section>
            );
          })}

          {ungrouped.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-300">Ungrouped</h2>
                <span className="text-xs text-gray-600">{ungrouped.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ungrouped.map(card)}</div>
            </section>
          )}
        </div>
      )}

      <UnmanagedContainers />
    </div>
  );
}
