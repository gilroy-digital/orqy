import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import AddProject from './pages/AddProject';
import Settings from './pages/Settings';
import EditProject from './pages/EditProject';
import Help from './pages/Help';
import Setup from './pages/Setup';
import Login from './pages/Login';

function Unreachable({ error, onRetry }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-white">Can&rsquo;t reach Orqy</h1>
        <p className="mt-2 text-sm text-gray-400">
          The page loaded, but <span className="font-mono text-gray-300">{window.location.origin}</span> didn&rsquo;t
          answer. {error}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          The server may be restarting, or this machine may have lost the route to it.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { loading, setupError, retrySetup, setupComplete, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (setupError) {
    return <Unreachable error={setupError} onRetry={retrySetup} />;
  }

  if (!setupComplete) {
    return <Setup />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="projects/new" element={<AddProject />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="projects/:id/edit" element={<EditProject />} />
        <Route path="settings" element={<Settings />} />
        <Route path="help" element={<Help />} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
