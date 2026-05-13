import type { Response } from 'express';

/**
 * In-memory registry of active SSE connections.
 * Maps userId → Set of open Response objects (supports multiple tabs).
 */
const clients = new Map<string, Set<Response>>();

export function addClient(userId: string, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
}

export function removeClient(userId: string, res: Response): void {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

/**
 * Push a JSON event to all open connections for a given user.
 * Silently skips users that have no active connection.
 */
export function pushToUser(userId: string, data: unknown): void {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // Connection was closed — remove it lazily
      set.delete(res);
    }
  }
}
