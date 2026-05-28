# 12 - MOVEMENT PHYSICS

**Priority**: 🔴 CRITICAL - Foundation System  
**Status**: 🟢 Complete  
**Dependencies**: 01-player-controller, 10-physics-core  
**Estimated Complexity**: Medium  
**Time Estimate**: 4-8 hours

---

## 📋 Overview

The Movement Physics system defines how the player accelerates, decelerates, and interacts with the world. It separates "input" from "velocity", allowing for momentum, sliding, and air control. This is what makes the movement feel "fluid" rather than "stiff".

### Why This Matters
- **Game Feel**: Momentum allows for skill expression (bunny hopping, sliding).
- **Control**: Air control allows for corrections during jumps.
- **Realism**: Friction prevents instant stopping (unless desired for "snappiness").

---

## 🎯 Design Goals

- [x] **Momentum**: Velocity is preserved and modified by forces, not set directly.
- [x] **Air Control**: Reduced authority over movement while airborne.
- [x] **Friction**: Ground friction slows the player when no input is given.
- [x] **Sliding**: Reduced friction and maintained momentum while sliding.

---

## ✅ Implementation Checklist

### Phase 1: Velocity Management (Priority: Immediate)
- [x] **Acceleration**
  - [x] Apply force based on input direction.
  - [x] Different acceleration rates for Ground vs Air.
- [x] **Deceleration (Friction)**
  - [x] Apply friction when no input is given.
  - [x] Different friction rates for Ground vs Air vs Slide.

### Phase 2: Advanced Movement (Priority: High)
- [x] **Air Control**
  - [x] Allow limited steering while jumping/falling.
  - [x] Prevent instant direction changes in air.
- [x] **Slope Handling**
  - [x] Adjust velocity when moving up/down slopes (handled via collision resolution).
  - [x] Prevent sliding down shallow slopes.

### Phase 3: State Integration (Priority: Medium)
- [x] **Sprint Integration**
  - [x] Higher max speed, different acceleration.
- [x] **Slide Integration**
  - [x] Low friction, locked direction (mostly).

---

## 🔗 Dependencies & Integration

### Required Before This
- [x] **Player Controller**: To manage the state.
- [x] **Physics Core**: To handle the collision response.

### Systems That Depend On This
- **Weapon System**: Spread is based on velocity.
- **Camera System**: Head bob is based on velocity.

---

## 🔍 Verification Criteria

### Automated Checks
```typescript
// Check Player Entity
✓ update() uses velocity vector
✓ lerp() used for acceleration/friction
✓ airAccel/groundAccel constants exist
```

---

## 🎯 Definition of Done

- [x] Player accelerates smoothly (but quickly).
- [x] Player slides a bit before stopping (friction).
- [x] Jumping preserves forward momentum.
- [x] Sliding feels slippery.

