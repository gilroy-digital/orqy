import { useEffect } from 'react';
import { X } from 'lucide-react';
import EditProject from '../pages/EditProject';

/**
 * The edit form over the project page rather than instead of it.
 *
 * The form itself is the existing Edit Project page, embedded: it reads the
 * same :id from the route, so opening this from a project page edits that
 * project, and there is only ever one copy of the form to keep up to date.
 */
export default function EditProjectModal({ open, onClose, onSaved }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // The page behind a dialog should not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit project"
        // Clicks inside the dialog must not reach the backdrop, or filling in
        // a field would close the form under your hands.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl bg-gray-900 border border-gray-800 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Edit project</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="p-1 text-gray-500 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <EditProject
            embedded
            onDone={() => {
              onSaved?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
