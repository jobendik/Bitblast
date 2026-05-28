// Remote Bot Entity
// Represents server-controlled AI bots in multiplayer
// Bots are simulated on the server and their state is broadcast to all clients

import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PlayerWeaponSystem } from '../systems/PlayerWeaponSystem';
import { WeaponType } from '../types/weapons';
import { WEAPON_CONFIG } from '../config/weaponConfigs';
import { PLAYER_CONFIG } from '../config/gameConfig';

/**
 * Server bot state received from network
 */
export interface ServerBotState {
  id: string;
  oderId: string;
  username: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  health: number;
  isAlive: boolean;
  animation: string;
  weaponType?: string | number; // Added to sync weapon state
}

/**
 * Remote Bot - Represents a server-controlled AI bot
 * No local AI logic - just renders at server-provided positions
 */
export class RemoteBot {
  public readonly id: string;
  public username: string;
  public team: string = '';
  public isDead: boolean = false;
  public isBot: boolean = true;

  // Compatibility with game systems
  public get uuid(): string { return this.id; }
  public get name(): string { return this.username; }
  public set name(value: string) { this.username = value; }
  public get position(): THREE.Vector3 { return this.mesh.position; }

  // Health for combat detection
  public health: number = PLAYER_CONFIG.maxHealth;
  public maxHealth: number = PLAYER_CONFIG.maxHealth;
  public status: number = 12; // STATUS_ALIVE

  private mesh: THREE.Group;
  private scene: THREE.Scene;
  private assetManager: any;

  // Interpolation for smooth movement
  private targetPosition: THREE.Vector3;
  private targetRotation: THREE.Euler;
  private interpolationSpeed: number = 12;

  // Visual components
  private model: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private activeAction: THREE.AnimationAction | null = null;
  private nameLabelSprite: THREE.Sprite | null = null;

  // Weapon system
  private weaponSystem: PlayerWeaponSystem | null = null;
  public botCamera: THREE.Camera | null = null; // Exposed for World.ts to use
  private handBone: THREE.Object3D | null = null;
  public currentWeapon: WeaponType = WeaponType.AK47;

  // Audio
  public audios: Map<string, THREE.PositionalAudio> = new Map();

  constructor(scene: THREE.Scene, assetManager: any, id: string, username: string) {
    this.scene = scene;
    this.assetManager = assetManager;
    this.id = id;
    this.username = username;

    // Initialize positions
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();

    // Create container
    this.mesh = new THREE.Group();
    this.mesh.name = `RemoteBot_${id}`;
    this.mesh.userData.entity = this;
    this.mesh.userData.isBot = true;

    // Load character model
    this.loadCharacter();

    // Create floating name label
    this.updateNameLabel();

    // Add to scene
    this.scene.add(this.mesh);
  }

  private loadCharacter(): void {
    // Randomly choose between amy and granny
    const modelType = Math.random() > 0.5 ? 'amy' : 'granny';
    const originalModel = this.assetManager.models.get(modelType);

    if (originalModel) {
      this.model = clone(originalModel) as THREE.Group;
      this.model.scale.set(0.02, 0.02, 0.02);
      this.model.matrixAutoUpdate = true;
      this.model.traverse((child: THREE.Object3D) => {
        child.matrixAutoUpdate = true;
        child.userData.entity = this;
      });
      this.model.rotation.y = 0;
      // Model origin is at feet - no Y offset needed

      // Create animation mixer
      this.mixer = new THREE.AnimationMixer(this.model);
      this.mesh.add(this.model);

      // Setup animations
      const animations = this.assetManager.animations;
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

      // Load animations for the selected model type
      // Movement animations
      setupAction(`${modelType}_idle`);
      setupAction(`${modelType}_forward`);      // Running forward
      setupAction(`${modelType}_walk_forward`); // Walking forward
      setupAction(`${modelType}_backward`);     // Moving backward
      setupAction(`${modelType}_left`);         // Strafing left
      setupAction(`${modelType}_right`);        // Strafing right

      // Combat/state animations
      setupAction(`${modelType}_death1`, false);
      setupAction(`${modelType}_death2`, false);
      setupAction(`${modelType}_death3`, false);
      setupAction(`${modelType}_hit_front`, false);
      setupAction(`${modelType}_shoot_idle`);

      // Store model type for animation lookup
      (this as any)._modelType = modelType;

      // Start idle
      this.playAnimation('idle');

      // Setup sounds
      this.setupSounds();

      // Setup weapon
      this.setupWeaponSystem();

      // Setup Head Hitbox
      this.setupHeadHitbox();

    } else {
      console.warn(`[RemoteBot] Model not found, using fallback`);
      this.createFallbackMesh();
    }
  }

