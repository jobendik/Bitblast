# BITBLAST Integration Guide for BitBlast FPS Game

> **Purpose**: This document serves as a comprehensive checklist for integrating BITBLAST features into the BitBlast FPS game. Each section can be worked on independently, and tasks can be marked complete as they are finished.
>
> **How to Use**: 
> - Work through sections in order (Phase 1 → Phase 6)
> - Mark tasks complete by changing `[ ]` to `[x]`
> - Update the "Current Progress" section before ending a session
> - Reference source files in `BITBLAST/BitBlastGame/`, `BITBLAST/BitBlastBackend/`, `BITBLAST/BitBlastSocial/`

---

## Current Progress

**Last Updated**: [Current Session]  
**Current Phase**: Phase 8 - Testing & Integration  
**Status**: Phases 1-7 COMPLETE, ready for testing  
**Blocking Issues**: None  
**Notes**: All core systems implemented. Ready for integration testing.

### Completed:
- ✅ Phase 1: Types & Config
- ✅ Phase 2: Core Weapon System  
- ✅ Phase 3: Visual Effects (Particles, Decals, Tracers)
- ✅ Phase 4: HUD & UI System
- ✅ Phase 5: Audio System
- ✅ Phase 6: Game Modes (FFA, TDM, Wave Survival)
- ✅ Phase 7: Network & Lobby System

### Files Created:
- `src/types/index.ts`, `weapons.ts`, `player.ts`, `game.ts`
- `src/config/gameConfig.ts`, `weaponConfigs.ts`, `enemyTypes.ts`, `index.ts`
- `src/systems/ParticleSystem.ts`, `WeaponSystem.ts`, `DecalSystem.ts`, `BulletTracerSystem.ts`, `index.ts`
- `src/ui/HUDManager.ts`, `index.ts`
- `src/managers/AudioManager.ts`, `index.ts`
- `src/gamemodes/IGameMode.ts`, `BaseGameMode.ts`, `FreeForAllMode.ts`, `TeamDeathmatchMode.ts`, `WaveSurvivalMode.ts`, `GameModeManager.ts`, `index.ts`
- `src/network/types.ts`, `RemotePlayer.ts`, `NetworkManager.ts`, `index.ts`
- `src/lobby/types.ts`, `LobbyManager.ts`, `LobbyUI.ts`, `index.ts`
- `src/bitblast-integration.ts` (master integration)
- `public/style/bitblast-hud.css`
- `public/bitblast-hud.html`

---

## Quick Reference: Key File Locations

### Source (BITBLAST)
| Component | Location |
|-----------|----------|
| Weapon System | `BITBLAST/BitBlastGame/src/systems/WeaponSystem.ts` |
| Weapon Config | `BITBLAST/BitBlastGame/src/config/gameConfig.ts` |
| Player Controller | `BITBLAST/BitBlastGame/src/entities/Player.ts` |
| HUD Manager | `BITBLAST/BitBlastGame/src/ui/HUDManager.ts` |
| Network Manager | `BITBLAST/BitBlastGame/src/managers/NetworkManager.ts` |
| Backend Server | `BITBLAST/BitBlastBackend/src/server.ts` |
| Game Handler | `BITBLAST/BitBlastBackend/src/sockets/gameHandler.ts` |
| Social App | `BITBLAST/BitBlastSocial/src/` |

### Target (BitBlast)
| Component | Location |
|-----------|----------|
| Main Entry | `src/main.ts` |
| World | `src/core/World.ts` |
| Current Player | `src/entities/Player.ts` |
| Current Weapons | `src/core/WeaponSystem.ts` |
| Current UI | `src/core/UIManager.ts` |

---

## Phase 1: Configuration & Types Foundation

### 1.1 Create Type Definitions
- [ ] Create `src/types/index.ts` with all shared interfaces
- [ ] Create `src/types/weapons.ts` with weapon-related types
- [ ] Create `src/types/player.ts` with player-related types
- [ ] Create `src/types/game.ts` with game state types

<details>
<summary>📋 Task 1.1.1: Create src/types/index.ts</summary>

**Action**: Create new file `src/types/index.ts`

**Content to include**:
```typescript
// Re-export all types
export * from './weapons';
export * from './player';
export * from './game';
```

**Verification**: File exists and exports work
</details>

<details>
<summary>📋 Task 1.1.2: Create src/types/weapons.ts</summary>

**Action**: Create new file `src/types/weapons.ts`

**Content to copy from**: `BITBLAST/BitBlastGame/src/types/index.ts` (WeaponType enum, weapon interfaces)

**Key types needed**:
- `WeaponType` enum (AK47, AWP, LMG, M4, Pistol, Scar, Shotgun, Sniper, Tec9)
- `WeaponConfig` interface
- `RecoilConfig` interface
- `SpreadConfig` interface
- `MuzzleConfig` interface
- `ScreenEffectsConfig` interface
- `AnimationConfig` interface

**Verification**: Types compile without errors
</details>

<details>
<summary>📋 Task 1.1.3: Create src/types/player.ts</summary>

**Action**: Create new file `src/types/player.ts`

