import { useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { Shield, Check, Trash2, Monitor, AlertTriangle } from 'lucide-react';

const OS_LABELS = { mac: 'macOS', windows: 'Windows', linux: 'Linux', unknown: 'Unknown' };

export default function Settings() {
  const { systemInfo } = useAuth();
  const { data: settings, loading, refetch } = useApi('/settings');
  const [pat, setPat] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSavePat = async () => {
    if (!pat.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await apiPost('/settings/pat', { pat });
      setPat('');
      setSaved(true);
      refetch();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Failed to save PAT: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePat = async () => {
    if (!confirm('Remove the global PAT? Projects without their own PAT will lose access to private repos.')) return;
    try {
      await apiDelete('/settings/pat');
      refetch();
    } catch (err) {
      alert('Failed to delete PAT: ' + err.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {/* Global PAT */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Global GitHub PAT</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          This PAT is used for all projects that don't have their own PAT override.
          It's encrypted at rest using AES-256-GCM.
        </p>

        {!loading && settings && (
          <div className="text-sm mb-4 flex items-center justify-between">
            {settings.has_global_pat ? (
              <>
                <span className="text-emerald-400">A global PAT is currently set.</span>
                <button
                  onClick={handleDeletePat}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove PAT
                </button>
              </>
            ) : (
              <span className="text-amber-400">No global PAT configured. Projects will need individual PATs or SSH keys.</span>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <input
            type="text"
            autoComplete="off"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSavePat()}
            placeholder={settings?.has_global_pat ? 'Enter new PAT to replace current one' : 'ghp_... or gitlab PAT'}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-mono"
          />
          <button
            type="button"
            onClick={handleSavePat}
            disabled={saving || !pat.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving...' : settings?.has_global_pat ? 'Update PAT' : 'Save PAT'}
          </button>
        </div>
      </div>

      {/* System Info */}
      {systemInfo && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Monitor className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">System</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Server OS</span>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={systemInfo.detected_os}
                  onChange={async (e) => {
                    try {
                      await apiPost('/settings/os', { os: e.target.value });
                      window.location.reload();
                    } catch {}
                  }}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                >
                  <option value="linux">Linux</option>
                  <option value="mac">macOS</option>
                  <option value="windows">Windows</option>
                </select>
              </div>
            </div>
            <div>
              <span className="text-gray-500">Architecture</span>
              <p className="text-white mt-0.5">{systemInfo.arch}</p>
            </div>
          </div>
        </div>
      )}

      {/* Factory Reset */}
      <div className="mt-6 bg-gray-900 border border-red-900/30 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-white">Factory Reset</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Removes all projects, deploy history, logs, PATs, and user accounts. Orqy will restart in setup mode.
        </p>
        <button
          type="button"
          onClick={async () => {
            const confirm1 = prompt('Type "RESET" to confirm factory reset:');
            if (confirm1 !== 'RESET') return;
            try {
              await apiPost('/settings/reset', {});
              localStorage.removeItem('orqy_token');
              window.location.href = '/';
            } catch (err) {
              alert('Reset failed: ' + err.message);
            }
          }}
          className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors text-sm font-medium"
        >
          Factory Reset
        </button>
      </div>

      {/* Info */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-3">How it works</h2>
        <div className="text-sm text-gray-400 space-y-3">
          <p>
            <strong className="text-gray-300">Polling:</strong> The service periodically checks each project's remote branch
            for new commits using <code className="text-indigo-400">git ls-remote</code>. When a change is detected, it triggers a deploy.
          </p>
          <p>
            <strong className="text-gray-300">Webhooks:</strong> Each project has a unique webhook URL. Configure it in your
            GitHub/GitLab repo settings to get instant deploys on push.
          </p>
          <p>
            <strong className="text-gray-300">Deploy process:</strong> git fetch → git reset --hard → docker compose down → docker compose up -d --build.
          </p>
        </div>
      </div>
    </div>
  );
}
