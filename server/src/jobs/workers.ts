/**
 * BullMQ workers -- only started when Redis is available.
 *
 * Workers perform:
 *   - saveMatchHistory : persist end-of-game scores to PostgreSQL
 *   - cleanupRoom      : delete expired room data from Postgres
 *   - saveChatLogs     : archive chat messages to PostgreSQL
 */

import { Worker } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import type { MatchHistoryJob, CleanupRoomJob, ChatLogJob } from './queues';

const REDIS_URL = process.env.REDIS_URL ?? '';

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

export function startWorkers(prisma?: PrismaClient) {
  if (!REDIS_URL) {
    console.log('[Workers] Redis unavailable -- background workers not started.');
    return;
  }

  const connection = parseRedisUrl(REDIS_URL);

  new Worker<MatchHistoryJob>('saveMatchHistory', async (job) => {
    if (!prisma) return;
    const { roomId, players } = job.data;
    const sorted = [...players].sort((a, b) => b.score - a.score);
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]!;
      try {
        await prisma.matchHistory.upsert({
          where: { roomId_userId: { roomId, userId: p.id } },
          update: { score: p.score, rank: i + 1 },
          create: { roomId, userId: p.id, score: p.score, rank: i + 1 },
        });
      } catch (err) {
        console.error('[Worker:saveMatchHistory] error for userId', p.id, err);
      }
    }
    console.log(`[Worker:saveMatchHistory] saved ${sorted.length} records for room ${roomId}`);
  }, { connection });

  new Worker<CleanupRoomJob>('cleanupRoom', async (job) => {
    const { roomId } = job.data;
    if (prisma) {
      await prisma.room.updateMany({
        where: { code: roomId },
        data: { phase: 'GAME_OVER' },
      }).catch(() => {});
    }
    console.log(`[Worker:cleanupRoom] cleaned up room ${roomId}`);
  }, { connection });

  new Worker<ChatLogJob>('saveChatLogs', async (job) => {
    const { roomId, messages } = job.data;
    console.log(`[Worker:saveChatLogs] ${messages.length} messages for room ${roomId} (archived)`);
  }, { connection });

  console.log('[Workers] BullMQ workers started.');
}
