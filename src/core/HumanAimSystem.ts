import { Vector3, MathUtils } from 'yuka';

/**
 * Simulates human-like aiming for bots: warm-up over sustained fire, stress when
 * taking damage, recoil bloom, and smoothed error so aim drifts rather than snaps.
 *
 * NOTE: Yuka 0.7.x exposes neither `MathUtils.lerp` nor `Vector3.lerp`, so all
 * interpolation here is done with the local helpers below. Calling the missing
 * Yuka methods previously threw on every shot and disabled enemy fire entirely.
 */
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
    private baseAccuracy: number = 0.5; // From Personality (0 = wild, 1 = perfect)

    // Constants
    private readonly WARMUP_SPEED = 2.0; // Seconds to max accuracy
    private readonly RECOIL_RECOVERY = 3.0;
    private readonly STRESS_DECAY = 0.5;

    constructor(owner: any, accuracy: number = 0.5) {
        this.owner = owner;
        this.baseAccuracy = MathUtils.clamp(accuracy, 0, 1);
    }

    /** Scalar linear interpolation (Yuka's MathUtils lacks lerp). */
    private static lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    /** In-place vector interpolation (Yuka's Vector3 lacks lerp). */
    private static lerpVec(out: Vector3, target: Vector3, t: number): void {
        out.x += (target.x - out.x) * t;
        out.y += (target.y - out.y) * t;
        out.z += (target.z - out.z) * t;
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
     * Calculates the point the bot typically wants to aim at, with error and a
     * modest amount of target lead applied.
     */
    calculateAimPoint(targetPosition: Vector3, targetVelocity: Vector3 = new Vector3()): Vector3 {
        const finalAim = new Vector3().copy(targetPosition);

        // 1. Calculate Error Magnitude based on all factors.
        // Start with base inaccuracy (1.0 - accuracy); warmup tightens it.
        let errorRadius = (1.0 - this.baseAccuracy) * 2.0;
        errorRadius *= HumanAimSystem.lerp(1.0, 0.2, this.aimWarmup); // Reduce error as we warm up
        errorRadius += this.stress * 1.5;                              // Stress widens it
        errorRadius += this.recoilAccumulation * 0.5;                  // Recoil bloom

        // 2. Generate a smoothed noisy offset so aim drifts instead of teleporting.
        const noise = new Vector3(
            MathUtils.randFloat(-1, 1),
            MathUtils.randFloat(-0.5, 0.5), // Less vertical error usually
            MathUtils.randFloat(-1, 1)
        ).normalize().multiplyScalar(errorRadius);
        HumanAimSystem.lerpVec(this.currentError, noise, 0.1);

        // 3. Tracking lead: follow the target's velocity with deliberate lag so
        // skilled bots trail strafing players slightly rather than aiming dead-on.
        HumanAimSystem.lerpVec(this.targetVelocityTracker, targetVelocity, 0.9);
        const leadTime = 0.15 * this.baseAccuracy; // better bots lead more
        finalAim.x += this.targetVelocityTracker.x * leadTime;
        finalAim.z += this.targetVelocityTracker.z * leadTime;

        // 4. Apply error.
        finalAim.add(this.currentError);

        return finalAim;
    }
}

export { HumanAimSystem };
