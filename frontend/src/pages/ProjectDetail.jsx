import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { useDeployLogs } from '../hooks/useDeployLogs';
import StatusBadge from '../components/StatusBadge';
import LogViewer from '../components/LogViewer';
import { Play, Trash2, GitBranch, Clock, ArrowLeft, Copy, ExternalLink, Pencil } from 'lucide-react';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: project, loading: loadingProject, refetch: refetchProject } = useApi(`/projects/${id}`, [], { pollInterval: 5000 });
  const { data: deploys, loading: loadingDeploys, refetch: refetchDeploys } = useApi(`/projects/${id}/deploys`, [], { pollInterval: 5000 });
  const [selectedDeploy, setSelectedDeploy] = useState(null);
  const [deploying, setDeploying] = useState(false);

  // Live logs for the selected deploy
  const { logs: liveLogs, connected } = useDeployLogs(
    id,
    selectedDeploy?.id,
    () => {
      // Deploy finished — refetch to update status
      refetchDeploys();
      refetchProject();
    }
  );

  // Static logs fallback for completed deploys
  const { data: staticLogs } = useApi(
    selectedDeploy ? `/projects/${id}/deploys/${selectedDeploy.id}/logs` : null,
    [selectedDeploy?.id]
  );

  const displayLogs = selectedDeploy?.status === 'running' ? liveLogs : (staticLogs || []);

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const result = await apiPost(`/projects/${id}/deploy`);
      // Refetch deploys to see the new one
      setTimeout(() => {
        refetchDeploys();
        refetchProject();
      }, 1000);
    } catch (err) {
      alert('Deploy failed: ' + err.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
    try {
      await apiDelete(`/projects/${id}`);
      navigate('/');
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const webhookUrl = project ? `${window.location.origin}/api/webhook/${project.id}` : '';

  if (loadingProject) {
    return <div className="text-gray-500 text-center py-10">Loading...</div>;
  }

  if (!project) {
    return (
      <div className="text-center py-10">
        <div className="text-red-400 mb-4">{error || 'Project not found'}</div>
        <button onClick={() => navigate('/')} className="text-sm text-indigo-400 hover:text-indigo-300">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/')} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
            <span className="flex items-center gap-1"><GitBranch className="w-4 h-4" />{project.branch}</span>
            <span className="text-gray-600">{project.repo_url}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            <Play className="w-4 h-4" />
            {deploying ? 'Deploying...' : 'Deploy Now'}
          </button>
          <button
            onClick={() => navigate(`/projects/${id}/edit`)}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
            title="Edit project"
          >
            <Pencil className="w-5 h-5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-400/10 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-1">Webhook URL</h3>
            <code className="text-xs text-gray-400 break-all">{webhookUrl}</code>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
            title="Copy webhook URL"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Add this URL as a webhook in your GitHub repo settings. Set content type to application/json.
        </p>
      </div>

      {/* Deploy History + Logs side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deploy list */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold text-white mb-3">Deploy History</h2>
          {loadingDeploys ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : !deploys || deploys.length === 0 ? (
            <div className="text-gray-500 text-sm bg-gray-900 rounded-lg p-4 text-center">
              No deploys yet. Click "Deploy Now" to trigger one.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {deploys.map((deploy) => (
                <button
                  key={deploy.id}
                  onClick={() => setSelectedDeploy(deploy)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedDeploy?.id === deploy.id
                      ? 'bg-gray-800 border-indigo-500/50'
                      : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <StatusBadge status={deploy.status} />
                    <span className="text-xs text-gray-500">{deploy.trigger_type}</span>
                  </div>
                  {deploy.commit_sha && (
                    <div className="text-xs text-gray-400 font-mono mt-1 truncate">
                      {deploy.commit_sha.slice(0, 8)} — {deploy.commit_message}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3" />
                    {new Date(deploy.started_at).toLocaleString()}
                    {deploy.duration_secs != null && (
                      <span className="ml-auto">{deploy.duration_secs}s</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Log viewer */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">
              {selectedDeploy ? 'Deploy Logs' : 'Select a deploy to view logs'}
            </h2>
            {selectedDeploy?.status === 'running' && (
              <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-gray-500'}`}>
                {connected ? 'Live' : 'Connecting...'}
              </span>
            )}
          </div>
          {selectedDeploy ? (
            <LogViewer logs={displayLogs} />
          ) : (
            <div className="bg-gray-900 rounded-lg p-12 text-gray-500 text-sm text-center">
              Click a deploy on the left to view its logs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
