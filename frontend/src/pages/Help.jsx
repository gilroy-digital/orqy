import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const sectionClass = 'bg-gray-900 border border-gray-800 rounded-xl p-6';

export default function Help() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-white">Help</h1>
      </div>

      <div className="space-y-6">
        <div className={sectionClass}>
          <h2 className="text-lg font-semibold text-white mb-3">Requirements</h2>
          <div className="text-sm text-gray-400 space-y-3">
            <p>Each project managed by Orqy must have:</p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-300">
              <li><strong>A Git repository</strong> — hosted on GitHub, GitLab, or any HTTPS-accessible git remote</li>
              <li><strong>A Docker Compose file</strong> — <code className="text-indigo-400">docker-compose.yml</code> (or custom filename) at the repo root or a specified path</li>
              <li><strong>A branch to watch</strong> — Orqy monitors a single branch per project for changes</li>
            </ul>
          </div>
        </div>

        <div className={sectionClass}>
          <h2 className="text-lg font-semibold text-white mb-3">How Deploys Work</h2>
          <div className="text-sm text-gray-400 space-y-3">
            <p>When a change is detected (via polling or webhook), Orqy runs:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-gray-300">
              <li><code className="text-indigo-400">git fetch</code> — pull latest changes from the remote</li>
              <li><code className="text-indigo-400">git reset --hard</code> — update the working directory to match</li>
              <li><code className="text-indigo-400">docker compose down</code> — stop existing containers</li>
              <li><code className="text-indigo-400">docker compose up -d --build</code> — rebuild and start containers</li>
            </ol>
            <p>All output is captured and streamed live via WebSocket to the UI.</p>
          </div>
        </div>

        <div className={sectionClass}>
          <h2 className="text-lg font-semibold text-white mb-3">Change Detection</h2>
          <div className="text-sm text-gray-400 space-y-3">
            <div>
              <h3 className="text-gray-300 font-medium mb-1">Polling</h3>
              <p>Orqy periodically runs <code className="text-indigo-400">git ls-remote</code> to check if the remote branch has new commits. The interval is configurable per project (default: 60 seconds).</p>
            </div>
            <div>
              <h3 className="text-gray-300 font-medium mb-1">Webhooks</h3>
              <p>Each project gets a unique webhook URL. Add it to your GitHub/GitLab repository settings for instant deploys on push. Set content type to <code className="text-indigo-400">application/json</code>.</p>
            </div>
          </div>
        </div>

        <div className={sectionClass}>
          <h2 className="text-lg font-semibold text-white mb-3">Authentication</h2>
          <div className="text-sm text-gray-400 space-y-3">
            <p>For private repositories, Orqy needs a Personal Access Token (PAT):</p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-300">
              <li><strong>Global PAT</strong> — set in Settings, used by all projects that don't have their own</li>
              <li><strong>Project PAT</strong> — overrides the global PAT for a specific project</li>
            </ul>
            <p>PATs are encrypted at rest using AES-256-GCM. For GitHub, create a fine-grained token with <code className="text-indigo-400">Contents: Read</code> permission.</p>
          </div>
        </div>

        <div className={sectionClass}>
          <h2 className="text-lg font-semibold text-white mb-3">Project Setup</h2>
          <div className="text-sm text-gray-400 space-y-3">
            <ol className="list-decimal list-inside space-y-1.5 text-gray-300">
              <li>Set a global PAT in Settings (or add one per project)</li>
              <li>Click "Add Project" and enter the repository URL</li>
              <li>Click "Validate" to verify access and load branches</li>
              <li>Select the branch to watch</li>
              <li>Browse to the local path where the repo should live (or clone it)</li>
              <li>Select the Docker Compose file and optionally a specific service</li>
              <li>Configure polling interval and auto-deploy preferences</li>
            </ol>
          </div>
        </div>

        <div className={sectionClass}>
          <h2 className="text-lg font-semibold text-white mb-3">Troubleshooting</h2>
          <div className="text-sm text-gray-400 space-y-3">
            <div>
              <h3 className="text-gray-300 font-medium mb-1">Deploy fails at git fetch</h3>
              <p>Check that your PAT is valid and has read access to the repository. Re-save it in Settings or the project edit page.</p>
            </div>
            <div>
              <h3 className="text-gray-300 font-medium mb-1">Cannot browse host folders</h3>
              <p>Orqy needs the host filesystem mounted. Check <code className="text-indigo-400">HOST_MOUNT</code> in your <code className="text-indigo-400">.env</code> file (Mac: <code className="text-indigo-400">/Users</code>, Linux: <code className="text-indigo-400">/home</code>, Windows: <code className="text-indigo-400">/c/Users</code>).</p>
            </div>
            <div>
              <h3 className="text-gray-300 font-medium mb-1">Docker compose commands fail</h3>
              <p>Ensure the Docker socket is mounted (<code className="text-indigo-400">/var/run/docker.sock</code>) and the compose file path is correct relative to the project root.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
