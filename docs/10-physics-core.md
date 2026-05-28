# 10 - PHYSICS CORE

**Priority**: 🔴 CRITICAL - Foundation System  
**Status**: 🟢 Complete  
**Dependencies**: 01-player-controller  
**Estimated Complexity**: Medium  
**Time Estimate**: 4-8 hours

---

## 📋 Overview

The Physics Core handles collision detection and resolution for the player and world objects. Since this engine uses a custom lightweight physics implementation (AABB), this system ensures players don't walk through walls, fall through floors, or get stuck in geometry.

### Why This Matters
- **Playability**: Getting stuck or falling out of the world breaks the game.
- **Movement**: Smooth collision sliding is essential for FPS movement.
- **Performance**: Custom AABB is faster than a full physics engine for this scope.

---

## 🎯 Design Goals

- [x] **AABB Collision**: Axis-Aligned Bounding Box collision for all static geometry.
- [x] **Step Handling**: Automatically step up small obstacles (stairs/curbs).
- [x] **Wall Sliding**: Slide along walls instead of stopping dead.
- [x] **Gravity**: Constant downward force with terminal velocity.

---

## ✅ Implementation Checklist

### Phase 1: Collision Detection (Priority: Immediate)
- [x] **Bounding Boxes**
  - [x] Generate AABB for all arena objects.
  - [x] Define player AABB (width/height).
- [x] **Intersection Testing**
  - [x] Check for overlap between player and world boxes.
  - [x] Check for map boundaries.

### Phase 2: Collision Resolution (Priority: Immediate)
- [x] **Separation**
  - [x] Push player out of overlapping geometry.
  - [x] Determine shallowest penetration axis (X vs Z).
- [x] **Vertical Handling**
  - [x] Detect ground vs ceiling.
  - [x] Handle step-up logic for small height differences.
  - [x] Reset vertical velocity on landing/head-bonk.

### Phase 3: Forces (Priority: High)
- [x] **Gravity**
  - [x] Apply gravity every frame.
  - [x] Cap at terminal velocity.
- [x] **Friction**
  - [x] Apply ground friction/deceleration.
  - [x] Apply air resistance.

---

## 🔗 Dependencies & Integration

### Required Before This
- [x] **Player Controller**: To apply the movement.
- [x] **Level Geometry**: To collide with.

### Systems That Depend On This
- **Movement**: Relies on `onGround` state.
- **Projectiles**: Will need collision checks (raycast or AABB).

---

## 🔍 Verification Criteria

### Automated Checks
```typescript
// Check Player Entity
✓ update() contains collision resolution loop
✓ arenaObjects passed to update()
✓ Step height logic exists
✓ Wall slide logic (min overlap check) exists
```

---

## 🎯 Definition of Done

- [x] Player cannot walk through walls.
- [x] Player can walk up stairs/slopes.
- [x] Player falls when walking off a ledge.
- [x] Player slides along walls when walking diagonally into them.

