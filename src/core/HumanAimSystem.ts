import { Vector3, MathUtils } from 'yuka';
import { CONFIG } from './Config';

class HumanAimSystem {
    public owner: any; // GameEntity / Bot

    // Correction State
    private currentError: Vector3 = new Vector3(0, 0, 0);
    private targetVelocityTracker: Vector3 = new Vector3(0, 0, 0);

    // Dynamic Factors
    public aimWarmup: number = 0; // 0.0 (cold) to 1.0 (perfect)
    public stress: number = 0;    // 0.0 (calm) to 1.0 (panic)
    public recoilAccumulation: number = 0;

    // Tuning
    private baseAccuracy: number = 0.5; // From Personality
    private reactionTime: number = 0.2; // From Personality

    // Constants
    private readonly WARMUP_SPEED = 2.0; // Seconds to max accuracy
    private readonly RECOIL_RECOVERY = 3.0;
    private readonly STRESS_DECAY = 0.5;

    constructor(owner: any, accuracy: number = 0.5) {
        this.owner = owner;
        this.baseAccuracy = accuracy;
    }

    update(dt: number) {
        // Improve aim over time if holding fire on target
        if (this.owner.weaponSystem?.isFiring) {
            this.aimWarmup = Math.min(1.0, this.aimWarmup + dt * this.WARMUP_SPEED);
            this.recoilAccumulation = Math.min(1.0, this.recoilAccumulation + dt); // Recoil builds up
        } else {
            this.aimWarmup = Math.max(0.0, this.aimWarmup - dt * 2.0); // Cooldown
            this.recoilAccumulation = Math.max(0.0, this.recoilAccumulation - dt * this.RECOIL_RECOVERY);
        }

        // Decay stress
        this.stress = Math.max(0.0, this.stress - dt * this.STRESS_DECAY);
    }

    /**
     * Called when the bot takes damage to throw off aim
     */
    takeDamage(amount: number) {
        this.stress = Math.min(1.0, this.stress + (amount / 50.0)); // 50dmg = max stress
        this.aimWarmup = 0; // Reset focus
    }

    /**
     * Calculates the point the bot typically wants to aim at, with error applied.
     */
    calculateAimPoint(targetPosition: Vector3, targetVelocity: Vector3 = new Vector3()): Vector3 {
        const finalAim = new Vector3().copy(targetPosition);

        // 1. Calculate Error Magnitude based on all factors
        // Start with base inaccuracy (1.0 - accuracy)
        let errorRadius = (1.0 - this.baseAccuracy) * 2.0;

        // Reduce error as we warmup
        errorRadius *= MathUtils.lerp(1.0, 0.2, this.aimWarmup);

        // Increase error with stress
        errorRadius += this.stress * 1.5;

        // Increase error with recoil
        errorRadius += this.recoilAccumulation * 0.5;

        // Distance factor: Errors are magnified over distance in world space 
        // (already handled by angular spread naturally, but we simulating "sway")

        // 2. Generate Noisy Offset
        // We use Perlin-like temporal noise usually, but simple random for now is okay
        // if we smooth it.
        const noise = new Vector3(
            MathUtils.randFloat(-1, 1),
            MathUtils.randFloat(-0.5, 0.5), // Less vertical error usually
            MathUtils.randFloat(-1, 1)
        ).normalize().multiplyScalar(errorRadius);

        // Smoothly interpolate current error to new noise target to avoid jitter
        // Use a "spring" force or simple lerp
        this.currentError.lerp(noise, 0.1); // 0.1 is smoothing factor

        // 3. Tracking Lag (Lead the target... poorly?)
        // Perfect lead = targetPosition + targetVelocity * timeToHit
        // We add "reaction lag" by mixing current velocity with old velocity
        this.targetVelocityTracker.lerp(targetVelocity, 0.9); // High val = good tracking

        // Apply error
        finalAim.add(this.currentError);

        return finalAim;
    }
}

export { HumanAimSystem };
