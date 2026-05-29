import * as THREE from 'three';
import { WEAPON_CONFIG } from '../config/weaponConfigs';
import { SingleWeaponConfig, WeaponType } from '../types/weapons';
import { AssetManager } from '../core/AssetManager';
import { AudioManager } from '../managers/AudioManager';

interface WeaponState {
  currentMag: number;
  reserveAmmo: number;
  lastShotTime: number;
  isReloading: boolean;
  reloadStartTime: number;
}

export class PlayerWeaponSystem {
  private camera: THREE.Camera;
  private audioManager: AudioManager;
  private assetManager: AssetManager;
  public weaponMesh!: THREE.Object3D;

  // Muzzle flash effects (persistent)
  private muzzleFlash!: THREE.Sprite;
  private muzzleFlash2!: THREE.Sprite;
  private muzzleFlash3!: THREE.Sprite; // Additional flash layer for depth
  private muzzleLight!: THREE.PointLight;
  private muzzleFlashTimer: number = 0; // Timer for how long flash is visible
  private muzzleFlashDuration: number = 0.05;

  // Weapon fill light - follows camera for consistent weapon visibility
  private weaponFillLight!: THREE.PointLight;

  // Smoke particle system
  private smokeParticles: THREE.Sprite[] = [];
  private smokeTexture!: THREE.Texture;
  private readonly MAX_SMOKE_PARTICLES = 12;
  private readonly SMOKE_SPRITE_COLS = 4; // Spritesheet columns
  private readonly SMOKE_SPRITE_ROWS = 4; // Spritesheet rows

  // State
  public currentWeapon: WeaponType = WeaponType.AK47;
  private weaponStates: Map<WeaponType, WeaponState> = new Map();
  public isZoomed: boolean = false;

  // Spread (camera recoil is owned by ScreenEffects/World, not here)
  private currentSpread: number = 0;

  // Weapon Animation
  private weaponSwayX: number = 0;
  private weaponSwayY: number = 0;
  private weaponKickZ: number = 0;
  private weaponKickRotX: number = 0;
  private sprintBlend: number = 0;
  private reloadBlend: number = 0;
  private zoomBlend: number = 0; // 0 = hip fire, 1 = fully zoomed

  // Weapon model (placeholder position for now)
  // private weaponOffset: THREE.Vector3 = new THREE.Vector3(0.2, -0.2, -0.5);

  // Callbacks
  private shellEjectCallback?: (pos: THREE.Vector3, dir: THREE.Vector3) => void;
  private zoomCallback?: (isZoomed: boolean) => void;

  // Third-person mode for AI enemies
  private isThirdPerson: boolean = false;
  private thirdPersonParent: THREE.Object3D | null = null;

  constructor(_scene: THREE.Scene, camera: THREE.Camera, assetManager: AssetManager, audioManager: AudioManager) {
    this.camera = camera;
    this.audioManager = audioManager;
    this.assetManager = assetManager;

    this.initializeWeaponStates();
    this.loadAllAudio();

    // Initialize muzzle flash effects
    this.initializeMuzzleFlash();

    // Initialize weapon model
    this.resetWeaponState();
  }

  public setShellEjectCallback(callback: (pos: THREE.Vector3, dir: THREE.Vector3) => void): void {
    this.shellEjectCallback = callback;
  }



  public setZoomCallback(callback: (isZoomed: boolean) => void): void {
    this.zoomCallback = callback;
  }

  /**
   * Set zoom/ADS state - only works for sniper weapons (AWP, Sniper)
   * @param zoomed Whether to zoom in or out
   * @returns True if zoom state changed, false otherwise
   */
  public setZoom(zoomed: boolean): boolean {
    // Only allow zoom for sniper-type weapons
    if (this.currentWeapon !== WeaponType.Sniper && this.currentWeapon !== WeaponType.AWP) {
      return false;
    }

    if (this.isZoomed === zoomed) return false;

    this.isZoomed = zoomed;

    // Don't instantly hide - let the animation blend handle visibility
    // The weapon will smoothly lower and fade out during zoom transition

    // Notify callback (for HUD scope overlay and FOV)
    if (this.zoomCallback) {
      this.zoomCallback(zoomed);
    }

    return true;
  }

  /**
   * Configure weapon system for third-person view (for AI enemies)
   * @param parent The object to attach the weapon to (e.g., hand bone)
   */
  public setThirdPersonMode(parent: THREE.Object3D): void {
    this.isThirdPerson = true;
    this.thirdPersonParent = parent;

    // Re-attach current weapon to new parent with third-person positioning
    if (this.weaponMesh) {
      if (this.weaponMesh.parent) {
        this.weaponMesh.parent.remove(this.weaponMesh);
      }

      // Apply third-person transforms
      // CRITICAL: Enemy models are scaled to 0.02, compensate by 50x, then 3.2x larger (80% of 4x)
      const modelScaleCompensation = 160;

      // For OBJ models, we need to recalculate scale based on the weapon config
      if (this.weaponMesh.userData.isOBJModel) {
        // Get the base scale based on weapon type and apply third-person multiplier
        let baseScale = 6.4; // Default scale

        // Map weapon types to their scales
        switch (this.currentWeapon) {
          case WeaponType.Pistol:
          case WeaponType.Scar:
          case WeaponType.Tec9:
            baseScale = 5.2;
            break;
          case WeaponType.Sniper:
          case WeaponType.AWP:
          case WeaponType.LMG:
            baseScale = 6.8;
            break;
          default:
            baseScale = 6.4;
        }

        const tpScale = baseScale * 0.6 * modelScaleCompensation;
        this.weaponMesh.scale.set(tpScale, tpScale, tpScale);
        // Rotation: X=-83°, Y=-2°, Z=-105° (from visual editor)
        this.weaponMesh.rotation.set(-0.463 * Math.PI, -0.009 * Math.PI, -0.584 * Math.PI);
        // Position adjusted via visual editor
        this.weaponMesh.position.set(5.3, 16.0, 5.3);
      } else {
        // Procedural models - use fixed third-person transform with scale compensation
        const tpScale = 0.7 * modelScaleCompensation;
        this.weaponMesh.scale.set(tpScale, tpScale, tpScale);
        this.weaponMesh.position.set(0, 0, 0);
        this.weaponMesh.rotation.set(0, Math.PI, 0);
      }

      // Ensure weapon is visible and not frustum culled
      this.weaponMesh.visible = true;
      this.weaponMesh.frustumCulled = false;
      this.weaponMesh.traverse((child) => {
        child.visible = true;
        child.frustumCulled = false;
      });

      parent.add(this.weaponMesh);
    }
  }

