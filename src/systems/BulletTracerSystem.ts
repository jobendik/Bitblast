import * as THREE from 'three';

interface TracerInstance {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  lifetime: number;
  maxLifetime: number;
  active: boolean;
}

export class BulletTracerSystem {
  private activeTracers: TracerInstance[] = [];
  private pool: TracerInstance[] = [];
  private scene: THREE.Scene;
  private tracerTexture?: THREE.Texture;
  private fireTracerTexture?: THREE.Texture;
  private sharedGeometry: THREE.PlaneGeometry;

  constructor(scene: THREE.Scene, _camera: THREE.Camera) {
    this.scene = scene;
    this.sharedGeometry = new THREE.PlaneGeometry(1, 1);
    this.loadTextures();
  }

  private loadTextures(): void {
    const textureLoader = new THREE.TextureLoader();

    // Load tracer textures
    textureLoader.load(
      'assets/images/ui/Bullet-Trace.png_1b6132fc.png',
      (texture) => {
        this.tracerTexture = texture;
        this.tracerTexture.wrapS = THREE.RepeatWrapping;
        this.tracerTexture.wrapT = THREE.RepeatWrapping;
      },
      undefined,
      (err) => console.warn('Failed to load bullet trace texture:', err)
    );

    textureLoader.load(
      'assets/images/ui/Bullet-Fire-Trace.jpg_d795b3f8.jpg',
      (texture) => {
        this.fireTracerTexture = texture;
        this.fireTracerTexture.wrapS = THREE.RepeatWrapping;
        this.fireTracerTexture.wrapT = THREE.RepeatWrapping;
      },
      undefined,
      (err) => console.warn('Failed to load fire trace texture:', err)
    );
  }

  private getFromPool(): TracerInstance {
    if (this.pool.length > 0) {
      const instance = this.pool.pop()!;
      instance.active = true;
      instance.mesh.visible = true;
      this.scene.add(instance.mesh);
      return instance;
    }

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    const mesh = new THREE.Mesh(this.sharedGeometry, material);
    this.scene.add(mesh);

    return {
      mesh,
      material,
      lifetime: 0,
      maxLifetime: 0.2,
      active: true
    };
  }

  private returnToPool(instance: TracerInstance): void {
    instance.active = false;
    instance.mesh.visible = false;
    this.scene.remove(instance.mesh);
    this.pool.push(instance);
  }

  /**
   * Create visually impressive textured bullet tracer beam
   * Dopamine-inducing fast tracer with proper texture stretching
   */
  public createTracer(start: THREE.Vector3, end: THREE.Vector3, color: number = 0x00ffff, useFireTexture: boolean = false): void {
    const direction = new THREE.Vector3().subVectors(end, start);
    const distance = direction.length();

    if (distance < 0.1) return;

    const instance = this.getFromPool();

    // Setup material
    const texture = useFireTexture && this.fireTracerTexture ? this.fireTracerTexture : this.tracerTexture;
    instance.material.map = texture || null;
    instance.material.color.setHex(color);
    instance.material.opacity = 1.0;
    instance.material.needsUpdate = true;

    // Setup mesh transform
    instance.mesh.position.copy(start).addScaledVector(direction, 0.5);

    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(
      new THREE.Vector3(1, 0, 0), // plane's X axis
      direction.clone().normalize()
    );
    instance.mesh.quaternion.copy(quaternion);

    // Scale: X = length of ray, Y = thickness (visual width)
    const thickness = 0.03; // Scaled down thickness (was 0.15)
    instance.mesh.scale.set(distance, thickness, 1);

    instance.lifetime = 0;
    instance.maxLifetime = 0.15; // Fast fade

    this.activeTracers.push(instance);
  }

  /**
   * Create multiple tracers for shotgun spread
   */
  public createMultipleTracers(
    start: THREE.Vector3,
    endpoints: THREE.Vector3[],
    color: number = 0x00ffff,
    useFireTexture: boolean = false
  ): void {
    endpoints.forEach((end) => {
      this.createTracer(start, end, color, useFireTexture);
    });
  }

  public update(delta: number): void {
    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const tracer = this.activeTracers[i];
      tracer.lifetime += delta;

      if (tracer.lifetime >= tracer.maxLifetime) {
        this.returnToPool(tracer);
        this.activeTracers.splice(i, 1);
      } else {
        // Fast, snappy fade: alpha = 1 - age/lifetime
        const fadeProgress = tracer.lifetime / tracer.maxLifetime;
        tracer.material.opacity = 1.0 - fadeProgress;
      }
    }
  }

  public clear(): void {
    // Return all active to pool
    this.activeTracers.forEach(t => this.returnToPool(t));
    this.activeTracers = [];

    // Clean up pool
    this.pool.forEach(t => {
      this.scene.remove(t.mesh);
      t.material.dispose();
    });
    this.pool = [];
    this.sharedGeometry.dispose();
  }
}
