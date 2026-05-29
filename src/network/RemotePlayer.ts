// Remote Player Entity
// Represents other players in multiplayer

import * as THREE from 'three';
import { Vector3 as YukaVector3 } from 'yuka';
import { NetworkPlayerState } from './types';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PlayerWeaponSystem } from '../systems/PlayerWeaponSystem';
import { WeaponType } from '../types/weapons';
import { WEAPON_CONFIG } from '../config/weaponConfigs';
import { PLAYER_CONFIG } from '../config/gameConfig';

/**
 * Remote Player - Represents another player in the game
 * Handles interpolation and rendering of other players
 */
export class RemotePlayer {
  public readonly userId: string;
  public id: string;
  public username: string;
  public team: string = '';
  public isDead: boolean = false;

  // Compatibility with Yuka entities - used by BaseGameMode
  public get uuid(): string { return this.userId; }
  public get name(): string { return this.username; }
  public set name(value: string) { this.username = value; }
  public get position(): THREE.Vector3 { return this.mesh.position; }

  /** Returns the root group for this remote player (used by adapters/raycasting). */
  public getMesh(): THREE.Group { return this.mesh; }

  // Health property for CombatManager detection
  public health: number = PLAYER_CONFIG.maxHealth;
  public maxHealth: number = PLAYER_CONFIG.maxHealth;
  public status: number = 12; // STATUS_ALIVE

  private mesh: THREE.Group;
  private scene: THREE.Scene;
  private assetManager: any; // AssetManager type

  // Interpolation
  private targetPosition: THREE.Vector3;
  private targetRotation: THREE.Euler;
  private currentPosition: THREE.Vector3;

  // State buffer for interpolation
  private stateBuffer: NetworkPlayerState[] = [];
  private interpolationDelay: number = 100; // ms

  // Visual components
  private model: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private activeAction: THREE.AnimationAction | null = null;
  private nameLabelSprite: THREE.Sprite | null = null;

  // Shooting animation tracking
  private isShooting: boolean = false;
  private shootAnimEndTime: number = 0;

  // Weapon system for third-person weapon display
  private weaponSystem: PlayerWeaponSystem | null = null;
  private handBone: THREE.Object3D | null = null;
  public currentWeapon: WeaponType = WeaponType.AK47;

  // Audio
  public audios: Map<string, THREE.PositionalAudio> = new Map();

  constructor(scene: THREE.Scene, assetManager: any, id: string, username?: string) {
    this.scene = scene;
    this.assetManager = assetManager;
    this.id = id;
    this.userId = id;
    this.username = username || `Player_${id.slice(0, 4)}`;

    // Initialize positions
    this.currentPosition = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();

    // Create container mesh
    this.mesh = new THREE.Group();
    this.mesh.name = `RemotePlayer_${id}`;

    // CRITICAL: Set userData.entity so CombatManager raycasting finds this player
    this.mesh.userData.entity = this;

    // Load 3D Character
    this.loadCharacter();

    // Create name label
    this.updateNameLabel();

    // Add to scene
    this.scene.add(this.mesh);
  }



