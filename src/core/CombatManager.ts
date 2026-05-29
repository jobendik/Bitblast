import * as THREE from 'three';
import { AssetManager } from './AssetManager';
import { PlayerWeaponSystem } from '../systems/PlayerWeaponSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { DecalSystem, SurfaceMaterial } from '../systems/DecalSystem';
import { BulletTracerSystem } from '../systems/BulletTracerSystem';
import { ImpactSystem } from '../systems/ImpactSystem';
import { ScreenEffects } from '../systems/ScreenEffects';
import { HUDManager } from '../ui/HUDManager';
import { KillfeedManager } from '../ui/KillfeedManager';

import { AudioManager } from '../managers/AudioManager';
import { MESSAGE_HIT } from './Constants';
import { WEAPON_TYPES_BLASTER, WEAPON_TYPES_SHOTGUN, WEAPON_TYPES_ASSAULT_RIFLE } from './Constants';

// Helper function to get weapon name from weapon type
export function getWeaponName(weapon: any): string {
  if (!weapon) {
    return 'Unknown';
  }

  // Check if weapon has a type property
  if (weapon.type !== undefined && weapon.type !== null) {
    switch (weapon.type) {
      case WEAPON_TYPES_BLASTER: return 'Blaster';
      case WEAPON_TYPES_SHOTGUN: return 'Shotgun';
      case WEAPON_TYPES_ASSAULT_RIFLE: return 'Assault Rifle';
      default:
        return 'Unknown';
    }
  }

  // Fallback to toString if available
  if (weapon.toString && typeof weapon.toString === 'function') {
    try {
      const result = weapon.toString();
      if (result && result !== '[object Object]') return result;
    } catch (e) {
    }
  }

  return 'Unknown';
}

/**
 * Combat Manager
 * 
 * Central manager for all combat-related subsystems including weapons, particles,
 * decals, tracers, impacts, screen effects, and HUD.
 */
export class CombatManager {
  // Systems
  public weaponSystem: PlayerWeaponSystem;
  public particleSystem: ParticleSystem;
  public decalSystem: DecalSystem;
  public tracerSystem: BulletTracerSystem;
  public impactSystem: ImpactSystem;
  public screenEffects: ScreenEffects;
  public audioManager: AudioManager;

  // UI
  public hudManager: HUDManager;
  public killfeedManager: KillfeedManager;

  // Core references
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;

