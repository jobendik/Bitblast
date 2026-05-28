# Post-migration regression report (YUKA moved client → server)

Date: 2025-12-15

## Symptoms reported
- Hit detection unreliable after moving YUKA logic server-side.
- AI agents appear ~20 cm below the ground.

## High-confidence root causes

### 1) Match room join mismatch (breaks replication + damage events)
**Why it matters**: If clients don’t join the same match room, they won’t reliably receive room-scoped broadcasts (player/bot state, damage, kill events). That often *looks* like “hit detection is broken” because the victim never sees health changes / hit reactions, or bots/players are missing.

**Evidence**
- Client emitted `join_match` in two different shapes:
  - string `matchId` in the connect handler
  - object `{ matchId, token }` when reusing the lobby socket
  
**Fix implemented**
- Client now always emits `join_match` as the string `matchId` when reusing lobby sockets.
- Servers now accept both shapes (string or `{ matchId }`) to remain backward compatible.

**Files changed**
- [src/network/NetworkManager.ts](src/network/NetworkManager.ts)
- [server/standalone.cjs](server/standalone.cjs)
- [src/server/sockets/gameHandler.ts](src/server/sockets/gameHandler.ts)

### 2) Server navmesh loader ignored glTF node transforms (systematic offsets)
**Why it matters**: The client uses YUKA’s `NavMeshLoader` (via GLTFLoader), which applies scene graph transforms. The server used a custom GLB parser that only read raw vertex positions from the first mesh/primitive and did not apply node transforms. This commonly manifests as a consistent offset/rotation/scale mismatch between server navmesh and the rendered level.

**Evidence**
- Server loader originally:
  - loaded only `json.meshes[0].primitives[0]`
  - treated POSITION buffer as already world-space
  - did not traverse nodes / apply `node.matrix` or TRS

**Fix implemented**
- Server loader now:
  - traverses all nodes that reference meshes
  - processes all primitives
  - applies node transforms using glTF column-major matrices

**Files changed**
- [server/yuka-bot/ServerNavMeshLoader.js](server/yuka-bot/ServerNavMeshLoader.js)

### 3) Server grounding correction factor differed from client (causes persistent “below ground”)
**Why it matters**: Even with the same navmesh, different height correction smoothing can leave entities persistently under/over the plane depending on how often you clamp/snap and how aggressive the correction is.

**Evidence**
- Client bot grounding uses `CONFIG.NAVMESH.HEIGHT_CHANGE_FACTOR` (currently `0.2`).
- Server bot grounding used a hard-coded multiplier `0.5`.

**Fix implemented**
- Server bot grounding now uses `BOT_CONFIG.NAVMESH_HEIGHT_CHANGE_FACTOR = 0.2`.

**Files changed**
- [server/yuka-bot/ServerBot.js](server/yuka-bot/ServerBot.js)

## Remaining risks / follow-ups (not implemented here)

### A) Client-authoritative hits with no server validation
Currently the client raycasts and sends hit events. If networking hiccups or a client is desynced, hit outcomes can be inconsistent.

Recommended next step:
- Make the server authoritative for hitscan:
  - client sends `shoot` intent (origin, direction, weapon, timestamp)
  - server performs raycast against authoritative collision/hitboxes
  - server applies damage + broadcasts results

### B) Two parallel server implementations
There is both a standalone CommonJS server and a TypeScript server under `src/server/...`. If production and dev sometimes run different ones, event schemas can bitblast.

Recommended next step:
- Pick one server implementation and delete/retire the other, or very clearly separate responsibilities and share a single event contract.

## How to run (local)
- Standalone multiplayer server: `npm run server:standalone`
- Frontend dev server: `npm run dev`
