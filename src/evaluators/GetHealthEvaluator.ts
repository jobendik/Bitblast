import { GoalEvaluator, MathUtils } from 'yuka';
import { Feature } from '../core/Feature';
import { GetItemGoal } from '../goals/GetItemGoal';
import { Bot } from '../entities/Bot';
import { HEALTH_PACK } from '../core/Constants';

/**
* Class for representing the get-health goal evaluator. Can be used to compute a score that
* represents the desirability of the respective top-level goal.
*/
class GetHealthEvaluator extends GoalEvaluator<Bot> {

	public itemType: number;
	public tweaker: number;

	/**
	* Constructs a new get health goal evaluator.
	*
	* @param {Number} characterBias - Can be used to adjust the preferences of the bot.
	* @param {Number} itemType - The item type.
	*/
	constructor(characterBias = 1, itemType = HEALTH_PACK) {

		super(characterBias);

		this.itemType = itemType;
		this.tweaker = 1.0; // value used to tweak the desirability

	}

	/**
	* Calculates the desirability. It's a score between 0 and 1 representing the desirability
	* of a goal.
	*
	* @param {Bot} owner - The owner of this goal evaluator.
	* @return {Number} The desirability.
	*/
	calculateDesirability(owner: Bot) {

		let desirability = 0;

		if (owner.isItemIgnored(this.itemType) === false && owner.health < owner.maxHealth) {

			const distanceScore = Feature.distanceToItem(owner, this.itemType);
			const healthScore = Feature.health(owner);

			const desperation = 1 - healthScore;
			const criticalMultiplier = healthScore < 0.3 ? 2.0 : 1.0;

			desirability = this.tweaker * desperation * criticalMultiplier / distanceScore;

			desirability = MathUtils.clamp(desirability, 0, 1);

			// Debug logging
			if (owner.uuid === owner.world.competitors[0]?.uuid && desirability > 0) {
				// console.log(`[HealthEvaluator] Health: ${owner.health}/${owner.maxHealth} (${healthScore.toFixed(2)}), Desperation: ${desperation.toFixed(2)}, DistScore: ${distanceScore.toFixed(2)}, Final: ${desirability.toFixed(2)}`);
			}

		}

		return desirability;

	}

	/**
	* Executed if this goal evaluator produces the highest desirability.
	*
	* @param {Bot} owner - The owner of this goal evaluator.
	*/
	setGoal(owner: Bot) {

		const currentSubgoal = owner.brain.currentSubgoal();

		if ((currentSubgoal instanceof GetItemGoal) === false) {

			owner.brain.clearSubgoals();

			owner.brain.addSubgoal(new GetItemGoal(owner, this.itemType));

		}

	}

}

export { GetHealthEvaluator };