  private loadCharacter(): void {
    // Clone the Amy model from AssetManager using SkeletonUtils to preserve animation bindings
    const originalModel = this.assetManager.models.get('amy');

    if (originalModel) {
      // Use SkeletonUtils.clone for proper SkinnedMesh cloning
      this.model = clone(originalModel) as THREE.Group;

      // Apply scale directly to model (same as local player)
      this.model.scale.set(0.02, 0.02, 0.02);

      // Enable matrix auto-update for proper animation (critical for death animation!)
      this.model.matrixAutoUpdate = true;
      this.model.traverse((child: THREE.Object3D) => {
        child.matrixAutoUpdate = true;
        child.userData.entity = this; // CRITICAL: Link mesh parts to RemotePlayer entity for raycasting
      });

      // Rotate 180 degrees (face forward) - Model faces +Z, needs to face -Z
      this.model.rotation.y = Math.PI;

      // Model origin is at feet - no Y offset needed

      // Create mixer on the model
      this.mixer = new THREE.AnimationMixer(this.model);

      // Add model directly to mesh container
      this.mesh.add(this.model);

      // Setup animations
      const animations = this.assetManager.animations;

      // Helper to setup action
      const setupAction = (name: string, loop: boolean = true) => {
        const clip = animations.get(name);
        if (clip && this.mixer) {
          const action = this.mixer.clipAction(clip);
          if (!loop) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          this.actions.set(name, action);
        }
      };

      setupAction('amy_idle');
      setupAction('amy_forward'); // Run
      setupAction('amy_death1', false);
      setupAction('amy_death2', false);
      setupAction('amy_death3', false);
      setupAction('amy_hit_front', false);
      setupAction('amy_shoot_idle');

      // Start idle
      this.playAction('amy_idle');

      // Setup impact sounds - reuse player sounds
      this.setupSounds();

      // Setup weapon system
      this.setupWeaponSystem();

      // Setup Head Hitbox
      this.setupHeadHitbox();

    } else {
      console.warn(`[RemotePlayer] Model 'amy' not found in AssetManager!`);
      // Fallback to capsule
      this.createFallbackMesh();
    }
  }

  private setupHeadHitbox(): void {
    if (!this.model) return;

    console.log(`[RemotePlayer] Setting up Head Hitbox for ${this.id}...`);
    let headBone: THREE.Object3D | null = null;
    this.model.traverse((child: THREE.Object3D) => {
      // Prevent overwriting if we already found a "good" head bone
      if (headBone && !headBone.name.toLowerCase().includes('top') && !headBone.name.toLowerCase().includes('end')) return;

      if ((child as any).isBone) {
        const name = child.name.toLowerCase();
        if (name.includes('head') && !name.includes('top') && !name.includes('end')) {
          headBone = child;
        }
      }
    });

    if (headBone) {
      // Create hitbox (approx 30cm x 30cm x 30cm in WORLD space)
      // Model scale is 0.02, so we need 0.30 / 0.02 = 15.0
      // Increased to 15.0 to ensure it's slightly larger than the visual mesh (hit priority)
      const geometry = new THREE.BoxGeometry(15.0, 15.0, 15.0);
      // Invisible material
      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.5, // DEBUG VISIBLE
        depthWrite: false
      });

      const hitbox = new THREE.Mesh(geometry, material);
      hitbox.name = 'HeadHitbox';

      // CRITICAL: Tags for CombatManager
      hitbox.userData.isHead = true;
      hitbox.userData.entity = this; // Link back to this RemotePlayer

      // Offset (5.0 local units = 0.1 world units) -> Reduced to 1.5
      hitbox.position.y = 1.5;

