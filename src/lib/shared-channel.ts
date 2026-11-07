/**
 * One Realtime channel per key no matter how many components need it (shell widgets and
 * the page all read the same projects/roles). The last release removes the channel.
 */
const channels = new Map<string, { count: number; dispose: () => void }>();

export function retainSharedChannel(key: string, open: () => () => void): () => void {
  const existing = channels.get(key);
  if (existing) existing.count += 1;
  else channels.set(key, { count: 1, dispose: open() });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const entry = channels.get(key);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) {
      channels.delete(key);
      entry.dispose();
    }
  };
}
