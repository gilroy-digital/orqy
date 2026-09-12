import { useState, useEffect } from 'react';
import { useApi, apiPost, apiPut, apiDelete } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { Shield, Check, Trash2, Monitor, AlertTriangle, RefreshCw, Bell, User } from 'lucide-react';

const OS_LABELS = { mac: 'macOS', windows: 'Windows', linux: 'Linux', unknown: 'Unknown' };

export default function Settings() {
  const { systemInfo, user, refreshUser } = useAuth();
  const { data: settings, loading, refetch } = useApi('/settings');
  const [pat, setPat] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState(null);

  useEffect(() => { setEmail(user?.email || ''); }, [user?.email]);

  const handleSaveEmail = async () => {
    setEmailSaving(true);
    setEmailSaved(false);
    setEmailError(null);
    try {
      await apiPut('/auth/me', { email: email.trim() || null });
      await refreshUser();
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 3000);
    } catch (err) {
      setEmailError(err.message || 'Failed to save email');
    } finally {
      setEmailSaving(false);
    }
  };

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

      {/* Account */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Your account</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          You sign in as <span className="font-mono text-gray-300">{user?.username || '—'}</span>.
          An email lets you raise bug reports and feature requests from the button in
          the corner, and gives us somewhere to reply. It is not used for signing in
          and never leaves this install except on a ticket you submit.
        </p>

        {/* Three states: username is already an address, an address has been
            set explicitly, or there is nothing to attribute a ticket to. */}
        {user && !user.email && user.ticket_email && (
          <div className="flex gap-2.5 rounded-lg border border-gray-700 bg-gray-800/50 p-3 mb-4">
            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              Your username is already an email address, so tickets are sent as{' '}
              <span className="font-mono text-gray-300">{user.ticket_email}</span>. Set a
              different one below if you&rsquo;d rather we replied elsewhere.
            </p>
          </div>
        )}

        {user && !user.ticket_email && (
          <div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/80">
              No email set — you can use Orqy as normal, but you won&rsquo;t be able to
              submit tickets until you add one.
            </p>
          </div>
        )}

        <label className="block text-sm font-medium text-gray-300 mb-1">Email address</label>
        <div className="flex gap-3">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveEmail()}
            placeholder="you@example.com"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
          />
          <button
            type="button"
            onClick={handleSaveEmail}
            disabled={emailSaving || email.trim() === (user?.email || '')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {emailSaved ? <><Check className="w-4 h-4" /> Saved</> : emailSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {emailError && <p className="mt-2 text-xs text-red-400">{emailError}</p>}
      </div>

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

      {/* Global Webhooks */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Global Webhooks</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Receive notifications when any project deploys. Per-project URLs in project settings will also fire.
        </p>
        <div className="space-y-3">
          {[
            { key: 'webhook_running', label: 'Running', desc: 'When a deploy starts', color: 'text-indigo-400' },
            { key: 'webhook_success', label: 'Success', desc: 'When a deploy succeeds', color: 'text-emerald-400' },
            { key: 'webhook_failed', label: 'Failed', desc: 'When a deploy fails', color: 'text-red-400' },
          ].map(({ key, label, desc, color }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                <span className={color}>{label}</span> <span className="text-gray-500 font-normal">— {desc}</span>
              </label>
              <input
                type="text"
                autoComplete="off"
                defaultValue={settings?.[key] || ''}
                onBlur={async (e) => {
                  try {
                    await apiPost('/settings/webhooks', {
                      [key]: e.target.value || null,
                      ...Object.fromEntries(
                        ['webhook_running', 'webhook_success', 'webhook_failed']
                          .filter(k => k !== key)
                          .map(k => [k, settings?.[k] || null])
                      ),
                    });
                    refetch();
                  } catch {}
                }}
                placeholder="https://hooks.slack.com/... or any URL"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-mono"
              />
            </div>
          ))}
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

      {/* Update Orqy */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Update Orqy</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Pulls the latest version from the git repository and rebuilds the container. The page will reload automatically.
        </p>
        <button
          type="button"
          onClick={async () => {
            if (!confirm('Update Orqy to the latest version? The service will restart briefly.')) return;
            try {
              await apiPost('/settings/update', {});
              // Poll until the service comes back
              const poll = setInterval(async () => {
                try {
                  const res = await fetch('/api/setup/status');
                  if (res.ok) {
                    clearInterval(poll);
                    window.location.reload();
                  }
                } catch {}
              }, 3000);
            } catch (err) {
              alert('Update failed: ' + err.message);
            }
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors text-sm font-medium"
        >
          Check for Updates
        </button>
      </div>

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
