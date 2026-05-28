# Architecture Migration Report: YUKA.js AI Server Migration

**Date:** December 15, 2025  
**Issue:** Hit detection failures and spawn position errors after migrating AI from client to server

---

## Executive Summary

The migration of YUKA.js AI logic from the client to the server introduced several synchronization issues between the server-authoritative bot state and client-side rendering/hit detection. The primary issues are:

1. **Spawn Position Offset** - Bots appear ~2m above ground level
2. **Hit Detection Failures** - Raycasts not consistently detecting bot meshes
3. **State Desynchronization** - Client and server have different views of bot state

---

## Architecture Overview

### Before Migration (Single-Player)

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │  Bot.ts  │───▶│ YUKA.js  │───▶│ world.competitors │   │
│  │ (AI+Vis) │    │  (Local) │    │    (Raycasting)   │   │
│  └──────────┘    └──────────┘    └──────────────────┘   │
│        │                                   ▲             │
│        └───────────────────────────────────┘             │
│              Synchronous, Same Frame                     │
└─────────────────────────────────────────────────────────┘
```

### After Migration (Multiplayer)

```
┌─────────────────────────────────────┐
│              SERVER                  │
│  ┌──────────────────────────────┐   │
│  │    ServerBot.js (YUKA AI)    │   │
│  │    ServerBotManager.js       │   │
│  └──────────────┬───────────────┘   │
│                 │ bot_states (10Hz) │
└─────────────────┼───────────────────┘
                  │ WebSocket
┌─────────────────▼───────────────────┐
│              CLIENT                  │
│  ┌──────────────────────────────┐   │
│  │   RemoteBot.ts (Visual only) │   │
│  │   world.remoteBots (Map)     │   │
│  └──────────────┬───────────────┘   │
│                 │                    │
│  ┌──────────────▼───────────────┐   │
│  │   CombatManager.ts           │   │
│  │   (Local Raycasting)         │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## Issue #1: Spawn Position Offset (2m Above Ground)

### Root Cause Analysis

**Server spawn points** in `server/standalone.cjs` (lines 62-66):
```javascript
const SPAWN_POINTS = [
  { position: { x: -33.5, y: -4.9, z: 42 }, ... },
  { position: { x: 29.5, y: -7.17, z: -27.5 }, ... },
  // ...
];
```

**Server bot position** in `ServerBot.js` (line 611):
```javascript
this.position.set(spawnPoint.position.x, spawnPoint.position.y, spawnPoint.position.z);
```

**Client model offset** in `RemoteBot.ts` (lines 108-109):
```typescript
// Model origin is at center, but entity position is at feet
this.model.position.y = -0.9;
```

**The Problem:**
- YUKA's `Vehicle` class uses position as the **center of mass**
- The old `Bot.ts` compensated for this locally
- `RemoteBot` receives the server position (center of mass) and applies an additional -0.9 offset
- The spawn Y-values were tuned for the old local system

### Evidence

In `RemoteBot.ts` line 253-254:
```typescript
console.log(`🤖 [RemoteBot] ${this.username} first update: target Y=${state.position.y.toFixed(2)}, mesh Y=${this.mesh.position.y.toFixed(2)}`);
```

This debug log should reveal the discrepancy between server Y and displayed Y.

### Recommended Fix

Option A: Adjust server spawn points to account for YUKA vehicle center:
```javascript
// Add ~0.9 to Y values in SPAWN_POINTS
{ position: { x: -33.5, y: -4.0, z: 42 }, ... }
```

Option B: Remove the model offset in RemoteBot since server sends correct position:
```typescript
// Remove or adjust this line in RemoteBot.loadCharacter()
// this.model.position.y = -0.9;
```

---

## Issue #2: Hit Detection Failures

### Root Cause Analysis

**Three-layer problem:**

#### Layer 1: Obstacles List Construction

In `Player.ts` (lines 879-891):
```typescript
if ((world as any).remoteBots) {
    (world as any).remoteBots.forEach((bot: any) => {
        if (bot && !bot.isDead) {
            const mesh = bot.getMesh ? bot.getMesh() : bot.mesh;
            if (mesh) {
                obstacles.push(mesh);
            }
        }
    });
}
```

**Issues:**
- Uses `bot.isDead` but server uses `status` field
- TypeScript `as any` hides potential type mismatches
- `getMesh()` returns `this.mesh` (the Group), not the actual model geometry

#### Layer 2: userData.entity Linking

In `CombatManager.ts` (lines 335-347):
```typescript
let entity = hitObject.userData.entity;
if (!entity) {
    hitObject.traverseAncestors((ancestor: any) => {
        if (!entity && ancestor.userData.entity) {
            entity = ancestor.userData.entity;
        }
    });
}
```

In `RemoteBot.ts` (lines 101-104):
```typescript
this.model.traverse((child: THREE.Object3D) => {
    child.matrixAutoUpdate = true;
    child.userData.entity = this;
});
```

