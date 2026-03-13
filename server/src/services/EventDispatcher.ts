/**
 * EventDispatcher — broadcasts drawing / game events via Redis Pub/Sub.
 *
 * When Redis is available:
 *   publish(channel, data) → PUBLISH to Redis → all server nodes subscribe
 *   and forward to their local Socket.io clients.
 *
 * When Redis is unavailable (local dev):
 *   publish(channel, data) → call the local broadcast handler directly.
 */

import { Server } from 'socket.io';
import { redis } from './RedisService';
import type { Op } from '../types';

type BroadcastFn = (channel: string, data: unknown) => void;

export class EventDispatcher {
  private io: Server;
  /** Fallback in-process broadcast (used when Redis is unavailable). */
  private localBroadcast: BroadcastFn;

  constructor(io: Server) {
    this.io = io;
    this.localBroadcast = (channel: string, data: unknown) => {
      // channel format: "room:<roomId>:<event>"
      const parts = channel.split(':');
      const roomId = parts[1];
      const event  = parts.slice(2).join(':');
      if (roomId && event) this.io.to(roomId).emit(event, data);
    };
  }

  /** Must be called once after server starts to wire Redis subscription. */
  async setup() {
    if (!redis.available || !redis.sub) return;

    // Forward every message received on any room channel to local Socket.io
    redis.sub.psubscribe('room:*', (err) => {
      if (err) console.error('[EventDispatcher] subscribe error:', err.message);
    });

    redis.sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      try {
        const parts = channel.split(':');
        const roomId = parts[1];
        const event  = parts.slice(2).join(':');
        if (roomId && event) {
          this.io.to(roomId).emit(event, JSON.parse(message));
        }
      } catch (err) {
        console.error('[EventDispatcher] pmessage error:', err);
      }
    });
  }

  /** Publish any event to a room. Falls back to local emit when Redis is down. */
  publish(roomId: string, event: string, data: unknown) {
    const channel = `room:${roomId}:${event}`;
    if (redis.available && redis.pub) {
      redis.pub.publish(channel, JSON.stringify(data)).catch((err) => {
        console.error('[EventDispatcher] publish error:', err.message);
        // Fallback: emit locally
        this.localBroadcast(channel, data);
      });
    } else {
      this.localBroadcast(channel, data);
    }
  }

  /** Send a drawing op to every client in the room. */
  broadcastOp(roomId: string, op: Op) {
    if (op.kind === 'undo' || op.kind === 'redo' || op.kind === 'clear') {
      this.publish(roomId, 'sync', op);
    } else {
      this.publish(roomId, 'op', op);
    }
  }

  /** Send full sync (all visible ops) to everyone in the room. */
  broadcastSync(roomId: string, ops: Op[]) {
    this.publish(roomId, 'sync', ops);
  }
}
