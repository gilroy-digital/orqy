import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm';
const labelClass = 'block text-sm font-medium text-gray-300 mb-1';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!username.trim() || !password) { setError('Enter username and password'); return; }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <svg viewBox="0 0 32 32" className="w-10 h-10 mx-auto mb-3" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 3C16 3 10 9 10 18C10 21 11.5 24 16 27C20.5 24 22 21 22 18C22 9 16 3 16 3Z" fill="url(#lg)" stroke="#818cf8" strokeWidth="1" />
            <circle cx="16" cy="14" r="2.5" fill="#1e1b4b" stroke="#a5b4fc" strokeWidth="0.8" />
            <path d="M10 20C10 20 6 22 7 26L10 23Z" fill="#6366f1" />
            <path d="M22 20C22 20 26 22 25 26L22 23Z" fill="#6366f1" />
            <defs><linearGradient id="lg" x1="16" y1="3" x2="16" y2="27" gradientUnits="userSpaceOnUse"><stop stopColor="#c7d2fe" /><stop offset="1" stopColor="#818cf8" /></linearGradient></defs>
          </svg>
          <h1 className="text-xl font-bold text-white">Orqy</h1>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
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
              autoComplete="username"
            />
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoComplete="current-password"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={async () => {
              const confirm1 = prompt('This will erase ALL data (projects, deploys, settings) and restart setup.\n\nType "RESET" to confirm:');
              if (confirm1 !== 'RESET') return;
              try {
                await fetch('/api/setup/reset', { method: 'POST' });
                localStorage.removeItem('orqy_token');
                window.location.href = '/';
              } catch (err) {
                alert('Reset failed: ' + err.message);
              }
            }}
            className="w-full text-center text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            Forgot password? Factory reset
          </button>
        </div>

        <div className="text-center mt-6 text-xs text-gray-600">
          Built by <a href="https://gilroy.digital" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white">Leon Gilroy</a> &middot; <a href="https://gilroy.digital" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white">Gilroy.digital</a>
        </div>
      </div>
    </div>
  );
}