**Issue:** `userData.entity` is set on model children, but the raycaster might hit the outer `mesh` Group first, which doesn't have `userData.entity` set directly.

#### Layer 3: Interpolation Position Mismatch

```typescript
// RemoteBot stores TWO positions:
private targetPosition: THREE.Vector3;  // Where server says bot IS
// vs
this.mesh.position  // Where bot APPEARS (interpolated)
```

The raycast hits `mesh.position` (visual), but the server thinks the bot is at `targetPosition`. At 10Hz updates with network latency, these can differ by 0.5-1m.

### Recommended Fixes

**Fix 1:** Set `userData.entity` on the mesh Group itself:
```typescript
// In RemoteBot constructor, after creating mesh:
this.mesh.userData.entity = this;
```

**Fix 2:** Ensure consistent alive status check:
```typescript
// In Player.ts, change:
if (bot && !bot.isDead) {
// To:
if (bot && bot.status === 12) {  // STATUS_ALIVE
```

**Fix 3:** Consider using `targetPosition` for hit detection or add hitbox:
```typescript
// Add a dedicated hitbox that follows targetPosition
private hitbox: THREE.Mesh;
// Update hitbox position directly from server state, not interpolated
```

---

## Issue #3: State Desynchronization

### Root Cause Analysis

**Server state update frequency:**
```javascript
// ServerBotManager.js
this.tickRate = 20;      // AI runs at 20Hz
this.broadcastRate = 10; // Network sends at 10Hz
```

**Client interpolation:**
```typescript
// RemoteBot.ts
private interpolationSpeed: number = 12;

public update(delta: number): void {
    this.mesh.position.lerp(this.targetPosition, Math.min(1, this.interpolationSpeed * delta));
}
```

**Dual state tracking:**
```typescript
// RemoteBot has BOTH:
public isDead: boolean = false;
public status: number = 12; // STATUS_ALIVE
```

These can become desynced if one is updated but not the other.

### Evidence in Code

In `RemoteBot.updateFromServer()`:
```typescript
if (state.isAlive !== !this.isDead) {
    if (!state.isAlive && !this.isDead) {
        this.onDeath();  // Sets isDead = true, status = 13
    }
}
```

But `status` is also set directly:
```typescript
this.health = state.health;
// status is NOT updated from state.isAlive here!
```

### Recommended Fix

Consolidate state into single source of truth:
```typescript
public updateFromServer(state: ServerBotState): void {
    this.health = state.health;
    
    // Single source of truth for alive state
    const wasAlive = this.status === 12;
    const isNowAlive = state.isAlive;
    
    if (wasAlive && !isNowAlive) {
        this.onDeath();
    } else if (!wasAlive && isNowAlive) {
        this.onRespawn();
    }
    
    // Always sync status with server
    this.status = state.isAlive ? 12 : 13;
    this.isDead = !state.isAlive;
}
```

---

## Additional Observations

### 1. Client-Authoritative Damage

Current flow:
```
Player shoots → Client raycast → Hit detected → sendBotHit() to server
```

This is **client-authoritative** for damage detection. A laggy or malicious client could:
- Report hits that didn't happen
- Miss hits that should have connected

**Recommendation:** Consider server-side hit validation or accept client authority with anti-cheat measures.

### 2. Missing Bot in Competitors Array

Old code used `world.competitors` for all entities. New code stores bots in `world.remoteBots` Map.

Some systems might still iterate `competitors` expecting to find bots:
```typescript
// This will NOT include RemoteBots:
world.competitors.forEach((competitor) => { ... });
```

**Recommendation:** Audit all `competitors` usage to ensure RemoteBots are included where needed.

### 3. Animation State Sync

Server sends `animation: string` but client has complex animation mapping:
```typescript
// Server sends: 'idle', 'run', 'death'
// Client maps to: 'amy_idle', 'granny_forward', etc.
```

If server sends an unmapped animation name, it fails silently.

---

## Summary of Required Changes

| Priority | File | Change |
|----------|------|--------|
| HIGH | `RemoteBot.ts` | Add `this.mesh.userData.entity = this` in constructor |
| HIGH | `RemoteBot.ts` | Fix Y-offset or adjust server spawn points |
| HIGH | `RemoteBot.ts` | Sync `status` and `isDead` from server state |
| MEDIUM | `Player.ts` | Use `status === 12` instead of `!isDead` |
| MEDIUM | `ServerBotManager.js` | Adjust spawn point Y-values for YUKA vehicle center |
| LOW | `CombatManager.ts` | Add fallback hitbox for interpolation lag |

---

## Testing Checklist

- [ ] Verify bot spawn position visually matches ground level
- [ ] Confirm raycast hits register on stationary bots
- [ ] Test hit detection on moving bots
- [ ] Verify death/respawn transitions sync correctly
- [ ] Check killfeed shows correct bot kills
- [ ] Test with artificial network latency (200ms+)

---

*Report generated from codebase analysis on December 15, 2025*
