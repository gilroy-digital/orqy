import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Settings, Plus, LogOut, HelpCircle, Heart } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

function OrqyLogo({ animate }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={`w-7 h-7 ${animate ? 'animate-launch' : ''}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rocket body */}
      <path
        d="M16 3C16 3 10 9 10 18C10 21 11.5 24 16 27C20.5 24 22 21 22 18C22 9 16 3 16 3Z"
        fill="url(#rocketGrad)"
        stroke="#818cf8"
        strokeWidth="1"
      />
      {/* Window */}
      <circle cx="16" cy="14" r="2.5" fill="#1e1b4b" stroke="#a5b4fc" strokeWidth="0.8" />
      {/* Left fin */}
      <path d="M10 20C10 20 6 22 7 26L10 23Z" fill="#6366f1" />
      {/* Right fin */}
      <path d="M22 20C22 20 26 22 25 26L22 23Z" fill="#6366f1" />
      {/* Flame */}
      <path
        d="M13.5 27C13.5 27 14.5 31 16 31C17.5 31 18.5 27 18.5 27C18.5 27 17.5 29 16 29C14.5 29 13.5 27 13.5 27Z"
        fill="#f59e0b"
        className={animate ? 'animate-flame' : ''}
      />
      <path
        d="M14.5 27C14.5 27 15 30 16 30C17 30 17.5 27 17.5 27C17.5 27 17 29 16 29C15 29 14.5 27 14.5 27Z"
        fill="#ef4444"
        className={animate ? 'animate-flame' : ''}
      />
      <defs>
        <linearGradient id="rocketGrad" x1="16" y1="3" x2="16" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c7d2fe" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Layout() {
  const location = useLocation();
  const { logout } = useAuth();
  const [launching, setLaunching] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLaunching(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const navLink = (to, label, icon) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          active
            ? 'bg-indigo-600 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
      >
        {icon}
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <OrqyLogo animate={launching} />
              <span className="text-lg font-bold text-white">Orqy</span>
            </Link>
            <div className="flex items-center gap-2">
              {navLink('/', 'Dashboard', null)}
              {navLink('/projects/new', 'Add Project', <Plus className="w-4 h-4" />)}
              {navLink('/settings', 'Settings', <Settings className="w-4 h-4" />)}
              {navLink('/help', 'Help', <HelpCircle className="w-4 h-4" />)}
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-gray-800 py-4 text-center text-xs text-gray-500">
        <div className="flex items-center justify-center gap-3">
          <span>Built by <a href="https://gilroy.digital" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Leon Gilroy</a> &middot; <a href="https://gilroy.digital" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Gilroy.digital</a></span>
          <a
            href="https://donate.stripe.com/dRm5kDgAk6mB4sw9sYfbq06"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-pink-600/20 text-pink-400 rounded-full hover:bg-pink-600/30 transition-colors"
          >
            <Heart className="w-3 h-3" />
            Donate
          </a>
        </div>
      </footer>
    </div>
  );
}
