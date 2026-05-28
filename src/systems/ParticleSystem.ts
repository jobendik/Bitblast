// Particle System
// Handles bullet impacts, muzzle smoke, explosions, debris, shell casings

import * as THREE from 'three';

class ParticlePool {
  private pool: THREE.Object3D[] = [];
  private createFn: () => THREE.Object3D;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, createFn: () => THREE.Object3D, initialSize: number = 20) {
    this.scene = scene;
    this.createFn = createFn;
    for (let i = 0; i < initialSize; i++) {
      const obj = createFn();
      obj.visible = false;
      this.scene.add(obj);
      this.pool.push(obj);
    }
  }

  public get(): THREE.Object3D {
    let obj: THREE.Object3D;
    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
    } else {
      obj = this.createFn();
      this.scene.add(obj);
    }
    obj.visible = true;
    return obj;
  }

  public release(obj: THREE.Object3D): void {
    obj.visible = false;
    this.pool.push(obj);
  }
}

export interface Particle {
  mesh: THREE.Mesh | THREE.Sprite;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  initialScale?: number;
  gravity?: number;
}

interface Shell {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotationalVelocity: THREE.Vector3;
  lifetime: number;
  onHit?: (pos: THREE.Vector3) => void;
  hasHit: boolean;
  groundLevel: number; // Y coordinate of the ground where shell should land
  bounceCount: number; // Track number of bounces for sound variation
  settled: boolean; // Whether the shell has come to rest on the ground
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private shells: Shell[] = [];
  private scene: THREE.Scene;

  // Callback for shell bounce sounds
  private onShellBounce?: (position: THREE.Vector3, bounceNumber: number) => void;

  // Pools
  private spherePool: ParticlePool;
  private cubePool: ParticlePool;
  private shellPool: ParticlePool;
  private smokePool: ParticlePool;
  private sparkPool: ParticlePool;
  private shockwavePool: ParticlePool;
  private impactSpritePool: ParticlePool; // Pre-compiled impact sprites

  private hitImpactTexture?: THREE.Texture;
  private hitSpriteLowTexture?: THREE.Texture;
  private fireSmokeTexture?: THREE.Texture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Initialize pools
    this.spherePool = new ParticlePool(scene, () => {
      return new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
    }, 100);

