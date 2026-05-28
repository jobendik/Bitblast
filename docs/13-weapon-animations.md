# 13 - WEAPON ANIMATIONS

**Priority**: 🟠 HIGH - Combat Core  
**Status**: 🟢 Complete  
**Dependencies**: 04-weapon-system, 01-player-controller  
**Estimated Complexity**: Medium  
**Time Estimate**: 4-8 hours

---

## 📋 Overview

Procedural weapon animations bring the gun to life. Instead of using pre-baked animation clips, we use code to procedurally animate the weapon model based on player state (moving, sprinting, shooting). This ensures perfect synchronization with gameplay logic.

### Why This Matters
- **Immersion**: Static weapons feel like 2D sprites.
- **Feedback**: Sway and bob convey weight and movement.
- **Responsiveness**: Procedural animations react instantly to input.

---

## 🎯 Design Goals

- [x] **Sway**: Weapon lags behind camera rotation (simulating weight).
- [x] **Bob**: Weapon moves up/down with footsteps.
- [x] **Recoil**: Weapon kicks back and rotates up when firing.
- [x] **States**: Smooth transitions for Sprinting and Reloading.

---

## ✅ Implementation Checklist

### Phase 1: Procedural Motion (Priority: Immediate)
- [x] **Weapon Sway**
  - [x] Calculate sway based on mouse delta.
  - [x] Lerp towards base position (spring effect).
- [x] **Head Bob Integration**
  - [x] Sync weapon bob with camera head bob.
  - [x] Apply vertical and horizontal figure-8 motion.

### Phase 2: Action Animations (Priority: High)
- [x] **Firing Kick**
  - [x] Move weapon back (Z-axis) on fire.
  - [x] Rotate weapon up (X-axis) on fire.
  - [x] Recover smoothly.
- [x] **Sprint State**
  - [x] Lower weapon and rotate inward when sprinting.
  - [x] Smooth blend (lerp) between Idle and Sprint states.

### Phase 3: Reload Animation (Priority: Medium)
- [x] **Procedural Reload**
  - [x] Dip weapon down and rotate.
  - [x] Sync with reload timer.
  - [x] Return to idle when complete.

---

## 🔗 Dependencies & Integration

### Required Before This
- [x] **Weapon System**: To control the model.
- [x] **Player Controller**: To provide movement state (bob time).

### Systems That Depend On This
- **Visual Effects**: Muzzle flash position depends on weapon position.

---

## 🔍 Verification Criteria

### Automated Checks
```typescript
// Check Weapon System
✓ updateWeaponTransform() method exists
✓ weaponSwayX/Y properties exist
✓ sprintBlend/reloadBlend properties exist
✓ WEAPON_CONFIG contains animation settings
```

---

## 🎯 Definition of Done

- [x] Weapon sways when looking around.
- [x] Weapon bobs when walking.
- [x] Weapon kicks back when shooting.
- [x] Weapon lowers when sprinting.
- [x] Weapon dips when reloading.

