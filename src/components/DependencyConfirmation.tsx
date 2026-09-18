import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
type Request = { title: string; description?: string; accept: string; cancel: string; resolve: (value: boolean) => void };
export function askDependencyConfirmation(request: Omit<Request, 'resolve'>): Promise<boolean> {
  return new Promise(resolve => window.dispatchEvent(new CustomEvent('dependency-confirm', { detail: { ...request, resolve } })));
}
export function DependencyConfirmation() {
  const [queue, setQueue] = useState<Request[]>([]);
  useEffect(() => {
    const receive = (event: Event) => setQueue(q => [...q, (event as CustomEvent<Request>).detail]);
    window.addEventListener('dependency-confirm', receive);
    return () => window.removeEventListener('dependency-confirm', receive);
  }, []);
  const request = queue[0];
  const answer = (value: boolean) => { request?.resolve(value); setQueue(q => q.slice(1)); };
  return <Dialog open={!!request} onOpenChange={open => { if (!open) answer(false); }}>
    <DialogContent><DialogHeader><DialogTitle>{request?.title}</DialogTitle>
      <DialogDescription>{request?.description ?? 'A data está antes do limite definido pelas predecessoras.'}</DialogDescription>
    </DialogHeader><DialogFooter>
      <Button variant="outline" onClick={() => answer(false)}>{request?.cancel}</Button>
      <Button onClick={() => answer(true)}>{request?.accept}</Button>
    </DialogFooter></DialogContent>
  </Dialog>;
}
