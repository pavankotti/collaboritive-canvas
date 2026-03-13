/**
 * WordService — provides words for drawing turns.
 *
 * Priority order:
 *   1. PostgreSQL (via Prisma) — if DATABASE_URL is set.
 *   2. In-memory built-in list  — fallback for local / no-DB dev.
 */

import type { PrismaClient } from '@prisma/client';
import { WORDS } from '../game';

export class WordService {
  private prisma: PrismaClient | null;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? null;
  }

  /** Attach a Prisma client after async initialisation. */
  setPrisma(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** Return `count` unique random words. */
  async pick(count: number): Promise<string[]> {
    if (this.prisma) {
      try {
        // Random sample via raw SQL (works on PostgreSQL)
        const rows = await this.prisma.$queryRaw<{ word: string }[]>`
          SELECT word FROM words
          ORDER BY random()
          LIMIT ${count}
        `;
        if (rows.length >= count) {
          await this.prisma.word.updateMany({
            where: { word: { in: rows.map((r: { word: string }) => r.word) } },
            data: { timesUsed: { increment: 1 } },
          });
          return rows.map((r: { word: string }) => r.word);
        }
      } catch (err) {
        console.warn('[WordService] DB pick failed, using in-memory fallback:', err);
      }
    }

    // In-memory fallback
    const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}

