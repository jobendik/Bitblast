import { Goal } from 'yuka';

/**
* Sub-goal for finding the next random location
* on the map that the enemy is going to seek.
*/
class FindPathGoal extends Goal<any> {

	public from: any;
	public to: any;

	constructor(owner: any, from: any, to: any) {

		super(owner);

		this.from = from;
		this.to = to;

	}

	activate() {

		const owner = this.owner;
		const pathPlanner = owner.world.pathPlanner;

		owner.path = null; // reset previous path

		// perform async path finding

		pathPlanner.findPath(owner, this.from, this.to, onPathFound);

	}

	execute() {

		const owner = this.owner;

		if (owner.path) {

			// when a path was found, mark this goal as completed

			this.status = Goal.STATUS.COMPLETED;


		}

	}

}

//

function onPathFound(owner: any, path: any) {

	owner.path = path;

}

export { FindPathGoal };
