import * as THREE from 'three';

/**
 * Screen Effects System
 * 
 * Provides visual feedback effects for combat:
 * - Screen shake (from firing, explosions, damage)
 * - FOV punch (firing feedback)
 * - Chromatic aberration
 * - Camera kick from recoil
 */

interface ShakeInstance {
  intensity: number;
  duration: number;
  elapsed: number;
  frequency: number;
  decay: number;
}

interface FOVPunch {
  amount: number;
  duration: number;
  elapsed: number;
  baseFOV: number;
}

export class ScreenEffects {
  private camera: THREE.PerspectiveCamera;

  // Screen shake state
  private shakeInstances: ShakeInstance[] = [];
  private shakeOffset: THREE.Vector3 = new THREE.Vector3();

  // FOV punch state
  private fovPunch: FOVPunch | null = null;

  // Camera recoil state (applies to camera rotation)
  private recoilPitch: number = 0; // Up/down (Y rotation after euler decomposition)
  private recoilYaw: number = 0;   // Left/right (X rotation)
  private targetRecoilPitch: number = 0;
  private targetRecoilYaw: number = 0;
  private recoilRecoveryRate: number = 5;

  // Chromatic aberration (requires post-processing or shader)
  private chromaticAberration: number = 0;
  private targetChromaticAberration: number = 0;

  // Vignette intensity
  private vignetteIntensity: number = 0;
  private targetVignetteIntensity: number = 0;

  // Desaturation (black and white effect)
  private desaturation: number = 0;

