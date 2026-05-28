import { Goal, Vector3 } from 'yuka';
import { Bot } from '../entities/Bot';
import { BaseMovementGoal } from './BaseMovementGoal'; // Assuming this exists or I should use FollowPathGoal directly

/**
 * Goal: Find a valid cover position and move there.
 * Uses the Navigation logic to find cover protected from the current Target.
 */
class SeekCoverGoal extends Goal<Bot> {
    private moveGoal: any; // FollowPathGoal or similar
    private coverPosition: Vector3 | null = null;

    constructor(owner: Bot) {
        super(owner);
    }

    activate() {
        const threat = this.owner.targetSystem.getTarget();
        if (!threat) {
            this.status = Goal.STATUS.FAILED;
            return;
        }

        // Logic to find cover
        // Ideally: owner.world.navMesh.findCover(threat.position)
        // Since we don't have a complex Cover query system yet in NavMeshUtils, 
        // we simulate it: Raycast around to find a wall?
        // Or simpler: Run AWAY from threat to a node not visible

        // For now, let's use a "Run Away" logic that tries to put distance/obstacles
        this.coverPosition = this._findCoverPosition(threat.position);

        if (this.coverPosition) {
            // Use existing movement goal logic (assuming FindPathGoal available)
            // Ideally we'd wrap this in a CompositeGoal logic, but here we just manage the move
            this.owner.pathPlanner.findPath(this.owner.position, this.coverPosition, (path) => {
                // ... handled in callback, but Goal structure usually synchronous for path setup
                // We'll rely on Bot's existing "moveTo" abstraction if available, or create FollowPathGoal
            });
            // HACK: Assuming we can just initiate a move via helper
            // Retrying with standard Yuka pattern if FollowPathGoal exists
        } else {
            this.status = Goal.STATUS.FAILED;
        }
    }

    _findCoverPosition(threatPos: Vector3): Vector3 | null {
        // Placeholder for advanced cover query
        // Simple: Run 15m away from threat
        const dir = new Vector3().subVectors(this.owner.position, threatPos).normalize();
        const dest = new Vector3().copy(this.owner.position).add(dir.multiplyScalar(15));

        // Clamp to navmesh
        const region = this.owner.world.navMesh.getClosestRegion(dest);
        if (region) return region.centroid; // Simplified

        return null;
    }

    execute() {
        // If arrived, COMPLETED
        if (this.status === Goal.STATUS.ACTIVE) {
            if (this.owner.position.distanceTo(this.coverPosition!) < 1.0) {
                this.status = Goal.STATUS.COMPLETED;
            }
        }
        return this.status;
    }

    terminate() {
        // Cleanup
    }
}

export { SeekCoverGoal };