**Content to include**:
```typescript
export interface PlayerConfig {
  maxHealth: number;
  maxArmor: number;
  maxStamina: number;
  height: number;
  walkSpeed: number;
  sprintSpeed: number;
  jumpForce: number;
  gravity: number;
  groundAccel: number;
  airAccel: number;
  groundDecel: number;
  airDecel: number;
  jumpBuffer: number;
  coyoteTime: number;
  jumpCutMultiplier: number;
  stepHeight: number;
  staminaDrain: number;
  staminaRegen: number;
  slideSpeed: number;
  slideDuration: number;
  slideFriction: number;
  slideCooldown: number;
}

export interface CameraConfig {
  baseFOV: number;
  sprintFOV: number;
  jumpFOV: number;
  landFOV: number;
  fovLerpSpeed: number;
  bobFrequency: number;
  bobAmplitudeX: number;
  bobAmplitudeY: number;
  breathFrequency: number;
  breathAmplitude: number;
  jumpStretch: number;
  mouseSensitivity: number;
}
```

**Verification**: Types compile without errors
</details>

<details>
<summary>📋 Task 1.1.4: Create src/types/game.ts</summary>

**Action**: Create new file `src/types/game.ts`

**Content to include**:
```typescript
export interface GameState {
  running: boolean;
  paused: boolean;
  wave: number;
  score: number;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  timeStarted: number;
  waveInProgress: boolean;
  betweenWaves: boolean;
  inStartScreen: boolean;
}

export interface DamageInfo {
  amount: number;
  type: DamageType;
  sourcePosition?: THREE.Vector3;
  knockbackForce?: number;
  hitLocation?: 'head' | 'body';
  instigator?: any;
}

export enum DamageType {
  Bullet = 'bullet',
  Explosion = 'explosion',
  Melee = 'melee',
  Fall = 'fall',
  Zone = 'zone',
}
```

**Verification**: Types compile without errors
</details>

### 1.2 Create Configuration Files
- [ ] Create `src/config/gameConfig.ts` with player/camera/weapon configs
- [ ] Create `src/config/weaponConfigs.ts` with all weapon definitions
- [ ] Create `src/config/enemyTypes.ts` with enemy definitions

<details>
<summary>📋 Task 1.2.1: Create src/config/gameConfig.ts</summary>

**Action**: Create new file `src/config/gameConfig.ts`

**Source**: Copy `PLAYER_CONFIG` and `CAMERA_CONFIG` from `BITBLAST/BitBlastGame/src/config/gameConfig.ts`

**Content**:
```typescript
import { PlayerConfig, CameraConfig } from '../types';

export const PLAYER_CONFIG: PlayerConfig = {
  maxHealth: 100,
  maxArmor: 100,
  maxStamina: 100,
  height: 1.7,
  walkSpeed: 8,
  sprintSpeed: 13,
  jumpForce: 12,
  gravity: 35,
  groundAccel: 50,
  airAccel: 20,
  groundDecel: 30,
  airDecel: 5,
  jumpBuffer: 0.1,
  coyoteTime: 0.15,
  jumpCutMultiplier: 0.5,
  stepHeight: 0.5,
  staminaDrain: 20,
  staminaRegen: 30,
  slideSpeed: 18,
  slideDuration: 1.0,
  slideFriction: 2.5,
  slideCooldown: 1.0,
};

export const CAMERA_CONFIG: CameraConfig = {
  baseFOV: 75,
  sprintFOV: 85,
  jumpFOV: 78,
  landFOV: 70,
  fovLerpSpeed: 10,
  bobFrequency: 12,
  bobAmplitudeX: 0.015,
  bobAmplitudeY: 0.035,
  breathFrequency: 2,
  breathAmplitude: 0.005,
  jumpStretch: 0.2,
  mouseSensitivity: 0.002,
};
```

**Verification**: Config imports correctly in other files
</details>

<details>
<summary>📋 Task 1.2.2: Create src/config/weaponConfigs.ts</summary>

**Action**: Create new file `src/config/weaponConfigs.ts`

**Source**: Copy `WEAPON_CONFIG` object from `BITBLAST/BitBlastGame/src/config/gameConfig.ts`

**Important**: This is a large file (~400 lines). Copy the entire `WEAPON_CONFIG` object with all weapon definitions (AK47, AWP, LMG, M4, Pistol, Scar, Shotgun, Sniper, Tec9).

**Audio paths note**: Update audio paths to match your project structure or copy audio files from `BITBLAST/BitBlastGame/assets/audio/weapons/` to `public/audios/weapons/`.

**Verification**: All weapon configs accessible via `WEAPON_CONFIG[WeaponType.AK47]` etc.
</details>

<details>
<summary>📋 Task 1.2.3: Create src/config/enemyTypes.ts</summary>

**Action**: Create new file `src/config/enemyTypes.ts`

**Source**: Copy `ENEMY_TYPES` from `BITBLAST/BitBlastGame/src/config/gameConfig.ts`

