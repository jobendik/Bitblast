import { Goal, Vector3 } from 'yuka';

/**
* Sub-goal for seeking a target position.
*/
class SeekToPositionGoal extends Goal<any> {

	public target: Vector3;

	constructor(owner: any, target = new Vector3()) {

		super(owner);

		this.target = target;

	}

	activate() {

		const owner = this.owner;

		const seekBehavior = owner.steering.behaviors[2];
		seekBehavior.target.copy(this.target);
		seekBehavior.active = true;

	}

	execute() {

		if (this.owner.atPosition(this.target)) {

			this.status = Goal.STATUS.COMPLETED;

		}

	}

	terminate() {

		const seekBehavior = this.owner.steering.behaviors[2];
		seekBehavior.active = false;

	}

}

export { SeekToPositionGoal };
