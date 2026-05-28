# 09 - SPREAD SYSTEM

**Priority**: 🔴 CRITICAL - Foundation System  
**Status**: 🟢 Complete  
**Dependencies**: 04-weapon-system, 01-player-controller  
**Estimated Complexity**: Medium  
**Time Estimate**: 4-8 hours

---

## 📋 Overview

The Spread System determines the accuracy of weapons. Unlike recoil (which moves the camera), spread randomizes the bullet trajectory within a cone. This system handles dynamic accuracy changes based on movement, stance, and continuous fire.

### Why This Matters
- **Tactical Depth**: Encourages stopping to shoot for accuracy.
- **Balance**: Limits the effective range of weapons (e.g., SMGs vs Rifles).
- **Realism**: Simulates the difficulty of aiming while moving or jumping.

---

## 🎯 Design Goals

- [x] **Dynamic Accuracy**: Spread changes based on player state (Idle < Walk < Run < Jump).
- [x] **Bloom**: Continuous fire increases spread (spray & pray penalty).
- [x] **Recovery**: Accuracy resets quickly when stopping fire.
- [x] **Visual Feedback**: Crosshair gap expands to show current spread.

---

## ✅ Implementation Checklist

### Phase 1: Core Spread (Priority: Immediate)
- [x] **Base Spread**
  - [x] Define base accuracy for each weapon.
  - [x] Randomize bullet direction within the spread cone.
- [x] **Bloom (Heat)**
  - [x] Increase spread per shot.
  - [x] Cap maximum spread.
  - [x] Decay spread over time when not firing.

### Phase 2: Movement Penalties (Priority: High)
- [x] **State-Based Multipliers**
  - [x] Jumping penalty (significant accuracy loss).
  - [x] Sprinting penalty.
  - [x] Moving penalty (walking).
- [x] **First Shot Accuracy**
  - [x] Ensure the first shot is perfectly accurate (or close to it) for tap-firing.

### Phase 3: Integration (Priority: Medium)
- [x] **Crosshair Integration**
  - [x] Pass current spread value to HUD.
  - [x] Animate crosshair gap based on spread.

---

## 🔗 Dependencies & Integration

### Required Before This
- [x] **Weapon System**: To calculate the shot.
- [x] **Player Controller**: To know if moving/jumping.

### Systems That Depend On This
- **Hit Detection**: Uses the randomized direction.
- **HUD**: Displays the accuracy.

---

## 🔍 Verification Criteria

### Automated Checks
```typescript
// Check Weapon System
✓ calculateShotDirection() applies spread
✓ currentBloom property exists
✓ WEAPON_CONFIG contains spread settings

// Check HUD Manager
✓ updateCrosshair() takes spread as argument
```

---

## 🎯 Definition of Done

- [x] Bullets do not always go to the center of the screen.
- [x] Running and gunning is less accurate than standing still.
- [x] Jumping makes you very inaccurate.
- [x] Crosshair expands when shooting or moving.

