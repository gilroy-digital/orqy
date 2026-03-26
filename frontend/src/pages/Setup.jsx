import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm';
const labelClass = 'block text-sm font-medium text-gray-300 mb-1';

const OS_OPTIONS = [
  { value: 'mac', label: 'macOS', desc: 'Mounts /Users from host' },
  { value: 'windows', label: 'Windows', desc: 'Mounts /c/Users from host' },
  { value: 'linux', label: 'Linux', desc: 'Mounts /home from host' },
];

export default function Setup() {
  const { setup, systemInfo } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hostOs, setHostOs] = useState(systemInfo?.detected_os || 'mac');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!username.trim()) { setError('Username is required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    try {
      await setup(username.trim(), password, hostOs);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <svg viewBox="0 0 32 32" className="w-12 h-12 mx-auto mb-4 animate-launch" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 3C16 3 10 9 10 18C10 21 11.5 24 16 27C20.5 24 22 21 22 18C22 9 16 3 16 3Z" fill="url(#sg)" stroke="#818cf8" strokeWidth="1" />
            <circle cx="16" cy="14" r="2.5" fill="#1e1b4b" stroke="#a5b4fc" strokeWidth="0.8" />
            <path d="M10 20C10 20 6 22 7 26L10 23Z" fill="#6366f1" />
            <path d="M22 20C22 20 26 22 25 26L22 23Z" fill="#6366f1" />
            <path d="M13.5 27C13.5 27 14.5 31 16 31C17.5 31 18.5 27 18.5 27C18.5 27 17.5 29 16 29C14.5 29 13.5 27 13.5 27Z" fill="#f59e0b" className="animate-flame" />
            <defs><linearGradient id="sg" x1="16" y1="3" x2="16" y2="27" gradientUnits="userSpaceOnUse"><stop stopColor="#c7d2fe" /><stop offset="1" stopColor="#818cf8" /></linearGradient></defs>
          </svg>
          <h1 className="text-2xl font-bold text-white">Welcome to Orqy</h1>
          <p className="text-sm text-gray-400 mt-1">Set up your deployment orchestrator</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          {error && (
            <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>Username</label>
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="off"
            />
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
            />
          </div>

          <div>
            <label className={labelClass}>Confirm Password</label>
            <input
              className={inputClass}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div>
            <label className={labelClass}>Host Operating System</label>
            <div className="grid grid-cols-3 gap-2">
              {OS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setHostOs(opt.value)}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    hostOs === opt.value
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs mt-0.5 opacity-60">{opt.desc}</div>
                </button>
              ))}
            </div>
            {systemInfo?.detected_os && systemInfo.detected_os !== 'unknown' && (
              <p className="text-xs text-gray-500 mt-2">
                Auto-detected: {systemInfo.detected_os} ({systemInfo.arch})
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {submitting ? 'Setting up...' : 'Complete Setup'}
          </button>
        </div>
      </div>
      <div className="text-center mt-6 text-xs text-gray-600">
        Built by <a href="https://gilroy.digital" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white">Leon Gilroy</a> &middot; <a href="https://gilroy.digital" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white">Gilroy.digital</a>
      </div>
    </div>
  );
}