  private setupHeadHitbox(): void {
    if (!this.model) return;

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
      console.log(`[RemoteBot] Attaching Head Hitbox to ${this.username}`);
      // Create hitbox (approx 34cm world size - slightly larger target)
      // Model scale is 0.02, so 0.34 / 0.02 = 17.0
      const geometry = new THREE.BoxGeometry(17.0, 17.0, 17.0);

      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0, // DEBUG HIDDEN (was 0.5)
        depthWrite: false,
        side: THREE.DoubleSide // Ensure hits regiser from inside/backface
      });

      const hitbox = new THREE.Mesh(geometry, material);
      hitbox.name = 'HeadHitbox';

      // CRITICAL: Tags for CombatManager
      hitbox.userData.isHead = true;
      hitbox.userData.entity = this; // Link back to this RemoteBot

      // Offset (5.0 local units = 0.1 world units) -> Reduced to 1.5 to center on face
      hitbox.position.y = 1.5;

      (headBone as THREE.Object3D).add(hitbox);
    } else {
      console.warn(`[RemoteBot] No Head bone found for ${this.username}`);
    }
  }

  private createFallbackMesh(): void {
    const geometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    const capsule = new THREE.Mesh(geometry, material);
    capsule.position.y = 0.8;
    this.mesh.add(capsule);
  }

  /**
   * Create or update the name label with health bar
   */
  private updateNameLabel(): void {
    if (!this.nameLabelSprite) {
      const material = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(document.createElement('canvas')),
        transparent: true,
        depthTest: true, // Enable depth test for occlusion (hide behind walls)
        depthWrite: false
      });
      this.nameLabelSprite = new THREE.Sprite(material);
      this.nameLabelSprite.position.y = 3.0; // Moved up to valid position above head
      // Smaller scale for realism (1.5m wide)
      this.nameLabelSprite.scale.set(1.5, 0.375, 1);
      this.mesh.add(this.nameLabelSprite);
    }

    const canvas = this.nameLabelSprite.material.map!.image as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;

    // Resolution
    if (canvas.width !== 512) {
      canvas.width = 512;
      canvas.height = 128;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    // Health percentage
    const healthPercent = Math.max(0, Math.min(1, this.health / this.maxHealth));

    // --- Background ---
    context.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent black

    // Rounded rectangle path
    const radius = 16;
    const w = canvas.width;
    const h = canvas.height;

    context.beginPath();
    context.roundRect(0, 0, w, h, radius);
    context.fill();

    // --- Health Bar Background (Dark) ---
    const barHeight = 12;
    const barY = h - barHeight - 10;
    const barMargin = 20;
    const barWidth = w - (barMargin * 2);

    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(barMargin, barY, barWidth, barHeight);

    // --- Health Bar Foreground (Gradient) ---
    if (healthPercent > 0) {
      const gradient = context.createLinearGradient(barMargin, 0, barMargin + barWidth, 0);
      gradient.addColorStop(0, '#ff3333'); // Red
      gradient.addColorStop(0.5, '#ffff33'); // Yellow
      gradient.addColorStop(1, '#33ff33'); // Green

      // Simple color based on health
      let barColor = '#33ff33';
      if (healthPercent < 0.3) barColor = '#ff3333';
      else if (healthPercent < 0.6) barColor = '#ffff33';

      context.fillStyle = barColor;

      // Draw bar with width proportional to health
      context.beginPath();
      context.roundRect(barMargin, barY, barWidth * healthPercent, barHeight, 4);
      context.fill();
    }

    // --- Text ---
    context.font = 'bold 56px "Segoe UI", Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Shadow
    context.shadowColor = 'rgba(0,0,0,0.8)';
    context.shadowBlur = 6;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;

    context.fillStyle = '#ffffff';
    context.fillText(this.username, w / 2, (h / 2) - 5);

    // Update texture
    this.nameLabelSprite.material.map!.needsUpdate = true;
  }

  private setupSounds(): void {
    if (this.assetManager.audios) {
      for (let i = 1; i <= 7; i++) {
        const sound = this.assetManager.audios.get(`impact${i}`);
        if (sound) {
          this.audios.set(`impact${i}`, this.assetManager.cloneAudio(sound));
          this.mesh.add(this.audios.get(`impact${i}`)!);
        }
      }

      const deathSound = this.assetManager.audios.get('enemy_death');
      if (deathSound) {
        this.audios.set('death', this.assetManager.cloneAudio(deathSound));
        this.mesh.add(this.audios.get('death')!);
      }
    }
  }

  private setupWeaponSystem(): void {
    if (!this.model) return;

    this.model.traverse((child: THREE.Object3D) => {
      if ((child as any).isBone) {
        const boneName = child.name.toLowerCase();
        // Robust bone finding matching Bot.ts and Editor
        if (boneName.includes('righthand') && !boneName.includes('thumb') && !boneName.includes('index') &&
          !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
          this.handBone = child;
        }
        if (!this.handBone && (boneName.includes('hand') && boneName.includes('right') ||
          boneName.includes('r_hand') || boneName.includes('hand_r'))) {
          this.handBone = child;
        }
      }
    });

    // Create virtual camera and attach to head or root
    this.botCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

    // Find head bone if possible for better camera placement
    let headBone: THREE.Object3D | null = null;
    this.model.traverse((child: any) => {
      if (child.isBone && child.name.toLowerCase().includes('head')) {
        headBone = child;
      }
    });

    if (headBone) {
      (headBone as THREE.Object3D).add(this.botCamera);
      this.botCamera.position.set(0, 0, 0);
      this.botCamera.rotation.set(0, 0, 0); // Reset rotation relative to head
    } else {
      // Fallback to mesh root
      this.mesh.add(this.botCamera);
      this.botCamera.position.set(0, 1.6, 0.5); // Approximate head height
    }

    this.weaponSystem = new PlayerWeaponSystem(
      this.scene,
      this.botCamera,
      this.assetManager,
      null as any
    );

    if (this.handBone) {
      this.weaponSystem.setThirdPersonMode(this.handBone);
    } else if (this.model) {
      // Fallback: Create near chest/right shoulder
      const weaponMount = new THREE.Object3D();
      weaponMount.name = 'weapon_mount';
      weaponMount.position.set(15, 75, 10); // Check if this matches Bot.ts logic (Bot uses 0.3, HEAD*0.6, 0.2 relative to unscaled root)
      // Note: RemoteBot model is scaled 0.02.
      // If we add to model, local position 15 units = 0.3 world units.
      // Bot.ts uses 0.3 (meters? or units?).
      // Let's keep existing fallback but log a warning
      console.warn(`[RemoteBot] Hand bone not found for ${this.username}, using fallback!`);
      this.model.add(weaponMount);
      this.weaponSystem.setThirdPersonMode(weaponMount);
    }

    this.weaponSystem.switchWeapon(0);
  }

  /**
   * Update bot state from server
   */
  public updateFromServer(state: ServerBotState): void {
    this.targetPosition.set(state.position.x, state.position.y, state.position.z);
    this.targetRotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
    this.health = state.health;

    // Update name label with new health
    if (this.nameLabelSprite && this.nameLabelSprite.visible) {
      this.updateNameLabel();
    }

    // CRITICAL: Always sync status from server isAlive state for hit detection
    // CombatManager checks entity.status === 12 (STATUS_ALIVE)
    const wasAlive = this.status === 12;
    const isNowAlive = state.isAlive;

    if (wasAlive && !isNowAlive) {
      this.onDeath();
    } else if (!wasAlive && isNowAlive) {
      this.onRespawn();
    }

    // Always update status to match server state
    this.status = state.isAlive ? 12 : 13; // STATUS_ALIVE = 12, STATUS_DYING/DEAD = 13
    this.isDead = !state.isAlive;

    // Update animation based on server state
    this.playAnimation(state.animation);

    // Sync Weapon State
    if (state.weaponType !== undefined) {
      // Map legacy numeric types if necessary
      let newWeaponType = state.weaponType as WeaponType;
      if (typeof state.weaponType === 'number') {
        // Simple mapping if needed, or cast if enums match
        // Assuming direct cast or string mostly
        // 1=Pistol, 2=Shotgun, 3=AK47 etc if legacy
        if (state.weaponType === 1) newWeaponType = WeaponType.Pistol;
        if (state.weaponType === 2) newWeaponType = WeaponType.Shotgun;
        if (state.weaponType === 3) newWeaponType = WeaponType.AK47;
      }

      if (this.currentWeapon !== newWeaponType) {
        this.currentWeapon = newWeaponType;
        if (this.weaponSystem) {
          this.weaponSystem.switchWeapon(newWeaponType);
        }
      }
    }
  }

  /**
   * Play animation by name (mapped to model type)
   */
  public playAnimation(animName: string): void {
    if (!this.mixer) return;

    const modelType = (this as any)._modelType || 'amy';
    let actionName = `${modelType}_${animName}`;

    // Map generic animation names to model-specific ones
    switch (animName) {
      case 'idle':
        actionName = `${modelType}_idle`;
        break;
      case 'run':
      case 'forward':
        actionName = `${modelType}_forward`;
        break;
      case 'walk':
        actionName = `${modelType}_walk_forward`;
        break;
      case 'backward':
        actionName = `${modelType}_backward`;
        break;
      case 'left':
      case 'strafe_left':
        actionName = `${modelType}_left`;
        break;
      case 'right':
      case 'strafe_right':
        actionName = `${modelType}_right`;
        break;
      case 'death':
        // Death is handled separately in onDeath()
        actionName = `${modelType}_death1`;
        break;
      default:
        // Use as-is if already model-prefixed
        actionName = `${modelType}_${animName}`;
    }

    const action = this.actions.get(actionName);
    if (action && action !== this.activeAction) {
      if (this.activeAction) {
        this.activeAction.fadeOut(0.2);
      }
      action.reset().fadeIn(0.2).play();
      this.activeAction = action;
    }
  }

  /**
   * Handle death
   */
  private onDeath(): void {
    this.isDead = true;
    this.status = 13; // STATUS_DEAD

    // Play death animation
    const modelType = (this as any)._modelType || 'amy';
    const deathAnims = [`${modelType}_death1`, `${modelType}_death2`, `${modelType}_death3`];
    const deathAnim = deathAnims[Math.floor(Math.random() * deathAnims.length)];
    const action = this.actions.get(deathAnim);
    if (action) {
      if (this.activeAction) this.activeAction.fadeOut(0.2);
      action.reset().fadeIn(0.2).play();
      this.activeAction = action;
    }

    // Play death sound
    const deathAudio = this.audios.get('death');
    if (deathAudio && !deathAudio.isPlaying) {
      deathAudio.play();
    }

    // Hide name label
    if (this.nameLabelSprite) {
      this.nameLabelSprite.visible = false;
    }
  }

  /**
   * Handle respawn
   */
  private onRespawn(): void {
    this.isDead = false;
    this.status = 12; // STATUS_ALIVE
    this.health = this.maxHealth;

    // Reset animations
    this.playAnimation('idle');

    // Show name label
    if (this.nameLabelSprite) {
      this.nameLabelSprite.visible = true;
    }
  }

  /**
   * Handle message from CombatManager (required for hit detection)
   * This is called when the local player's raycast hits this bot
   */
  public handleMessage(telegram: any): boolean {
    if (telegram.message === 'HIT' || telegram.message === 1) { // MESSAGE_HIT = 1
      const damage = telegram.data?.damage || 0;

      // Play hit sound for immediate feedback
      const impactNum = Math.floor(Math.random() * 7) + 1;
      const impactSound = this.audios.get(`impact${impactNum}`);
      if (impactSound && !impactSound.isPlaying) {
        impactSound.play();
      }

      // Note: Actual damage is applied server-side via sendBotHit()
      // The server will update our health via bot_states broadcast
      return true;
    }
    return false;
  }

  /*
   * Shoot at a specific position (for visual effects)
   */
  public shootAt(targetPosition: THREE.Vector3): { shotFired: boolean; direction: THREE.Vector3; directions?: THREE.Vector3[] } {
    if (!this.weaponSystem || !this.botCamera) return { shotFired: false, direction: new THREE.Vector3() };

    // Update camera orientation
    this.mesh.updateMatrixWorld(true);
    this.botCamera.updateMatrixWorld(true);
    this.botCamera.lookAt(targetPosition);
    this.botCamera.updateMatrixWorld(true);

    // Trigger visual shot
    const result = this.weaponSystem.shoot(
      this.botCamera,
      true, // onGround
      false, // isSprinting
      new THREE.Vector3()
    );

    // Also play animation and sound (since PlayerWeaponSystem audioManager is null)
    this.playShootAnimation();
    this.playWeaponSound();

    return result;
  }

  /**
   * Show muzzle flash when bot shoots
   */
  public showMuzzleFlash(): void {
    // Legacy method - prefer shootAt if target is known
    // Just trigger flash without directing it
    if (this.weaponSystem) {
      this.weaponSystem.showMuzzleFlash();
      this.playWeaponSound();
      this.playShootAnimation();
    }
  }

  /**
   * Play shooting animation
   */
  private playShootAnimation(): void {
    const modelType = (this as any)._modelType || 'amy';
    const shootAction = this.actions.get(`${modelType}_shoot_idle`);

    if (shootAction && this.mixer) {
      // Don't interrupt death animations
      if (this.isDead) return;

      // Play shoot animation once, then return to previous animation
      shootAction.reset();
      shootAction.setLoop(THREE.LoopOnce, 1);
      shootAction.clampWhenFinished = false;
      shootAction.play();

      // Blend back to idle/run after shot
      const duration = shootAction.getClip().duration;
      setTimeout(() => {
        if (!this.isDead) {
          // Let the current movement animation take over again
          shootAction.fadeOut(0.1);
        }
      }, duration * 1000 * 0.5); // Fade out halfway through
    }
  }

  private playWeaponSound(): void {
    const world = (window as any).world;
    if (!world?.combat?.audioManager) return;

    const config = WEAPON_CONFIG[this.currentWeapon];
    if (config?.audio?.fire) {
      world.combat.audioManager.playPositionalSound(config.audio.fire, this.mesh.position, 'sfx', {
        volume: 0.6,
        refDistance: 5,
        maxDistance: 60
      });
    }
  }

  /**
   * Update called each frame
   */
  public update(delta: number): void {
    // Interpolate position
    this.mesh.position.lerp(this.targetPosition, Math.min(1, this.interpolationSpeed * delta));

    // Interpolate rotation (Y axis only for horizontal turning)
    const currentY = this.mesh.rotation.y;
    const targetY = this.targetRotation.y;

    // Handle rotation wraparound
    let diff = targetY - currentY;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    this.mesh.rotation.y += diff * Math.min(1, this.interpolationSpeed * delta);

    // Update animation mixer
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // Update weapon effects (muzzle flash fade, smoke, etc.)
    if (this.weaponSystem) {
      this.weaponSystem.updateEffects(delta);
    }
  }

  /**
   * Set position directly (for initial spawn)
   */
  public setPosition(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z);
    this.targetPosition.set(x, y, z);
  }

  /**
   * Set rotation directly
   */
  public setRotation(x: number, y: number, z: number): void {
    this.mesh.rotation.set(x, y, z);
    this.targetRotation.set(x, y, z);
  }

  /**
   * Get the mesh for raycasting
   */
  public getMesh(): THREE.Group {
    return this.mesh;
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    // Stop all animations
    if (this.mixer) {
      this.mixer.stopAllAction();
    }

    // Weapon system doesn't have dispose, just null it out
    this.weaponSystem = null;

    // Remove from scene
    this.scene.remove(this.mesh);

    // Dispose geometry and materials
    this.mesh.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
  }
}