  private initializeWeaponStates(): void {
    (Object.values(WEAPON_CONFIG) as SingleWeaponConfig[]).forEach((config) => {
      // Find the key for this config
      const type = Object.keys(WEAPON_CONFIG).find(key => WEAPON_CONFIG[key as WeaponType] === config) as WeaponType;

      if (type) {
        this.weaponStates.set(type, {
          currentMag: config.magSize,
          reserveAmmo: config.reserveAmmo,
          lastShotTime: 0,
          isReloading: false,
          reloadStartTime: 0
        });
      }
    });
  }

  private initializeMuzzleFlash(): void {
    const initialConfig = WEAPON_CONFIG[this.currentWeapon];
    const initialPos = initialConfig.muzzle.position;

    // Try to get pre-loaded textures from AssetManager, fallback to loading directly
    const textureLoader = new THREE.TextureLoader();
    const muzzleTexture = this.assetManager?.textures?.get('muzzle') ||
      textureLoader.load('/assets/images/misc/muzzle.png_19188667.png');

    this.smokeTexture = this.assetManager?.textures?.get('smoke') ||
      textureLoader.load('/assets/images/misc/smoke.png_96f15dd1.png');
    this.smokeTexture.wrapS = THREE.RepeatWrapping;
    this.smokeTexture.wrapT = THREE.RepeatWrapping;

    // Primary muzzle flash - bright white/yellow core using muzzle.png - INTENSE
    const spriteMat = new THREE.SpriteMaterial({
      map: muzzleTexture,
      color: 0xffffff, // Pure white for maximum intensity
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      rotation: Math.PI, // Flip 180 degrees so it faces away from player
    });
    this.muzzleFlash = new THREE.Sprite(spriteMat);
    this.muzzleFlash.scale.set(0.25, 0.25, 0.25);
    this.muzzleFlash.position.set(initialPos.x, initialPos.y, initialPos.z);
    this.muzzleFlash.visible = false; // Start hidden, show on fire
    this.muzzleFlash.renderOrder = 999;
    this.muzzleFlash.frustumCulled = false;

    // Secondary muzzle flash - bright orange outer glow using muzzle.png
    const spriteMat2 = new THREE.SpriteMaterial({
      map: muzzleTexture,
      color: 0xffcc55, // Brighter orange
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      rotation: Math.PI,
    });
    this.muzzleFlash2 = new THREE.Sprite(spriteMat2);
    this.muzzleFlash2.scale.set(0.35, 0.35, 0.35);
    this.muzzleFlash2.position.set(initialPos.x, initialPos.y, initialPos.z - 0.01);
    this.muzzleFlash2.visible = false;
    this.muzzleFlash2.renderOrder = 998;
    this.muzzleFlash2.frustumCulled = false;

    // Tertiary muzzle flash - red/orange background bloom using muzzle.png
    const spriteMat3 = new THREE.SpriteMaterial({
      map: muzzleTexture,
      color: 0xff6622,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      rotation: Math.PI,
    });
    this.muzzleFlash3 = new THREE.Sprite(spriteMat3);
    this.muzzleFlash3.scale.set(0.45, 0.45, 0.45);
    this.muzzleFlash3.position.set(initialPos.x, initialPos.y, initialPos.z - 0.02);
    this.muzzleFlash3.visible = false;
    this.muzzleFlash3.renderOrder = 997;
    this.muzzleFlash3.frustumCulled = false;

    // Muzzle light - brighter and warmer (starts at 0 intensity)
    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, initialConfig.muzzle.lightRange * 1.5);
    this.muzzleLight.position.copy(this.muzzleFlash.position);

    // Weapon fill light - provides consistent lighting for the weapon model
    // This ensures the weapon is always visible regardless of world position
    this.weaponFillLight = new THREE.PointLight(0xffffff, 1.2, 3, 2);
    this.weaponFillLight.position.set(0.3, 0.2, 0.5); // Position in front and slightly above weapon

