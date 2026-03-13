/**
 * RedisService — singleton Redis client used by EventDispatcher and BullMQ.
 *
 * Connections are established lazily; if REDIS_URL is not set the service
 * operates in no-op / in-memory mode so the server still runs locally
 * without a Redis instance.
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? '';

class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  readonly available: boolean;

  constructor() {
    this.available = Boolean(REDIS_URL);
    if (this.available) {
      this.client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
      this.subscriber = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });

      this.client.on('error', (err) => console.error('[Redis] client error:', err.message));
      this.subscriber.on('error', (err) => console.error('[Redis] subscriber error:', err.message));
    }
  }

  /** The main command-issuing client. May be null if Redis is unavailable. */
  get pub(): Redis | null { return this.client; }

  /** The dedicated subscribe-only client. May be null if Redis is unavailable. */
  get sub(): Redis | null { return this.subscriber; }

  /** Connect both clients (no-op if Redis is unavailable). */
  async connect() {
    if (!this.available) return;
    await Promise.all([
      this.client!.connect().catch(() => {}),
      this.subscriber!.connect().catch(() => {}),
    ]);
  }
}

export const redis = new RedisService();
