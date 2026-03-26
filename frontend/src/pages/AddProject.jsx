import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../hooks/useApi';
import PathPicker from '../components/PathPicker';

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm';
const labelClass = 'block text-sm font-medium text-gray-300 mb-1';
const btnPrimary = 'px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-medium';
const btnSecondary = 'px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm';
const sectionClass = 'bg-gray-900 border border-gray-800 rounded-xl p-5';

export default function AddProject() {
  const navigate = useNavigate();

  // Step tracking
  const [repoValidated, setRepoValidated] = useState(false);
  const [pathValidated, setPathValidated] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    repo_url: '',
    branch: 'staging',
    local_path: '',
    compose_file: 'docker-compose.yml',
    service_name: '',
    pat: '',
    poll_interval_secs: 60,
    polling_enabled: true,
    webhook_secret: '',
    auto_deploy: true,
    compose_args: '',
    notify_url: '',
    build_timeout_secs: 600,
  });

  // Repo validation state
  const [branches, setBranches] = useState([]);
  const [validating, setValidating] = useState(false);
  const [repoError, setRepoError] = useState(null);

  // Path state
  const [repoCheck, setRepoCheck] = useState(null);
  const [checkingPath, setCheckingPath] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState(null);

  // Compose / service state
  const [containers, setContainers] = useState([]);
  const [containersLoading, setContainersLoading] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ── Step 1: Validate repo ──
  const handleValidateRepo = async () => {
    setValidating(true);
    setRepoError(null);
    setBranches([]);
    try {
      const params = new URLSearchParams({ repo_url: form.repo_url });
      if (form.pat) params.set('pat', form.pat);
      const res = await fetch(`/api/branches?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setRepoError(data.error || 'Failed to validate repository');
        return;
      }
      setBranches(data.branches || []);
      // Auto-select best default branch
      const br = data.branches || [];
      const defaultBranch = br.includes('main') ? 'main'
        : br.includes('master') ? 'master'
        : br.includes('staging') ? 'staging'
        : br[0] || 'main';
      setForm((prev) => ({ ...prev, branch: defaultBranch }));

      // Auto-derive project name from repo URL
      if (!form.name) {
        const match = form.repo_url.match(/\/([^/]+?)(\.git)?$/);
        if (match) setForm((prev) => ({ ...prev, name: match[1] }));
      }

      setRepoValidated(true);
    } catch {
      setRepoError('Failed to connect to server');
    } finally {
      setValidating(false);
    }
  };

  const handleRepoUrlChange = (e) => {
    setForm((prev) => ({ ...prev, repo_url: e.target.value }));
    // Reset validation when URL changes
    if (repoValidated) {
      setRepoValidated(false);
      setPathValidated(false);
      setBranches([]);
      setRepoCheck(null);
    }
  };

  // ── Step 2: Check local path ──
  const handlePathSelected = useCallback(async (path) => {
    setForm((prev) => ({ ...prev, local_path: path }));
    setCheckingPath(true);
    setRepoCheck(null);
    setCloneError(null);
    setPathValidated(false);
    try {
      const res = await fetch(`/api/check-repo?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setRepoCheck(data);
      if (data.is_git_repo) {
        setPathValidated(true);
        fetchComposeServices(path, form.compose_file);
        // If repo URL wasn't set yet, auto-fill from the repo's remote
        if (!repoValidated && data.remote_url) {
          setForm((prev) => ({ ...prev, repo_url: data.remote_url }));
          // Auto-validate with detected URL
          fetchBranches(data.remote_url, form.pat).then(() => {
            setRepoValidated(true);
            // Auto-derive project name
            const match = data.remote_url.match(/\/([^/]+?)(\.git)?$/);
            if (match && !form.name) {
              setForm((prev) => ({ ...prev, name: match[1] }));
            }
          });
        }
      }
    } catch {
      setRepoCheck(null);
    } finally {
      setCheckingPath(false);
    }
  }, [form.compose_file]);

  const handleClone = async () => {
    setCloning(true);
    setCloneError(null);
    try {
      const res = await fetch('/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: form.repo_url,
          path: form.local_path,
          branch: form.branch,
          pat: form.pat || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCloneError(data.error + (data.detail ? ': ' + data.detail : ''));
        return;
      }
      // Re-check the path
      await handlePathSelected(form.local_path);
    } catch (err) {
      setCloneError('Clone failed: ' + err.message);
    } finally {
      setCloning(false);
    }
  };

  // ── Step 3: Compose file & services ──
  const fetchComposeServices = async (path, composeFile) => {
    setContainersLoading(true);
    try {
      const params = new URLSearchParams({ path });
      if (composeFile) params.set('compose_file', composeFile);
      const res = await fetch(`/api/containers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContainers(data.containers || []);
      }
    } catch {
      // ignore
    } finally {
      setContainersLoading(false);
    }
  };

  const handleComposeFileChange = (v) => {
    setForm((prev) => ({ ...prev, compose_file: v }));
    if (form.local_path) {
      fetchComposeServices(form.local_path, v);
    }
  };

  // ── Submit ──
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        service_name: form.service_name || null,
        pat: form.pat || null,
        webhook_secret: form.webhook_secret || null,
        compose_args: form.compose_args || null,
        notify_url: form.notify_url || null,
        build_timeout_secs: parseInt(form.build_timeout_secs),
        poll_interval_secs: parseInt(form.poll_interval_secs),
      };
      const project = await apiPost('/projects', payload);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Add Project</h1>

      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* ── Step 1: Repository ── */}
        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">1</span>
            Repository
          </h2>

          <div className="space-y-3">
            <div>
              <label className={labelClass}>Repository URL *</label>
              <input
                className={inputClass}
                value={form.repo_url}
                onChange={handleRepoUrlChange}
                placeholder="https://github.com/you/repo.git"
              />
            </div>

            <div>
              <label className={labelClass}>PAT Override</label>
              <input
                className={inputClass}
                type="text"
                autoComplete="off"
                value={form.pat}
                onChange={(e) => {
                  update('pat')(e);
                  if (repoValidated) { setRepoValidated(false); setBranches([]); }
                }}
                placeholder="ghp_... (leave empty to use global PAT)"
              />
              <p className="text-xs text-gray-500 mt-1">Uses global PAT if empty.</p>
            </div>

            {!repoValidated && (
              <button
                type="button"
                onClick={handleValidateRepo}
                disabled={!form.repo_url || validating}
                className={btnPrimary}
              >
                {validating ? 'Validating...' : 'Validate'}
              </button>
            )}

            {repoError && (
              <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3 text-red-400 text-sm">
                {repoError}
              </div>
            )}

            {repoValidated && (
              <div className="space-y-3 pt-2 border-t border-gray-800">
                <div className="text-xs text-emerald-400">Repository validated — {branches.length} branch{branches.length !== 1 ? 'es' : ''} found</div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Project Name *</label>
                    <input className={inputClass} value={form.name} onChange={update('name')} placeholder="my-app" />
                  </div>
                  <div>
                    <label className={labelClass}>Branch *</label>
                    <select className={inputClass} value={form.branch} onChange={update('branch')}>
                      {branches.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2: Local Path ── */}
        <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">2</span>
              Local Path
            </h2>

            <div className="space-y-3">
              <div>
                <label className={labelClass}>Project Path on Server *</label>
                <PathPicker
                  value={form.local_path}
                  onChange={handlePathSelected}
                  mode="directory"
                  placeholder="/opt/projects/my-app"
                />
                <p className="text-xs text-gray-500 mt-1">Navigate to a project directory — repo URL and branch will be auto-detected if it's a git repo.</p>
              </div>

              {checkingPath && <p className="text-xs text-gray-500">Checking path...</p>}

              {repoCheck && !checkingPath && (
                <div>
                  {repoCheck.is_git_repo ? (
                    <div className="bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3 text-sm">
                      <span className="text-emerald-400">Git repository found.</span>
                      {repoCheck.remote_url && (
                        <span className="text-gray-400 ml-2">Remote: {repoCheck.remote_url}</span>
                      )}
                    </div>
                  ) : repoCheck.exists ? (
                    <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg p-3 text-sm space-y-2">
                      <p className="text-amber-400">Directory exists but is not a git repository.</p>
                      <button type="button" onClick={handleClone} disabled={cloning} className={btnPrimary}>
                        {cloning ? 'Cloning...' : `Clone ${form.repo_url.split('/').pop()} here`}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg p-3 text-sm space-y-2">
                      <p className="text-amber-400">Directory does not exist.</p>
                      <button type="button" onClick={handleClone} disabled={cloning} className={btnPrimary}>
                        {cloning ? 'Cloning...' : `Clone to ${form.local_path}`}
                      </button>
                    </div>
                  )}
                  {cloneError && (
                    <p className="text-red-400 text-xs mt-2">{cloneError}</p>
                  )}
                </div>
              )}
            </div>
          </div>

        {/* ── Step 3: Compose & Service ── */}
        {pathValidated && (
          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">3</span>
              Docker Compose
            </h2>

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
                    {containers.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <input className={inputClass} value={form.service_name} onChange={update('service_name')} placeholder="Leave empty for all" />
                )}
                {containersLoading && <p className="text-xs text-gray-500 mt-1">Loading services...</p>}
                <p className="text-xs text-gray-500 mt-1">Empty = rebuild all services</p>
              </div>
            </div>

            <div className="mt-3">
              <label className={labelClass}>Extra Compose Arguments</label>
              <input className={inputClass} value={form.compose_args} onChange={update('compose_args')} placeholder="e.g. --env-file .env.production --profile prod" />
              <p className="text-xs text-gray-500 mt-1">Additional flags passed to docker compose commands.</p>
            </div>
          </div>
        )}

        {/* ── Step 4: Detection Settings ── */}
        {pathValidated && (
          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">4</span>
              Detection
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Poll Interval (seconds)</label>
                <input className={inputClass} type="number" min="10" value={form.poll_interval_secs} onChange={update('poll_interval_secs')} />
              </div>
              <div>
                <label className={labelClass}>Build Timeout (seconds)</label>
                <input className={inputClass} type="number" min="60" value={form.build_timeout_secs} onChange={update('build_timeout_secs')} />
                <p className="text-xs text-gray-500 mt-1">Auto-cancels after this duration</p>
              </div>
            </div>
            <div>
              <label className={labelClass}>Webhook Secret</label>
              <input className={inputClass} type="text" autoComplete="off" value={form.webhook_secret} onChange={update('webhook_secret')} placeholder="Optional" />
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

            <div className="mt-3">
              <label className={labelClass}>Notification Webhook URL</label>
              <input className={inputClass} value={form.notify_url} onChange={update('notify_url')} placeholder="https://hooks.slack.com/... or Discord webhook URL" />
              <p className="text-xs text-gray-500 mt-1">Receives a POST with deploy status (success/failed) on completion.</p>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-2">
          {pathValidated && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !form.name || !form.repo_url || !form.local_path}
              className={btnPrimary}
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/')}
            className={btnSecondary}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