**Content**:
```typescript
export interface EnemyType {
  health: number;
  speed: number;
  damage: number;
  fireRate: number;
  accuracy: number;
  color: number;
  score: number;
}

export const ENEMY_TYPES: Record<string, EnemyType> = {
  grunt: { health: 40, speed: 4, damage: 10, fireRate: 1, accuracy: 0.05, color: 0x00FFFF, score: 100 },
  shooter: { health: 60, speed: 5, damage: 15, fireRate: 2, accuracy: 0.02, color: 0x9D00FF, score: 200 },
  heavy: { health: 200, speed: 2, damage: 25, fireRate: 0.5, accuracy: 0.05, color: 0xFF0000, score: 300 },
  swarmer: { health: 30, speed: 9, damage: 15, fireRate: 0, accuracy: 1, color: 0xFF5500, score: 50 },
  viper: { health: 50, speed: 6, damage: 40, fireRate: 0.5, accuracy: 0.001, color: 0x00FF88, score: 250 },
  bulwark: { health: 300, speed: 1.5, damage: 20, fireRate: 1, accuracy: 0.1, color: 0x0066FF, score: 400 },
  spectre: { health: 40, speed: 7, damage: 25, fireRate: 0, accuracy: 1, color: 0x5555FF, score: 350 },
  razor: { health: 80, speed: 8, damage: 30, fireRate: 0, accuracy: 1, color: 0xFF00FF, score: 300 },
};
```

**Verification**: Enemy types accessible
</details>

### 1.3 Copy Required Assets
- [ ] Copy weapon audio files to `public/audios/weapons/`
- [ ] Copy player audio files to `public/audios/player/`
- [ ] Copy muzzle flash texture to `public/textures/`
- [ ] Update audio paths in weaponConfigs.ts to match new locations

<details>
<summary>📋 Task 1.3.1: Copy weapon audio files</summary>

**Action**: Copy audio files from BITBLAST

**Source directory**: `BITBLAST/BitBlastGame/assets/audio/weapons/`

**Target directory**: `public/audios/weapons/`

**Files to copy**: All `.mp3` files for weapon sounds (fire, reload, tail, etc.)

**Verification**: Audio files exist in target directory
</details>

<details>
<summary>📋 Task 1.3.2: Copy player audio files</summary>

**Action**: Copy audio files from BITBLAST

**Source directory**: `BITBLAST/BitBlastGame/assets/audio/player/`

**Target directory**: `public/audios/player/`

**Files to copy**: Footstep sounds, hurt sounds, jump, land, death, heartbeat

**Verification**: Audio files exist in target directory
</details>

<details>
<summary>📋 Task 1.3.3: Copy muzzle flash texture</summary>

**Action**: Copy muzzle texture

**Source**: `BITBLAST/BitBlastGame/assets/images/muzzle.png_19188667.png`

**Target**: `public/textures/muzzle.png`

**Verification**: Texture file exists
</details>

---

## Phase 2: New Weapon System

### 2.1 Create New Weapon System Core
- [ ] Create `src/systems/BitBlastWeaponSystem.ts` (new weapon system)
- [ ] Integrate weapon system with existing World class
- [ ] Test basic shooting functionality

<details>
<summary>📋 Task 2.1.1: Create BitBlastWeaponSystem.ts</summary>

**Action**: Create new file `src/systems/BitBlastWeaponSystem.ts`

**Source**: Port from `BITBLAST/BitBlastGame/src/systems/WeaponSystem.ts`

**Key modifications needed**:
1. Change class name to `BitBlastWeaponSystem` to avoid conflicts
2. Import types from your new type files
3. Import configs from your config files
4. Ensure THREE.js imports are correct
5. Create a ParticleSystem stub if not yet created

**Core functionality to include**:
- Constructor with camera, listener, particleSystem params
- `currentWeaponType`, `weapons` map
- `shoot()` method returning direction and shotFired
- `reload()` method
- `switchWeapon()` method
- `update()` method
- Muzzle flash creation and management
- Audio loading and playback
- Recoil system
- Spread/bloom system

**Size**: ~800 lines - copy entire file and modify imports

**Verification**: 
- File compiles without errors
- Can instantiate the class
</details>

<details>
<summary>📋 Task 2.1.2: Create ParticleSystem stub</summary>

**Action**: Create `src/systems/ParticleSystem.ts` (minimal version for now)

**Content**:
```typescript
import * as THREE from 'three';

export class ParticleSystem {
  private scene: THREE.Scene;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }
  
  spawn(position: THREE.Vector3, color: number, count: number): void {
    // Stub - will be implemented in Phase 3
    console.log('ParticleSystem.spawn called', position, color, count);
  }
  
  spawnMuzzleSmoke(position: THREE.Vector3, direction: THREE.Vector3): void {
    // Stub
  }
  
  spawnShellCasing(position: THREE.Vector3, direction: THREE.Vector3, onHit?: (pos: THREE.Vector3) => void): void {
    // Stub
  }
  
  spawnImpactEffect(position: THREE.Vector3, killed: boolean): void {
    // Stub
  }
  
  spawnMaterialImpact(position: THREE.Vector3, normal: THREE.Vector3, material: string): void {
    // Stub
  }
  
  update(delta: number): void {
    // Stub
  }
  
  clear(): void {
    // Stub
  }
}
```

**Verification**: ParticleSystem can be instantiated
</details>

<details>
<summary>📋 Task 2.1.3: Integrate weapon system with World</summary>

**Action**: Modify `src/core/World.ts` to use new weapon system

**Steps**:
1. Import `BitBlastWeaponSystem` and `ParticleSystem`
2. Add properties:
   ```typescript
   public bitblastWeaponSystem!: BitBlastWeaponSystem;
   public particleSystem!: ParticleSystem;
   ```
3. In `_initPlayer()` or new method `_initWeapons()`:
   ```typescript
   this.particleSystem = new ParticleSystem(this.scene);
   this.bitblastWeaponSystem = new BitBlastWeaponSystem(
     this.camera,
     this.assetManager.listener,
     this.particleSystem
   );
   ```
