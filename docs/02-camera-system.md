# 02 - CAMERA SYSTEM

**Priority**: 🔴 CRITICAL - Foundation System  
**Status**: 🟢 Complete  
**Dependencies**: 01 - Player Controller  
**Estimated Complexity**: High  
**Time Estimate**: 6-10 hours

---

## 📋 Overview

The camera system is the **player's eyes** into the game world. In a first-person shooter, the camera **IS** the player's perception. This system handles FOV changes, camera shake, recoil, head bob, and all camera-related feel elements.

### Why This Matters
- **Gunfeel foundation**: 50% of gunfeel comes from camera response
- **Impact feedback**: Camera shake/kick conveys power
- **Speed sensation**: FOV changes create sense of velocity
- **Player immersion**: Subtle movements create presence
- **Differentiation**: Great camera feel = memorable game

---

## 🎯 Design Goals

### Feel Targets
- [x] **Responsive**: Camera reacts instantly to events
- [x] **Weighty**: Actions feel impactful through camera
- [x] **Smooth**: No jarring transitions or jitter
- [x] **Dynamic**: FOV/position adjusts to game state
- [x] **Readable**: Never obscures gameplay

### Reference Games
- DOOM Eternal (aggressive camera punch)
- Call of Duty MW (smooth aim feel)
- Titanfall 2 (speed-based FOV)
- Apex Legends (responsive but stable)

---

## 🔗 Dependencies & Integration

### Required Before This
- 01 - Player Controller (camera follows player)
- Basic input system (mouse look)

### Required For This
- Mouse input (raw input preferred)
- Transform hierarchy (camera parent/child structure)

### Systems That Depend On This
- 04 - Weapon System (weapon positioning, recoil)
- 08 - Recoil System (camera kick patterns)
- 26 - Screen Shake (explosion shake)
- All visual feedback systems

---

## 🏗️ Core Components

### 1. Camera Hierarchy
```
Player Entity
├── Camera Parent (rotation X/Y/Z, position offsets)
│   ├── Camera (render component, FOV)
│   ├── Weapon Parent (attached to camera)
│   │   └── Weapon Model
│   └── Effects Parent (muzzle flash, etc.)
```

### 2. Camera Variables
```javascript
// Base settings
baseFOV: 90.0
nearClip: 0.1
farClip: 1000.0

// Mouse sensitivity
mouseSensitivity: 0.3
verticalClamp: 89.0 // degrees
invertY: false

// FOV modifiers
sprintFOVBoost: 10.0
jumpFOVBoost: 3.0
landFOVReduction: 5.0
adsFOVReduction: 20.0
fovTransitionSpeed: 8.0

// Head bob
bobEnabled: true
bobFrequency: 10.0
bobHorizontalAmplitude: 0.05
bobVerticalAmplitude: 0.08
bobSprintMultiplier: 1.5

// Breathing bob (idle)
breathingEnabled: true
breathingFrequency: 2.0
breathingAmplitude: 0.01

// Camera shake
shakeDecay: 5.0
shakeFrequency: 25.0
maxShakeIntensity: 1.0

// Recoil
recoilRecoverySpeed: 8.0
recoilSmoothness: 10.0
```

---

## ✅ Implementation Checklist

### Phase 1: Basic Camera Setup (Priority: Immediate)
- [x] Create camera entity
- [x] Set up parent/child hierarchy
- [x] Implement mouse look (yaw/pitch)
- [x] Add vertical clamp (-89 to 89)
- [x] Add sensitivity setting
- [x] Test: Smooth mouse movement

### Phase 2: Dynamic FOV (Priority: High)
- [x] Implement base FOV setting
- [x] Add sprint FOV modifier (+10)
- [x] Add jump FOV modifier (+3)
- [x] Implement smooth FOV lerp
- [x] Add FOV punch support (for shooting)
- [x] Test: Speed sensation without nausea

### Phase 3: Head Bob & Sway (Priority: Medium)
- [x] Implement sinusoidal head bob (walking)
- [x] Add sprint bob multiplier
- [x] Implement idle breathing animation
- [x] Add weapon sway (lag behind camera)
- [x] Test: Natural movement feel

### Phase 4: Camera Shake (Priority: High)
- [x] Create shake manager class
- [x] Implement perlin noise or random shake
- [x] Add shake types (Rotational, Positional)
- [x] Implement trauma/decay system
- [x] Add recoil shake integration
- [x] Test: Shooting feels impactful

### Phase 5: Polish (Priority: Low)
- [x] Add landing camera dip
- [x] Implement wall run tilt (if applicable)
- [x] Add damage flinch (red flash/shake)
- [x] Optimize camera update loop
- [x] Test: No jitter at high framerates