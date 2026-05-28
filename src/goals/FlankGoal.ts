import { Goal, Vector3, Matrix4 } from 'yuka';
import { Bot } from '../entities/Bot';

/**
 * Goal: Move to a flanking position relative to the target.
 */
class FlankGoal extends Goal<Bot> {
    private targetPos: Vector3 | null = null;

    constructor(owner: Bot) {
        super(owner);
    }

    activate() {
        const target = this.owner.targetSystem.getTarget();
        if (!target) {
            this.status = Goal.STATUS.FAILED;
            return;
        }

        // Calculate Flank Position
        // Rotate the vector (Target -> Bot) by 45-90 degrees
        const toBot = new Vector3().subVectors(this.owner.position, target.position);

        // Direction: Left or Right? Randomize or based on available space
        const angle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2.5); // ~70 degrees

        const rotation = new Matrix4().fromRotationY(angle);
        toBot.applyMatrix4(rotation);

        this.targetPos = new Vector3().addVectors(target.position, toBot);

        // Validate on NavMesh
        // ... (Simplified: assume valid for prototype)
    }

    execute() {
        if (this.status === Goal.STATUS.ACTIVE && this.targetPos) {
            // Move logic using Bot's navigation
            // Just a simplified check here
            const dist = this.owner.position.distanceTo(this.targetPos);
            if (dist < 2.0) {
                this.status = Goal.STATUS.COMPLETED;
            } else {
                // Keep moving (Bot update handles path following usually)
                // This Goal just monitors
            }
        }
        return this.status;
    }
}

export { FlankGoal };