      (headBone as THREE.Object3D).add(hitbox);
      console.log(`[RemotePlayer] Head hitbox SUCCESSFULLY attached to ${headBone.name}`);
      console.log('[RemotePlayer] Hitbox UserData:', hitbox.userData);
    } else {
      console.error('[RemotePlayer] CRITICAL: No Head bone found for hitbox! Dumping all names:');
      this.model.traverse((c) => console.log(`- ${c.name} (${c.type})`));
    }
  }

  private setupSounds(): void {
    // Clone impact sounds from AssetManager so this player can emit sounds when hit
    if (this.assetManager.audios) {
      for (let i = 1; i <= 7; i++) {
        const sound = this.assetManager.audios.get(`impact${i}`);
        if (sound) {
          this.audios.set(`impact${i}`, this.assetManager.cloneAudio(sound));
          this.mesh.add(this.audios.get(`impact${i}`)!);
        }
      }

      // Death sound if available
      const deathSound = this.assetManager.audios.get('enemy_death'); // Reuse enemy death for now or player death
      if (deathSound) {
        this.audios.set('death', this.assetManager.cloneAudio(deathSound));
        this.mesh.add(this.audios.get('death')!);
      }
    }
  }

  /**
   * Setup weapon system for third-person weapon display
   */
  private setupWeaponSystem(): void {
    if (!this.model) return;

    // Find the right hand bone for weapon attachment
    this.model.traverse((child: THREE.Object3D) => {
      if ((child as any).isBone) {
        const boneName = child.name.toLowerCase();
        // Look for right hand bone (weapon hand) - prioritize actual hand bone
        if (boneName.includes('righthand') && !boneName.includes('thumb') && !boneName.includes('index') &&
          !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
          this.handBone = child;
        }
        // Generic hand bone patterns
        if (!this.handBone && (boneName.includes('hand') && boneName.includes('right') ||
          boneName.includes('r_hand') ||
          boneName.includes('hand_r') ||
          boneName.includes('rhand'))) {
          this.handBone = child;
        }
      }
    });

    // Create a virtual camera for weapon system (needed for initialization)
    const virtualCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

    // Create weapon system
    this.weaponSystem = new PlayerWeaponSystem(
      this.scene,
      virtualCamera,
      this.assetManager,
      null as any // No audio manager needed for remote players
    );

    // Configure for third-person mode
    if (this.handBone) {
      this.weaponSystem.setThirdPersonMode(this.handBone);
    } else if (this.model) {
      // Fallback: create weapon mount point
      const weaponMount = new THREE.Object3D();
      weaponMount.name = 'weapon_mount';
      weaponMount.position.set(15, 75, 10); // Position at right side (scaled for 0.02 model)
      this.model.add(weaponMount);
      this.weaponSystem.setThirdPersonMode(weaponMount);
    }

    // Start with default weapon (AK47)
    this.switchWeapon(WeaponType.AK47);
  }

  /**
   * Show muzzle flash when this player shoots
   */
  public showMuzzleFlash(): void {
    if (this.weaponSystem) {
      this.weaponSystem.showMuzzleFlash();
      // Play weapon fire sound at 3D position
      this.playWeaponSound();
      // Play shooting animation
      this.playShootAnimation();
    }
  }

  /**
   * Play shooting animation
   */
  private playShootAnimation(): void {
    const shootAction = this.actions.get('amy_shoot_idle');

    if (shootAction && this.mixer) {
      // Don't interrupt death animations
      if (this.isDead) return;

      // Set shooting flag to prevent idle/forward from overriding
      this.isShooting = true;
      const duration = shootAction.getClip().duration;
      this.shootAnimEndTime = performance.now() + (duration * 1000 * 0.6);

      // Fade out current action and play shoot
      if (this.activeAction && this.activeAction !== shootAction) {
        this.activeAction.fadeOut(0.1);
      }

      // Play shoot animation once
      shootAction.reset();
      shootAction.setLoop(THREE.LoopOnce, 1);
      shootAction.clampWhenFinished = false;
      shootAction.setEffectiveWeight(1);
      shootAction.fadeIn(0.05).play();
      this.activeAction = shootAction;

      // Clear shooting flag after animation
      setTimeout(() => {
        this.isShooting = false;
        if (!this.isDead) {
          shootAction.fadeOut(0.15);
        }
      }, duration * 1000 * 0.6);
    }
  }

  /**
   * Play weapon fire sound at this player's position
   */
  private playWeaponSound(): void {
    const world = (window as any).world;
    if (!world?.combat?.audioManager) return;

    const config = WEAPON_CONFIG[this.currentWeapon];
    if (config?.audio?.fire) {
      // Play 3D sound for correct spatialization
      world.combat.audioManager.playPositionalSound(config.audio.fire, this.mesh.position, 'sfx', {
        volume: 0.6,
        refDistance: 5,
        maxDistance: 60
      });
    }
  }

  /**
   * Play reload animation and sound
   */
  public playReload(weaponType: string): void {
    const world = (window as any).world;
    if (!world?.combat?.audioManager) return;

    const config = WEAPON_CONFIG[weaponType as WeaponType] || WEAPON_CONFIG[this.currentWeapon];
    if (config?.audio?.reload) {
      world.combat.audioManager.playPositionalSound(config.audio.reload, this.mesh.position, 'sfx', {
        volume: 0.5,
        refDistance: 3,
        maxDistance: 40
      });
    }
  }

  /**
   * Switch to a different weapon
   */
  public switchWeapon(weapon: WeaponType | number): void {
    if (!this.weaponSystem) {
      console.warn(`[RemotePlayer] ${this.id} switchWeapon called but no weaponSystem!`);
      return;
    }

    // Convert string enum to index if needed
    let weaponIndex: number;
    if (typeof weapon === 'string') {
      const weapons = Object.values(WeaponType);
      weaponIndex = weapons.indexOf(weapon);
      if (weaponIndex === -1) {
        console.warn(`[RemotePlayer] ${this.id} Unknown weapon: ${weapon}`);
        weaponIndex = 0;
      }
      this.currentWeapon = weapon as WeaponType;
    } else {
      weaponIndex = weapon;
      const weapons = Object.values(WeaponType);
      this.currentWeapon = weapons[weaponIndex] || WeaponType.AK47;
    }

    this.weaponSystem.switchWeapon(weaponIndex);
  }

  private createFallbackMesh(): void {
    // Original capsule code as fallback
    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.2, 8, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.9;
    this.mesh.add(bodyMesh);
  }

  /**
   * Create or update name label with health bar
   */
  private updateNameLabel(): void {
    if (!this.nameLabelSprite) {
      const material = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(document.createElement('canvas')),
        transparent: true,
        depthTest: true,
        depthWrite: false
      });

      this.nameLabelSprite = new THREE.Sprite(material);
      this.nameLabelSprite.position.y = 3.0;
      this.nameLabelSprite.scale.set(1.5, 0.375, 1);
      this.mesh.add(this.nameLabelSprite);
    }

    const canvas = this.nameLabelSprite.material.map!.image as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;

    if (canvas.width !== 512) {
      canvas.width = 512;
      canvas.height = 128;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    // Health percent
    const healthPercent = Math.max(0, Math.min(1, this.health / this.maxHealth));

    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    const radius = 16;
    const w = canvas.width;
    const h = canvas.height;

    context.beginPath();
    context.roundRect(0, 0, w, h, radius);
    context.fill();

    // Health Bar BG
    const barHeight = 12;
    const barY = h - barHeight - 10;
    const barMargin = 20;
    const barWidth = w - (barMargin * 2);

    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(barMargin, barY, barWidth, barHeight);

    // Health Bar FG
    if (healthPercent > 0) {
      const gradient = context.createLinearGradient(barMargin, 0, barMargin + barWidth, 0);
      gradient.addColorStop(0, '#ff3333');
      gradient.addColorStop(0.5, '#ffff33');
      gradient.addColorStop(1, '#33ff33');

      // Use gradient for fill
      context.fillStyle = gradient; // Changed to gradient for cooler look

      context.beginPath();
      context.roundRect(barMargin, barY, barWidth * healthPercent, barHeight, 4);
      context.fill();
    }

    // Text
    context.font = 'bold 56px "Segoe UI", Arial, sans-serif';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    context.shadowColor = 'rgba(0,0,0,0.8)';
    context.shadowBlur = 6;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;

    context.fillText(this.username, w / 2, (h / 2) - 5);

    this.nameLabelSprite.material.map!.needsUpdate = true;
  }

  /**
   * Update player state from network & blending animations
   */
  public updateState(
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number },
    isSprinting: boolean,
    isGrounded: boolean
  ): void {
    // Add to state buffer for interpolation
    this.stateBuffer.push({
      userId: this.id,
      position,
      rotation,
      isSprinting,
      isGrounded,
      timestamp: Date.now(),
    });

    // Keep buffer size manageable
    while (this.stateBuffer.length > 10) {
      this.stateBuffer.shift();
    }
  }

  /**
   * Update mesh each frame (interpolation + animation)
   */
  public update(delta: number): void {
    // Always update mixer for animations (including death anim)
    if (this.mixer) this.mixer.update(delta);

    // Update weapon effects (muzzle flash fade, smoke particles)
    if (this.weaponSystem) {
      this.weaponSystem.updateEffects(delta);
    }

    // Don't update position/movement when dead
    if (this.isDead) return;

    // --- Interpolation Logic ---
    const renderTime = Date.now() - this.interpolationDelay;
    let state1: NetworkPlayerState | null = null;
    let state2: NetworkPlayerState | null = null;

    for (let i = 0; i < this.stateBuffer.length - 1; i++) {
      if (this.stateBuffer[i].timestamp <= renderTime &&
        this.stateBuffer[i + 1].timestamp >= renderTime) {
        state1 = this.stateBuffer[i];
        state2 = this.stateBuffer[i + 1];
        break;
      }
    }

    let isMoving = false;

    if (state1 && state2) {
      const timeDiff = state2.timestamp - state1.timestamp;
      const t = timeDiff > 0 ? (renderTime - state1.timestamp) / timeDiff : 0;

      this.targetPosition.set(
        state1.position.x + (state2.position.x - state1.position.x) * t,
        state1.position.y + (state2.position.y - state1.position.y) * t,
        state1.position.z + (state2.position.z - state1.position.z) * t
      );

      this.targetRotation.set(
        state1.rotation.x + (state2.rotation.x - state1.rotation.x) * t,
        state1.rotation.y + (state2.rotation.y - state1.rotation.y) * t,
        0
      );

      // Calculate velocity for animation
      const dist = state1.position.x !== state2.position.x || state1.position.z !== state2.position.z;
      isMoving = dist;

    } else if (this.stateBuffer.length > 0) {
      const latest = this.stateBuffer[this.stateBuffer.length - 1];
      this.targetPosition.set(latest.position.x, latest.position.y, latest.position.z);
      this.targetRotation.set(latest.rotation.x, latest.rotation.y, 0);
    }

    const smoothing = 1 - Math.pow(0.001, delta);
    this.currentPosition.lerp(this.targetPosition, smoothing);

    this.mesh.position.copy(this.currentPosition);
    this.mesh.rotation.y = this.targetRotation.y;

    // Animation State Machine - Don't override shooting animation
    if (!this.isShooting) {
      if (isMoving) {
        this.playAction('amy_forward', 0.2); // Walk/Run
      } else {
        this.playAction('amy_idle', 0.2);
      }
    }
  }

  private playAction(name: string, fadeDuration: number = 0.2): void {
    if (!this.mixer) return;
    // Don't interrupt death animation
    if (this.isDead) return;

    const action = this.actions.get(name);
    if (!action) return;

    if (this.activeAction !== action) {
      if (this.activeAction) {
        this.activeAction.fadeOut(fadeDuration);
      }
      // Ensure action is properly enabled and has full weight
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.reset().fadeIn(fadeDuration).play();
      this.activeAction = action;
    }
  }

  public setTeam(team: string): void {
    this.team = team;
    // Optional: Outline or nametag color change
    // Since we use a texture model, we can't easily change body color like before
    // properly without changing materials or using uniforms
  }

  // CombatManager compatibility
  public handleMessage(telegram: any): boolean {
    if (telegram.message === 'HIT' || telegram.message === 'MESSAGE_HIT') {
      // Visual feedback handled by NetworkManager -> takeDamage now
      return true;
    }
    return false;
  }

  public takeDamage(damage: number): void {
    const oldHealth = this.health;
    this.health = Math.max(0, this.health - damage);

    if (this.nameLabelSprite && this.nameLabelSprite.visible) {
      this.updateNameLabel();
    }

    // Play random impact sound
    const rand = 1 + Math.floor(Math.random() * 7);
    const sound = this.audios.get(`impact${rand}`);
    if (sound && !sound.isPlaying) {
      sound.play();
    }

    // Play hit animation
    if (!this.isDead) { // Only play hit if not already dead
      if (this.health <= 0) {
        this.die();
      } else if (this.actions.has('amy_hit_front')) {
        const hitAnim = this.actions.get('amy_hit_front');
        if (hitAnim) {
          hitAnim.reset().setLoop(THREE.LoopOnce, 1).play();
        }
      }
    }

    // TODO: Add visual flash red if possible
  }

  public die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.status = 13; // STATUS_DYING if Yuka or custom constant

    // Hide weapon when dead
    if (this.weaponSystem) {
      this.weaponSystem.setVisible(false);
    }

    // CRITICAL: Stop ALL animations before playing death to prevent blending issues
    // This ensures the death animation plays at full weight without interference
    this.stopAllAnimations();

    // Play death animation (randomly select from available death animations)
    const deathAnimIndex = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
    let deathAnim = this.actions.get(`amy_death${deathAnimIndex}`);

    // Fallback: try other death animations if selected one doesn't exist
    if (!deathAnim) {
      for (let i = 1; i <= 3; i++) {
        deathAnim = this.actions.get(`amy_death${i}`);
        if (deathAnim) break;
      }
    }

    if (deathAnim) {
      deathAnim.reset();
      deathAnim.setLoop(THREE.LoopOnce, 1);
      deathAnim.clampWhenFinished = true; // CRITICAL: Hold final pose
      deathAnim.setEffectiveTimeScale(1); // Ensure normal speed
      deathAnim.setEffectiveWeight(1); // Full weight
      deathAnim.enabled = true;
      deathAnim.play();
      this.activeAction = deathAnim;
    } else {
      console.warn(`[RemotePlayer] ${this.id} NO death animation found!`);
    }

    // Play sound
    const deathSound = this.audios.get('death');
    if (deathSound && !deathSound.isPlaying) deathSound.play();
  }

  /**
   * Stop all animations to ensure clean state before playing new animation
   */
  private stopAllAnimations(): void {
    for (const action of this.actions.values()) {
      action.stop();
      action.enabled = false;
      action.time = 0;
      action.setEffectiveWeight(0);
    }
  }

  public respawn(position?: THREE.Vector3 | YukaVector3): void {
    const oldHealth = this.health;
    const wasAlreadyDead = this.isDead;

    // Force stop all animations immediately
    this.stopAllAnimations();

    this.isDead = false;
    this.status = 12; // STATUS_ALIVE
    this.stateBuffer = [];
    this.health = this.maxHealth;

    if (position) {
      const x = position.x;
      const y = position.y;
      const z = position.z;
      this.currentPosition.set(x, y, z);
      this.targetPosition.set(x, y, z);
      this.mesh.position.set(x, y, z);
      // Also reset rotation to prevent weird spawn angles
      this.mesh.rotation.y = 0;
      this.targetRotation.set(0, 0, 0);
    }

    // Clear active action so playAction will start fresh
    this.activeAction = null;

    // Reset animation to idle - force play with proper weight
    const idleAction = this.actions.get('amy_idle');
    if (idleAction) {
      idleAction.enabled = true;
      idleAction.setEffectiveWeight(1);
      idleAction.reset().play();
      this.activeAction = idleAction;
    }

    // Show weapon again after respawn
    if (this.weaponSystem) {
      this.weaponSystem.setVisible(true);
    }
  }

  public destroy(): void {
    this.scene.remove(this.mesh);
    // Cleanup mixer
    if (this.mixer) this.mixer.stopAllAction();
    if (this.nameLabelSprite) {
      (this.nameLabelSprite.material as THREE.Material).dispose();
    }
  }
}
