import { Vector3, MathUtils } from 'yuka';
import { STATUS_ALIVE } from './Constants';
import { CONFIG } from './Config';

class CombatTacticsSystem {
    public owner: any; // GameEntity / Bot

    // State
    private currentManeuver: 'NONE' | 'STRAFE' | 'CROUCH_SPAM' | 'JIGGLE' = 'NONE';
    private maneuverTimer: number = 0;
    private maneuverDirection: number = 1; // 1 or -1

    constructor(owner: any) {
        this.owner = owner;
    }

    update(dt: number) {
        if (!this.owner.inCombat || this.owner.status !== STATUS_ALIVE) {
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
                this._executeStrafe();
                break;
            case 'CROUCH_SPAM':
                this._executeCrouchSpam();
                break;
            case 'JIGGLE':
                this._executeJigglePeek();
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
     * Applies a lateral strafe velocity, clamped to the bot's max speed so it
     * doesn't fight navmesh clamping or overshoot.
     */
    private _applyStrafe(direction: number) {
        const target = this.owner.targetSystem?.getTarget();
        if (!target) return;

        const forward = new Vector3();
        this.owner.getDirection(forward);
        const right = new Vector3().crossVectors(forward, this.owner.up).normalize();

        const strafeVec = right.multiplyScalar(direction * CONFIG.BOT.MOVEMENT.STRAFE_SPEED);
        this.owner.velocity.add(strafeVec);

        // Clamp to max speed instead of stomping the existing (path) velocity.
        const speed = this.owner.velocity.length();
        if (speed > this.owner.maxSpeed) {
            this.owner.velocity.multiplyScalar(this.owner.maxSpeed / speed);
        }
    }

    /**
     * Strafing: Move perpendicular to target
     */
    private _executeStrafe() {
        this._applyStrafe(this.maneuverDirection);
    }

    private _executeCrouchSpam() {
        // Toggle crouch every 0.5s
        const crouchState = (Math.floor(this.maneuverTimer * 4) % 2) === 0;
        this.owner.isCrouching = crouchState;
    }

    private _executeJigglePeek() {
        // Oscillate left/right quickly
        const oscillate = Math.sin(this.maneuverTimer * 10) > 0 ? 1 : -1;
        this._applyStrafe(oscillate);
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
