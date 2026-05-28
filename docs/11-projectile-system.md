# 11 - PROJECTILE SYSTEM

**Priority**: 🔴 CRITICAL - Foundation System  
**Status**: 🟢 Complete  
**Dependencies**: 10-physics-core, 05-damage-system  
**Estimated Complexity**: Medium  
**Time Estimate**: 4-8 hours

---

## 📋 Overview

The Projectile System handles non-hitscan weapons like grenades, rockets, and slow-moving projectiles. It simulates physics (gravity, bouncing, friction) independent of the player.

### Why This Matters
- **Variety**: Adds depth beyond point-and-click shooting.
- **Tactics**: Grenades flush enemies out of cover.
- **Physics**: Bouncing grenades allow for skill shots.

---

## 🎯 Design Goals

- [x] **Physics Simulation**: Gravity, velocity, and drag.
- [x] **Collision**: Bounce off walls and floors.
- [x] **Detonation**: Explode on timer or impact.
- [x] **Visuals**: Rotating mesh, trail, and light.

---

## ✅ Implementation Checklist

### Phase 1: Core Projectile (Priority: Immediate)
- [x] **Projectile Class**
  - [x] Mesh, velocity, gravity properties.
  - [x] Update loop for physics integration.
- [x] **Spawning**
  - [x] Spawn at camera position + offset.
  - [x] Apply initial velocity based on look direction.

### Phase 2: Physics (Priority: High)
- [x] **Gravity & Drag**
  - [x] Apply gravity (arc).
  - [x] Apply friction on ground contact.
- [x] **Collision Resolution**
  - [x] Raycast ahead of movement.
  - [x] Reflect velocity on hit (Bounce).
  - [x] Apply bounciness factor (energy loss).

### Phase 3: Gameplay (Priority: Medium)
- [x] **Grenade Logic**
  - [x] Fuse timer (3 seconds).
  - [x] Detonation callback (Explosion).
- [x] **Input Integration**
  - [x] 'G' key to throw.

---

## 🔗 Dependencies & Integration

### Required Before This
- [x] **Physics Core**: For collision logic concepts.
- [x] **Input System**: To trigger the throw.

### Systems That Depend On This
- **Explosion System**: Triggered by projectiles.
- **Damage System**: Applied by explosions.

---

## 🔍 Verification Criteria

### Automated Checks
```typescript
// Check Projectile System
✓ spawnGrenade() method exists
✓ update() handles physics and collision
✓ Bouncing logic implemented (velocity reflection)

// Check Game Integration
✓ InputManager handles 'G' key
✓ Game.ts calls projectileSystem.update()
```

---

## 🎯 Definition of Done

- [x] Pressing G throws a grenade.
- [x] Grenade arcs through the air.
- [x] Grenade bounces off walls/floors.
- [x] Grenade explodes after a few seconds.

