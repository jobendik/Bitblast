# 08 - RECOIL SYSTEM

**Priority**: 🔴 CRITICAL - Foundation System  
**Status**: 🟢 Complete  
**Dependencies**: 04-weapon-system, 02-camera-system  
**Estimated Complexity**: Medium  
**Time Estimate**: 4-8 hours

---

## 📋 Overview

The Recoil System simulates the physical kick of a weapon when firing. It affects both the camera (visual recoil) and the bullet trajectory (spread/bloom). It is essential for balancing weapons and providing tactile feedback.

### Why This Matters
- **Balance**: Prevents players from holding down the trigger with perfect accuracy.
- **Skill**: Players must learn to control recoil (pull down).
- **Feel**: Makes weapons feel powerful and dangerous.

---

## 🎯 Design Goals

- [x] **Visual Kick**: Camera rotates up and shakes when firing.
- [x] **Recovery**: Camera automatically settles back to center (soft recoil).
- [x] **Patterns**: Support for fixed spray patterns (CS:GO style) or random spread.
- [x] **Per-Weapon Config**: Each weapon has unique recoil properties.

---

## ✅ Implementation Checklist

### Phase 1: Core Recoil (Priority: Immediate)
- [x] **Camera Kick**
  - [x] Apply pitch (upward) rotation on fire.
  - [x] Apply yaw (horizontal) rotation on fire.
  - [x] Add randomness to the kick.
- [x] **Recoil Recovery**
  - [x] Smoothly return camera to original rotation over time.
  - [x] Configurable recovery rate.

### Phase 2: Advanced Recoil (Priority: High)
- [x] **Spray Patterns**
  - [x] Support defined vertical/horizontal offsets per shot in a burst.
  - [x] Reset pattern when burst stops.
- [x] **Bloom/Spread**
  - [x] Increase bullet spread as continuous shots are fired.
  - [x] Visual crosshair expansion to match spread.

### Phase 3: Polish (Priority: Medium)
- [x] **Camera Shake**
  - [x] Add high-frequency "micro-shake" on top of the kick.
  - [x] Screen shake intensity based on weapon power.
- [x] **Weapon Model Kick**
  - [x] Move the weapon model back (Z-axis) and rotate (X-axis) for visual feedback.

---

## 🔗 Dependencies & Integration

### Required Before This
- [x] **Weapon System**: To trigger recoil.
- [x] **Camera System**: To apply the rotation.

### Systems That Depend On This
- **Combat Loop**: Affects accuracy and time-to-kill.
- **HUD**: Crosshair expands based on recoil/spread.

---

## 🔍 Verification Criteria

### Automated Checks
```typescript
// Check Weapon System
✓ applyRecoil() method exists
✓ recoilPitch/recoilYaw properties exist
✓ WEAPON_CONFIG contains recoil settings

// Check Game Loop
✓ updateCamera() applies recoil to camera rotation
```

---

## 🎯 Definition of Done

- [x] Firing a weapon moves the camera up.
- [x] Stopping fire returns the camera to center.
- [x] Continuous fire increases spread.
- [x] Different weapons have different recoil feels.

