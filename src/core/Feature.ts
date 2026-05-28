import { CONFIG } from './Config.js';
import { WEAPON_TYPES_BLASTER, WEAPON_TYPES_SHOTGUN, WEAPON_TYPES_ASSAULT_RIFLE } from './Constants.js';
import { MathUtils } from 'yuka';

const result = { distance: Infinity, item: null };

/**
* Class for calculating influencing factors in context of inference logic.
*
*/
class Feature {

	/**
	* Computes the total weapon score.
	*
	* @param {Enemy} enemy - The enemy this score is computed for.
	* @return {Number} The total weapon score.
	*/
	static totalWeaponStrength(enemy: any): number {

		const weaponSystem = enemy.weaponSystem;
		const weapons = weaponSystem.weapons;

		if (weapons.length === 0) return 0;

		let totalScore = 0;

		for (const weapon of weapons) {
			// Estimate max ammo if not available in config
			let maxAmmo = 100;
			const configAny = CONFIG as any;
			if (configAny[weapon.type?.toUpperCase()] && configAny[weapon.type?.toUpperCase()].MAX_AMMO) {
				maxAmmo = configAny[weapon.type.toUpperCase()].MAX_AMMO;
			} else if (weapon.type === 'Pistol') {
				maxAmmo = CONFIG.BLASTER.MAX_AMMO;
			} else if (weapon.type === 'M4' || weapon.type === 'AK47') {
				maxAmmo = CONFIG.ASSAULT_RIFLE.MAX_AMMO;
			}

			// Calculate ratio
			let ratio = weapon.ammo / maxAmmo;
			// Clamp to 1
			if (ratio > 1) ratio = 1;

			totalScore += ratio;
		}

		return totalScore / weapons.length;

	}

	/**
	* Computes the individual weapon score.
	*
	* @param {Enemy} enemy - The enemy this score is computed for.
	* @param {Number|string} weaponType - The type of weapon.
	* @return {Number} The individual weapon score.
	*/
	static individualWeaponStrength(enemy: any, weaponType: any): number {

		let type = weaponType;

		// Map legacy types to string
		if (typeof weaponType === 'number') {
			switch (weaponType) {
				case WEAPON_TYPES_BLASTER: type = 'Pistol'; break;
				case WEAPON_TYPES_SHOTGUN: type = 'Shotgun'; break;
				case WEAPON_TYPES_ASSAULT_RIFLE: type = 'M4'; break;
			}
		}

		// Find weapon in inventory
		const weapon = enemy.weaponSystem.weapons.find((w: any) => w.type === type);

		if (weapon) {
			let maxAmmo = 100; // Default
			const configAny = CONFIG as any;
			if (configAny[type.toUpperCase()]?.MAX_AMMO) {
				maxAmmo = configAny[type.toUpperCase()].MAX_AMMO;
			} else if (type === 'Pistol') {
				maxAmmo = CONFIG.BLASTER.MAX_AMMO;
			} else if (type === 'M4' || type === 'AK47') {
				maxAmmo = CONFIG.ASSAULT_RIFLE.MAX_AMMO;
			}

			return Math.min(weapon.ammo / maxAmmo, 1);
		}

		return 0;

	}

	/**
	* Computes the health score.
	*
	* @param {Enemy} enemy - The enemy this score is computed for.
	* @return {Number} The health score.
	*/
	static health(enemy: any): number {

		return enemy.health / enemy.maxHealth;

	}

	/**
	* Computes a score between 0 and 1 based on the bot's closeness to the given item.
	* The further the item, the higher the rating. If there is no item of the given type
	* present in the game world at the time this method is called the value returned is 1.
	*
	* @param {Enemy} enemy - The enemy this score is computed for.
	* @param {Number} itemType - The type of the item.
	* @return {Number} The distance score.
	*/
	static distanceToItem(enemy: any, itemType: number): number {

		let score = 1;

		enemy.world.getClosestItem(enemy, itemType, result);

		if (result.item) {

			let distance = result.distance;

			distance = MathUtils.clamp(distance, CONFIG.BOT.MIN_ITEM_RANGE, CONFIG.BOT.MAX_ITEM_RANGE);

			score = distance / CONFIG.BOT.MAX_ITEM_RANGE;

		}

		return score;

	}

}

export { Feature };
