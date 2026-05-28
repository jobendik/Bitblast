import { GoalEvaluator, MathUtils } from 'yuka';
import { Feature } from '../core/Feature';
import { GetItemGoal } from '../goals/GetItemGoal';
import { Bot } from '../entities/Bot';
import { WEAPON_TYPES_SHOTGUN } from '../core/Constants';

/**
* Class for representing the get-weapon goal evaluator. Can be used to compute a score that
* represents the desirability of the respective top-level goal.
*/
class GetWeaponEvaluator extends GoalEvaluator<Bot> {

	public itemType: number;
	public tweaker: number;

	/**
	* Constructs a new get weapon goal evaluator.
	*
	* @param {Number} characterBias - Can be used to adjust the preferences of the bot.
	* @param {Number} itemType - The item type.
	*/
	constructor(characterBias = 1, itemType = WEAPON_TYPES_SHOTGUN) {

		super(characterBias);

		this.itemType = itemType;
		this.tweaker = 0.15; // value used to tweak the desirability

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

		if (owner.isItemIgnored(this.itemType) === false) {

			const distanceScore = Feature.distanceToItem(owner, this.itemType);
			const weaponScore = Feature.individualWeaponStrength(owner, this.itemType);
			const healthScore = Feature.health(owner);

			desirability = this.tweaker * (1 - weaponScore) * healthScore / distanceScore;

			desirability = MathUtils.clamp(desirability, 0, 1);

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

export { GetWeaponEvaluator };
