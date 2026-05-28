import * as THREE from 'three';
import { SurfaceMaterial } from './ImpactSystem';

export { SurfaceMaterial }; // Re-export for compatibility

interface Decal {
  mesh: THREE.Mesh;
  lifetime: number;
  maxLifetime: number;
  material: THREE.MeshBasicMaterial;
}

interface DecalPoolItem {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  inUse: boolean;
}

export class DecalSystem {
  private decals: Decal[] = [];
  private scene: THREE.Scene;
  private bulletHoleTexture?: THREE.Texture;
  private crackHoleTexture?: THREE.Texture;
  private maxDecals = 50; // Limit to maintain performance and visual clarity

  // Pre-allocated pool to avoid runtime material/geometry creation
  private decalPool: DecalPoolItem[] = [];
  private sharedGeometry!: THREE.PlaneGeometry;
  private poolInitialized = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.loadTextures();
  }

  /**
   * Initialize the decal pool after textures are loaded
   * This pre-compiles all materials to avoid flickering during gameplay
   */
  private initializePool(): void {
    if (this.poolInitialized || !this.bulletHoleTexture) return;

    // Create shared geometry (reused by all decals)
    this.sharedGeometry = new THREE.PlaneGeometry(1, 1);

    // Pre-create pool of decal meshes with materials
    for (let i = 0; i < this.maxDecals; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: this.bulletHoleTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(this.sharedGeometry, material);
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;

      // Add to scene but keep invisible - this forces shader compilation
      this.scene.add(mesh);

      this.decalPool.push({
        mesh,
        material,
        inUse: false
      });
    }

    this.poolInitialized = true;
  }

  private loadTextures(): void {
    const textureLoader = new THREE.TextureLoader();

    textureLoader.load(
      'assets/images/ui/Bullet-Hole.png_6e4be8ce.png',
      (texture) => {
        this.bulletHoleTexture = texture;
      },
      undefined,
      (err) => console.warn('Failed to load bullet hole texture:', err)
    );

    textureLoader.load(
      'assets/images/ui/Crack-Hole.png_ee41c0b1.png',
      (texture) => {
        this.crackHoleTexture = texture;
      },
      undefined,
      (err) => console.warn('Failed to load crack hole texture:', err)
    );
  }

  /**
   * Create a bullet hole decal at impact point
   * Uses pre-allocated pool to avoid runtime material creation (prevents flickering)
   */
  public createBulletHole(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    material: SurfaceMaterial
  ): void {
    if (!this.bulletHoleTexture) {
      console.warn('⚠️ Cannot create bullet hole - texture not loaded yet');
      return;
    }

    // Initialize pool on first use (after textures loaded)
    if (!this.poolInitialized) {
      this.initializePool();
    }

    // Use crack texture for brick/rock surfaces for variety
    // Use crack texture for brick/rock surfaces for variety
    const useCrack =
      (material === SurfaceMaterial.BRICK || material === SurfaceMaterial.ROCK) &&
      this.crackHoleTexture &&
      Math.random() < 0.3;

    const texture = useCrack ? this.crackHoleTexture : this.bulletHoleTexture;
    const size = 0.15 + Math.random() * 0.1; // Slight size variation

    // Get a decal from the pool (reuse oldest if all in use)
    let poolItem = this.decalPool.find(item => !item.inUse);

    if (!poolItem) {
      // Reuse oldest active decal
      const oldestDecal = this.decals.shift();
      if (oldestDecal) {
        poolItem = this.decalPool.find(item => item.mesh === oldestDecal.mesh);
      }
    }

    if (!poolItem) {
      console.warn('⚠️ Decal pool exhausted');
      return;
    }

    poolItem.inUse = true;
    const decal = poolItem.mesh;
    const mat = poolItem.material;

    // Update material texture (no new material creation)
    mat.map = texture!;
    mat.opacity = 0.9;
    mat.needsUpdate = true;

    // Scale to desired size
    decal.scale.set(size, size, 1);

    // Position slightly offset from surface to avoid z-fighting
    decal.position.copy(position).add(normal.clone().multiplyScalar(0.002));

    // Orient to surface normal
    decal.quaternion.identity();
    decal.lookAt(position.clone().add(normal));

    // Random rotation for variety
    decal.rotateZ(Math.random() * Math.PI * 2);

    // Update matrix and make visible
    decal.updateMatrix();
    decal.visible = true;

    // Track for lifetime management
    this.decals.push({
      mesh: decal,
      lifetime: 0,
      maxLifetime: 12,
      material: mat,
    });
  }

  // Alias for compatibility
  public createDecal(position: THREE.Vector3, normal: THREE.Vector3, material: SurfaceMaterial): void {
    this.createBulletHole(position, normal, material);
  }

  public update(delta: number): void {
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const decal = this.decals[i];
      decal.lifetime += delta;

      // Start fading at 8 seconds
      if (decal.lifetime > 8) {
        const fadeProgress = (decal.lifetime - 8) / (decal.maxLifetime - 8);
        decal.material.opacity = 0.9 * (1 - fadeProgress);
      }

      // Return to pool when lifetime exceeded (don't dispose - reuse!)
      if (decal.lifetime >= decal.maxLifetime) {
        decal.mesh.visible = false;
        decal.material.opacity = 0;

        // Mark as available in pool
        const poolItem = this.decalPool.find(item => item.mesh === decal.mesh);
        if (poolItem) {
          poolItem.inUse = false;
        }

        this.decals.splice(i, 1);
      }
    }
  }

  public clear(): void {
    // Return all decals to pool (don't dispose)
    this.decals.forEach((decal) => {
      decal.mesh.visible = false;
      decal.material.opacity = 0;

      const poolItem = this.decalPool.find(item => item.mesh === decal.mesh);
      if (poolItem) {
        poolItem.inUse = false;
      }
    });
    this.decals.length = 0;
  }
}
