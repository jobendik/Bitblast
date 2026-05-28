import { Vector3, MathUtils } from 'yuka';
import { CONFIG } from './Config';

class CombatTacticsSystem {
    public owner: any; // GameEntity / Bot

    // State
    private timeSinceLastMove: number = 0;
    private currentManeuver: 'NONE' | 'STRAFE' | 'CROUCH_SPAM' | 'JIGGLE' = 'NONE';
    private maneuverTimer: number = 0;
    private maneuverDirection: number = 1; // 1 or -1

    constructor(owner: any) {
        this.owner = owner;
    }

    update(dt: number) {
        if (!this.owner.inCombat || this.owner.isDead) {
            this.currentManeuver = 'NONE';
            return;
        }

        this.maneuverTimer -= dt;

        // Decision logic: Switch maneuvers periodically
        if (this.maneuverTimer <= 0) {
            this._selectNewManeuver();
        }

        // Execute Maneuver
        switch (this.currentManeuver) {
            case 'STRAFE':
                this._executeStrafe(dt);
                break;
            case 'CROUCH_SPAM':
                this._executeCrouchSpam(dt);
                break;
            case 'JIGGLE':
                this._executeJigglePeek(dt);
                break;
        }
    }

    private _selectNewManeuver() {
        // Randomly pick a maneuver based on Personality usually
        // For now, simple random
        const roll = Math.random();
        if (roll < 0.4) {
            this.currentManeuver = 'STRAFE';
            this.maneuverTimer = MathUtils.randFloat(1.0, 3.0);
            this.maneuverDirection = Math.random() > 0.5 ? 1 : -1;
        } else if (roll < 0.6) {
            this.currentManeuver = 'CROUCH_SPAM';
            this.maneuverTimer = MathUtils.randFloat(1.0, 2.0);
        } else {
            this.currentManeuver = 'NONE'; // Stand still / aim focus
            this.maneuverTimer = MathUtils.randFloat(0.5, 1.5);
        }
    }

    /**
     * Strafing: Move perpendicular to target
     */
    private _executeStrafe(dt: number) {
        const target = this.owner.targetSystem?.getTarget();
        if (!target) return;

        // Calculate Right Vector relative to look direction
        const forward = new Vector3();
        this.owner.getDirection(forward);
        const right = new Vector3().crossVectors(forward, this.owner.up).normalize();

        // Apply movement input (Bot uses velocity directly or sets input for physics)
        // Assuming Bot class has manual control overrides or we modify velocity directly 
        // if no pathfinding active

        // Note: Use 'movementInput' if Bot has it, otherwise modify velocity
        const strafeVec = right.multiplyScalar(this.maneuverDirection * CONFIG.BOT.MOVEMENT.STRAFE_SPEED);
        this.owner.velocity.add(strafeVec).normalize().multiplyScalar(this.owner.maxSpeed);
    }

    private _executeCrouchSpam(dt: number) {
        // Toggle crouch every 0.5s
        const crouchState = (Math.floor(this.maneuverTimer * 4) % 2) === 0;
        this.owner.isCrouching = crouchState;
    }

    private _executeJigglePeek(dt: number) {
        // Complex: Move slightly out of cover and back
        // Just oscillate left/right quickly
        const oscillate = Math.sin(this.maneuverTimer * 10) > 0 ? 1 : -1;

        const forward = new Vector3();
        this.owner.getDirection(forward);
        const right = new Vector3().crossVectors(forward, this.owner.up).normalize();

        const strafeVec = right.multiplyScalar(oscillate * CONFIG.BOT.MOVEMENT.STRAFE_SPEED);
        this.owner.velocity.add(strafeVec);
    }

    /**
     * Instant reaction when hit
     */
    onDamageTaken() {
        // Immediate panic strafe
        this.currentManeuver = 'STRAFE';
        this.maneuverTimer = 1.5;
        this.maneuverDirection = Math.random() > 0.5 ? 1 : -1;

        // 30% chance to crouch immediately too
        if (Math.random() < 0.3) this.owner.isCrouching = true;
    }
}

export { CombatTacticsSystem };
