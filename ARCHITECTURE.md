# 🧩 Architecture Documentation — Collaborative Canvas

this document explains the internal design and technical decisions of the **collaborative canvas** project —  
a realtime multi-user drawing app built using **vanilla typescript**, **html5 canvas**, and **socket.io**.

---

## 🧠 Data Flow Diagram (Text Representation)

```text
user draws on canvas → browser captures pointer events
       │
       ├─ local preview → draws stroke immediately (for responsiveness)
       │
       └─ on pointerup → emits "op" event to server via socket.io
             │
             ▼
server flow:
  ├─ index.ts:
  │    ├─ receives client event "op" (stroke, erase, undo, redo)
  │    ├─ identifies the user and their current room
  │    └─ calls applyClientOp() in drawing-state.ts
  │
  ├─ drawing-state.ts:
  │    ├─ manages room.ops[] (list of all applied operations)
  │    ├─ manages room.undone[] (redo stack)
  │    ├─ handles:
  │    │    • stroke / erase → append to ops[], clear undone[]
  │    │    • undo → remove last op → push to undone[]
  │    │    • redo → pop from undone[] → push back to ops[]
  │    └─ returns canonical Op with id, user, timestamp
  │
  ├─ rooms.ts:
  │    ├─ creates or fetches RoomState
  │    ├─ manages users (join, leave, list)
  │    └─ tracks per-room data and presence
  │
  └─ server emits events:
       • "op" → broadcast incremental update to all clients
       • "sync" → send full operation history (after undo/redo)
       • "cursor" → broadcast live cursor positions
       • "presence" → show current online users + join/leave notes
             ▼
clients:
  ├─ listen for "op" → draw incrementally on base canvas
  ├─ listen for "sync" → clear base and replay all ops[]
  ├─ listen for "cursor" → render live cursors on overlay canvas
  └─ maintain ui state (color, tool, width) locally
```

## 📡 websocket protocol

**client → server**
| event | payload | purpose |
|--------|----------|----------|
| `join` | `{ roomId, user, name, color }` | register user in a room |
| `op` | `{ kind, color?, width?, points? }` | send stroke/erase/undo/redo |
| `cursor` | `{ x, y, color }` | broadcast live pointer position |

**server → client**
| event | payload | description |
|--------|----------|-------------|
| `sync` | `[Op[]]` | full op log (after join/undo/redo) |
| `op` | `{ ... }` | single new canonical op |
| `cursor` | `{ user, x, y, color }` | other users’ cursors |
| `presence` | `{ users:[{id,name,color}], note? }` | who’s in the room |

**operation types**
```ts
type Op =
  | { kind: 'stroke'; color: string; width: number; points: [number, number][] }
  | { kind: 'erase'; width: number; points: [number, number][] }
  | { kind: 'undo' }
  | { kind: 'redo' };
  ```
---

## ↩️ Undo / Redo Strategy

Undo and redo are **global** operations handled centrally by the **server** to ensure that all connected clients stay synchronized and consistent.

---

### 🧩 Undo Flow

1. The server scans `room.ops[]` **backward** to find the most recent drawable operation (`stroke` or `erase`).
2. It removes that operation from `room.ops[]` and pushes it into `room.undone[]`.
3. The server emits a `sync(ops)` event containing the updated operation history.
4. All connected clients receive the sync and **re-render** their canvases from scratch.

---

### 🔁 Redo Flow

1. The server pops the last operation from `room.undone[]`.
2. It re-adds that operation to `room.ops[]`.
3. The updated list of operations is broadcast via `sync(ops)` to every client.
4. Each client clears its canvas and **replays** all operations sequentially.

---

### 🖥️ Client Reaction

- On receiving `sync`, the client:
  - Clears the base canvas.
  - Re-applies all operations (`stroke` and `erase`) in order.
- This guarantees that every client’s view is **identical**, even after undo/redo actions or reconnections.

## ⚙️ Performance Decisions

| Optimization | Reason |
|---------------|--------|
| **Two-canvas design** | Separates stable ink (base) from dynamic cursors (overlay), avoiding full re-renders. |
| **Device Pixel Ratio scaling** | Ensures crisp rendering on high-DPI (Retina) screens. |
| **Local stroke preview** | Provides instant visual feedback before the server confirms the stroke. |
| **`destination-out` for erase** | Efficient and non-destructive erasing method using the Canvas compositing API. |
| **`requestAnimationFrame` for cursors** | Keeps cursor rendering smooth at ~60fps without blocking the main thread. |
| **Socket.io over raw WebSockets** | Simplifies room handling, reconnections, and event broadcasting. |
| **ResizeObserver** | Automatically adjusts canvas dimensions when the window resizes without a page reload. |

---

### 🚀 Future Improvements

- Persist drawings in a database or cloud storage (e.g., MongoDB, S3).
- Compress stroke point arrays to handle large multi-user sessions.
- Move stroke computations and resampling to Web Workers for higher concurrency and smoother rendering.

## ⚔️ Conflict Resolution

| Scenario | Handling |
|-----------|-----------|
| **Multiple users drawing simultaneously** | The server queues operations (ops) in order of arrival; the canvas replays them sequentially for all users. |
| **Overlapping strokes** | The most recent operation visually overrides previous ones — “last draw wins.” |
| **Undo during drawing** | The server serializes the undo event before processing new strokes to maintain consistency. |
| **Reconnect after lag** | Upon reconnection, the server sends a full `sync(ops)` event to rebuild a deterministic state on the client. |
| **Disconnect mid-stroke** | The portion of the stroke already sent remains on the canvas; unfinished parts are ignored. |
| **Concurrent redo** | The server timestamps every operation (`t`) to preserve a single, globally ordered history. |
