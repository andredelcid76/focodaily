import { useQuery } from '@tanstack/react-query';
import { Link2Off, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { loadDependencyInfo } from '@/lib/dependency-check';
import { dependencyStatus, dependencyDateLabel } from '@/lib/dependency-status';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
export function TaskDependencyStatus({ task }: { task: { id: string; scheduled_date: string | null; completed: boolean } }) {
  const { user } = useAuth();
  const { data = [] } = useQuery({ queryKey: ['dependency-status', user?.id], queryFn: () => loadDependencyInfo(), enabled: !!user, staleTime: 5000, refetchInterval: 15000 });
  const status = dependencyStatus(task.scheduled_date, data.filter(d => d.successor_id === task.id));
  if (!status.conflicts.length && (task.completed || !status.pending.length)) return null;
  return <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[10px]" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    {status.conflicts.map(c => {
      const label = `Agendada antes de: ${c.predecessor.title} (${dependencyDateLabel(c.limit)})`;
      return <TooltipProvider key={c.predecessor.id}><Tooltip><TooltipTrigger asChild>
        <span tabIndex={0} aria-label={label} className="inline-flex shrink-0 items-center text-overdue"><Link2Off className="h-3.5 w-3.5" /></span>
      </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip></TooltipProvider>;
    })}
    {!task.completed && status.pending.length > 0 && <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground" title={`Travada por: ${status.pending.join(', ')}`}><LockKeyhole className="h-3 w-3 shrink-0" /><span className="break-words">Travada por: {status.pending.join(', ')}</span></span>}
  </span>;
}
