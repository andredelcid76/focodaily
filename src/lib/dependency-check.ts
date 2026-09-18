import { supabase } from '@/integrations/supabase/client';
import { dependencyStatus, dependencyDateLabel, type DependencyInfo } from './dependency-status';
import { askDependencyConfirmation } from '@/components/DependencyConfirmation';
export async function loadDependencyInfo(taskId?: string): Promise<DependencyInfo[]> {
  const result: DependencyInfo[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase.from('task_dependencies').select('id,successor_id,lag_days,predecessor:tasks!task_dependencies_predecessor_id_fkey(id,title,scheduled_date,completed)').order('id').range(offset, offset + 999);
    if (taskId) query = query.eq('successor_id', taskId);
    const { data, error } = await query;
    if (error) throw error;
    result.push(...(data as DependencyInfo[]));
    if (data.length < 1000) return result;
  }
}
export async function confirmDependencyMove(taskId: string, date: string): Promise<boolean> {
  const status = dependencyStatus(date, await loadDependencyInfo(taskId));
  if (!status.conflicts.length) return true;
  return askDependencyConfirmation({
    title: 'Mover antes das predecessoras?',
    description: status.conflicts.map(c => `Agendada antes de: ${c.predecessor.title} (${dependencyDateLabel(c.limit)})`).join('; '),
    accept: 'Mover mesmo assim', cancel: 'Cancelar',
  });
}