    this.cubePool = new ParticlePool(scene, () => {
      return new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, 0.03),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
    }, 50);

    this.shellPool = new ParticlePool(scene, () => {
      // Shell casing - brass colored cylinder, larger for visibility
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.006, 0.04, 8), // Larger, tapered brass casing
        new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          metalness: 0.85,
          roughness: 0.15,
          emissive: 0xd4af37,
          emissiveIntensity: 0.15 // Slight glow for visibility
        })
      );
      mesh.castShadow = true;
      return mesh;
    }, 50);

    this.smokePool = new ParticlePool(scene, () => {
      const material = new THREE.SpriteMaterial({
        color: 0x666666, // Darker grey for "dirty" smoke
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      return new THREE.Sprite(material);
    }, 50);

    this.sparkPool = new ParticlePool(scene, () => {
      return new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.2),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
      );
    }, 50);

    this.shockwavePool = new ParticlePool(scene, () => {
      return new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.1, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 })
      );
    }, 10);

    // Pre-compiled impact sprite pool (prevents shader compilation during gameplay)
    this.impactSpritePool = new ParticlePool(scene, () => {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      return new THREE.Sprite(material);
    }, 30);

    this.loadTextures();
  }

  private loadTextures(): void {
    const textureLoader = new THREE.TextureLoader();

    textureLoader.load(
      'assets/textures/effects/muzzle.png', // Reuse muzzle flash for high energy impacts
      (texture) => { this.hitImpactTexture = texture; },
      undefined,
      () => { console.warn('Failed to load hit-impact texture'); }
    );

    textureLoader.load(
      'assets/textures/effects/smoke.png', // Use smoke for debris/dust for now
      (texture) => { this.hitSpriteLowTexture = texture; },
      undefined,
      () => { console.warn('Failed to load hit-sprite texture'); }
    );

    textureLoader.load(
      'assets/textures/effects/smoke.png',
      (texture) => { this.fireSmokeTexture = texture; },
      undefined,
      () => { console.warn('Failed to load smoke texture'); }
    );
  }

  /**
   * Spawn basic particle burst - simple geometric particles
   */
  public spawn(position: THREE.Vector3, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const particle = this.spherePool.get() as THREE.Mesh;
      (particle.material as THREE.MeshBasicMaterial).color.setHex(color);
      (particle.material as THREE.MeshBasicMaterial).opacity = 1;
      (particle.material as THREE.MeshBasicMaterial).transparent = false;

      particle.position.copy(position);
      particle.scale.set(1, 1, 1);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 5,
        (Math.random() - 0.5) * 5
      );

      this.particles.push({
        mesh: particle,
        velocity,
        lifetime: 0,
        maxLifetime: 0.5 + Math.random() * 0.5,
      });
    }
  }

  /**
   * Spawn blood particles on enemy hit
   */
  public spawnBlood(position: THREE.Vector3): void {
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const particle = this.cubePool.get() as THREE.Mesh;
      (particle.material as THREE.MeshBasicMaterial).color.setHex(0xaa0000);
      (particle.material as THREE.MeshBasicMaterial).opacity = 1;

      particle.position.copy(position);
      particle.scale.set(0.7, 0.7, 0.7);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      );

      this.particles.push({
        mesh: particle,
        velocity,
        lifetime: 0,
        maxLifetime: 0.4 + Math.random() * 0.4,
        gravity: 9.8
      });
    }
  }

  /**
   * Spawn explosive sprite-based impact effect
   * Uses pre-compiled sprite pool to avoid runtime shader compilation (prevents flickering)
   */
  public spawnImpactEffect(position: THREE.Vector3, isKill: boolean = false): void {
    this.spawnBlood(position);

    const texture = isKill ? this.hitImpactTexture : this.hitSpriteLowTexture;
    if (!texture) {
      this.spawn(position, isKill ? 0xffff00 : 0xff8800, isKill ? 15 : 8);
      return;
    }

    const spriteCount = isKill ? 3 : 2;
    for (let i = 0; i < spriteCount; i++) {
      // Get pre-compiled sprite from pool instead of creating new material
      const sprite = this.impactSpritePool.get() as THREE.Sprite;
      const spriteMaterial = sprite.material as THREE.SpriteMaterial;

      // Update existing material properties (no new material creation)
      spriteMaterial.map = texture;
      spriteMaterial.color.setHex(isKill ? 0xffff00 : 0xff4400);
      spriteMaterial.opacity = 1;
      spriteMaterial.needsUpdate = true;

      const baseScale = isKill ? 0.8 : 0.5;
      const scale = baseScale + i * 0.2;
      sprite.scale.set(scale, scale, scale);
      sprite.position.copy(position);

      this.particles.push({
        mesh: sprite,
        velocity: new THREE.Vector3(0, 0, 0),
        lifetime: 0,
        maxLifetime: isKill ? 0.3 : 0.2,
        initialScale: scale,
      });
    }
  }

  /**
   * Spawn material-based impact effects (metal sparks, wood splinters, concrete dust)
   */
  public spawnMaterialImpact(position: THREE.Vector3, normal: THREE.Vector3, material: string): void {
    switch (material) {
      case 'metal':
        this.spawnSparks(position, normal);
        this.spawnDebris(position, normal, 0xcccccc, 3);
        break;
      case 'wood':
        this.spawnDust(position, normal, 0x5d4037, 0.5); // Dark brown dust
        this.spawnDust(position, normal, 0x4e342e, 0.5);
        break;
      case 'concrete':
      case 'stone':
      case 'rock':
        this.spawnDebris(position, normal, 0x888888, 5);
        this.spawnDust(position, normal, 0x555555, 0.8); // Dark grey dust
        break;
      case 'dirt':
      case 'grass':
        this.spawnDebris(position, normal, 0x5d4037, 4);
        this.spawnDust(position, normal, 0x5d4037, 0.6);
        break;
      default:
        this.spawnDebris(position, normal, 0x888888, 4);
        this.spawnDust(position, normal, 0x666666, 0.4); // Dark grey defaults
    }
  }

  private spawnSparks(position: THREE.Vector3, normal: THREE.Vector3): void {
    const count = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const spark = this.sparkPool.get() as THREE.Mesh;
      (spark.material as THREE.MeshBasicMaterial).opacity = 1;

      spark.position.copy(position);

      const velocity = normal.clone().multiplyScalar(5 + Math.random() * 5);
      velocity.x += (Math.random() - 0.5) * 4;
      velocity.y += (Math.random() - 0.5) * 4;
      velocity.z += (Math.random() - 0.5) * 4;

      spark.lookAt(position.clone().add(velocity));

      this.particles.push({
        mesh: spark,
        velocity,
        lifetime: 0,
        maxLifetime: 0.1 + Math.random() * 0.2,
        gravity: 5
      });
    }
  }

  private spawnDust(position: THREE.Vector3, normal: THREE.Vector3, color: number, opacity: number): void {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const dust = this.smokePool.get() as THREE.Sprite;
      const material = dust.material;

      if (this.fireSmokeTexture && !material.map) {
        material.map = this.fireSmokeTexture;
      }

      material.color.setHex(color);
      material.opacity = opacity * (0.2 + Math.random() * 0.2);
      material.rotation = Math.random() * Math.PI * 2;

      const scale = 0.3 + Math.random() * 0.3;
      dust.scale.set(scale, scale, 1);
      dust.position.copy(position);

      const velocity = normal.clone().multiplyScalar(0.5 + Math.random() * 1.0);
      velocity.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      ));

      this.particles.push({
        mesh: dust,
        velocity,
        lifetime: 0,
        maxLifetime: 0.5 + Math.random() * 0.5,
        initialScale: scale,
        gravity: -0.2
      });
    }
  }

  /**
   * Spawn surface impact debris
   */
  public spawnDebris(position: THREE.Vector3, normal: THREE.Vector3, color: number, count: number = 5): void {
    for (let i = 0; i < count; i++) {
      const particle = this.cubePool.get() as THREE.Mesh;
      (particle.material as THREE.MeshBasicMaterial).color.setHex(color);
      (particle.material as THREE.MeshBasicMaterial).opacity = 1;

      particle.position.copy(position);
      particle.scale.set(1, 1, 1);

      const velocity = normal.clone().multiplyScalar(2 + Math.random() * 3);
      velocity.x += (Math.random() - 0.5) * 2;
      velocity.y += (Math.random() - 0.5) * 2;
      velocity.z += (Math.random() - 0.5) * 2;

      this.particles.push({
        mesh: particle,
        velocity,
        lifetime: 0,
        maxLifetime: 0.4 + Math.random() * 0.3,
        gravity: 9.8
      });
    }
  }

  /**
   * Spawn shell casing ejection
   * @param position World position to spawn shell
   * @param direction Ejection direction
   * @param groundLevel Y coordinate of the ground (player feet position)
   * @param onHit Optional callback when shell hits ground
   */
  public spawnShellCasing(position: THREE.Vector3, direction: THREE.Vector3, groundLevel: number = 0, onHit?: (pos: THREE.Vector3) => void): void {
    const mesh = this.shellPool.get() as THREE.Mesh;

    // Reset material opacity (may have been faded from previous use)
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.opacity = 1.0;
    material.transparent = false;

    mesh.position.copy(position);
    // Initial rotation - orient cylinder with some randomness
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    // Ejection velocity - direction with added upward component
    const speed = 2.5 + Math.random() * 1.5;
    const velocity = direction.clone().multiplyScalar(speed);

    // Add upward velocity for arc
    velocity.y += 1.5 + Math.random() * 1.0;

    this.shells.push({
      mesh,
      velocity,
      rotationalVelocity: new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      ),
      lifetime: 15.0, // Long lifetime so shells stay visible on ground
      onHit,
      hasHit: false,
      groundLevel: groundLevel, // Store ground level for this shell
      bounceCount: 0, // Track bounces for sound variation
      settled: false // Not yet settled on ground
    });
  }

  /**
   * Spawn muzzle smoke effect
   */
  public spawnMuzzleSmoke(position: THREE.Vector3, direction: THREE.Vector3): void {
    if (Math.random() > 0.3) return;

    const sprite = this.smokePool.get() as THREE.Sprite;
    const material = sprite.material;

    if (this.fireSmokeTexture && !material.map) {
      material.map = this.fireSmokeTexture;
    }

    material.color.setHex(0x555555);
    material.opacity = 0.02 + Math.random() * 0.05;
    material.rotation = Math.random() * Math.PI * 2;

    const scale = 0.1 + Math.random() * 0.15;
    sprite.scale.set(scale, scale, 1);
    sprite.position.copy(position);

    sprite.position.add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05
    ));

    const speed = 0.2 + Math.random() * 0.3;
    const velocity = direction.clone().multiplyScalar(speed);
    velocity.add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.1,
      0.2 + Math.random() * 0.2,
      (Math.random() - 0.5) * 0.1
    ));

    this.particles.push({
      mesh: sprite,
      velocity,
      lifetime: 0,
      maxLifetime: 0.3 + Math.random() * 0.3,
      initialScale: scale,
      gravity: -0.3
    });
  }

  /**
   * Spawn muzzle flash effect (bright sprite flash)
   */
  public spawnMuzzleFlash(position: THREE.Vector3): void {
    // Create 2-3 layered flash sprites for depth
    const layerCount = 2 + Math.floor(Math.random() * 2);

    for (let i = 0; i < layerCount; i++) {
      const sprite = this.smokePool.get() as THREE.Sprite;
      const material = sprite.material;

      // Bright yellow/orange colors for muzzle flash
      const colors = [0xffffee, 0xffaa44, 0xff6622];
      material.color.setHex(colors[i % colors.length]);
      material.opacity = 0.8 - (i * 0.2);
      material.rotation = Math.random() * Math.PI * 2;
      material.blending = THREE.AdditiveBlending;

      const scale = 0.3 + (i * 0.2); // Bigger flash (was 0.15)
      sprite.scale.set(scale, scale, 1);
      sprite.position.copy(position);

      // Slight offset for each layer
      sprite.position.z -= i * 0.01;

      this.particles.push({
        mesh: sprite,
        velocity: new THREE.Vector3(0, 0, 0), // Static flash
        lifetime: 0,
        maxLifetime: 0.05 + Math.random() * 0.03, // Very short duration
        initialScale: scale,
        gravity: 0
      });
    }
  }

  /**
   * Spawn a full explosion effect
   */
  public spawnExplosion(position: THREE.Vector3): void {
    // Flash
    const flash = this.spherePool.get() as THREE.Mesh;
    (flash.material as THREE.MeshBasicMaterial).color.setHex(0xffffee);
    (flash.material as THREE.MeshBasicMaterial).opacity = 1;
    (flash.material as THREE.MeshBasicMaterial).transparent = true;
    flash.position.copy(position);
    flash.scale.set(2, 2, 2);

    this.particles.push({
      mesh: flash,
      velocity: new THREE.Vector3(0, 0, 0),
      lifetime: 0,
      maxLifetime: 0.1,
      initialScale: 2
    });

    // Fireball
    const fireCount = 12;
    for (let i = 0; i < fireCount; i++) {
      const fire = this.spherePool.get() as THREE.Mesh;
      const color = Math.random() > 0.5 ? 0xff4400 : 0xff8800;
      (fire.material as THREE.MeshBasicMaterial).color.setHex(color);
      (fire.material as THREE.MeshBasicMaterial).opacity = 0.8;
      (fire.material as THREE.MeshBasicMaterial).transparent = true;

      fire.position.copy(position);
      fire.position.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      ));

      const scale = 1.5 + Math.random();
      fire.scale.set(scale, scale, scale);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8 + 2,
        (Math.random() - 0.5) * 8
      );

      this.particles.push({
        mesh: fire,
        velocity: velocity,
        lifetime: 0,
        maxLifetime: 0.4 + Math.random() * 0.3,
        initialScale: scale
      });
    }

    // Debris
    const debrisCount = 15;
    for (let i = 0; i < debrisCount; i++) {
      const debris = this.cubePool.get() as THREE.Mesh;
      (debris.material as THREE.MeshBasicMaterial).color.setHex(0x333333);

      debris.position.copy(position);
      const scale = 0.2 + Math.random() * 0.3;
      debris.scale.set(scale, scale, scale);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        Math.random() * 10 + 5,
        (Math.random() - 0.5) * 15
      );

      this.particles.push({
        mesh: debris,
        velocity: velocity,
        lifetime: 0,
        maxLifetime: 1.5 + Math.random(),
        gravity: 15
      });
    }

    // Smoke
    const smokeCount = 8;
    for (let i = 0; i < smokeCount; i++) {
      const smoke = this.spherePool.get() as THREE.Mesh;
      (smoke.material as THREE.MeshBasicMaterial).color.setHex(0x222222);
      (smoke.material as THREE.MeshBasicMaterial).opacity = 0.6;
      (smoke.material as THREE.MeshBasicMaterial).transparent = true;

      smoke.position.copy(position);
      const scale = 2.0 + Math.random();
      smoke.scale.set(scale, scale, scale);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 3
      );

      this.particles.push({
        mesh: smoke,
        velocity: velocity,
        lifetime: 0,
        maxLifetime: 1.5 + Math.random(),
        initialScale: scale
      });
    }

    // Shockwave
    const shockwave = this.shockwavePool.get() as THREE.Mesh;
    (shockwave.material as THREE.MeshBasicMaterial).opacity = 0.5;
    shockwave.position.copy(position);
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.scale.set(0.1, 0.1, 0.1);

    this.particles.push({
      mesh: shockwave,
      velocity: new THREE.Vector3(0, 0, 0),
      lifetime: 0,
      maxLifetime: 0.5,
      initialScale: 0.1
    });
  }

  /**
   * Spawn trail particles for projectiles
   */
  public spawnTrail(position: THREE.Vector3, color: number, size: number): void {
    const particle = this.smokePool.get() as THREE.Sprite;
    const material = particle.material;

    if (this.fireSmokeTexture && !material.map) {
      material.map = this.fireSmokeTexture;
    }

    material.color.setHex(color);
    material.opacity = 0.3;
    material.rotation = Math.random() * Math.PI * 2;

    particle.scale.set(size, size, 1);
    particle.position.copy(position);

    this.particles.push({
      mesh: particle,
      velocity: new THREE.Vector3(0, 0, 0),
      lifetime: 0,
      maxLifetime: 0.5,
      initialScale: size,
      gravity: -0.5
    });
  }

  public update(delta: number): void {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.lifetime += delta;

      if (particle.lifetime >= particle.maxLifetime) {
        if (particle.mesh instanceof THREE.Mesh) {
          if (particle.mesh.geometry.type === 'SphereGeometry') {
            this.spherePool.release(particle.mesh);
          } else if (particle.mesh.geometry.type === 'BoxGeometry') {
            this.cubePool.release(particle.mesh);
          } else if (particle.mesh.geometry.type === 'TorusGeometry') {
            this.shockwavePool.release(particle.mesh);
          } else {
            this.scene.remove(particle.mesh);
          }
        } else if (particle.mesh instanceof THREE.Sprite) {
          const mat = particle.mesh.material as THREE.SpriteMaterial;
          if (mat.depthWrite === false && mat.blending === THREE.NormalBlending) {
            this.smokePool.release(particle.mesh);
          } else if (mat.blending === THREE.AdditiveBlending) {
            // Return impact sprites to pool (don't remove from scene)
            this.impactSpritePool.release(particle.mesh);
          } else {
            this.scene.remove(particle.mesh);
          }
        } else {
          this.scene.remove(particle.mesh);
        }
        this.particles.splice(i, 1);
        continue;
      }

      particle.mesh.position.add(particle.velocity.clone().multiplyScalar(delta));

      const gravity = particle.gravity !== undefined ? particle.gravity : 5;
      particle.velocity.y -= gravity * delta;

      const lifeRatio = particle.lifetime / particle.maxLifetime;
      if (particle.mesh instanceof THREE.Sprite) {
        particle.mesh.material.opacity = 1 - lifeRatio;
        if (particle.initialScale) {
          const scale = particle.initialScale * (1 + lifeRatio * 0.5);
          particle.mesh.scale.set(scale, scale, 1);
        }
      } else {
        (particle.mesh.material as THREE.Material).opacity = 1 - lifeRatio;
        (particle.mesh.material as THREE.Material).transparent = true;

        if (particle.mesh.geometry.type === 'TorusGeometry') {
          const scale = 1 + lifeRatio * 20;
          particle.mesh.scale.set(scale, scale, scale);
        }
      }
    }

    // Update shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i];
      shell.lifetime -= delta;

      // Remove shells when lifetime expires
      if (shell.lifetime <= 0) {
        this.shellPool.release(shell.mesh);
        this.shells.splice(i, 1);
        continue;
      }

      // If shell is settled, just handle fade-out in last 2 seconds
      if (shell.settled) {
        if (shell.lifetime < 2.0) {
          // Fade out shell in last 2 seconds
          const material = shell.mesh.material as THREE.MeshStandardMaterial;
          material.transparent = true;
          material.opacity = shell.lifetime / 2.0;
        }
        continue; // Skip physics for settled shells
      }

      // Apply gravity
      shell.velocity.y -= 9.8 * delta;
      shell.mesh.position.add(shell.velocity.clone().multiplyScalar(delta));

      // Apply rotation (tumbling)
      shell.mesh.rotation.x += shell.rotationalVelocity.x * delta;
      shell.mesh.rotation.y += shell.rotationalVelocity.y * delta;
      shell.mesh.rotation.z += shell.rotationalVelocity.z * delta;

      // Ground collision using stored ground level (+ shell radius offset)
      const shellRadius = 0.02; // Match half the shell height
      const groundY = shell.groundLevel + shellRadius;

      if (shell.mesh.position.y <= groundY && shell.velocity.y < 0) {
        shell.mesh.position.y = groundY;
        shell.bounceCount++;

        // Calculate impact velocity for sound intensity
        const impactSpeed = Math.abs(shell.velocity.y);

        // Play bounce sound (louder for first bounce, quieter for subsequent)
        if (this.onShellBounce && impactSpeed > 0.3) {
          this.onShellBounce(shell.mesh.position.clone(), shell.bounceCount);
        }

        // Bounce physics - energy loss increases with each bounce
        const bounceFactor = Math.max(0.15, 0.45 - shell.bounceCount * 0.1);
        const frictionFactor = Math.max(0.4, 0.75 - shell.bounceCount * 0.1);

        if (impactSpeed > 0.4) {
          // Bounce - reverse and reduce Y velocity
          shell.velocity.y = impactSpeed * bounceFactor;
          shell.velocity.x *= frictionFactor;
          shell.velocity.z *= frictionFactor;
          shell.rotationalVelocity.multiplyScalar(frictionFactor);
        } else {
          // Too slow to bounce - start settling
          shell.velocity.y = 0;
          shell.velocity.x *= 0.7;
          shell.velocity.z *= 0.7;
          shell.rotationalVelocity.multiplyScalar(0.5);
        }

        // Check if shell should settle completely
        const totalSpeed = Math.sqrt(
          shell.velocity.x * shell.velocity.x +
          shell.velocity.y * shell.velocity.y +
          shell.velocity.z * shell.velocity.z
        );

        if (totalSpeed < 0.1 && shell.bounceCount >= 2) {
          // Shell has settled - stop all movement
          shell.velocity.set(0, 0, 0);
          shell.rotationalVelocity.set(0, 0, 0);
          shell.settled = true;

          // Lay the shell flat on the ground
          shell.mesh.rotation.x = Math.PI / 2; // Horizontal
          shell.mesh.rotation.z = Math.random() * Math.PI * 2; // Random rotation around Y
          shell.mesh.position.y = groundY; // Ensure on ground
        }
      }
    }
  }

  /**
   * Set callback for shell bounce sounds
   */
  public setShellBounceCallback(callback: (position: THREE.Vector3, bounceNumber: number) => void): void {
    this.onShellBounce = callback;
  }

  public clear(): void {
    this.particles.forEach((p) => this.scene.remove(p.mesh));
    this.particles.length = 0;
  }
}
