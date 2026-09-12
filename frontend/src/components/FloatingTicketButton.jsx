import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle, Bug, Lightbulb, X, AlertTriangle, Check, Paperclip, FileText } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const SEVERITIES = [
  { value: 'low', label: 'Low', active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40', hint: "Cosmetic — doesn't affect how anything works" },
  { value: 'medium', label: 'Medium', active: 'bg-amber-500/15 text-amber-400 border-amber-500/40', hint: 'Annoying, but there is a workaround' },
  { value: 'high', label: 'High', active: 'bg-orange-500/15 text-orange-400 border-orange-500/40', hint: 'Something important is broken and hard to work around' },
  { value: 'critical', label: 'Critical', active: 'bg-red-500/15 text-red-400 border-red-500/40', hint: 'Deploys are blocked or Orqy is unusable' },
];

const initialForm = { title: '', description: '', severity: 'medium', is_urgent: false };

// The ticket API's attachment rules. It checks again and is the authority —
// these are here so a file that would be refused is refused on the spot.
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'log', 'csv', 'json', 'har'];
const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',');

const extensionOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

const formatBytes = (n) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// Checks a batch being added on top of what is already attached. All or
// nothing, same as the API: returns an error sentence, or null if they fit.
function checkFiles(existing, incoming) {
  if (existing.length + incoming.length > MAX_FILES) return `At most ${MAX_FILES} files can be attached.`;
  for (const f of incoming) {
    if (!ALLOWED_EXTENSIONS.includes(extensionOf(f.name))) {
      return `${f.name} can't be attached. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
    }
    if (f.size > MAX_FILE_BYTES) return `${f.name} is over the 10 MB limit.`;
  }
  const total = [...existing, ...incoming].reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_BYTES) return 'Attachments are over 25 MB in total.';
  return null;
}

export default function FloatingTicketButton() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | 'bug' | 'feature'
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Only signed-in users can raise tickets — the reporter address is taken
  // from the account, so there is nothing to submit as without one.
  if (!user) return null;

  // Orqy logs in by username. Where that username is itself an address the
  // backend uses it, so nothing more is needed; where it isn't, there is no
  // reporter to attribute the ticket to and submission is blocked until the
  // user sets an email in Settings.
  const canSubmit = !!user.ticket_email;

  const reset = () => {
    setMode(null);
    setForm(initialForm);
    setSent(null);
    setError(null);
    setFiles([]);
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  const addFiles = (incoming) => {
    if (!incoming.length) return;
    const problem = checkFiles(files, incoming);
    setError(problem);
    if (!problem) setFiles((prev) => [...prev, ...incoming]);
  };

  // A screenshot on the clipboard is the most common attachment there is, and
  // saving it to disk first just to pick it again is a chore. Pasted images
  // arrive as "image.png", so each gets a name that won't collide.
  const handlePaste = (e) => {
    const pasted = [...(e.clipboardData?.files || [])];
    if (!pasted.length) return;
    e.preventDefault();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    addFiles(
      pasted.map((f, i) =>
        f.name && f.name !== 'image.png'
          ? f
          : new File([f], `screenshot-${stamp}${pasted.length > 1 ? `-${i + 1}` : ''}.${f.type.split('/')[1] || 'png'}`, { type: f.type }),
      ),
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // Multipart, not JSON — attachments can't travel any other way.
      // Content-Type is left for the browser to set, boundary included.
      const body = new FormData();
      body.append('type', mode);
      body.append('title', form.title.trim());
      body.append('description', form.description.trim());
      if (mode === 'bug') body.append('severity', form.severity);
      if (mode === 'feature') body.append('is_urgent', String(form.is_urgent));
      body.append('page', location.pathname);
      files.forEach((f) => body.append('attachments', f, f.name));

      const token = localStorage.getItem('orqy_token');
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(res.status === 413 ? 'Attachments are too large to send.' : text || `${res.status} ${res.statusText}`);
      }
      setSent(text ? JSON.parse(text) : {});
    } catch (err) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const heading = sent
    ? 'Thanks — that’s logged'
    : mode === null
      ? 'How can we help?'
      : mode === 'bug'
        ? 'Report a bug'
        : 'Request a feature';

  const subheading = sent
    ? 'We’ll be in touch by email'
    : mode === null
      ? 'Choose an option below'
      : 'Goes straight to the Orqy backlog';

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report a bug or request a feature"
        className={`fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg shadow-black/40 flex items-center justify-center transition-all duration-200 ${
          open ? 'bg-gray-700 hover:bg-gray-600 rotate-90' : 'bg-indigo-600 hover:bg-indigo-500 hover:scale-105'
        }`}
      >
        {open ? <X className="w-5 h-5 text-white" /> : <MessageCircle className="w-5 h-5 text-white" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-80 max-w-[calc(100vw-3rem)] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl bg-gray-900 border border-gray-800 shadow-2xl shadow-black/50">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">{heading}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{subheading}</p>
          </div>

          {/* No email on the account — everything else still works, but a
              ticket has nobody to come back to. */}
          {!canSubmit && (
            <div className="m-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="text-amber-300 font-medium">No email on your account</p>
                  <p className="text-amber-200/70 mt-1 leading-relaxed">
                    You sign in as <span className="font-mono text-amber-200">{user.username}</span>, which
                    isn&rsquo;t an address we can reply to. Add one in Settings to raise tickets.
                  </p>
                  <Link
                    to="/settings"
                    onClick={close}
                    className="inline-block mt-2 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors font-medium"
                  >
                    Go to Settings
                  </Link>
                </div>
              </div>
            </div>
          )}

          {sent ? (
            <div className="p-4">
              <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="text-xs">
                  <p className="text-emerald-300 font-medium">
                    {sent.id ? `Ticket #${sent.id} raised` : 'Ticket raised'}
                  </p>
                  <p className="text-emerald-200/70 mt-0.5">
                    {sent.status === 'pending_auth'
                      ? 'Waiting on authorisation from the main contact.'
                      : `Logged as ${sent.type === 'feature' ? 'a feature request' : `a ${sent.severity || 'medium'} bug`}${
                          sent.attachments ? ` with ${sent.attachments} attachment${sent.attachments === 1 ? '' : 's'}` : ''
                        }.`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  Raise another
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : mode === null ? (
            <div className="p-4 space-y-2">
              <button
                onClick={() => setMode('bug')}
                className="w-full flex items-center gap-3 rounded-lg border border-gray-800 p-3.5 text-left hover:border-red-500/40 hover:bg-red-500/5 transition-colors group"
              >
                <div className="h-9 w-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                  <Bug className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Report a bug</div>
                  <div className="text-xs text-gray-500">Something isn&rsquo;t working</div>
                </div>
              </button>

              <button
                onClick={() => setMode('feature')}
                className="w-full flex items-center gap-3 rounded-lg border border-gray-800 p-3.5 text-left hover:border-purple-500/40 hover:bg-purple-500/5 transition-colors group"
              >
                <div className="h-9 w-9 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Request a feature</div>
                  <div className="text-xs text-gray-500">Suggest an improvement</div>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  autoFocus
                  placeholder={mode === 'bug' ? 'What went wrong?' : 'What would you like to see?'}
                  value={form.title}
                  onChange={set('title')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Details</label>
                <textarea
                  rows={3}
                  placeholder={
                    mode === 'bug'
                      ? 'Steps to reproduce, what you expected, which project...'
                      : 'Describe the feature and what it would let you do...'
                  }
                  value={form.description}
                  onChange={set('description')}
                  onPaste={handlePaste}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-400">Attachments</label>
                  <span className="text-[10px] text-gray-600">
                    {files.length}/{MAX_FILES}
                  </span>
                </div>
                {files.length > 0 && (
                  <ul className="space-y-1 mb-1.5">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-2 rounded-md bg-gray-800/60 border border-gray-800 px-2 py-1"
                      >
                        <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-[11px] text-gray-300" title={f.name}>
                          {f.name}
                        </span>
                        <span className="text-[10px] text-gray-500 shrink-0">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                          title={`Remove ${f.name}`}
                          className="text-gray-500 hover:text-gray-300 shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {files.length < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-700 px-3 py-2 text-[11px] text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    Add files, or paste a screenshot into Details
                  </button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    addFiles([...e.target.files]);
                    e.target.value = '';
                  }}
                />
              </div>

              {mode === 'bug' && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Severity</label>
                  <div className="flex gap-1.5">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, severity: s.value }))}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                          form.severity === s.value
                            ? s.active
                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-gray-300'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    {SEVERITIES.find((s) => s.value === form.severity)?.hint}
                  </p>
                </div>
              )}

              {mode === 'feature' && (
                <label className="flex items-start gap-2.5 rounded-lg border border-gray-800 px-3 py-2.5 cursor-pointer hover:border-gray-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.is_urgent}
                    onChange={(e) => setForm((p) => ({ ...p, is_urgent: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 shrink-0 accent-indigo-500"
                  />
                  <span>
                    <span className="block text-xs font-medium text-gray-300">Mark as urgent</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      Flags it for immediate attention and notifies the main contact straight away.
                    </span>
                  </span>
                </label>
              )}

              {error && (
                <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.title.trim() || !canSubmit}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Sending...' : 'Submit'}
                </button>
              </div>
            </form>
          )}

          <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50">
            <p className="text-[10px] text-gray-600 text-center">
              {canSubmit ? `Submitting as ${user.ticket_email}` : 'Add an email in Settings to submit'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