    // Pre-create smoke particle pool
    this.initializeSmokeParticles();
  }

  private initializeSmokeParticles(): void {
    for (let i = 0; i < this.MAX_SMOKE_PARTICLES; i++) {
      const smokeMat = new THREE.SpriteMaterial({
        map: this.smokeTexture.clone(),
        color: 0x888888,
        transparent: true,
        opacity: 0,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      // Set up UV for spritesheet (start at random frame)
      smokeMat.map!.repeat.set(1 / this.SMOKE_SPRITE_COLS, 1 / this.SMOKE_SPRITE_ROWS);

      const smoke = new THREE.Sprite(smokeMat);
      smoke.scale.set(0.05, 0.05, 1);
      smoke.visible = false;
      smoke.userData = {
        life: 0,
        maxLife: 0,
        velocity: new THREE.Vector3(),
        startScale: 0.05,
        frame: 0,
        frameTime: 0,
      };

      this.smokeParticles.push(smoke);
    }
  }

  private loadAllAudio(): void {
    // Skip audio loading if no audio manager (e.g., for remote players)
    if (!this.audioManager) return;

    const loadedPaths = new Set<string>();

    // Preload all weapon sounds
    (Object.values(WEAPON_CONFIG) as SingleWeaponConfig[]).forEach((config) => {
      Object.values(config.audio).forEach((path) => {
        if (path && typeof path === 'string' && !loadedPaths.has(path)) {
          this.audioManager.loadAudio(path);
          loadedPaths.add(path);
        }
      });
    });
  }

  public get currentConfig(): SingleWeaponConfig {
    return WEAPON_CONFIG[this.currentWeapon];
  }

  public getEquippedWeapons(): WeaponType[] {
    // For now, return all available weapons in a fixed order
    return Object.values(WeaponType);
  }

  public switchWeapon(weapon: WeaponType | number): void {
    // Unzoom when switching weapons
    if (this.isZoomed) {
      this.setZoom(false);
    }

    if (typeof weapon === 'number') {
      const weapons = this.getEquippedWeapons();
      if (weapon >= 0 && weapon < weapons.length) {
        this.currentWeapon = weapons[weapon];
      }
    } else {
      this.currentWeapon = weapon;
    }

    // Reset reloading state on switch
    const state = this.weaponStates.get(this.currentWeapon);
    if (state) {
      state.isReloading = false;
    }

    this.resetWeaponState();

    // Play deploy sound if available (optional)
  }

  public scrollWeapon(direction: number): void {
    const weapons = this.getEquippedWeapons();
    let currentIndex = weapons.indexOf(this.currentWeapon);

    if (direction > 0) {
      currentIndex = (currentIndex + 1) % weapons.length;
    } else {
      currentIndex = (currentIndex - 1 + weapons.length) % weapons.length;
    }

    this.switchWeapon(weapons[currentIndex]);
  }

  public get isReloading(): boolean {
    return this.weaponStates.get(this.currentWeapon)?.isReloading || false;
  }

  public get currentMag(): number {
    return this.weaponStates.get(this.currentWeapon)?.currentMag || 0;
  }

  public get reserveAmmo(): number {
    return this.weaponStates.get(this.currentWeapon)?.reserveAmmo || 0;
  }

  public getCurrentSpread(): number {
    return this.currentSpread;
  }

  public getMuzzleWorldPosition(): THREE.Vector3 {
    // Calculate muzzle position: weapon base position + muzzle offset from weapon config
    const config = WEAPON_CONFIG[this.currentWeapon];
    const muzzleOffset = config.muzzle.position;

    // Start with weapon base position in first-person (relative to camera)
    // Weapon position is (0.25, -0.25, -0.4) relative to camera
    const weaponBasePos = new THREE.Vector3(0.25, -0.25, -0.4);

    // Add muzzle offset (relative to weapon)
    // Note: muzzle z should be negative to be forward of weapon
    const muzzlePos = weaponBasePos.clone();
    muzzlePos.x += muzzleOffset.x;
    muzzlePos.y += muzzleOffset.y;
    muzzlePos.z += muzzleOffset.z; // muzzle.z is typically negative (forward)

    // Transform from camera-local space to world space
    muzzlePos.applyMatrix4(this.camera.matrixWorld);

    return muzzlePos;
  }

  /**
   * Get the ejection port position (right side of weapon, where shells eject from)
   */
  private getEjectionPortPosition(): THREE.Vector3 {
    // Start with weapon base position (relative to camera)
    const weaponBasePos = new THREE.Vector3(0.25, -0.25, -0.4);

    // Ejection port is on the right side of the weapon, behind the muzzle
    // Offset: right +0.08, up +0.05, slight forward -0.1 (relative to weapon base)
    weaponBasePos.x += 0.08;  // Right side
    weaponBasePos.y += 0.05;  // Slightly above weapon center
    weaponBasePos.z += -0.1;  // Slightly forward of weapon center

    // Transform to world space
    weaponBasePos.applyMatrix4(this.camera.matrixWorld);
    return weaponBasePos;
  }

  /**
   * Get the shell ejection direction (right, up, and slightly back)
   */
  private getEjectionDirection(): THREE.Vector3 {
    // Shells eject to the right, upward, and slightly backward
    // Add randomization for natural variation
    const dir = new THREE.Vector3(
      0.8 + Math.random() * 0.4,   // Right (0.8-1.2)
      0.5 + Math.random() * 0.3,   // Up (0.5-0.8)
      0.1 + Math.random() * 0.2    // Slightly back (0.1-0.3)
    );
    dir.applyQuaternion(this.camera.quaternion);
    return dir.normalize();
  }

  public shoot(
    camera: THREE.Camera,
    _onGround: boolean,
    isSprinting: boolean,
    _velocity: THREE.Vector3
  ): { shotFired: boolean; direction: THREE.Vector3; directions?: THREE.Vector3[] } {
    const config = WEAPON_CONFIG[this.currentWeapon];
    const state = this.weaponStates.get(this.currentWeapon);

    if (!config || !state) return { shotFired: false, direction: new THREE.Vector3() };

    // Check can fire
    const now = performance.now();
    const msPerShot = 1000 / config.fireRate;

    if (state.isReloading || state.currentMag <= 0 || now - state.lastShotTime < msPerShot) {
      if (state.currentMag <= 0 && !state.isReloading && state.reserveAmmo > 0) {
        this.reload();
      }
      return { shotFired: false, direction: new THREE.Vector3() };
    }

    // Sprint check (cannot fire while sprinting)
    if (isSprinting) {
      return { shotFired: false, direction: new THREE.Vector3() };
    }

    // Update state
    state.lastShotTime = now;
    state.currentMag--;

    // Play sound
    if (config.audio.fire) {
      if (this.isThirdPerson) {
        // AI/Enemy: Play 3D positional sound from muzzle
        const muzzlePos = this.getMuzzleWorldPosition();
        if (this.audioManager) {
          this.audioManager.playPositionalSound(config.audio.fire, muzzlePos, 'sfx', {
            volume: 0.8, // Slightly lower base volume for enemies
            refDistance: 10, // Distance where volume starts dropping
            maxDistance: 60, // Max hearing distance (Arena is 60x60)
            rolloffFactor: 1.5 // Standard rolloff
          });
        }
      } else {
        // Player: Play 2D sound (local)
        this.audioManager.playSound(config.audio.fire, 'sfx', { volume: 0.5 });
      }
    }

    // Apply recoil (includes weapon visual kick)
    this.applyRecoil(config.recoil);

    // Increase spread
    this.currentSpread = Math.min(
      this.currentSpread + config.spread.increasePerShot,
      config.spread.max
    );

    // Trigger muzzle flash
    this.triggerMuzzleFlash();

    // Eject shell from ejection port (right side of weapon)
    if (this.shellEjectCallback) {
      const ejectionPos = this.getEjectionPortPosition();
      const ejectionDir = this.getEjectionDirection();
      this.shellEjectCallback(ejectionPos, ejectionDir);
    }

    // Calculate shot direction(s). Bullets fire along the camera (crosshair); the
    // recoil "kick" is applied to the camera itself by the World, so it both moves
    // the view and the shots, then recovers — no separate bullet-only recoil.
    const baseDir = camera.getWorldDirection(new THREE.Vector3());

    if (config.pelletCount && config.pelletCount > 1) {
      // Shotgun spread
      const directions: THREE.Vector3[] = [];
      for (let i = 0; i < config.pelletCount; i++) {
        const dir = baseDir.clone();
        this.applySpread(dir, this.currentSpread * 2); // Wider spread for shotgun
        directions.push(dir);
      }
      return { shotFired: true, direction: baseDir, directions };
    } else {
      // Single shot spread
      this.applySpread(baseDir, this.currentSpread);
      return { shotFired: true, direction: baseDir };
    }
  }

  private applySpread(direction: THREE.Vector3, spreadAmount: number): void {
    const u = Math.random() * 2 - 1;
    const v = Math.random() * 2 - 1;

    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, direction).normalize();

    direction.addScaledVector(right, u * spreadAmount);
    direction.addScaledVector(up, v * spreadAmount);
    direction.normalize();
  }

  private applyRecoil(recoilConfig: { kickZ: number; kickRotX: number }): void {
    // Weapon visual kick from config (the camera/aim kick is handled by ScreenEffects).
    this.weaponKickZ = recoilConfig.kickZ;
    this.weaponKickRotX = (recoilConfig.kickRotX * Math.PI) / 180; // Convert degrees to radians
  }

  /**
   * Public method to trigger muzzle flash (used for remote players)
   */
  public showMuzzleFlash(): void {
    this.triggerMuzzleFlash();
  }

  /**
   * Simplified update for remote players - only handles muzzle flash and smoke fading
   */
  public updateEffects(deltaTime: number): void {
    const config = WEAPON_CONFIG[this.currentWeapon];
    if (!config) return;

    // Update muzzle flash
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= deltaTime;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashTimer = 0;
        // HIDE sprites
        this.muzzleFlash.visible = false;
        this.muzzleFlash2.visible = false;
        this.muzzleFlash3.visible = false;
        (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = 0;
        (this.muzzleFlash2.material as THREE.SpriteMaterial).opacity = 0;
        (this.muzzleFlash3.material as THREE.SpriteMaterial).opacity = 0;
        this.muzzleLight.intensity = 0;
      } else {
        // Fast initial flash, then quick fade
        const ratio = this.muzzleFlashTimer / this.muzzleFlashDuration;
        const easedRatio = ratio * ratio;

        (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = easedRatio * 1.0;
        (this.muzzleFlash2.material as THREE.SpriteMaterial).opacity = easedRatio * 0.7;
        (this.muzzleFlash3.material as THREE.SpriteMaterial).opacity = easedRatio * 0.4;
        this.muzzleLight.intensity = easedRatio * config.muzzle.lightIntensity * 1.5;
      }
    }

    // Update smoke particles
    this.updateSmokeParticles(deltaTime);
  }

  private triggerMuzzleFlash(): void {
    const config = WEAPON_CONFIG[this.currentWeapon];

    // Set flash active
    this.muzzleFlashTimer = config.muzzle.flashDuration;
    this.muzzleFlashDuration = config.muzzle.flashDuration;

    // MAKE VISIBLE (like AI system!)
    this.muzzleFlash.visible = true;
    this.muzzleFlash2.visible = true;
    this.muzzleFlash3.visible = true;

    // Set maximum opacity for intense flash
    (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = 1.0;
    (this.muzzleFlash2.material as THREE.SpriteMaterial).opacity = 0.95;
    (this.muzzleFlash3.material as THREE.SpriteMaterial).opacity = 0.85;

    // Randomize scale slightly for each shot
    const scaleVar = 0.85 + Math.random() * 0.3;
    this.muzzleFlash.scale.set(0.25 * scaleVar, 0.25 * scaleVar, 0.25 * scaleVar);
    this.muzzleFlash2.scale.set(0.35 * scaleVar, 0.35 * scaleVar, 0.35 * scaleVar);
    this.muzzleFlash3.scale.set(0.45 * scaleVar, 0.45 * scaleVar, 0.45 * scaleVar);

    // Set light intensity (boost for visibility and intensity)
    const lightMultiplier = this.isThirdPerson ? 3.0 : 2.5;
    this.muzzleLight.intensity = config.muzzle.lightIntensity * lightMultiplier * 2.0;

    // Randomize rotation for variety
    const baseRotation = Math.random() * Math.PI * 2;
    this.muzzleFlash.material.rotation = baseRotation;
    this.muzzleFlash2.material.rotation = baseRotation + Math.PI * 0.25;
    this.muzzleFlash3.material.rotation = baseRotation + Math.PI * 0.5;

    // Spawn smoke particles
    this.spawnSmokeParticles();
  }

  private spawnSmokeParticles(): void {
    // Spawn 2-4 smoke particles per shot
    const numParticles = 2 + Math.floor(Math.random() * 3);

    for (let i = 0; i < numParticles; i++) {
      // Find an inactive smoke particle
      const smoke = this.smokeParticles.find(s => s.userData.life <= 0);
      if (!smoke) continue;

      // Position at muzzle with slight random offset
      smoke.position.copy(this.muzzleFlash.position);
      smoke.position.x += (Math.random() - 0.5) * 0.02;
      smoke.position.y += (Math.random() - 0.5) * 0.02;

      // Set velocity - smoke rises and bitblasts forward/up
      smoke.userData.velocity.set(
        (Math.random() - 0.5) * 0.15,  // Slight horizontal bitblast
        0.08 + Math.random() * 0.12,    // Rise upward
        -0.05 - Math.random() * 0.1     // BitBlast forward (toward player view)
      );

      // Randomize life and appearance
      smoke.userData.maxLife = 0.4 + Math.random() * 0.4;
      smoke.userData.life = smoke.userData.maxLife;
      smoke.userData.startScale = 0.03 + Math.random() * 0.03;
      smoke.userData.frame = 0;
      smoke.userData.frameTime = 0;

      // Set initial state
      smoke.scale.set(smoke.userData.startScale, smoke.userData.startScale, 1);
      (smoke.material as THREE.SpriteMaterial).opacity = 0.3 + Math.random() * 0.2;

      // Random starting frame in spritesheet
      const startFrame = Math.floor(Math.random() * (this.SMOKE_SPRITE_COLS * this.SMOKE_SPRITE_ROWS));
      this.setSmokeFrame(smoke, startFrame);

      smoke.visible = true;
    }
  }

  private setSmokeFrame(smoke: THREE.Sprite, frame: number): void {
    const col = frame % this.SMOKE_SPRITE_COLS;
    const row = Math.floor(frame / this.SMOKE_SPRITE_COLS) % this.SMOKE_SPRITE_ROWS;

    const mat = smoke.material as THREE.SpriteMaterial;
    if (mat.map) {
      mat.map.offset.set(
        col / this.SMOKE_SPRITE_COLS,
        1 - (row + 1) / this.SMOKE_SPRITE_ROWS
      );
    }
  }

  private updateSmokeParticles(deltaTime: number): void {
    for (const smoke of this.smokeParticles) {
      if (smoke.userData.life <= 0) continue;

      smoke.userData.life -= deltaTime;

      if (smoke.userData.life <= 0) {
        smoke.visible = false;
        continue;
      }

      const lifeRatio = smoke.userData.life / smoke.userData.maxLife;

      // Move smoke
      smoke.position.add(
        smoke.userData.velocity.clone().multiplyScalar(deltaTime)
      );

      // Slow down horizontal movement, maintain upward bitblast
      smoke.userData.velocity.x *= 0.98;
      smoke.userData.velocity.z *= 0.98;

      // Expand smoke over time
      const expandedScale = smoke.userData.startScale * (1 + (1 - lifeRatio) * 3);
      smoke.scale.set(expandedScale, expandedScale, 1);

      // Fade out
      const opacity = lifeRatio * 0.4;
      (smoke.material as THREE.SpriteMaterial).opacity = opacity;

      // Animate spritesheet frames
      smoke.userData.frameTime += deltaTime;
      if (smoke.userData.frameTime > 0.05) { // 20 FPS animation
        smoke.userData.frameTime = 0;
        smoke.userData.frame = (smoke.userData.frame + 1) % (this.SMOKE_SPRITE_COLS * this.SMOKE_SPRITE_ROWS);
        this.setSmokeFrame(smoke, smoke.userData.frame);
      }
    }
  }

  public reload(): void {
    const state = this.weaponStates.get(this.currentWeapon);
    const config = WEAPON_CONFIG[this.currentWeapon];

    if (!state || !config || state.isReloading || state.currentMag === config.magSize || state.reserveAmmo <= 0) {
      return;
    }

    // Unzoom if reloading while zoomed
    if (this.isZoomed) {
      this.setZoom(false);
    }

    state.isReloading = true;
    state.reloadStartTime = performance.now();

    if (config.audio.reload && this.audioManager) {
      this.audioManager.playSound(config.audio.reload, 'sfx', { volume: 0.5 });
    }

    // Send reload event to network
    const world = (window as any).world;
    if (world?.networkManager?.isConnected()) {
      world.networkManager.sendReload(this.currentWeapon.toString());
    }
  }

  /**
   * Immediately stops all visual effects (muzzle flash, smoke).
   * Call this when an enemy dies to prevent frozen effects.
   */
  public stopAllEffects(): void {
    // Hide muzzle flashes immediately
    this.muzzleFlashTimer = 0;
    this.muzzleFlash.visible = false;
    this.muzzleFlash2.visible = false;
    this.muzzleFlash3.visible = false;
    (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = 0;
    (this.muzzleFlash2.material as THREE.SpriteMaterial).opacity = 0;
    (this.muzzleFlash3.material as THREE.SpriteMaterial).opacity = 0;
    this.muzzleLight.intensity = 0;

    // Hide all smoke particles immediately
    for (const smoke of this.smokeParticles) {
      smoke.visible = false;
      smoke.userData.life = 0;
      (smoke.material as THREE.SpriteMaterial).opacity = 0;
    }
  }

  /**
   * Show or hide the weapon mesh.
   * Used during player death to hide the first-person weapon view.
   */
  public setVisible(visible: boolean): void {
    if (this.weaponMesh) {
      this.weaponMesh.visible = visible;
      // Also hide all child objects
      this.weaponMesh.traverse((child) => {
        child.visible = visible;
      });
    }
    // Also hide muzzle flash and effects when hiding weapon
    if (!visible) {
      this.stopAllEffects();
    }
  }

  public update(deltaTime: number, mouseMovement: { x: number, y: number }, isSprinting: boolean, isMoving: boolean, isAirborne: boolean, headBobTime: number = 0): void {
    const config = WEAPON_CONFIG[this.currentWeapon];
    const state = this.weaponStates.get(this.currentWeapon);

    if (!config || !state) return;

    // Handle Reloading
    if (state.isReloading) {
      if (performance.now() - state.reloadStartTime >= config.reloadTime * 1000) {
        const needed = config.magSize - state.currentMag;
        const toAdd = Math.min(needed, state.reserveAmmo);

        state.currentMag += toAdd;
        state.reserveAmmo -= toAdd;
        state.isReloading = false;
      }
    }

    // Spread recovery
    let minSpread = config.spread.base;

    if (isAirborne) {
      minSpread = config.spread.base * 2.5;
    } else if (isSprinting) {
      minSpread = config.spread.base * 2.0;
    } else if (isMoving) {
      minSpread = config.spread.base * 1.5;
    }

    this.currentSpread = THREE.MathUtils.lerp(this.currentSpread, minSpread, deltaTime * config.spread.recoveryRate);

    // Weapon kickback recovery
    this.weaponKickZ *= 1 - 5 * deltaTime;
    this.weaponKickRotX *= 1 - 5 * deltaTime;

    // Weapon sway (follows mouse movement with lag)
    const swayAmount = 0.01; // How much weapon lags behind mouse
    const swayRecovery = 8; // How fast it returns to center
    this.weaponSwayX += (mouseMovement.x * swayAmount - this.weaponSwayX) * swayRecovery * deltaTime;
    this.weaponSwayY += (mouseMovement.y * swayAmount - this.weaponSwayY) * swayRecovery * deltaTime;    // Sprint blend
    const targetSprint = isSprinting ? 1 : 0;
    this.sprintBlend += (targetSprint - this.sprintBlend) * 8 * deltaTime;

    // Reload blend
    const targetReload = state.isReloading ? 1 : 0;
    this.reloadBlend += (targetReload - this.reloadBlend) * 8 * deltaTime;

    // Zoom blend (smooth transition for scope animation)
    const targetZoom = this.isZoomed ? 1 : 0;
    this.zoomBlend += (targetZoom - this.zoomBlend) * 10 * deltaTime; // Slightly faster for snappy feel

    // Update muzzle flash
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= deltaTime;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashTimer = 0;
        // HIDE sprites (like AI system!)
        this.muzzleFlash.visible = false;
        this.muzzleFlash2.visible = false;
        this.muzzleFlash3.visible = false;
        (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = 0;
        (this.muzzleFlash2.material as THREE.SpriteMaterial).opacity = 0;
        (this.muzzleFlash3.material as THREE.SpriteMaterial).opacity = 0;
        this.muzzleLight.intensity = 0;
      } else {
        // Fast initial flash, then quick fade
        const ratio = this.muzzleFlashTimer / this.muzzleFlashDuration;
        const easedRatio = ratio * ratio; // Quadratic ease out for snappier fade

        (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = easedRatio * 1.0;
        (this.muzzleFlash2.material as THREE.SpriteMaterial).opacity = easedRatio * 0.7;
        (this.muzzleFlash3.material as THREE.SpriteMaterial).opacity = easedRatio * 0.4;
        this.muzzleLight.intensity = easedRatio * config.muzzle.lightIntensity * 1.5;

        // Quick rotation during flash for dynamic effect
        const rotSpeed = 15;
        this.muzzleFlash.material.rotation += deltaTime * rotSpeed;
        this.muzzleFlash2.material.rotation -= deltaTime * rotSpeed * 0.7;
        this.muzzleFlash3.material.rotation += deltaTime * rotSpeed * 0.5;

        // Slight scale pulse
        this.muzzleFlash.scale.multiplyScalar(1 + deltaTime * 2);
        this.muzzleFlash2.scale.multiplyScalar(1 + deltaTime * 1.5);
      }
    }

    // Update smoke particles
    this.updateSmokeParticles(deltaTime);

    // Update weapon transform (position and rotation)
    this.updateWeaponTransform(deltaTime, headBobTime);
  }

  private updateWeaponTransform(delta: number, headBobTime: number): void {
    if (!this.weaponMesh) return;

    // Skip FPS-style animations for third-person mode
    if (this.isThirdPerson) {
      // Simple kickback for third-person
      const kickZ = this.weaponKickZ * 0.5; // Reduced kickback

      // Respect base position for OBJ models
      let baseZ = 0;
      if (this.weaponMesh.userData.isOBJModel) {
        baseZ = 8;
      }

      this.weaponMesh.position.z = baseZ + kickZ;
      return;
    }

    // Hide weapon smoothly when fully zoomed
    // Start hiding at 70% zoom progress for smooth transition
    const hideThreshold = 0.7;
    if (this.zoomBlend > hideThreshold) {
      const hideProgress = (this.zoomBlend - hideThreshold) / (1 - hideThreshold);
      this.weaponMesh.visible = hideProgress < 0.99;
    } else {
      this.weaponMesh.visible = true;
    }

    // Base position
    let targetX = 0.25 - this.weaponSwayX;
    let targetY = -0.25 - this.weaponSwayY;
    let targetZ = -0.4;

    // Weapon bob (breathing/walking motion) - reduce during zoom
    const bobInfluence = 1.0 - this.zoomBlend * 0.8; // Less bob when zooming
    const bobX = Math.cos(headBobTime * 0.5) * 0.015 * bobInfluence;
    const bobY = Math.sin(headBobTime) * 0.035 * bobInfluence;
    targetX += bobX;
    targetY += bobY;

    // Kickback from shooting
    targetZ += this.weaponKickZ;

    // Sprint offset (lower and to the side)
    targetX += 0.1 * this.sprintBlend;
    targetY -= 0.2 * this.sprintBlend;

    // Reload offset (dip down)
    targetY -= 0.15 * this.reloadBlend;

    // Zoom animation: weapon raises up to bring scope to eye level
    // Also moves forward and centers for proper ADS position
    targetY += 0.15 * this.zoomBlend;  // Raise the weapon up
    targetZ -= 0.2 * this.zoomBlend;   // Pull forward toward eye
    targetX -= 0.15 * this.zoomBlend;  // Center the weapon

    // Rotation
    let targetRotX = -this.weaponKickRotX + (0.3 * this.reloadBlend);
    let targetRotZ = (0.2 * this.sprintBlend);

    // Zoom rotation: tilt weapon slightly to align scope
    targetRotX += 0.1 * this.zoomBlend;

    // Smooth lerp to target
    const lerpSpeed = 15;
    this.weaponMesh.position.x += (targetX - this.weaponMesh.position.x) * lerpSpeed * delta;
    this.weaponMesh.position.y += (targetY - this.weaponMesh.position.y) * lerpSpeed * delta;
    this.weaponMesh.position.z += (targetZ - this.weaponMesh.position.z) * lerpSpeed * delta;
    this.weaponMesh.rotation.x += (targetRotX - this.weaponMesh.rotation.x) * lerpSpeed * delta;
    this.weaponMesh.rotation.z += (targetRotZ - this.weaponMesh.rotation.z) * lerpSpeed * delta;
  }

  private resetWeaponState(): void {
    // Remove old model
    if (this.weaponMesh) {
      if (this.weaponMesh.parent) {
        this.weaponMesh.parent.remove(this.weaponMesh);
      }
      // Procedural models create fresh geometry/materials each switch, so dispose
      // them. GLB clones share geometry/materials with the cached asset (must NOT
      // be disposed). Reused sprites (smoke/muzzle) are not Meshes, so they're safe.
      if (!this.weaponMesh.userData.isOBJModel) {
        this.weaponMesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            const mat = child.material as THREE.Material | THREE.Material[];
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else if (mat) mat.dispose();
          }
        });
      }
    }

    // Create new model
    const group = this.createWeaponModel();
    this.weaponMesh = group;

    // Add muzzle effects to weapon
    const config = WEAPON_CONFIG[this.currentWeapon];
    const pos = config.muzzle.position;

    // For third-person mode, adjust muzzle flash position to account for weapon rotation
    if (this.isThirdPerson) {
      // Muzzle flash offset from visual editor (in weapon local space)
      this.muzzleFlash.position.set(0.007, 0.000, 0.000);
      this.muzzleFlash2.position.set(0.007, 0.000, 0.002); // Tiny Z offset
      this.muzzleFlash3.position.set(0.007, 0.000, 0.004);
      // Scale up muzzle flash for third-person visibility
      this.muzzleFlash.scale.set(0.15, 0.15, 0.15);
      this.muzzleFlash2.scale.set(0.20, 0.20, 0.20);
      this.muzzleFlash3.scale.set(0.25, 0.25, 0.25);
    } else {
      // First-person: Position relative to camera since sprites are attached to camera
      // Weapon is typically at (0.25, -0.25, -0.4) in camera space
      // Muzzle flash should be at the weapon's barrel tip position
      const weaponBaseX = 0.25;
      const weaponBaseY = -0.25;
      const weaponBaseZ = -0.4;

      // Position further from player, at the weapon barrel
      const muzzleX = weaponBaseX + pos.x;
      const muzzleY = weaponBaseY + pos.y;
      const muzzleZ = weaponBaseZ + (pos.z * 0.5); // Push further forward

      this.muzzleFlash.position.set(muzzleX, muzzleY, muzzleZ);
      this.muzzleFlash2.position.set(muzzleX, muzzleY, muzzleZ - 0.02); // Layer behind
      this.muzzleFlash3.position.set(muzzleX, muzzleY, muzzleZ - 0.04);

      // Make them extremely large for maximum visibility
      this.muzzleFlash.scale.set(4.0, 4.0, 4.0);
      this.muzzleFlash2.scale.set(5.2, 5.2, 5.2);
      this.muzzleFlash3.scale.set(6.4, 6.4, 6.4);
    }
    this.muzzleLight.position.copy(this.muzzleFlash.position);
    this.muzzleLight.color.setHex(0xffaa44); // Warm muzzle light
    this.muzzleLight.distance = config.muzzle.lightRange * 1.5;

    if (this.isThirdPerson) {
      // Third-person: add to weapon mesh
      this.weaponMesh.add(this.muzzleFlash);
      this.weaponMesh.add(this.muzzleFlash2);
      this.weaponMesh.add(this.muzzleFlash3);
      this.weaponMesh.add(this.muzzleLight);
    } else {
      // First-person: add directly to camera for visibility
      // Remove from any previous parent first
      if (this.muzzleFlash.parent) this.muzzleFlash.parent.remove(this.muzzleFlash);
      if (this.muzzleFlash2.parent) this.muzzleFlash2.parent.remove(this.muzzleFlash2);
      if (this.muzzleFlash3.parent) this.muzzleFlash3.parent.remove(this.muzzleFlash3);
      if (this.muzzleLight.parent) this.muzzleLight.parent.remove(this.muzzleLight);
      if (this.weaponFillLight.parent) this.weaponFillLight.parent.remove(this.weaponFillLight);

      this.camera.add(this.muzzleFlash);
      this.camera.add(this.muzzleFlash2);
      this.camera.add(this.muzzleFlash3);
      this.camera.add(this.muzzleLight);
      this.camera.add(this.weaponFillLight); // Add fill light to camera for consistent weapon illumination
    }

    // Add smoke particles to weapon mesh (they work fine there)
    for (const smoke of this.smokeParticles) {
      this.weaponMesh.add(smoke);
    }

    // Attach to appropriate parent based on mode
    if (this.isThirdPerson && this.thirdPersonParent) {
      // Third-person mode: attach to hand bone with appropriate transform
      // Note: OBJ models already have their third-person transforms applied in tryLoadGLBModel()
      // Only apply default transform for procedural models
      if (!this.weaponMesh.userData.isOBJModel) {
        this.weaponMesh.scale.set(0.7, 0.7, 0.7);
        this.weaponMesh.position.set(0, 0, 0);
        this.weaponMesh.rotation.set(0, Math.PI, 0);
      }

      // Ensure weapon and all children are visible and have proper render settings
      this.weaponMesh.visible = true;
      this.weaponMesh.frustumCulled = false;
      this.weaponMesh.renderOrder = 0;
      this.weaponMesh.traverse((child) => {
        child.visible = true;
        child.frustumCulled = false;
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // FIX: Apply precise transforms from weapon editor tool
      // Position: (6.3, 13.8, 1.3)
      this.weaponMesh.position.set(6.3, 13.8, 1.3);

      // Rotation: X=-102°, Y=7°, Z=-93°
      // (-0.569 * Math.PI, 0.040 * Math.PI, -0.514 * Math.PI)
      this.weaponMesh.rotation.set(
        -0.569 * Math.PI,
        0.040 * Math.PI,
        -0.514 * Math.PI
      );

      // Scale Compensation: 720 (Reduced by 10% from 800)
      const scale = 720;
      this.weaponMesh.scale.set(scale, scale, scale);

      this.thirdPersonParent.add(this.weaponMesh);

      // Update muzzle flash offset if applying locally (though usually handled by bone attachment)
      // User provided: (-0.000, 0.005, 0.065)
      this.muzzleFlash.position.set(-0.000, 0.005, 0.065);
      this.muzzleFlash2.position.set(-0.000, 0.005, 0.067); // +0.002 Z
      this.muzzleFlash3.position.set(-0.000, 0.005, 0.069); // +0.004 Z
    } else {
      // First-person mode: attach to camera
      // Note: OBJ models already have their transforms applied in tryLoadGLBModel()
      // Only apply default transform for procedural models
      if (!this.weaponMesh.userData.isOBJModel) {
        this.weaponMesh.scale.set(1.0, 1.0, 1.0);
        this.weaponMesh.position.set(0.25, -0.25, -0.4);
      }
      this.camera.add(this.weaponMesh);
    }
  }

  // Weapon model creation
  private createWeaponModel(): THREE.Group {
    // Try to load GLB model first for weapons that have them
    const glbModel = this.tryLoadGLBModel();
    if (glbModel) {
      return glbModel;
    }

    // Fall back to procedural generation
    switch (this.currentWeapon) {
      case WeaponType.AK47: return this.createAK47Model();
      case WeaponType.AWP: return this.createAWPModel();
      case WeaponType.LMG: return this.createLMGModel();
      case WeaponType.M4: return this.createM4Model();
      case WeaponType.Pistol: return this.createPistolModel();
      case WeaponType.Scar: return this.createScarModel();
      case WeaponType.Shotgun: return this.createShotgunModel();
      case WeaponType.Sniper: return this.createSniperModel();
      case WeaponType.Tec9: return this.createTec9Model();
      default: return this.createAK47Model();
    }
  }

  private tryLoadGLBModel(): THREE.Group | null {
    // Map weapon types to weaponpack OBJ model names
    let modelKey: string | null = null;
    let scale = 1.0;
    let rotation = new THREE.Euler(0, 0, 0);
    let position = new THREE.Vector3(0, 0, 0);

    switch (this.currentWeapon) {
      case WeaponType.AK47:
        modelKey = 'machinegun';
        scale = 6.4;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.3, -0.2, -0.5);
        break;
      case WeaponType.Pistol:
        modelKey = 'pistol';
        scale = 5.2;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.25, -0.15, -0.4);
        break;
      case WeaponType.Scar:
        modelKey = 'pistolSilencer';
        scale = 5.2;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.25, -0.15, -0.4);
        break;
      case WeaponType.Shotgun:
        modelKey = 'shotgun';
        scale = 6.4;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.3, -0.2, -0.5);
        break;
      case WeaponType.Sniper:
        modelKey = 'sniper';
        scale = 6.8;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.3, -0.2, -0.6);
        break;
      case WeaponType.AWP:
        modelKey = 'sniperCamo';
        scale = 6.8;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.3, -0.2, -0.6);
        break;
      case WeaponType.Tec9:
        modelKey = 'uzi';
        scale = 5.2;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.25, -0.15, -0.4);
        break;
      case WeaponType.LMG:
        modelKey = 'machinegunLauncher';
        scale = 6.8;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.3, -0.2, -0.6);
        break;
      case WeaponType.M4:
        modelKey = 'machinegun';
        scale = 6.4;
        rotation.set(0, Math.PI, -Math.PI * 0.5);
        position.set(0.3, -0.2, -0.5);
        break;
    }

    if (modelKey) {
      const model = this.assetManager.models.get(modelKey);

      if (model) {
        const clonedModel = model.clone() as THREE.Group;

        // Mark as OBJ model so resetWeaponState knows not to apply default transform
        clonedModel.userData.isOBJModel = true;

        // Fix materials: ensure all meshes have proper materials (some OBJ meshes have undefined materials)
        clonedModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (!child.material || child.material === undefined) {
              // Add default material to meshes without materials
              child.material = new THREE.MeshPhongMaterial({
                color: 0x888888,
                shininess: 30,
                flatShading: false
              });
            }
            // Ensure mesh is set to visible and cast shadows
            child.visible = true;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Apply FPS-optimized transformations
        if (!this.isThirdPerson) {
          // First-person view (player)
          clonedModel.scale.set(scale, scale, scale);
          clonedModel.rotation.copy(rotation);
          clonedModel.position.copy(position);
        } else {
          // Third-person view (enemy AI)
          // CRITICAL: Enemy models are scaled to 0.02, compensate by 50x, then 3.2x larger (80% of 4x)
          const modelScaleCompensation = 160; // 50 base * 3.2x size boost

          // Use 0.6 scale factor to match setThirdPersonMode logic
          const tpScale = scale * 0.6 * modelScaleCompensation;
          clonedModel.scale.set(tpScale, tpScale, tpScale);

          // Rotation: X=-102°, Y=7°, Z=-93° (from visual editor)
          clonedModel.rotation.set(-0.569 * Math.PI, 0.040 * Math.PI, -0.514 * Math.PI);
          // Position adjusted via visual editor
          clonedModel.position.set(6.3, 13.8, 1.3);
        }

        return clonedModel;
      }
    }

    return null;
  }

  private createAK47Model(): THREE.Group {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x5d4037, metalness: 0.1, roughness: 0.8 }) // Wood
    );
    body.position.set(0, 0, -0.1);
    group.add(body);

    // Metal parts
    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.13, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 })
    );
    receiver.position.set(0, 0.01, -0.1);
    group.add(receiver);

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.3 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.5);
    group.add(barrel);

    // Magazine (Curved look via rotation)
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.25, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    mag.position.set(0, -0.15, -0.05);
    mag.rotation.x = 0.3;
    group.add(mag);

    return group;
  }

  private createAWPModel(): THREE.Group {
    const group = new THREE.Group();

    // Green Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.15, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x2e7d32, metalness: 0.2, roughness: 0.7 })
    );
    body.position.set(0, 0, -0.2);
    group.add(body);

    // Long Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.8);
    group.add(barrel);

    // Scope
    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.12, -0.1);
    group.add(scope);

    return group;
  }

  private createLMGModel(): THREE.Group {
    const group = new THREE.Group();

    // Bulky Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.2, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x424242 })
    );
    body.position.set(0, 0, -0.1);
    group.add(body);

    // Box Mag
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.2, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x2e7d32 })
    );
    mag.position.set(0, -0.15, 0);
    group.add(mag);

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.6);
    group.add(barrel);

    return group;
  }

  private createM4Model(): THREE.Group {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    );
    body.position.set(0, 0, -0.1);
    group.add(body);

    // Barrel with handguard
    const handguard = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    handguard.position.set(0, 0.02, -0.4);
    group.add(handguard);

    // Carry handle / Sight
    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.06, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    sight.position.set(0, 0.1, -0.1);
    group.add(sight);

    return group;
  }

  private createPistolModel(): THREE.Group {
    const group = new THREE.Group();

    // Slide
    const slide = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xbdc3c7, metalness: 0.8 })
    );
    slide.position.set(0, 0.05, 0);
    group.add(slide);

    // Grip
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.15, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
    );
    grip.position.set(0, -0.05, 0.05);
    grip.rotation.x = -0.2;
    group.add(grip);

    return group;
  }

  private createScarModel(): THREE.Group {
    const group = new THREE.Group();

    // Tan Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.15, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xd2b48c }) // Tan
    );
    body.position.set(0, 0, -0.1);
    group.add(body);

    // Upper receiver
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.08, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xc2a47c })
    );
    upper.position.set(0, 0.08, -0.15);
    group.add(upper);

    // Mag
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.2, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    mag.position.set(0, -0.15, -0.05);
    group.add(mag);

    return group;
  }

  private createShotgunModel(): THREE.Group {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    body.position.set(0, 0, -0.1);
    group.add(body);

    // Long Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.6);
    group.add(barrel);

    // Pump
    const pump = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x5d4037 }) // Wood pump
    );
    pump.position.set(0, -0.05, -0.5);
    group.add(pump);

    return group;
  }

  private createSniperModel(): THREE.Group {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    body.position.set(0, 0, -0.2);
    group.add(body);

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.8);
    group.add(barrel);

    // Scope
    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.1);
    group.add(scope);

    return group;
  }

  private createTec9Model(): THREE.Group {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    body.position.set(0, 0.05, 0);
    group.add(body);

    // Barrel shroud
    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x111111, wireframe: false })
    );
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.05, -0.25);
    group.add(shroud);

    // Mag (Forward of trigger)
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    mag.position.set(0, -0.1, -0.1);
    group.add(mag);

    return group;
  }
}
