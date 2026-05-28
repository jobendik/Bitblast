import { Vector3, MathUtils } from 'yuka';
import { CONFIG } from './Config';
import { WeaponType } from '../types/weapons';
import { HumanAimSystem } from './HumanAimSystem';

const displacement = new Vector3();
const targetPosition = new Vector3();
const offset = new Vector3();

// Define a simple interface for what the AI needs to know about a weapon
interface AIWeaponState {
	type: WeaponType;
	ammo: number;
	reserve: number;
}

/**
* Class to manage all operations specific to weapons and their deployment.
* Now fully integrated with the visual PlayerWeaponSystem.
*/
class AIWeaponSystem {

	public owner: any;
	public reactionTime: number;
	public aimAccuracy: number;
	public humanAim: HumanAimSystem;

	// Inventory
	public weapons: Array<AIWeaponState>;
	public currentWeaponType: WeaponType | null;
	public nextWeaponType: WeaponType | null;

	/**
	* Constructs a new weapon system with the given values.
	*
	* @param {GameEntity} owner - The owner of this weapon system.
	*/
	constructor(owner: any) {

		this.owner = owner;

		this.reactionTime = CONFIG.BOT.WEAPON.REACTION_TIME;
		this.aimAccuracy = CONFIG.BOT.WEAPON.AIM_ACCURACY;

		this.weapons = new Array();
		this.currentWeaponType = null;
		this.nextWeaponType = null;

		this.humanAim = new HumanAimSystem(owner);
	}

	/**
	* Inits the weapon system. Should be called once during the creation
	* or startup process of an entity.
	*
	* @return {WeaponSystem} A reference to this weapon system.
	*/
	init(): this {
		// Visuals are initialized in Bot.ts via _initVisualWeaponSystem
		// Here we just ensure our state syncs up
		this.reset();
		return this;
	}

	/**
	* Resets the internal data structures and sets an initial weapon.
	*
	* @return {WeaponSystem} A reference to this weapon system.
	*/
	reset(): this {
		this.weapons = [];
		this.currentWeaponType = null;
		this.nextWeaponType = null;
		return this;
	}

	/**
	 * Adds a weapon to the AI's inventory logic.
	 * @param type The weapon type to add
	 */
	addWeapon(type: string): this { // Accept string to match WeaponType enum
		const weaponType = type as WeaponType;

		// check if already exists
		const existing = this.weapons.find(w => w.type === weaponType);
		if (existing) {
			// Refill ammo (logic simplified)
			return this;
		}

		this.weapons.push({
			type: weaponType,
			ammo: 999, // Bot ammo handled by visual system mostly, but we track existence
			reserve: 999
		});

		// If this is the first weapon, equip it
		if (!this.currentWeaponType) {
			this.changeWeapon(weaponType);
		}

		return this;
	}

	/**
	* Determines the most appropriate weapon to use given the current game state.
	*
	* @return {WeaponSystem} A reference to this weapon system.
	*/
	selectBestWeapon(): this {

		const owner = this.owner;
		const target = owner.targetSystem.getTarget();

		if (target && this.weapons.length > 0) {

			let highestDesirability = -Infinity;
			let bestWeaponType = this.currentWeaponType || this.weapons[0].type;

			const distanceToTarget = this.owner.position.distanceTo(target.position);

			for (const weapon of this.weapons) {
				// Calculate desirability based on effective range from Config
				// We don't have direct access to internal Weapon instances anymore, 
				// so we use a heuristic based on weapon type.
				let desirability = this.calculateWeaponDesirability(weapon.type, distanceToTarget);

				// Hysteresis: Cost to switch weapons to prevent flickering
				if (this.currentWeaponType !== weapon.type) {
					desirability -= CONFIG.BOT.WEAPON.CHANGE_COST;
				}

				if (desirability > highestDesirability) {
					highestDesirability = desirability;
					bestWeaponType = weapon.type;
				}
			}

			// select the best weapon
			if (bestWeaponType && bestWeaponType !== this.currentWeaponType) {
				this.setNextWeapon(bestWeaponType);
			}
		}

		return this;
	}

	/**
	 * Heuristic for weapon desirability based on range.
	 */
	calculateWeaponDesirability(type: WeaponType, distance: number): number {
		// Simple range-based logic
		// Shotguns: Great < 10m, terrible > 15m
		// SMGs: Good < 20m
		// Rifles: Good 10m - 50m
		// Snipers: Good > 30m

		switch (type) {
			case WeaponType.Shotgun:
				if (distance < 5) return 1.0;
				if (distance < 10) return 0.8;
				if (distance < 20) return 0.2;
				return 0.0;

			case WeaponType.Pistol:
			case WeaponType.Tec9:
				if (distance < 15) return 0.6; // Backup weapon
				return 0.1;

			case WeaponType.AK47:
			case WeaponType.M4:
			case WeaponType.LMG:
			case WeaponType.Scar:
				if (distance < 5) return 0.5; // Shotgun better close
				if (distance < 40) return 0.9;
				return 0.6; // Okay at range

			case WeaponType.Sniper:
			case WeaponType.AWP:
				if (distance < 10) return 0.1; // Terrible close
				if (distance > 25) return 1.0;
				return 0.7;

			default:
				return 0.5;
		}
	}

