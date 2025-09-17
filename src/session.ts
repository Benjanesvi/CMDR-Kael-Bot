type Pending = { chunks: string[]; expires: number };

const store = new Map<string, Pending>();
const TTL_MS = 5 * 60 * 1000;

export function setPending(channelId: string, chunks: string[]) {
  store.set(channelId, { chunks, expires: Date.now() + TTL_MS });
}

export function hasPending(channelId: string) {
  const p = store.get(channelId);
  if (!p) return false;
  if (p.expires < Date.now()) { store.delete(channelId); return false; }
  return p.chunks.length > 0;
}

export function popNext(channelId: string): string | null {
  const p = store.get(channelId);
  if (!p || p.expires < Date.now()) { store.delete(channelId); return null; }
  const next = p.chunks.shift() || null;
  if (!p.chunks.length) store.delete(channelId);
  else p.expires = Date.now() + TTL_MS;
  return next;
}

export function clearPending(channelId: string) {
  store.delete(channelId);
}
