import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi, apiPut } from '../hooks/useApi';
import PathPicker from '../components/PathPicker';

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm';
const labelClass = 'block text-sm font-medium text-gray-300 mb-1';

export default function EditProject() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: project, loading: loadingProject } = useApi(`/projects/${id}`);

  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Branch fetching
  const [branches, setBranches] = useState([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState(null);
  const [repoUrlChanged, setRepoUrlChanged] = useState(false);

  // Service fetching
  const [containers, setContainers] = useState([]);
  const [containersLoading, setContainersLoading] = useState(false);

  // Populate form when project loads
  useEffect(() => {
    if (project && !form) {
      setForm({
        name: project.name,
        repo_url: project.repo_url,
        branch: project.branch,
        local_path: project.local_path,
        compose_file: project.compose_file,
        service_name: project.service_name || '',
        pat: '',
        poll_interval_secs: project.poll_interval_secs,
        polling_enabled: project.polling_enabled,
        webhook_secret: '',
        auto_deploy: project.auto_deploy,
      });
      fetchBranches(project.repo_url, '');
      fetchContainers(project.local_path, project.compose_file);
    }
  }, [project]);

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const fetchBranches = useCallback(async (repoUrl, pat) => {
    if (!repoUrl || !repoUrl.includes('/')) return;
    setBranchLoading(true);
    setBranchError(null);
    try {
      const params = new URLSearchParams({ repo_url: repoUrl });
      if (pat) params.set('pat', pat);
      const res = await fetch(`/api/branches?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setBranchError(data.error || 'Failed to fetch branches');
        setBranches([]);
      } else {
        setBranches(data.branches || []);
      }
    } catch {
      setBranchError('Failed to connect');
      setBranches([]);
    } finally {
      setBranchLoading(false);
    }
  }, []);

  const fetchContainers = useCallback(async (path, composeFile) => {
    if (!path) return;
    setContainersLoading(true);
    try {
      const params = new URLSearchParams({ path });
      if (composeFile) params.set('compose_file', composeFile);
      const res = await fetch(`/api/containers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContainers(data.containers || []);
      }
    } catch {}
    finally { setContainersLoading(false); }
  }, []);

  // Re-fetch branches when repo URL changes
  const handleRepoUrlChange = (e) => {
    const newUrl = e.target.value;
    setForm((prev) => ({ ...prev, repo_url: newUrl }));
    if (newUrl !== project?.repo_url) {
      setRepoUrlChanged(true);
    } else {
      setRepoUrlChanged(false);
    }
  };

  const handleRefreshBranches = () => {
    fetchBranches(form.repo_url, form.pat);
  };

  const handleComposeFileChange = (v) => {
    setForm((prev) => ({ ...prev, compose_file: v }));
    if (form.local_path) fetchContainers(form.local_path, v);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = { ...form };
      // Only send PAT if user entered a new one
      if (!payload.pat) delete payload.pat;
      // Only send webhook_secret if user entered a new one
      if (!payload.webhook_secret) delete payload.webhook_secret;
      payload.service_name = payload.service_name || null;
      payload.poll_interval_secs = parseInt(payload.poll_interval_secs);

      await apiPut(`/projects/${id}`, payload);
      navigate(`/projects/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingProject || !form) {
    return <div className="text-gray-500 text-center py-10">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Edit Project</h1>

      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Project Name *</label>
            <input className={inputClass} value={form.name} onChange={update('name')} />
          </div>
          <div>
            <label className={labelClass}>Branch *</label>
            <div className="flex gap-2">
              {branches.length > 0 ? (
                <select className={inputClass} value={form.branch} onChange={update('branch')}>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (
                <input className={inputClass} value={form.branch} onChange={update('branch')} />
              )}
              <button
                type="button"
                onClick={handleRefreshBranches}
                disabled={branchLoading}
                className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-xs whitespace-nowrap"
              >
                {branchLoading ? '...' : 'Refresh'}
              </button>
            </div>
            {branchError && <p className="text-xs text-red-400 mt-1">{branchError}</p>}
            {repoUrlChanged && <p className="text-xs text-amber-400 mt-1">Repo URL changed — click Refresh to update branches</p>}
          </div>
        </div>

        <div>
          <label className={labelClass}>Repository URL *</label>
          <input className={inputClass} value={form.repo_url} onChange={handleRepoUrlChange} />
          {repoUrlChanged && (
            <p className="text-xs text-amber-400 mt-1">Changing the repo URL may require updating the branch and local path.</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Local Path on Server *</label>
          <PathPicker
            value={form.local_path}
            onChange={(v) => {
              setForm((prev) => ({ ...prev, local_path: v }));
              fetchContainers(v, form.compose_file);
            }}
            mode="directory"
            placeholder="/opt/projects/my-app"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Compose File</label>
            <PathPicker
              value={form.compose_file}
              onChange={handleComposeFileChange}
              mode="file"
              placeholder="docker-compose.yml"
              startPath={form.local_path}
            />
          </div>
          <div>
            <label className={labelClass}>Service Name</label>
            {containers.length > 0 ? (
              <select className={inputClass} value={form.service_name} onChange={update('service_name')}>
                <option value="">All services</option>
                {containers.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input className={inputClass} value={form.service_name} onChange={update('service_name')} placeholder="Leave empty for all" />
            )}
            {containersLoading && <p className="text-xs text-gray-500 mt-1">Loading services...</p>}
          </div>
        </div>

        <div className="border-t border-gray-800 pt-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Authentication</h3>
          <div>
            <label className={labelClass}>PAT Override</label>
            <input className={inputClass} type="text" autoComplete="off" value={form.pat} onChange={update('pat')}
              placeholder={project.has_pat ? 'Enter new PAT to replace (leave empty to keep current)' : 'ghp_... (leave empty to use global)'} />
            {project.has_pat && <p className="text-xs text-emerald-400 mt-1">A project PAT is currently set.</p>}
          </div>
        </div>

        <div className="border-t border-gray-800 pt-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Detection</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Poll Interval (seconds)</label>
              <input className={inputClass} type="number" min="10" value={form.poll_interval_secs} onChange={update('poll_interval_secs')} />
            </div>
            <div>
              <label className={labelClass}>Webhook Secret</label>
              <input className={inputClass} type="text" autoComplete="off" value={form.webhook_secret} onChange={update('webhook_secret')}
                placeholder={project.has_webhook_secret ? 'Enter new secret to replace' : 'Optional'} />
              {project.has_webhook_secret && <p className="text-xs text-emerald-400 mt-1">A webhook secret is currently set.</p>}
            </div>
          </div>
          <div className="flex gap-6 mt-4">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.polling_enabled} onChange={update('polling_enabled')} className="rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500" />
              Enable polling
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.auto_deploy} onChange={update('auto_deploy')} className="rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500" />
              Auto-deploy on change
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !form.name || !form.repo_url || !form.local_path}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/projects/${id}`)}
            className="px-5 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