4. Call `bitblastWeaponSystem.update(delta)` in animate loop

**Verification**: No errors on startup, weapon model visible
</details>

### 2.2 Weapon Model Generation
- [ ] Verify procedural weapon models render correctly
- [ ] Test weapon switching between all 9 weapon types
- [ ] Verify muzzle flash positioning for each weapon

<details>
<summary>📋 Task 2.2.1: Test weapon rendering</summary>

**Action**: Test that weapon models appear correctly

**Test procedure**:
1. Start the game
2. Verify a weapon model is visible in first-person view
3. Check weapon position (should be lower-right of screen)
4. Verify weapon materials look correct

**If issues**:
- Check `weaponGroup.position` values in `createWeaponModel()`
- Verify camera has weapon group added as child
- Check material settings

**Verification**: Weapon visible in game
</details>

<details>
<summary>📋 Task 2.2.2: Test weapon switching</summary>

**Action**: Implement and test weapon switching

**Steps**:
1. Add key bindings for weapon switching (1-9 keys, scroll wheel)
2. Call `bitblastWeaponSystem.switchWeapon(index)` on key press
3. Test each weapon type renders correctly

**Verification**: All 9 weapons can be selected and display correctly
</details>

### 2.3 Shooting Mechanics
- [ ] Implement shoot raycasting
- [ ] Implement damage calculation with falloff
- [ ] Implement hit detection on enemies
- [ ] Implement hit detection on environment

<details>
<summary>📋 Task 2.3.1: Implement shooting</summary>

**Action**: Connect weapon system shooting to game logic

**Location**: Create new method in World or create game controller class

**Implementation**:
```typescript
handleShooting(): void {
  const result = this.bitblastWeaponSystem.shoot(
    this.camera,
    this.player.onGround ?? true,
    this.player.isSprinting ?? false,
    new THREE.Vector3() // player velocity
  );
  
  if (result.shotFired) {
    // Handle raycast for hit detection
    const raycaster = new THREE.Raycaster(
      this.camera.position.clone(),
      result.direction
    );
    
    // Check enemy hits
    // Check environment hits
    // Apply damage
    // Spawn effects
  }
}
```

**Verification**: Shooting produces visual feedback
</details>

### 2.4 Recoil & Spread
- [ ] Verify recoil applies to camera
- [ ] Verify spray pattern works for automatic weapons
- [ ] Verify bloom increases while firing
- [ ] Verify bloom recovers over time

<details>
<summary>📋 Task 2.4.1: Test recoil system</summary>

**Action**: Verify recoil mechanics work

**Test procedure**:
1. Fire weapon
2. Camera should kick upward (recoilPitch)
3. Camera should have slight horizontal deviation (recoilYaw)
4. Recoil should recover when not firing

**Verification**: Firing feels impactful, recoil recovers
</details>

---

## Phase 3: Visual Effects Systems

### 3.1 Particle System (Full Implementation)
- [ ] Implement full ParticleSystem with pooling
- [ ] Add muzzle smoke particles
- [ ] Add shell casing particles
- [ ] Add impact particles (blood, sparks, debris)
- [ ] Add explosion particles

<details>
<summary>📋 Task 3.1.1: Full ParticleSystem implementation</summary>

**Action**: Replace stub with full implementation

**Source**: `BITBLAST/BitBlastGame/src/systems/ParticleSystem.ts`

**Key features to implement**:
- Particle pooling for performance
- Different particle types (smoke, sparks, blood, debris)
- Gravity/physics for particles
- Fade out over lifetime
- Material-based particle colors

**Verification**: Particles spawn when shooting, fade correctly
</details>

### 3.2 Impact System
- [ ] Create `src/systems/ImpactSystem.ts`
- [ ] Implement surface impact sounds (metal, concrete, wood, flesh)
- [ ] Implement body impact feedback
- [ ] Implement bullet whiz sounds

<details>
<summary>📋 Task 3.2.1: Create ImpactSystem</summary>

**Action**: Create new file `src/systems/ImpactSystem.ts`

**Source**: `BITBLAST/BitBlastGame/src/systems/ImpactSystem.ts`

**Features**:
- Audio loader for impact sounds
- `playSurfaceImpact(position, material)` - plays material-specific sound
- `playBodyImpact(position)` - plays flesh hit sound
- `playHitConfirmation()` - plays hitmarker sound
- `playBulletWhiz(position)` - plays near-miss sound
- `playShellDrop(position)` - plays shell casing landing sound

**Audio files needed**: Copy from `BITBLAST/BitBlastGame/assets/audio/impacts/`

**Verification**: Different surfaces make different sounds when shot
</details>

### 3.3 Decal System
- [ ] Create `src/systems/DecalSystem.ts`
- [ ] Implement bullet hole decals
- [ ] Implement material-specific decals
- [ ] Implement decal fade/cleanup

<details>
<summary>📋 Task 3.3.1: Create DecalSystem</summary>

**Action**: Create new file `src/systems/DecalSystem.ts`

**Source**: `BITBLAST/BitBlastGame/src/systems/DecalSystem.ts`

**Features**:
- `createBulletHole(position, normal, material)` - spawns decal
- Maximum decal limit with oldest removal
- Different textures for different materials
- Fade out over time

**Verification**: Bullet holes appear on surfaces when shot
</details>

