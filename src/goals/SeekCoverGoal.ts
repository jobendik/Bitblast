import { Goal, CompositeGoal, Vector3 } from 'yuka';
import { Bot } from '../entities/Bot';
import { FindPathGoal } from './FindPathGoal';
import { FollowPathGoal } from './FollowPathGoal';

/**
 * Goal: Retreat to a cover position away from the current threat and path there.
 *
 * Previously imported a non-existent `BaseMovementGoal` and called
 * `owner.pathPlanner` (the planner lives on `world`), so the bot never moved.
 * Now a proper CompositeGoal that finds a retreat point and follows a navmesh path.
 */
class SeekCoverGoal extends CompositeGoal<Bot> {
    public priority: number = 0;
    private coverPosition: Vector3 | null = null;

    constructor(owner: Bot) {
        super(owner);
    }

    activate() {
        this.clearSubgoals();

        const owner = this.owner!;
        const threat = owner.targetSystem.getTarget();
        if (!threat) {
            this.status = Goal.STATUS.FAILED;
            return;
        }

        this.coverPosition = this._findCoverPosition(threat.position);
        if (!this.coverPosition) {
            this.status = Goal.STATUS.FAILED;
            return;
        }

        const from = new Vector3().copy(owner.position);
        const to = new Vector3().copy(this.coverPosition);

        this.addSubgoal(new FindPathGoal(owner, from, to));
        this.addSubgoal(new FollowPathGoal(owner));
    }

    private _findCoverPosition(threatPos: Vector3): Vector3 | null {
        // Retreat ~15m directly away from the threat, then snap to the navmesh.
        const owner = this.owner!;
        const dir = new Vector3().subVectors(owner.position, threatPos).normalize();
        const dest = new Vector3().copy(owner.position).add(dir.multiplyScalar(15));

        const region = owner.world.navMesh.getClosestRegion(dest);
        return region ? new Vector3().copy(region.centroid) : null;
    }

    execute() {
        this.status = this.executeSubgoals();
        this.replanIfFailed();
        return this.status;
    }

    terminate() {
        this.clearSubgoals();
    }
}

export { SeekCoverGoal };