  // State
  private isInitialized: boolean = false;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    audioListener: THREE.AudioListener,
    assetManager: AssetManager
  ) {
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.camera = camera;

    // Initialize Audio Manager
    this.audioManager = new AudioManager(camera);

    // Initialize Systems
    this.particleSystem = new ParticleSystem(scene);
    this.decalSystem = new DecalSystem(scene);
    this.tracerSystem = new BulletTracerSystem(scene, camera);
    this.impactSystem = new ImpactSystem(scene, audioListener);
    this.screenEffects = new ScreenEffects(camera);

    // PlayerWeaponSystem depends on ParticleSystem
    this.weaponSystem = new PlayerWeaponSystem(scene, camera, assetManager, this.audioManager);

    // Initialize UI
    this.hudManager = new HUDManager();
    this.killfeedManager = new KillfeedManager();

    // Pass camera to HUD for 3D projection (damage numbers)
    this.hudManager.setCamera(this.camera);

    // Preload player sounds
    this.preloadPlayerSounds();

    // Preload enemy sounds
    this.preloadEnemySounds();

    this.isInitialized = true;
  }

  /**
   * Preload player audio files for instant playback
   */
  private preloadPlayerSounds(): void {
    const playerSounds = [
      // Footsteps
      '/assets/audio/sfx/player/Concrete-Run-1.mp3_c0954406.mp3',
      '/assets/audio/sfx/player/Concrete-Run-2.mp3_bcd23528.mp3',
      '/assets/audio/sfx/player/Concrete-Run-3.mp3_721706e6.mp3',
      '/assets/audio/sfx/player/Concrete-Run-4.mp3_4f98c76e.mp3',
      '/assets/audio/sfx/player/Concrete-Run-5.mp3_121ee958.mp3',
      '/assets/audio/sfx/player/Concrete-Run-6.mp3_a62fc298.mp3',
      // Jump/Land
      '/assets/audio/sfx/player/Jump.mp3_523dd26f.mp3',
      '/assets/audio/sfx/player/Land-1.mp3_58b9ba36.mp3',
      '/assets/audio/sfx/player/Land-2.mp3_de259dd1.mp3',
      // Grunts/Death
      '/assets/audio/sfx/player/Echo-Grunt-1.mp3_1cd206a1.mp3',
      '/assets/audio/sfx/player/Echo-Grunt-2.mp3_17321d9c.mp3',
      '/assets/audio/sfx/player/Echo-Grunt-3.mp3_31597fb1.mp3',
      '/assets/audio/sfx/player/Echo-Death-1.mp3_4264c0fa.mp3',
      // Heartbeat
      '/assets/audio/sfx/player/Heart-Beat.mp3_1e759b97.mp3'
    ];

    this.audioManager.preloadAudios(playerSounds);
  }

  /**
   * Preload enemy audio files for instant playback
   */
  private preloadEnemySounds(): void {
    const enemySounds = [
      // Kulu (male enemy) sounds
      '/assets/audio/sfx/enemy/Kulu-Death-1.mp3_d65e968a.mp3',
      '/assets/audio/sfx/enemy/Kulu-Grunt-1.mp3_ea942b67.mp3',
      '/assets/audio/sfx/enemy/Kulu-Grunt-2.mp3_8e323b62.mp3',
      '/assets/audio/sfx/enemy/Kulu-Grunt-3.mp3_5bae51a4.mp3',
      '/assets/audio/sfx/enemy/Kulu-Jump-1.mp3_3aef7e5f.mp3',
      '/assets/audio/sfx/enemy/Kulu-Jump-2.mp3_8cba70b6.mp3',
      // Female enemy sounds
      '/assets/audio/sfx/enemy/Female-Death-1.mp3_37cc105e.mp3',
      '/assets/audio/sfx/enemy/Female-Grunt-1.mp3_5f82c672.mp3',
      '/assets/audio/sfx/enemy/Female-Grunt-2.mp3_b787f958.mp3',
      '/assets/audio/sfx/enemy/Female-Grunt-3.mp3_4d6460fd.mp3',
    ];

    this.audioManager.preloadAudios(enemySounds);
  }

  /**
   * Handle shooting logic including raycasting, effects, and damage
   */
  public handleShooting(
    playerOnGround: boolean,
    playerIsSprinting: boolean,
    playerVelocity: THREE.Vector3,
    obstacles: THREE.Object3D[]
  ): void {
    const result = this.weaponSystem.shoot(
      this.camera,
      playerOnGround,
      playerIsSprinting,
      playerVelocity
    );

    if (result.shotFired) {
      const config = this.weaponSystem.currentConfig;

      // Send shoot event to network for other players to see muzzle flash/effects
      const world = (window as any).world;
      if (world?.networkManager) {
        const origin = this.camera.position.clone();
        const direction = result.direction.clone();
        const weaponType = this.weaponSystem.currentWeapon.toString();
        world.networkManager.sendShoot(origin, direction, weaponType);
      }

      // Track shot fired for statistics (once per trigger pull).
      const mode = world?.gameModeManager?.getCurrentMode?.();
      const weaponName = this.weaponSystem.currentWeapon.toString();
      const playerId = world?.player?.uuid;
      if (mode && playerId) {
        mode.onShotFired?.(playerId, weaponName);
      }

      // Apply screen effects
      // 1. Screen shake based on weapon power
      const weaponPower = config.damage / 30; // Normalize damage to power scale
      this.screenEffects.addFireShake(weaponPower);

      // 2. FOV punch for impact feel
      this.screenEffects.addFOVPunch(1.5 * weaponPower, 0.08);

      // 3. Camera recoil (actual camera rotation)
      const recoilPitch = config.recoil.pitchAmount * 0.5; // Scale down for camera
      const recoilYaw = (Math.random() - 0.5) * config.recoil.yawAmount * 0.5;
      this.screenEffects.applyRecoil(recoilPitch, recoilYaw);
      this.screenEffects.setRecoilRecoveryRate(config.recoil.recoveryRate);

      // Note: Muzzle flash and smoke are both handled by WeaponSystem sprites using muzzle.png and smoke.png
      // No need to spawn additional particles here

      // Process each shot (shotguns fire multiple pellets). Aggregate hits so a
      // single trigger pull counts as at most one "hit" for accuracy stats.
      const directions = result.directions || [result.direction];

      let anyHit = false;
      let totalDamage = 0;
      directions.forEach((dir: THREE.Vector3) => {
        const shot = this.processShot(dir, obstacles);
        if (shot.hit) {
          anyHit = true;
          totalDamage += shot.damage;
        }
      });

      if (anyHit && mode && playerId) {
        mode.onShotHit?.(playerId, weaponName, totalDamage);
      }

      // Update HUD
      this.updateHUD(false, playerIsSprinting, false); // Approximate state for immediate feedback
    }
  }

  /**
   * Process a shot from an enemy (AI) entity
   * @param camera The enemy's virtual camera
   * @param direction The shot direction
   * @param muzzlePosition The world position of the weapon muzzle
   * @param obstacles Objects to raycast against
   * @param shooter The enemy entity that fired the shot
   * @param damage The damage amount
   */
  public processEnemyShot(
    camera: THREE.Camera,
    direction: THREE.Vector3,
    muzzlePosition: THREE.Vector3,
    obstacles: THREE.Object3D[],
    shooter: any,
    weaponConfig: any
  ): void {
    // Raycast from enemy camera
    const rayOrigin = new THREE.Vector3();
    camera.getWorldPosition(rayOrigin);
    this.raycaster.set(rayOrigin, direction);

    const intersects = this.raycaster.intersectObjects(obstacles, true);

    let endPoint: THREE.Vector3;
    let hitObject: THREE.Object3D | null = null;

    if (intersects.length > 0) {
      const hit = intersects[0];
      endPoint = hit.point;
      hitObject = hit.object;

      // Check if hit object is an entity (player/enemy)
      let entity = hitObject.userData.entity;
      if (!entity) {
        hitObject.traverseAncestors((ancestor: any) => {
          if (!entity && ancestor.userData.entity) {
            entity = ancestor.userData.entity;
          }
        });
      }

      // Fallback heuristic for entity detection if userData is missing
      // (Fixes issue where decals appear on players/bots)
      if (!entity) {
        const name = hitObject.name.toLowerCase();
        // Check for common entity mesh names
        if (name.includes('collision') ||
          name.includes('mixamo') ||
          name.includes('remote') ||
          name.includes('player') ||
          name.includes('bot') ||
          name.includes('head') ||
          name.includes('body')) {
          // It's likely an entity part that lost its reference
          // We can't apply damage without the entity ref, but we CAN prevent the decal
        }
      }

      // Determine material
      let material = SurfaceMaterial.ROCK;

      if (hitObject.name.includes('wood') || hitObject.userData.material === 'wood') {
        material = SurfaceMaterial.WOOD;
      } else if (hitObject.name.includes('metal') || hitObject.userData.material === 'metal') {
        material = SurfaceMaterial.METAL;
      }

      // Only spawn decals on non-entity surfaces
      // Enhanced check: valid entity OR heuristic name match
      // Note: We check 'isEntity' to DECIDE on decals.
      // If we found an entity ref, it's definitely an entity.
      // If we didn't, but the name looks like an entity, we assume it is to prevent decals on players.
      const hasEntityRef = entity && typeof entity.health === 'number';
      const looksLikeEntity = hitObject.name.toLowerCase().includes('player') ||
        hitObject.name.toLowerCase().includes('bot') ||
        hitObject.name.toLowerCase().includes('mixamo') ||
        hitObject.name.toLowerCase().includes('collision');

      const isEntity = hasEntityRef || looksLikeEntity;

      if (!isEntity) {
        // Calculate reliable normal (fallback to inverse ray direction if face normal missing)
        const normal = hit.face?.normal?.clone() || direction.clone().multiplyScalar(-1).normalize();

        this.decalSystem.createDecal(hit.point, normal, material);
        this.particleSystem.spawnMaterialImpact(hit.point, normal, material);
        // Play surface impact sound at reduced volume
        this.impactSystem.playSurfaceImpact(hit.point, material);
      } else {
        // Entity Hit - Spawn blood/smoke but NO decal
        this.particleSystem.spawnBlood(hit.point);

        if (hasEntityRef) {
          // Calculate damage with falloff
          let damage = weaponConfig.damage;

          // Apply falloff if configured
          if (weaponConfig.falloff) {
            const distance = muzzlePosition.distanceTo(hit.point);
            const { startDistance, endDistance, minDamage } = weaponConfig.falloff;

            if (distance > startDistance) {
              if (distance >= endDistance) {
                damage = minDamage;
              } else {
                // Linear interpolation
                const t = (distance - startDistance) / (endDistance - startDistance);
                damage = damage * (1 - t) + minDamage * t;
              }
            }
          }

          // Symmetric headshots: if the enemy round struck a head hitbox, apply
          // the weapon's headshot multiplier (previously only the player could headshot).
          const isHeadshot = hitObject?.userData?.isHead === true;
          if (isHeadshot && typeof weaponConfig.headshotMultiplier === 'number') {
            damage *= weaponConfig.headshotMultiplier;
          }

          const telegram = {
            message: MESSAGE_HIT,
            data: {
              damage: damage,
              direction: direction,
              isHeadshot: isHeadshot,
              weapon: weaponConfig.name || 'EnemyWeapon'
            },
            sender: shooter
          };

          if (typeof entity.handleMessage === 'function') {
            entity.handleMessage(telegram);
          }

          this.impactSystem.playBodyImpact(hit.point);
          this.particleSystem.spawnImpactEffect(hit.point, false);
        }
      }
    } else {
      // Miss - extend to max range
      endPoint = camera.position.clone().add(direction.multiplyScalar(100));
    }

    // Create tracer
    this.tracerSystem.createTracer(muzzlePosition, endPoint);
  }

  private processShot(direction: THREE.Vector3, obstacles: THREE.Object3D[]): { hit: boolean; damage: number } {
    const muzzlePos = this.weaponSystem.getMuzzleWorldPosition();

    // Whether this pellet actually damaged an entity (for per-trigger-pull accuracy).
    let didHitEntity = false;
    let appliedDamage = 0;
    let hitFaceNormal: THREE.Vector3 | null = null;

    // Raycast from camera
    const rayOrigin = new THREE.Vector3();
    this.camera.getWorldPosition(rayOrigin);
    this.raycaster.set(rayOrigin, direction);

    const intersects = this.raycaster.intersectObjects(obstacles, true);

    let endPoint: THREE.Vector3;
    let hitObject: THREE.Object3D | null = null;

    if (intersects.length > 0) {
      // --- Penetration / Headshot Logic ---
      // Instead of just taking the first hit (which might be the body skin blocking the head hitbox),
      // we inspect the first few intersections to see if we "penetrated" the skin and validly hit the head.

      let finalHit = intersects[0];
      let finalEntity: any = null;
      let isHeadshot = false;

      // Scan the first few hits (e.g., top 10) to find the best entity hit
      for (const hitCandidate of intersects.slice(0, 20)) { // Increased to 20 to ensure we catch headbox inside meshes

        // Check ancestry for entity
        let candidateEntity = hitCandidate.object.userData.entity;

        // Fallback: If hitting a hitbox, check its parent for entity (common issue)
        if (!candidateEntity && hitCandidate.object.userData.isHitbox) {
          candidateEntity = hitCandidate.object.parent?.userData.entity;
        }

        if (!candidateEntity) {
          hitCandidate.object.traverseAncestors((ancestor: any) => {
            if (!candidateEntity && ancestor.userData.entity) {
              candidateEntity = ancestor.userData.entity;
            }
          });
        }

        // Stop if we hit a wall (non-entity) that is closer than any entity
        if (!candidateEntity && !hitCandidate.object.userData.isHitbox) {
          const mat = (hitCandidate.object as any).material;
          if (mat && (mat.opacity < 0.1 || mat.transparent)) continue; // Skip smoke/invisible walls
          // console.log('[CombatManager] Raycast blocked by wall:', hitCandidate.object.name);
          break; // Blocked by wall
        }

        // If we found a valid entity
        if (candidateEntity && typeof candidateEntity.health === 'number') {
          // If this is the FIRST entity we've seen, valid!
          if (!finalEntity) {
            finalEntity = candidateEntity;
            finalHit = hitCandidate;
          }

          // If this hit belongs to the SAME entity we successfully hit
          if (candidateEntity === finalEntity) {
            // Check if this specific intersection is a Head Hitbox
            if (hitCandidate.object.userData.isHead) {
              isHeadshot = true;
              break; // We found the head, upgrade to headshot and stop
            }
          } else {
            if (finalEntity) break;
          }
        }
      }

      // Restore found values to main variables
      const hit = finalHit;
      endPoint = hit.point;
      hitObject = hit.object;
      const entity = finalEntity; // This overrides the naive entity lookup below

      // Calculate damage with falloff
      let damage = this.weaponSystem.currentConfig.damage;

      // Apply falloff if configured
      const config = this.weaponSystem.currentConfig;
      if (config.falloff) {
        const distance = muzzlePos.distanceTo(hit.point);
        const { startDistance, endDistance, minDamage } = config.falloff;

        if (distance > startDistance) {
          if (distance >= endDistance) {
            damage = minDamage;
          } else {
            // Linear interpolation
            const t = (distance - startDistance) / (endDistance - startDistance);
            damage = damage * (1 - t) + minDamage * t;
          }
        }
      }

      // Apply per-weapon headshot multiplier (was a hardcoded 1000 instant-kill,
      // which made every weapon a one-shot and polluted damage stats).
      if (isHeadshot) {
        damage *= config.headshotMultiplier;
      }

      // Remember the surface normal so we don't have to re-raycast for the network.
      hitFaceNormal = hit.face?.normal ? hit.face.normal.clone() : null;

      // Apply damage via message system
      if (entity && entity.handleMessage) {
        didHitEntity = true;
        appliedDamage = damage;
        const telegram = {
          message: MESSAGE_HIT,
          data: {
            damage: damage,
            direction: direction,
            isHeadshot: isHeadshot,
            weapon: this.weaponSystem.currentWeapon.toString()
          },
          sender: { isPlayer: true, uuid: (window as any).world.player.uuid }
        };
        entity.handleMessage(telegram);

        // Show damage number
        this.hudManager.showDamageNumber(hit.point, damage, isHeadshot);

        // Show large headshot text if applicable
        if (isHeadshot) {
          this.hudManager.showHeadshotMessage();
        }

        // BITBLAST FPS FIX: Send hit to server if it's a remote player
        // We check for userId (RemotePlayer) and ensure we have the network manager
        if ((entity as any).userId && (window as any).world?.networkManager) {
          const netManager = (window as any).world.networkManager;
          if (netManager.isConnected()) {
            netManager.sendPlayerHit((entity as any).userId, damage, hit.point);
          }
        }

        // MULTIPLAYER: Send hit to server if it's a RemoteBot (server-authoritative)
        if ((entity as any).isBot && (entity as any).id && (window as any).world?.networkManager) {
          const netManager = (window as any).world.networkManager;
          if (netManager.isConnected()) {
            netManager.sendBotHit((entity as any).id, damage);
          }
        }
      }

      // Play audio feedback
      this.impactSystem.playBodyImpact(hit.point);
      this.impactSystem.playHitConfirmation(); // Instant hit sound feedback

      // Check if kill (assuming entity has health)
      if (entity && typeof entity.health === 'number') {
        const isKill = entity.health <= 0;
        this.hudManager.showHitmarker(isKill);
        this.hudManager.showHitFeedback(isKill, isHeadshot);

        // Show headshot/kill icons and play appropriate sounds
        if (isKill) {
          // Death sound is played in initDeath method
          if (isHeadshot) {
            this.hudManager.showHeadshotIcon();
          } else {
            this.hudManager.showKillIcon();
          }
        } else {
          // Play appropriate hit sound based on entity type
          if (entity.audios) {
            if (entity.name === 'Player') {
              // Player uses impact sounds
              const impactNum = Math.floor(Math.random() * 7) + 1;
              const impactSound = entity.audios.get(`impact${impactNum}`);
              if (impactSound && !impactSound.isPlaying) {
                impactSound.play();
              }
            } else if (entity.audios.has('enemy_grunt')) {
              // Enemies use grunt sound
              const gruntSound = entity.audios.get('enemy_grunt');
              if (gruntSound && !gruntSound.isPlaying) {
                gruntSound.play();
              }
            }
          }
        }
      }

      // Also spawn blood/impact effect for body hit
      this.particleSystem.spawnImpactEffect(hit.point, isHeadshot);
    } else {
      // Miss - extend to max range
      endPoint = this.camera.position.clone().add(direction.multiplyScalar(100));
    }

    // Create tracer
    this.tracerSystem.createTracer(muzzlePos, endPoint);

    // Send bullet impact to network for other players to see tracer/decals/particles
    const world = (window as any).world;
    if (world?.networkManager?.isConnected()) {
      // Reuse the normal captured during the original raycast (don't re-raycast).
      const hitNormal = hitFaceNormal || new THREE.Vector3(0, 1, 0);

      // Determine if hit was on an entity
      let wasEntityHit = false;
      if (hitObject) {
        let entity = hitObject.userData.entity;
        if (!entity) {
          hitObject.traverseAncestors((ancestor: any) => {
            if (!entity && ancestor.userData.entity) {
              entity = ancestor.userData.entity;
            }
          });
        }
        wasEntityHit = entity && typeof entity.health === 'number';
      }

      // Determine material
      let materialStr = 'rock';
      if (hitObject) {
        if (hitObject.name.includes('wood') || hitObject.userData.material === 'wood') {
          materialStr = 'wood';
        } else if (hitObject.name.includes('metal') || hitObject.userData.material === 'metal') {
          materialStr = 'metal';
        }
      }

      world.networkManager.sendBulletImpact(
        muzzlePos,
        endPoint,
        hitNormal,
        materialStr,
        wasEntityHit
      );
    }

    return { hit: didHitEntity, damage: appliedDamage };
  }

  /**
   * Spawn effects for a remote player's bullet impact
   * Called via NetworkManager callback when receiving bullet_impact events
   */
  public spawnRemoteBulletImpact(
    muzzlePos: THREE.Vector3,
    hitPos: THREE.Vector3,
    hitNormal: THREE.Vector3,
    material: string,
    hitEntity: boolean
  ): void {
    // Create tracer
    this.tracerSystem.createTracer(muzzlePos, hitPos);

    // Only spawn decals and particles on non-entity surfaces
    if (!hitEntity) {
      // Map string to SurfaceMaterial enum
      let surfaceMaterial = SurfaceMaterial.ROCK;
      if (material === 'wood') {
        surfaceMaterial = SurfaceMaterial.WOOD;
      } else if (material === 'metal') {
        surfaceMaterial = SurfaceMaterial.METAL;
      }

      // Create decal
      this.decalSystem.createDecal(hitPos, hitNormal, surfaceMaterial);

      // Spawn impact particles
      this.particleSystem.spawnMaterialImpact(hitPos, hitNormal, surfaceMaterial);

      // Play impact sound
      this.impactSystem.playSurfaceImpact(hitPos, surfaceMaterial);
    } else {
      // Body hit effects
      this.impactSystem.playBodyImpact(hitPos);
      this.particleSystem.spawnImpactEffect(hitPos, false);
    }
  }

  public update(delta: number, mouseMovement: { x: number, y: number }, isSprinting: boolean, isMoving: boolean, isAirborne: boolean, headBobTime: number = 0): void {
    if (!this.isInitialized) return;

    // Update all systems
    this.weaponSystem.update(delta, mouseMovement, isSprinting, isMoving, isAirborne, headBobTime);
    this.particleSystem.update(delta);
    this.decalSystem.update(delta);
    this.tracerSystem.update(delta);
    this.screenEffects.update(delta);

    // Update HUD (animations, damage numbers)
    this.hudManager.update(delta);

    // Update HUD with weapon state
    this.updateHUD(isMoving, isSprinting, isAirborne);
  }



  private updateHUD(isMoving: boolean = false, isSprinting: boolean = false, isAirborne: boolean = false): void {
    this.hudManager.updateAmmo(
      this.weaponSystem.currentMag,
      this.weaponSystem.reserveAmmo
    );

    // Update crosshair spread based on weapon state
    const spread = this.weaponSystem.getCurrentSpread();
    this.hudManager.updateCrosshair(spread, isMoving, isSprinting, isAirborne, this.weaponSystem.currentWeapon); // Scale for visual effect
  }

  public resize(_width: number, _height: number): void {
    // Handle resize events if necessary
  }

  public dispose(): void {
    this.decalSystem.clear();
    this.tracerSystem.clear();
    this.particleSystem.clear();
    this.screenEffects.reset();
    // Dispose other resources
  }

  /**
   * Apply damage effects when player takes damage
   * @param damageAmount Amount of damage taken
   * @param maxHealth Player's max health
   * @param directionAngle Optional angle to attacker in degrees
   * @param postProcessing Optional post-processing system for vignette pulse
   */
  public applyDamageEffects(damageAmount: number, maxHealth: number, directionAngle?: number, postProcessing?: any): void {
    // Screen shake based on damage
    const damagePercent = damageAmount / maxHealth;
    this.screenEffects.addDamageShake(damagePercent);

    // HUD vignette effect
    this.hudManager.showDamageVignette(damageAmount, maxHealth, directionAngle);

    // Post-processing vignette pulse for extra impact
    if (postProcessing) {
      const intensity = 0.5 + damagePercent * 0.3; // 0.5 to 0.8 based on damage
      postProcessing.pulseVignette(intensity, 0.4);
    }

    // Directional damage indicator
    if (directionAngle !== undefined) {
      this.hudManager.flashDamage(directionAngle);
    }
  }

  /**
   * Get current camera recoil for applying to player head rotation
   */
  public getCameraRecoil(): { pitch: number; yaw: number } {
    return this.screenEffects.getRecoil();
  }

  /**
   * Get screen shake offset to apply to camera position
   */
  public getShakeOffset(): THREE.Vector3 {
    return this.screenEffects.getShakeOffset();
  }

  // Future enemy audio methods - uncomment when enemy audio system is implemented
  /*
  private playEnemyDeathSound(position: THREE.Vector3): void {
    const deathPath = '/assets/audio/sfx/enemy/Kulu-Death-1.mp3_d65e968a.mp3';
    this.audioManager.playPositionalSound(deathPath, position, 'sfx', {
      volume: 1.5,
      refDistance: 12,
      maxDistance: 80
    });
  }

  private playEnemyGruntSound(position: THREE.Vector3): void {
    const gruntNum = Math.floor(Math.random() * 3) + 1;
    const hashes: { [key: number]: string } = {
      1: 'ea942b67',
      2: '8e323b62',
      3: '5bae51a4'
    };
    const gruntPath = `/assets/audio/sfx/enemy/Kulu-Grunt-${gruntNum}.mp3_${hashes[gruntNum]}.mp3`;
    this.audioManager.playPositionalSound(gruntPath, position, 'sfx', {
      volume: 1.3,
      refDistance: 10,
      maxDistance: 60
    });
  }
  */
}