### 3.4 Bullet Tracer System
- [ ] Create `src/systems/BulletTracerSystem.ts`
- [ ] Implement tracer line rendering
- [ ] Implement weapon-specific tracer colors
- [ ] Implement tracer fade

<details>
<summary>📋 Task 3.4.1: Create BulletTracerSystem</summary>

**Action**: Create new file `src/systems/BulletTracerSystem.ts`

**Source**: `BITBLAST/BitBlastGame/src/systems/BulletTracerSystem.ts`

**Features**:
- `createTracer(start, end, color, useFireTexture)` - creates tracer line
- `createMultipleTracers(start, ends[], color, useFireTexture)` - for shotgun
- Tracer pooling
- Fade over lifetime
- Additive blending for glow effect

**Verification**: Visible tracer lines when shooting
</details>

### 3.5 Post-Processing Effects
- [ ] Create `src/systems/PostProcessing.ts`
- [ ] Implement chromatic aberration
- [ ] Implement screen shake
- [ ] Integrate with weapon system effects

<details>
<summary>📋 Task 3.5.1: Create PostProcessing</summary>

**Action**: Create new file `src/systems/PostProcessing.ts`

**Source**: `BITBLAST/BitBlastGame/src/core/PostProcessing.ts`

**Features**:
- EffectComposer setup
- Chromatic aberration shader
- `setChromaAmount(intensity)` method
- `render()` method to replace direct renderer.render()

**Verification**: Screen effects visible when firing
</details>

---

## Phase 4: HUD System

### 4.1 HUD HTML Structure
- [ ] Add HUD elements to `public/index.html` or `index.html`
- [ ] Add HUD CSS styles
- [ ] Verify HUD elements exist in DOM

<details>
<summary>📋 Task 4.1.1: Add HUD HTML</summary>

**Action**: Add HUD HTML elements

**Location**: `public/index.html` or main HTML file

**Elements to add** (inside body, after game container):
```html
<div id="hud">
  <!-- Health/Armor/Stamina -->
  <div id="health-wrapper">
    <div id="health-bar-mask"></div>
    <span id="health-text-value">100</span>
  </div>
  <div id="armor-wrapper">
    <div id="armor-bar-mask"></div>
    <span id="armor-text-value">0</span>
  </div>
  <div id="stamina-wrapper">
    <div id="stamina-bar-mask"></div>
    <span id="stamina-text-value">100</span>
  </div>
  
  <!-- Weapon Info -->
  <div id="weapon-info">
    <span id="weapon-name">AK-47</span>
    <span id="ammo-display">30 / 90</span>
  </div>
  
  <!-- Crosshair -->
  <div id="crosshair">
    <div id="cross-top" class="cross-line"></div>
    <div id="cross-bottom" class="cross-line"></div>
    <div id="cross-left" class="cross-line"></div>
    <div id="cross-right" class="cross-line"></div>
  </div>
  
  <!-- Hitmarker -->
  <div id="hitmarker"></div>
  
  <!-- Damage Overlay -->
  <div id="damage-overlay"></div>
  
  <!-- Vignettes -->
  <div id="vignette-impact-flash"></div>
  <div id="vignette-damage-pulse"></div>
  <div id="vignette-critical"></div>
  
  <!-- Killfeed -->
  <div id="killfeed"></div>
  
  <!-- Score/Wave -->
  <div id="wave-display"></div>
  <div id="score-display">0</div>
  
  <!-- Reload Indicator -->
  <div id="reload-indicator">RELOADING...</div>
  
  <!-- Kill/Headshot Icons -->
  <div id="kill-icon"></div>
  <div id="headshot-icon"></div>
  
  <!-- Multi-kill/Streak -->
  <div id="multikill-display"></div>
  <div id="streak-display"></div>
  
  <!-- Sniper Scope -->
  <div id="sniper-scope"></div>
  
  <!-- Pause Menu -->
  <div id="pause-menu">
    <h1>PAUSED</h1>
    <button id="resume-btn">RESUME</button>
    <button id="settings-btn">SETTINGS</button>
    <button id="quit-btn">QUIT</button>
  </div>
  
  <!-- Game Over -->
  <div id="game-over">
    <h1>GAME OVER</h1>
    <div id="final-stats"></div>
    <button id="restart-btn">RESTART</button>
  </div>
</div>
```

**Verification**: Elements visible in browser dev tools
</details>

<details>
<summary>📋 Task 4.1.2: Add HUD CSS</summary>

**Action**: Create HUD styles

**Location**: `public/style/hud.css` or add to existing CSS

**Source reference**: `BITBLAST/BitBlastGame/src/styles.css`

**Key styles needed**:
- Health/armor/stamina bars (horizontal bars with fill)
- Crosshair positioning (centered, dynamic gap)
- Hitmarker (centered X, fades in/out)
- Damage overlay (full screen, red tint)
- Vignette effects (radial gradients)
- Killfeed (top-right, stacked entries)
- Weapon info (bottom-right)
- Animations (pulse, shake, fade)

**Verification**: HUD elements styled correctly
</details>

### 4.2 HUD Manager Implementation
- [ ] Create `src/ui/HUDManager.ts`
- [ ] Implement health/armor/stamina updates
- [ ] Implement ammo display
- [ ] Implement crosshair dynamics
- [ ] Implement damage feedback

<details>
<summary>📋 Task 4.2.1: Create HUDManager</summary>