	/**
	* Changes the current weapon to one of the specified type.
	*
	* @param {WeaponType} type - The weapon type.
	* @return {WeaponSystem} A reference to this weapon system.
	*/
	changeWeapon(type: string): this {
		const weaponType = type as WeaponType;

		// Verify we have it
		const weaponState = this.weapons.find(w => w.type === weaponType);
		if (!weaponState) return this;

		this.currentWeaponType = weaponType;

		// Command visuals to switch
		if (this.owner.visualWeaponSystem) {
			this.owner.visualWeaponSystem.switchWeapon(weaponType);
		}

		return this;

	}

	/**
	 * Sets the next weapon type the owner should use.
	 */
	setNextWeapon(type: string): this {
		const weaponType = type as WeaponType;
		if (this.currentWeaponType !== weaponType) {
			this.nextWeaponType = weaponType;
		}
		return this;
	}

	/**
	 * Helper to get current weapon type as string/enum
	 */
	getCurrentWeaponType(): WeaponType | null {
		return this.currentWeaponType;
	}

	/**
	* Returns the amount of ammo remaining for the specified weapon.
	*/
	getRemainingAmmoForWeapon(_type: number | string): number {
		// Map legacy number types if needed, or string types
		// Simplified: return a placeholder or query visual system
		if (this.owner.visualWeaponSystem) {
			// We can't easily query specific weapon ammo from visual system without switching
			// So we return a high number for now as bots have infinite ammo conceptually for logic
			return 99;
		}
		return 0;
	}

	/* Legacy support methods */
	getWeapon(type: any): any { return null; }
	showCurrentWeapon(): this { return this; }
	hideCurrentWeapon(): this { return this; }




	/**
	* Updates method of the weapon system. Called each simulation step if the owner is alive.
	*
	* @param {Number} delta - The time delta value.
	* @return {WeaponSystem} A reference to this weapon system.
	*/
	update(delta: number): this {

		this.updateWeaponChange();
		this.humanAim.update(delta);
		this.updateAimAndShot(delta);

		return this;

	}

	/**
	* Updates weapon changing logic.
	*
	* @return {WeaponSystem} A reference to this weapon system.
	*/
	updateWeaponChange(): this {

		if (this.nextWeaponType !== null) {
			// Instant switch for now (can add delays later)
			this.changeWeapon(this.nextWeaponType);
			this.nextWeaponType = null;
		}

		return this;

	}

	/**
	* Updates the aiming and shooting of the enemy.
	*
	* @param {Number} delta - The time delta value.
	* @return {WeaponSystem} A reference to this weapon system.
	*/
	updateAimAndShot(delta: number): this {

		const owner = this.owner;
		const targetSystem = owner.targetSystem;
		const target = targetSystem.getTarget();

		if (target) {

			if (targetSystem.isTargetShootable()) {

				owner.resetSearch();

				const targeted = owner.rotateTo(target.position, delta, 0.05);

				// Debug: Log rotation status
				// if (Math.random() < 0.01) { ... }

				const timeBecameVisible = targetSystem.getTimeBecameVisible();
				const elapsedTime = owner.world.time.getElapsed();

				if (targeted === true && (elapsedTime - timeBecameVisible) >= this.reactionTime) {

					target.bounds.getCenter(targetPosition);

					// Use Human Aim System instead of simple noise
					// Calculate target velocity if available for tracking
					const targetVelocity = target.velocity || new Vector3();
					const aimPoint = this.humanAim.calculateAimPoint(targetPosition, targetVelocity);

					this.shoot(aimPoint);

				}

			} else {
				// Not shootable logic (hunt/search)
				if (owner.searchAttacker) {
					targetPosition.copy(owner.position).add(owner.attackDirection);
					owner.rotateTo(targetPosition, delta);
				} else {
					owner.rotateTo(targetSystem.getLastSensedPosition(), delta);
				}

			}

		} else {
			// No target logic
			if (owner.searchAttacker) {
				targetPosition.copy(owner.position).add(owner.attackDirection);
				owner.rotateTo(targetPosition, delta);
			} else {
				displacement.copy(owner.velocity).normalize();
				targetPosition.copy(owner.position).add(displacement);
				owner.rotateTo(targetPosition, delta);
			}

		}

		return this;

	}

	/**
	* Ensures the enemy does not perfectly aim at the given target position.
	*/
	addNoiseToAim(targetPosition: any): any {

		const distance = this.owner.position.distanceTo(targetPosition);

		offset.x = MathUtils.randFloat(- this.aimAccuracy, this.aimAccuracy);
		offset.y = MathUtils.randFloat(- this.aimAccuracy, this.aimAccuracy);
		offset.z = MathUtils.randFloat(- this.aimAccuracy, this.aimAccuracy);

		const maxDistance = CONFIG.BOT.WEAPON.NOISE_MAX_DISTANCE;
		const f = Math.min(distance, maxDistance) / maxDistance;

		targetPosition.add(offset.multiplyScalar(f));

		return targetPosition;

	}

	/**
	* Shoots at the given position with the current weapon.
	*/
	shoot(targetPosition: any): this {
		if (this.owner.visualWeaponSystem) {
			this.owner._shootWithVisuals(targetPosition);
		}
		return this;
	}

	// Stub for reload if called externally
	reload(): this {
		return this;
	}

	// Stub for initialization (legacy calls)
	_initRenderComponents() { return this; }
	_initFuzzyModules() { return this; }

}

export { AIWeaponSystem };
