import {
  Scene,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Vector3,
  ArrowHelper,
  Box3,
  Box3Helper,
  Color,
  Object3D
} from 'three';

/**
 * Debug visualization helper for collision detection
 * Add this to your World class to visualize collision rays, bounds, and hits
 */
export class CollisionDebug {
  private scene: Scene;
  private enabled: boolean = false;
  private helpers: Object3D[] = [];
  
  // Persistent helpers
  private playerBoundsHelper: Box3Helper | null = null;
  private groundRayHelper: ArrowHelper | null = null;
  private wallRayHelpers: ArrowHelper[] = [];
  private hitMarkers: Mesh[] = [];
  
  constructor(scene: Scene) {
    this.scene = scene;
  }
  
  /**
   * Toggle debug visualization on/off
   */
  toggle(): void {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.clear();
    }
    console.log('Collision Debug:', this.enabled ? 'ENABLED' : 'DISABLED');
  }
  
  /**
   * Check if debug is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Clear all debug helpers from the scene
   */
  clear(): void {
    for (const helper of this.helpers) {
      this.scene.remove(helper);
    }
    this.helpers = [];
    
    if (this.playerBoundsHelper) {
      this.scene.remove(this.playerBoundsHelper);
      this.playerBoundsHelper = null;
    }
    
    if (this.groundRayHelper) {
      this.scene.remove(this.groundRayHelper);
      this.groundRayHelper = null;
    }
    
    for (const helper of this.wallRayHelpers) {
      this.scene.remove(helper);
    }
    this.wallRayHelpers = [];
    
    for (const marker of this.hitMarkers) {
      this.scene.remove(marker);
    }
    this.hitMarkers = [];
  }
  
  /**
   * Visualize player bounding box
   */
  showPlayerBounds(position: Vector3, radius: number, height: number): void {
    if (!this.enabled) return;
    
    const box = new Box3(
      new Vector3(position.x - radius, position.y, position.z - radius),
      new Vector3(position.x + radius, position.y + height, position.z + radius)
    );
    
    if (this.playerBoundsHelper) {
      this.scene.remove(this.playerBoundsHelper);
    }
    
    this.playerBoundsHelper = new Box3Helper(box, new Color(0x00ff00));
    this.scene.add(this.playerBoundsHelper);
  }
  
  /**
   * Visualize a raycast
   */
  showRay(origin: Vector3, direction: Vector3, length: number, color: number = 0xffff00): void {
    if (!this.enabled) return;
    
    const arrow = new ArrowHelper(
      direction.clone().normalize(),
      origin,
      length,
      color,
      0.1,
      0.05
    );
    
    this.helpers.push(arrow);
    this.scene.add(arrow);
  }
  
  /**
   * Visualize ground ray
   */
  showGroundRay(origin: Vector3, hit: boolean, hitPoint?: Vector3): void {
    if (!this.enabled) return;
    
    if (this.groundRayHelper) {
      this.scene.remove(this.groundRayHelper);
    }
    
    const length = hitPoint ? origin.distanceTo(hitPoint) : 3.0;
    const color = hit ? 0x00ff00 : 0xff0000;
    
    this.groundRayHelper = new ArrowHelper(
      new Vector3(0, -1, 0),
      origin,
      length,
      color,
      0.1,
      0.05
    );
    this.scene.add(this.groundRayHelper);
    
    if (hit && hitPoint) {
      this.showHitMarker(hitPoint, 0x00ff00);
    }
  }
  
  /**
   * Visualize wall rays
   */
  showWallRays(origin: Vector3, direction: Vector3, hit: boolean, hitPoint?: Vector3): void {
    if (!this.enabled) return;
    
    const length = hitPoint ? origin.distanceTo(hitPoint) : 2.0;
    const color = hit ? 0xff0000 : 0x00ff00;
    
    const arrow = new ArrowHelper(
      direction.clone().normalize(),
      origin,
      length,
      color,
      0.1,
      0.05
    );
    
    this.wallRayHelpers.push(arrow);
    this.scene.add(arrow);
    
    if (hit && hitPoint) {
      this.showHitMarker(hitPoint, 0xff0000);
    }
  }
  
  /**
   * Show a hit marker at a point
   */
  showHitMarker(position: Vector3, color: number = 0xff0000): void {
    if (!this.enabled) return;
    
    const geometry = new SphereGeometry(0.1, 8, 8);
    const material = new MeshBasicMaterial({ color });
    const marker = new Mesh(geometry, material);
    marker.position.copy(position);
    
    this.hitMarkers.push(marker);
    this.scene.add(marker);
    
    // Auto-remove after 0.5 seconds
    setTimeout(() => {
      const index = this.hitMarkers.indexOf(marker);
      if (index > -1) {
        this.scene.remove(marker);
        this.hitMarkers.splice(index, 1);
      }
    }, 500);
  }
  
  /**
   * Show level bounds
   */
  showLevelBounds(levelMesh: Object3D): void {
    if (!this.enabled) return;
    
    const box = new Box3().setFromObject(levelMesh);
    const helper = new Box3Helper(box, new Color(0x0000ff));
    this.helpers.push(helper);
    this.scene.add(helper);
    
    console.log('Level bounds:', {
      min: box.min.toArray(),
      max: box.max.toArray(),
      size: box.getSize(new Vector3()).toArray()
    });
  }
  
  /**
   * Log collision state
   */
  logState(playerPos: Vector3, onGround: boolean, velocity: Vector3): void {
    if (!this.enabled) return;
    
    console.log('Collision State:', {
      position: [playerPos.x.toFixed(2), playerPos.y.toFixed(2), playerPos.z.toFixed(2)],
      onGround,
      velocity: [velocity.x.toFixed(2), velocity.y.toFixed(2), velocity.z.toFixed(2)]
    });
  }
  
  /**
   * Clear frame-specific helpers (call at start of each update)
   */
  clearFrame(): void {
    // Clear wall ray helpers each frame
    for (const helper of this.wallRayHelpers) {
      this.scene.remove(helper);
    }
    this.wallRayHelpers = [];
  }
}

export default CollisionDebug;