**Action**: Create new file `src/ui/HUDManager.ts`

**Source**: `BITBLAST/BitBlastGame/src/ui/HUDManager.ts`

**Key methods**:
- `updateHealth(health, maxHealth)`
- `updateArmor(armor, maxArmor)`
- `updateStamina(stamina, maxStamina)`
- `updateAmmo(current, reserve)`
- `updateWeaponName(name)`
- `updateCrosshair(spread, isMoving, isSprinting, isAirborne)`
- `showHitmarker(isKill)`
- `flashDamage(directionAngle?)`
- `showDamageVignette(damageAmount, maxHealth, directionAngle?)`
- `showReloading(isReloading)`
- `showKillIcon()` / `showHeadshotIcon()`
- `showMultiKill(count)`
- `showMessage(message, duration)`
- `showGameOver(stats)`
- `toggleScope(show)`

**Verification**: HUD updates when game state changes
</details>

### 4.3 Killfeed System
- [ ] Create `src/ui/KillfeedManager.ts`
- [ ] Implement kill entry creation
- [ ] Implement entry animation and removal

<details>
<summary>📋 Task 4.3.1: Create KillfeedManager</summary>

**Action**: Create new file `src/ui/KillfeedManager.ts`

**Source**: `BITBLAST/BitBlastGame/src/ui/KillfeedManager.ts`

**Features**:
- `addKill(killer, victim, weapon, isHeadshot, isMultiKill)`
- Entry creation with icons
- Auto-fade after duration
- Maximum entries limit

**Verification**: Kill entries appear when enemies die
</details>

### 4.4 Damage Text System
- [ ] Create `src/ui/DamageTextSystem.ts`
- [ ] Implement floating damage numbers
- [ ] Implement 3D to 2D projection

<details>
<summary>📋 Task 4.4.1: Create DamageTextSystem</summary>

**Action**: Create new file `src/ui/DamageTextSystem.ts`

**Source**: `BITBLAST/BitBlastGame/src/ui/DamageTextSystem.ts`

**Features**:
- `spawn(worldPosition, damage, isHeadshot)`
- 3D position to screen position conversion
- Float upward animation
- Fade out
- Different colors for headshots

**Verification**: Damage numbers appear when hitting enemies
</details>

---

## Phase 5: Enhanced Player Controller

### 5.1 Player Movement Enhancement
- [ ] Add stamina system to Player
- [ ] Add sliding mechanics
- [ ] Add coyote time and jump buffering
- [ ] Add fall damage

<details>
<summary>📋 Task 5.1.1: Enhance Player movement</summary>

**Action**: Modify `src/entities/Player.ts`

**Properties to add**:
```typescript
public stamina: number;
public maxStamina: number;
public isSliding: boolean;
public slideTimer: number;
public slideCooldownTimer: number;
public slideDirection: Vector3;
public coyoteTimer: number;
public jumpBufferTimer: number;
public canCutJump: boolean;
```

**Methods to add/modify**:
- Update `update()` to handle stamina drain/regen
- Add slide initiation check (crouch while sprinting)
- Add slide physics (locked direction, friction)
- Add coyote time logic
- Add jump buffer logic
- Add fall damage calculation

**Source reference**: `BITBLAST/BitBlastGame/src/entities/Player.ts` update() method

**Verification**: Sliding works, stamina depletes when sprinting
</details>

### 5.2 Player Audio
- [ ] Add footstep sounds
- [ ] Add jump/land sounds
- [ ] Add hurt sounds
- [ ] Add death sound
- [ ] Add heartbeat at low health

<details>
<summary>📋 Task 5.2.1: Add player audio</summary>

**Action**: Add audio to Player class

**Audio files needed** (from BITBLAST):
- Footsteps: `Concrete-Run-1.mp3` through `Concrete-Run-6.mp3`
- Jump: `Jump.mp3`
- Land: `Land-1.mp3`
- Hurt: `Echo-Grunt-1.mp3`, `Echo-Grunt-2.mp3`, `Echo-Grunt-3.mp3`
- Death: `Echo-Death-1.mp3`
- Heartbeat: `Heart-Beat.mp3`

**Implementation**:
- Load all audio files on player init
- Play footsteps at interval while moving on ground
- Play jump sound on jump
- Play land sound on landing (based on fall speed)
- Play random hurt sound on damage
- Start heartbeat loop when health < 50%

**Verification**: Footsteps play while walking, heartbeat at low health
</details>

### 5.3 Camera Enhancements
- [ ] Implement FOV changes (sprint, jump, land)
- [ ] Implement head bobbing
- [ ] Implement breathing idle animation
- [ ] Apply weapon recoil to camera

<details>
<summary>📋 Task 5.3.1: Enhance camera</summary>

**Action**: Modify camera update logic

**Location**: FirstPersonControls or World animate loop

**Features**:
- FOV lerp based on state (sprint → higher, land → lower temporarily)
- Head bob based on movement speed
- Breathing motion when idle
- Apply `weaponSystem.recoilPitch` and `weaponSystem.recoilYaw` to camera rotation
- Apply `weaponSystem.cameraShake` to camera position

**Verification**: Camera feels more dynamic during movement and shooting
</details>

---

## Phase 6: Multiplayer Foundation

### 6.1 Network Manager (Client)
- [ ] Create `src/managers/NetworkManager.ts`
- [ ] Implement Socket.IO connection
- [ ] Implement player state sync (send/receive)
- [ ] Implement shooting events
- [ ] Implement damage events

