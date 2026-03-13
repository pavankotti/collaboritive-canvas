/**
 * BullMQ queue definitions.
 *
 * Queues gracefully no-op when Redis is not available — the Worker is simply
 * not started in that case (see workers.ts).
 *
 * Note: BullMQ bundles its own ioredis internally. We pass a plain connection
 * config object (host/port/…) rather than an ioredis instance to avoid
 * version-mismatch type errors.
 */

import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL ?? '';

/** Parse redis://[:password@]host[:port] into { host, port, password }. */
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || '127.0.0.1',
      port: u.port ? Number(u.port) : 6379,
      ...(u.password ? { password: u.password } : {}),
    };
  } catch {
    return { host: '127.0.0.1', port: 6379 };
  }
}

const redisConnection = REDIS_URL ? parseRedisUrl(REDIS_URL) : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeQueue<T extends object>(name: string): Queue<T> {
  if (!redisConnection) {
    // Stub queue — add() is a no-op when Redis is not configured.
    return { add: async () => {} } as unknown as Queue<T>;
  }
  return new Queue<T>(name, { connection: redisConnection });
}

// ─── Queues ──────────────────────────────────────────────────────────────────

export interface MatchHistoryJob {
  roomId: string;
  players: { id: string; name: string; score: number }[];
}

export interface CleanupRoomJob {
  roomId: string;
}

export interface ChatLogJob {
  roomId: string;
  messages: { userId: string; name: string; text: string; ts: number }[];
}

export const saveMatchHistoryQueue = makeQueue<MatchHistoryJob>('saveMatchHistory');
export const cleanupRoomQueue      = makeQueue<CleanupRoomJob>('cleanupRoom');
export const saveChatLogsQueue     = makeQueue<ChatLogJob>('saveChatLogs');

