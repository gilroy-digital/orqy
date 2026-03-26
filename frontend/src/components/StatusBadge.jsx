import { CheckCircle, XCircle, Loader, Clock } from 'lucide-react';

const config = {
  success: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Success' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Failed' },
  running: { icon: Loader, color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Running' },
  pending: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-400/10', label: 'Pending' },
};

export default function StatusBadge({ status }) {
  const c = config[status] || config.pending;
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.color} ${c.bg}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {c.label}
    </span>
  );
}