<details>
<summary>📋 Task 6.1.1: Create NetworkManager</summary>

**Action**: Create new file `src/managers/NetworkManager.ts`

**Source**: `BITBLAST/BitBlastGame/src/managers/NetworkManager.ts`

**Dependencies**: Add `socket.io-client` to package.json
```bash
npm install socket.io-client
```

**Key features**:
- `connect(token, matchId)` - establish connection
- `sendPlayerUpdate(player, camera)` - send position/rotation at interval
- `sendShoot(origin, direction, weaponType)` - notify of shot
- `sendPlayerHit(targetId, damage, hitLocation)` - report hit
- `sendPlayerDied(attackerId, weaponType)` - report death
- Event handlers for receiving other players' updates

**Verification**: Can connect to server (once backend is set up)
</details>

### 6.2 Remote Player Rendering
- [ ] Create `src/entities/RemotePlayer.ts`
- [ ] Implement position interpolation
- [ ] Implement rotation smoothing
- [ ] Implement team colors

<details>
<summary>📋 Task 6.2.1: Create RemotePlayer</summary>

**Action**: Create new file `src/entities/RemotePlayer.ts`

**Source**: `BITBLAST/BitBlastGame/src/entities/RemotePlayer.ts`

**Features**:
- Mesh creation (capsule or character model)
- `updateState(position, rotation, isSprinting, isGrounded)` - update target state
- `update(delta)` - interpolate toward target
- `setTeam(team)` - change color based on team
- `destroy()` - cleanup

**Verification**: Remote player capsules appear and move smoothly
</details>

### 6.3 Backend Setup
- [ ] Copy backend files to `server/` directory
- [ ] Install backend dependencies
- [ ] Set up Prisma database
- [ ] Test server startup

<details>
<summary>📋 Task 6.3.1: Set up backend</summary>

**Action**: Copy and configure backend

**Steps**:
1. Create `server/` directory in project root
2. Copy contents of `BITBLAST/BitBlastBackend/src/` to `server/src/`
3. Copy `BITBLAST/BitBlastBackend/package.json` to `server/package.json`
4. Copy `BITBLAST/BitBlastBackend/prisma/` to `server/prisma/`
5. Copy `BITBLAST/BitBlastBackend/tsconfig.json` to `server/tsconfig.json`

**Install dependencies**:
```bash
cd server
npm install
```

**Set up database**:
```bash
npx prisma generate
npx prisma db push  # or migrate dev
```

**Start server**:
```bash
npm run dev  # or tsx src/server.ts
```

**Verification**: Server starts without errors, Socket.IO listening
</details>

### 6.4 Backend Connector
- [ ] Create `src/managers/BackendConnector.ts`
- [ ] Implement loadout fetching
- [ ] Implement stats syncing

<details>
<summary>📋 Task 6.4.1: Create BackendConnector</summary>

**Action**: Create new file `src/managers/BackendConnector.ts`

**Source**: `BITBLAST/BitBlastGame/src/managers/BackendConnector.ts`

**Features**:
- `setToken(token)` - store auth token
- `getLoadout()` - fetch player's weapon loadout
- `syncStats(stats)` - send game stats to backend

**Verification**: Can fetch loadout when authenticated
</details>

---

## Phase 7: Game Modes

### 7.1 Game Mode Infrastructure
- [ ] Create `src/managers/GameModeManager.ts`
- [ ] Create `src/managers/gamemodes/IGameMode.ts` interface
- [ ] Create `src/managers/gamemodes/BaseGameMode.ts`

<details>
<summary>📋 Task 7.1.1: Create GameModeManager</summary>

**Action**: Create game mode infrastructure

**Source**: `BITBLAST/BitBlastGame/src/managers/GameModeManager.ts`

**Files to create**:
1. `src/managers/gamemodes/IGameMode.ts` - interface
2. `src/managers/gamemodes/BaseGameMode.ts` - base class
3. `src/managers/GameModeManager.ts` - mode switcher

**GameModeManager methods**:
- `setMode(modeType)` - switch to game mode
- `getCurrentMode()` - get active mode
- `update(delta)` - update active mode

**Verification**: Can set and get game modes
</details>

### 7.2 Single Player Wave Mode
- [ ] Create `src/managers/gamemodes/SinglePlayerWaveMode.ts`
- [ ] Implement wave spawning
- [ ] Implement wave completion
- [ ] Implement difficulty scaling

<details>
<summary>📋 Task 7.2.1: Create SinglePlayerWaveMode</summary>

**Action**: Create wave-based game mode

**Source**: `BITBLAST/BitBlastGame/src/managers/gamemodes/SinglePlayerWaveMode.ts`

**Features**:
- Wave counter
- Enemy spawning per wave
- Wave completion detection
- Score tracking
- Difficulty increase per wave (more enemies, harder types)

**Verification**: Waves progress, enemies spawn in increasing difficulty
</details>

### 7.3 Multiplayer Deathmatch Mode
- [ ] Create `src/managers/gamemodes/MultiplayerDeathmatchMode.ts`
- [ ] Implement spawn points
- [ ] Implement kill tracking
- [ ] Implement respawning

<details>
<summary>📋 Task 7.3.1: Create MultiplayerDeathmatchMode</summary>

**Action**: Create FFA deathmatch mode

