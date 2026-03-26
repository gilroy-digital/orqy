import { Link } from 'react-router-dom';
import { useApi, apiDelete } from '../hooks/useApi';
import StatusBadge from '../components/StatusBadge';
import { GitBranch, Clock, Rocket, RefreshCw, Trash2 } from 'lucide-react';

export default function Dashboard() {
  const { data: projects, loading, error, refetch } = useApi('/projects', [], { pollInterval: 5000 });

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
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Project</h1>
        <button
          onClick={refetch}
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
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

            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-800 text-xs">
              <span className={project.polling_enabled ? 'text-emerald-400' : 'text-gray-600'}>
                {project.polling_enabled ? 'Polling ON' : 'Polling OFF'}
              </span>
              <span className={project.auto_deploy ? 'text-emerald-400' : 'text-gray-600'}>
                {project.auto_deploy ? 'Auto-deploy ON' : 'Auto-deploy OFF'}
              </span>
              {project.has_pat && <span className="text-amber-400">PAT set</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