  // Original camera state
  private originalPosition: THREE.Vector3 = new THREE.Vector3();
  private baseFOV: number = 75;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.baseFOV = camera.fov;
    this.originalPosition.copy(camera.position);
  }

  /**
   * Add screen shake effect
   * @param intensity Shake amplitude in world units
   * @param duration Duration in seconds
   * @param frequency Shake frequency (cycles per second)
   * @param decay Decay rate (0-1, higher = faster decay)
   */
  public addShake(
    intensity: number = 0.05,
    duration: number = 0.15,
    frequency: number = 25,
    decay: number = 0.5
  ): void {
    this.shakeInstances.push({
      intensity,
      duration,
      elapsed: 0,
      frequency,
      decay
    });
  }

  /**
   * Apply weapon firing screen shake
   */
  public addFireShake(weaponPower: number = 1.0): void {
    // Scale shake based on weapon power (pistol = 0.5, sniper = 2.0)
    // Scale shake based on weapon power (pistol = 0.5, sniper = 2.0)
    const intensity = 0.05 * weaponPower; // Increased from 0.02
    const duration = 0.12; // Increased from 0.08
    const frequency = 35; // Increased frequency for sharper kick
    this.addShake(intensity, duration, frequency, 0.7);
  }

  /**
   * Apply explosion shake
   * @param distance Distance from explosion (affects intensity)
   */
  public addExplosionShake(distance: number = 10): void {
    // Inverse square falloff
    const falloff = Math.max(0.1, 1 - (distance / 50));
    const intensity = 0.15 * falloff;
    const duration = 0.5;
    const frequency = 15;
    this.addShake(intensity, duration, frequency, 0.3);
  }

  /**
   * Apply damage shake (when player takes damage)
   * @param damagePercent Percent of max health as damage (0-1)
   */
  public addDamageShake(damagePercent: number = 0.1): void {
    const intensity = 0.05 + (damagePercent * 0.1);
    const duration = 0.2 + (damagePercent * 0.1);
    const frequency = 20;
    this.addShake(intensity, duration, frequency, 0.4);
  }

  /**
   * Trigger damage flash effect (red screen tint + shake)
   */
  public damageFlash(): void {
    // Red vignette/flash (assuming vignette shader uses red or tracks health status)
    this.addVignette(0.8);
    this.addDamageShake(0.2);
    this.addChromaticAberration(0.5);
  }

  /**
   * Apply FOV punch effect (brief zoom out on firing)
   * @param amount FOV increase in degrees
   * @param duration Duration in seconds
   */
  public addFOVPunch(amount: number = 2, duration: number = 0.1): void {
    this.fovPunch = {
      amount,
      duration,
      elapsed: 0,
      baseFOV: this.baseFOV
    };
  }

  /**
   * Apply camera recoil (actual camera rotation)
   * @param pitch Vertical recoil (positive = up)
   * @param yaw Horizontal recoil (random left/right)
   */
  public applyRecoil(pitch: number, yaw: number): void {
    this.targetRecoilPitch += pitch;
    this.targetRecoilYaw += yaw;
  }

  /**
   * Get current recoil values for camera application
   */
  public getRecoil(): { pitch: number; yaw: number } {
    return {
      pitch: this.recoilPitch,
      yaw: this.recoilYaw
    };
  }

  /**
   * Set recoil recovery rate
   */
  public setRecoilRecoveryRate(rate: number): void {
    this.recoilRecoveryRate = rate;
  }

  /**
   * Trigger chromatic aberration effect
   * @param intensity Effect intensity (0-1)
   */
  public addChromaticAberration(intensity: number = 0.5): void {
    this.targetChromaticAberration = intensity;
  }

  /**
   * Trigger vignette flash
   * @param intensity Effect intensity (0-1)
   */
  public addVignette(intensity: number = 0.5): void {
    this.targetVignetteIntensity = intensity;
  }

  /**
   * Update all screen effects
   * @param delta Time since last frame in seconds
   */
  public update(delta: number): void {
    this.updateShake(delta);
    this.updateFOVPunch(delta);
    this.updateRecoil(delta);
    this.updateChromaticAberration(delta);
    this.updateVignette(delta);
  }

  private updateShake(delta: number): void {
    // Reset shake offset
    this.shakeOffset.set(0, 0, 0);

    // Process all shake instances
    for (let i = this.shakeInstances.length - 1; i >= 0; i--) {
      const shake = this.shakeInstances[i];
      shake.elapsed += delta;

      if (shake.elapsed >= shake.duration) {
        // Remove expired shake
        this.shakeInstances.splice(i, 1);
        continue;
      }

      // Calculate decay
      const progress = shake.elapsed / shake.duration;
      const decayMultiplier = Math.pow(1 - progress, shake.decay * 2);

      // Calculate shake offset using perlin-like noise simulation
      const t = shake.elapsed * shake.frequency;
      const currentIntensity = shake.intensity * decayMultiplier;

      this.shakeOffset.x += Math.sin(t * 6.28) * currentIntensity;
      this.shakeOffset.y += Math.cos(t * 5.13) * currentIntensity;
      this.shakeOffset.z += Math.sin(t * 4.27) * currentIntensity * 0.5;
    }
  }

  private updateFOVPunch(delta: number): void {
    if (!this.fovPunch) return;

    this.fovPunch.elapsed += delta;

    if (this.fovPunch.elapsed >= this.fovPunch.duration) {
      // Reset FOV
      this.camera.fov = this.baseFOV;
      this.camera.updateProjectionMatrix();
      this.fovPunch = null;
      return;
    }

    // Ease out FOV punch
    const progress = this.fovPunch.elapsed / this.fovPunch.duration;
    const eased = 1 - Math.pow(progress, 2);
    const currentPunch = this.fovPunch.amount * eased;

    this.camera.fov = this.baseFOV + currentPunch;
    this.camera.updateProjectionMatrix();
  }

  private updateRecoil(delta: number): void {
    // Smooth interpolation towards target recoil
    this.recoilPitch = THREE.MathUtils.lerp(
      this.recoilPitch,
      this.targetRecoilPitch,
      delta * 15
    );
    this.recoilYaw = THREE.MathUtils.lerp(
      this.recoilYaw,
      this.targetRecoilYaw,
      delta * 15
    );

    // Decay target recoil back to 0
    this.targetRecoilPitch = THREE.MathUtils.lerp(
      this.targetRecoilPitch,
      0,
      delta * this.recoilRecoveryRate
    );
    this.targetRecoilYaw = THREE.MathUtils.lerp(
      this.targetRecoilYaw,
      0,
      delta * this.recoilRecoveryRate
    );
  }

  private updateChromaticAberration(delta: number): void {
    // Decay chromatic aberration
    this.chromaticAberration = THREE.MathUtils.lerp(
      this.chromaticAberration,
      this.targetChromaticAberration,
      delta * 10
    );

    // Decay target to 0
    this.targetChromaticAberration = THREE.MathUtils.lerp(
      this.targetChromaticAberration,
      0,
      delta * 8
    );
  }

  private updateVignette(delta: number): void {
    // Decay vignette
    this.vignetteIntensity = THREE.MathUtils.lerp(
      this.vignetteIntensity,
      this.targetVignetteIntensity,
      delta * 10
    );

    // Decay target to 0
    this.targetVignetteIntensity = THREE.MathUtils.lerp(
      this.targetVignetteIntensity,
      0,
      delta * 5
    );
  }

  /**
   * Get current shake offset to apply to camera
   */
  public getShakeOffset(): THREE.Vector3 {
    return this.shakeOffset.clone();
  }

  /**
   * Get chromatic aberration intensity (for post-processing)
   */
  public getChromaticAberration(): number {
    return this.chromaticAberration;
  }

  /**
   * Get vignette intensity (for post-processing)
   */
  public getVignetteIntensity(): number {
    return this.vignetteIntensity;
  }

  /**
   * Set desaturation level (0 = full color, 1 = black and white)
   */
  public setDesaturation(value: number): void {
    this.desaturation = Math.max(0, Math.min(1, value));
    this.applyDesaturationCSS();
  }

  /**
   * Get current desaturation level
   */
  public getDesaturation(): number {
    return this.desaturation;
  }

  /**
   * Apply desaturation effect via CSS filter on the canvas and game container
   */
  private applyDesaturationCSS(): void {
    const grayscaleValue = `grayscale(${this.desaturation * 100}%)`;

    // Apply to the WebGL canvas
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.style.filter = this.desaturation > 0 ? grayscaleValue : '';
    }

    // Also apply to the main game container for complete coverage
    const gameContainer = document.getElementById('game-container') || document.body;
    if (gameContainer && this.desaturation > 0) {
      gameContainer.style.filter = grayscaleValue;
    } else if (gameContainer) {
      gameContainer.style.filter = '';
    }

    // console.log(`[ScreenEffects] Desaturation set to ${this.desaturation} - Applied: ${grayscaleValue}`);
  }

  /**
   * Reset all effects
   */
  public reset(): void {
    this.shakeInstances = [];
    this.shakeOffset.set(0, 0, 0);
    this.fovPunch = null;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.targetRecoilPitch = 0;
    this.targetRecoilYaw = 0;
    this.chromaticAberration = 0;
    this.targetChromaticAberration = 0;
    this.vignetteIntensity = 0;
    this.targetVignetteIntensity = 0;
    this.setDesaturation(0); // Reset black and white effect
    this.camera.fov = this.baseFOV;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Update base FOV (e.g., when player changes settings)
   */
  public setBaseFOV(fov: number): void {
    this.baseFOV = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
}