**Source**: `BITBLAST/BitBlastGame/src/managers/gamemodes/MultiplayerDeathmatchMode.ts`

**Features**:
- Random spawn point selection
- Kill/death tracking
- Respawn timer
- Score limit for win condition

**Verification**: Players can respawn, scores track correctly
</details>

### 7.4 Additional Modes (Optional)
- [ ] Create TeamDeathmatchMode
- [ ] Create CaptureTheFlagMode
- [ ] Create BattleRoyaleMode with ZoneSystem

---

## Phase 8: Social/Lobby Integration

### 8.1 Lobby Setup
- [ ] Configure BitBlastSocial as separate route or subdirectory
- [ ] Set up build process for lobby app
- [ ] Configure routing between lobby and game

<details>
<summary>📋 Task 8.1.1: Set up lobby</summary>

**Action**: Configure social/lobby app

**Option A - Separate directory**:
1. Keep `BITBLAST/BitBlastSocial/` as is
2. Build it: `cd BITBLAST/BitBlastSocial && npm install && npm run build`
3. Serve built files from `/social/` route on backend
4. Link to game with query params: `/game/?token=xxx&mode=tdm`

**Option B - Monorepo**:
1. Move `BITBLAST/BitBlastSocial/` to `social/`
2. Configure workspace in root package.json
3. Build both apps together

**Verification**: Can navigate from lobby to game
</details>

### 8.2 Matchmaking Integration
- [ ] Verify matchmaking flow works
- [ ] Implement match found redirect to game
- [ ] Pass authentication token to game

<details>
<summary>📋 Task 8.2.1: Matchmaking flow</summary>

**Action**: Verify and test matchmaking

**Flow**:
1. User clicks "Play" in lobby
2. Frontend calls matchmaking endpoint
3. Socket.IO emits "match found" with matchId
4. Redirect to game URL with token and matchId

**Verification**: Full flow from queue to game works
</details>

---

## Phase 9: Testing & Polish

### 9.1 Integration Testing
- [ ] Test single player wave mode end-to-end
- [ ] Test all weapons fire correctly
- [ ] Test HUD updates properly
- [ ] Test audio plays correctly
- [ ] Test multiplayer with 2+ clients

### 9.2 Performance Testing
- [ ] Profile particle system
- [ ] Profile network updates
- [ ] Optimize if needed

### 9.3 Bug Fixes
- [ ] Document any bugs found
- [ ] Fix critical bugs
- [ ] Fix minor bugs

---

## Appendix A: Troubleshooting

### Common Issues

**Issue**: Weapon not visible
- Check camera has weapon group as child
- Check weapon position values
- Verify materials are correct

**Issue**: Audio not playing
- Check audio file paths
- Verify AudioListener is added to camera
- Check browser autoplay policy (need user interaction)

**Issue**: TypeScript errors on import
- Ensure all type files are created
- Check import paths use correct extensions
- Verify tsconfig includes new directories

**Issue**: Socket connection fails
- Check server is running
- Verify port matches
- Check CORS settings on server

---

## Appendix B: File Checklist

### New Files to Create
```
src/
├── types/
│   ├── index.ts          [ ]
│   ├── weapons.ts        [ ]
│   ├── player.ts         [ ]
│   └── game.ts           [ ]
├── config/
│   ├── gameConfig.ts     [ ]
│   ├── weaponConfigs.ts  [ ]
│   └── enemyTypes.ts     [ ]
├── systems/
│   ├── BitBlastWeaponSystem.ts    [ ]
│   ├── ParticleSystem.ts      [ ]
│   ├── ImpactSystem.ts        [ ]
│   ├── DecalSystem.ts         [ ]
│   ├── BulletTracerSystem.ts  [ ]
│   └── PostProcessing.ts      [ ]
├── ui/
│   ├── HUDManager.ts          [ ]
│   ├── KillfeedManager.ts     [ ]
│   └── DamageTextSystem.ts    [ ]
├── managers/
│   ├── NetworkManager.ts      [ ]
│   ├── BackendConnector.ts    [ ]
│   ├── SettingsManager.ts     [ ]
│   ├── GameModeManager.ts     [ ]
│   └── gamemodes/
│       ├── IGameMode.ts              [ ]
│       ├── BaseGameMode.ts           [ ]
│       ├── SinglePlayerWaveMode.ts   [ ]
│       └── MultiplayerDeathmatchMode.ts  [ ]
└── entities/
    └── RemotePlayer.ts        [ ]
```

### Files to Modify
```
src/
├── core/
│   └── World.ts          [ ] - Add weapon system, HUD, etc.
├── entities/
│   └── Player.ts         [ ] - Add stamina, sliding, audio
├── controls/
│   └── FirstPersonControls.ts  [ ] - Add camera enhancements
```

### Assets to Copy
```
public/
├── audios/
│   ├── weapons/          [ ] - Copy from BITBLAST
│   └── player/           [ ] - Copy from BITBLAST
├── textures/
│   └── muzzle.png        [ ] - Copy from BITBLAST
└── style/
    └── hud.css           [ ] - New file
```

---

## Appendix C: Quick Commands

```bash
# Install socket.io client
npm install socket.io-client

# Start backend server
cd server && npm run dev

# Start frontend dev server
npm run dev

# Build frontend
npm run build

# Build backend
cd server && npm run build
```

---

*End of Integration Guide*
