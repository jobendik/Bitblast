import { Goal, CompositeGoal, Vector3 } from 'yuka';
import { Bot } from '../entities/Bot';
import { FindPathGoal } from './FindPathGoal';
import { FollowPathGoal } from './FollowPathGoal';

/**
 * Goal: Move to a flanking position offset ~70° around the current target, then
 * path there using the navmesh.
 *
 * Previously used `Matrix4.fromRotationY`, which does not exist in Yuka and threw
 * on activation. Rotation is now done manually on the XZ plane.
 */
class FlankGoal extends CompositeGoal<Bot> {
    public priority: number = 0;
    private targetPos: Vector3 | null = null;

    constructor(owner: Bot) {
        super(owner);
    }

    activate() {
        this.clearSubgoals();

        const owner = this.owner!;
        const target = owner.targetSystem.getTarget();
        if (!target) {
            this.status = Goal.STATUS.FAILED;
            return;
        }

        // Vector from target to bot, rotated ~70° (left or right) around the Y axis.
        const toBot = new Vector3().subVectors(owner.position, target.position);
        const angle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2.5);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rx = toBot.x * cos - toBot.z * sin;
        const rz = toBot.x * sin + toBot.z * cos;
        toBot.x = rx;
        toBot.z = rz;

        const flankPos = new Vector3().addVectors(target.position, toBot);

        // Snap the flank position onto the navmesh so it is reachable.
        const region = owner.world.navMesh.getClosestRegion(flankPos);
        this.targetPos = region ? new Vector3().copy(region.centroid) : flankPos;

        const from = new Vector3().copy(owner.position);
        const to = new Vector3().copy(this.targetPos);

        this.addSubgoal(new FindPathGoal(owner, from, to));
        this.addSubgoal(new FollowPathGoal(owner));
    }

    execute() {
        const owner = this.owner!;

        // Flanking is pointless once we can shoot the target again.
        if (owner.targetSystem.isTargetShootable()) {
            this.status = Goal.STATUS.COMPLETED;
            return this.status;
        }

        this.status = this.executeSubgoals();
        this.replanIfFailed();
        return this.status;
    }

    terminate() {
        this.clearSubgoals();
    }
}

export { FlankGoal };
