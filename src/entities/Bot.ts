import { Vehicle, Regulator, Think, FollowPathBehavior, OnPathBehavior, SeekBehavior, Vector3, Vision, MemorySystem, GameEntity, Quaternion, MathUtils } from 'yuka';
import { LoopOnce } from 'three';
import { MESSAGE_HIT, MESSAGE_DEAD, STATUS_ALIVE, STATUS_DYING, STATUS_DEAD, WEAPON_TYPES_ASSAULT_RIFLE, WEAPON_TYPES_SHOTGUN, HEALTH_PACK } from '../core/Constants';
import { AttackEvaluator } from '../evaluators/AttackEvaluator';
import { ExploreEvaluator } from '../evaluators/ExploreEvaluator';
import { CharacterBounds } from '../utils/CharacterBounds';
import { AIWeaponSystem } from '../core/AIWeaponSystem';
import { TargetSystem } from '../core/TargetSystem';
import { CONFIG } from '../core/Config';
import { GetHealthEvaluator } from '../evaluators/GetHealthEvaluator';
import { GetWeaponEvaluator } from '../evaluators/GetWeaponEvaluator';
import World from '../core/World';
import { PlayerWeaponSystem } from '../systems/PlayerWeaponSystem';
import { Camera as ThreeCamera, PerspectiveCamera, Vector3 as ThreeVector3, Object3D, BoxGeometry, MeshBasicMaterial, Mesh, DoubleSide } from 'three';
import { WeaponType } from '../types/weapons';
import { PersonalitySystem } from '../core/PersonalitySystem';
import { CombatTacticsSystem } from '../core/CombatTacticsSystem';
import { EventDispatcher } from '../core/EventDispatcher';
import { TakeCoverEvaluator } from '../evaluators/TakeCoverEvaluator';
import { FlankEvaluator } from '../evaluators/FlankEvaluator';

const positiveWeightings = new Array();
const weightings = [0, 0, 0, 0];
const directions = [
	{ direction: new Vector3(0, 0, 1), name: 'forward' },
	{ direction: new Vector3(0, 0, - 1), name: 'backward' },
	{ direction: new Vector3(- 1, 0, 0), name: 'left' },
	{ direction: new Vector3(1, 0, 0), name: 'right' }
];
const lookDirection = new Vector3();
const moveDirection = new Vector3();
const quaternion = new Quaternion();
const transformedDirection = new Vector3();
const worldPosition = new Vector3();
const customTarget = new Vector3();

/**
* Class for representing AI-controlled bots in this game.
* Bots simulate human players and can fill in during matchmaking.
*/
class Bot extends Vehicle {

	public world: typeof World;
	public currentTime: number;
	public boundingRadius: number;
	public maxSpeed: number;
	public updateOrientation: boolean;
	public health: number;
	public maxHealth: number;
	public status: number;
	public isPlayer: boolean;

	public currentRegion: any;
	public currentPosition: Vector3;
	public previousPosition: Vector3;

	public searchAttacker: boolean;
	public attackDirection: Vector3;
	public endTimeSearch: number;
	public searchTime: number;

	public ignoreHealth: boolean;
	public ignoreWeapons: boolean;
	public ignoreShotgun: boolean;
	public ignoreAssaultRifle: boolean;
	public endTimeIgnoreHealth: number;
	public endTimeIgnoreShotgun: number;
	public endTimeIgnoreAssaultRifle: number;
	public ignoreItemsTimeout: number;

	public endTimeDying: number;
	public dyingTime: number;

	public head: GameEntity;
	public weaponContainer: GameEntity;
	public bounds: CharacterBounds;

	public mixer: any;
	public animations: Map<string, any>;
	public audios: Map<string, any>;

	public path: any;

	public brain: Think<Bot>;
	public goalArbitrationRegulator: Regulator;

	public memorySystem: MemorySystem;
	public memoryRecords: Array<any>;

	declare public steering: any;

	public vision: Vision;
	public visionRegulator: Regulator;

	public targetSystem: TargetSystem;
	public targetSystemRegulator: Regulator;

	public weaponSystem: AIWeaponSystem;
	public weaponSelectionRegulator: Regulator;

	// Visual weapon system for rendering
	public visualWeaponSystem: PlayerWeaponSystem | null = null;
	public botCamera: ThreeCamera | null = null; // Virtual camera for weapon rendering

	// Advanced AI Systems
	public personalitySystem: PersonalitySystem;
	public combatTacticsSystem: CombatTacticsSystem;
	public events: EventDispatcher;
	public currentSquadOrder: string | null = null;
	public tookDamageRecently: boolean = false;
	public damageTime: number = 0;

	// Combat-movement state (consumed by CombatTacticsSystem)
	public inCombat: boolean = false;
	public isCrouching: boolean = false;
	public spawnProtectedUntil: number = 0; // currentTime until which damage is ignored

	/**
	 * Serialization for network sync
	 */
	toJSON() {
		return {
			id: this.uuid,
			oderId: this.uuid, // Legacy/typo support
			username: this.name,
			position: this.position,
			rotation: this.rotation,
			health: this.health,
			isAlive: this.status === STATUS_ALIVE,
			animation: 'idle', // Default
			weaponType: this.weaponSystem.currentWeaponType
		};
	}

	// Getter for protected _renderComponent from Yuka's GameEntity
	public get renderComponent(): Object3D | null {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._renderComponent || null;
	}

	public pathHelper: any;
	public hitboxHelper: any;

	/**
	* Constructs a new enemy.
	*
	* @param {World} world - A reference to the world.
	*/
	constructor(world: typeof World) {

		super();

		this.world = world;

		this.currentTime = 0;
		this.boundingRadius = CONFIG.BOT.BOUNDING_RADIUS;
		this.maxSpeed = CONFIG.BOT.MOVEMENT.MAX_SPEED;
		this.updateOrientation = false;
		this.health = CONFIG.BOT.MAX_HEALTH;
		this.maxHealth = CONFIG.BOT.MAX_HEALTH;
		this.status = STATUS_ALIVE;
		this.isPlayer = false;

		// current convex region of the navmesh the entity is in

		this.currentRegion = null;
		this.currentPosition = new Vector3();
		this.previousPosition = new Vector3();

		// searching for attackers

		this.searchAttacker = false;
		this.attackDirection = new Vector3();
		this.endTimeSearch = Infinity;
		this.searchTime = CONFIG.BOT.SEARCH_FOR_ATTACKER_TIME;

		// item related properties

		this.ignoreHealth = false;
		this.ignoreWeapons = false;
		this.ignoreShotgun = false;
		this.ignoreAssaultRifle = false;
		this.endTimeIgnoreHealth = Infinity;
		this.endTimeIgnoreShotgun = Infinity;
		this.endTimeIgnoreAssaultRifle = Infinity;
		this.ignoreItemsTimeout = CONFIG.BOT.IGNORE_ITEMS_TIMEOUT;


		// death animation

		this.endTimeDying = Infinity;
		this.dyingTime = CONFIG.BOT.DYING_TIME;

		// head

		this.head = new GameEntity();
		this.head.position.y = CONFIG.BOT.HEAD_HEIGHT;
		this.add(this.head);

		// the weapons are attached to the following container entity

		this.weaponContainer = new GameEntity();
		this.head.add(this.weaponContainer);

		// bounds

		this.bounds = new CharacterBounds(this);

		// animation

		this.mixer = null;
		this.animations = new Map();
		this.audios = new Map();

		// brain

		this.brain = new Think(this);
		this.brain.addEvaluator(new AttackEvaluator());
		this.brain.addEvaluator(new GetHealthEvaluator());
		this.brain.addEvaluator(new GetWeaponEvaluator()); // Default is Shotgun
		this.brain.addEvaluator(new GetWeaponEvaluator(1, WEAPON_TYPES_ASSAULT_RIFLE));
		this.brain.addEvaluator(new ExploreEvaluator());
		this.brain.addEvaluator(new TakeCoverEvaluator());
		this.brain.addEvaluator(new FlankEvaluator());

		this.goalArbitrationRegulator = new Regulator(CONFIG.BOT.GOAL_ARBITRATION_FREQUENCY);

		// memory

		this.memorySystem = new MemorySystem(this);
		this.memorySystem.memorySpan = CONFIG.BOT.MEMORY.SPAN;
		this.memoryRecords = new Array();

		// steering

		const followPathBehavior = new FollowPathBehavior();
		followPathBehavior.active = false;
		followPathBehavior.nextWaypointDistance = CONFIG.BOT.NAVIGATION.NEXT_WAYPOINT_DISTANCE;
		(followPathBehavior as any)._arrive.deceleration = CONFIG.BOT.NAVIGATION.ARRIVE_DECELERATION;
		this.steering.add(followPathBehavior);

		const onPathBehavior = new OnPathBehavior();
		onPathBehavior.active = false;
		onPathBehavior.path = followPathBehavior.path;
		onPathBehavior.radius = CONFIG.BOT.NAVIGATION.PATH_RADIUS;
		onPathBehavior.weight = CONFIG.BOT.NAVIGATION.ONPATH_WEIGHT;
		this.steering.add(onPathBehavior);

		const seekBehavior = new SeekBehavior();
		seekBehavior.active = false;
		this.steering.add(seekBehavior);

		// vision

		this.vision = new Vision(this.head);
		this.vision.fieldOfView = CONFIG.BOT.VISION.FOV;
		this.vision.range = CONFIG.BOT.VISION.RANGE;
		this.visionRegulator = new Regulator(CONFIG.BOT.VISION.UPDATE_FREQUENCY);


		// target system

		this.targetSystem = new TargetSystem(this);
		this.targetSystemRegulator = new Regulator(CONFIG.BOT.TARGET_SYSTEM.UPDATE_FREQUENCY);

		// AI weapon system for decision making

		this.weaponSystem = new AIWeaponSystem(this);
		this.weaponSelectionRegulator = new Regulator(CONFIG.BOT.WEAPON.UPDATE_FREQUENCY);

		// debug

		this.pathHelper = null;
		this.hitboxHelper = null;

		// Initialize Advanced Systems
		this.events = new EventDispatcher();
		this.personalitySystem = new PersonalitySystem();
		this.combatTacticsSystem = new CombatTacticsSystem(this);

		// Set personality-based tuning
		// e.g. this.targetSystem.reactionTime *= ...

		// Register with Coordination System
		if (this.world.aiCoordinationSystem) {
			this.world.aiCoordinationSystem.registerBot(this);
		}

	}

	private _initHeadHitbox(): void {
		if (!this.renderComponent) return;

		let headBone: Object3D | null = null;

		this.renderComponent.traverse((child) => {
			// Prevent overwriting if we already found a "good" head bone
			if (headBone && !headBone.name.toLowerCase().includes('top') && !headBone.name.toLowerCase().includes('end')) return;

			if ((child as any).isBone) {
				const name = child.name.toLowerCase();
				if (name.includes('head') && !name.includes('top') && !name.includes('end')) {
					headBone = child;
				}
			}
		});

		if (headBone) {
			// Head hitbox sized in model space (model scale ~0.02 -> ~0.34m world).
			const geometry = new BoxGeometry(17.0, 17.0, 17.0);

			// Invisible but still raycastable (used for headshot detection).
			const material = new MeshBasicMaterial({
				color: 0xff0000,
				transparent: true,
				opacity: 0,
				depthWrite: false,
				visible: false,
				side: DoubleSide
			});

			const hitbox = new Mesh(geometry, material);
			hitbox.name = 'HeadHitbox';

			// CRITICAL: Tags for CombatManager
			hitbox.userData.isHead = true;
			hitbox.userData.entity = this; // Link back to this Bot

			// Offset so the box sits over the head.
			hitbox.position.y = 1.5;

			(headBone as Object3D).add(hitbox);
		} else if (this.world.debug) {
			console.warn('[Bot] No head bone found for hitbox.');
		}
	}

	/**
	* Executed when this game entity is updated for the first time by its entity manager.
	*
	* @return {Enemy} A reference to this game entity.
	*/
	start() {
		const run = this.animations.get('forward');
		if (run) run.enabled = true;

		const level = this.manager!.getEntityByName('level');
		if (level) {
			this.vision.addObstacle(level);
		}

		this.bounds.init();

		// Initialize visual weapon system for this enemy
		this._initVisualWeaponSystem();

		// Setup Head Hitbox
		this._initHeadHitbox();

		return this;

	}

	/**
	* Updates the internal state of this game entity.
	*
	* @param {Number} delta - The time delta.
	* @return {Enemy} A reference to this game entity.
	*/
	update(delta: number) {

		super.update(delta);

		this.currentTime += delta;

		// ensure the enemy never leaves the level

		this.stayInLevel();

		// only update the core logic of the enemy if it is alive

		if (this.status === STATUS_ALIVE) {

			// update hitbox

			this.bounds.update();

			// update perception

			if (this.visionRegulator.ready()) {

				this.updateVision();

			}

			// update memory system

			this.memorySystem.getValidMemoryRecords(this.currentTime, this.memoryRecords);

			// update target system

			if (this.targetSystemRegulator.ready()) {

				this.targetSystem.update();

			}

			// update goals

			this.brain.execute();

			if (this.goalArbitrationRegulator.ready()) {

				this.brain.arbitrate();

			}

			// update weapon selection (AI decision making handled by goals)
			if (this.weaponSelectionRegulator.ready()) {
				// Weapon selection is handled by attack goals, but we force a check here
				// to ensure range-based switching happens regardless of goal state
				this.weaponSystem.selectBestWeapon();
			}

			// stop search for attacker if necessary

			if (this.currentTime >= this.endTimeSearch) {

				this.resetSearch();

			}

			// reset ignore flags if necessary

			if (this.currentTime >= this.endTimeIgnoreHealth) {

				this.ignoreHealth = false;

			}

			if (this.currentTime >= this.endTimeIgnoreShotgun) {

				this.ignoreShotgun = false;

			}

			if (this.currentTime >= this.endTimeIgnoreAssaultRifle) {

				this.ignoreAssaultRifle = false;

			}

			// updating the weapon system means updating the aiming and shooting.
			// so this call will change the actual heading/orientation of the enemy

			this.weaponSystem.update(delta);

			// Update visual weapon system (animations, muzzle flash, etc.)
			if (this.visualWeaponSystem && this.botCamera) {
				const isMoving = this.getSpeed() > 0.1;
				this.visualWeaponSystem.update(delta, { x: 0, y: 0 }, false, isMoving, false, this.currentTime);
			}

			// Maintain combat state so tactical movement only runs while engaging.
			this.inCombat = this.targetSystem.hasTarget() && this.targetSystem.isTargetShootable();

			// Update Tactics
			this.combatTacticsSystem.update(delta);

			// Process global events (example)
			// this.events.process()... 

			// Check damage timeout
			if (this.currentTime - this.damageTime > 2.0) {
				this.tookDamageRecently = false;
			}

		}

		// handle dying

		if (this.status === STATUS_DYING) {

			if (this.currentTime >= this.endTimeDying) {

				this.status = STATUS_DEAD;
				this.endTimeDying = Infinity;

			}

		}

		// handle death

		if (this.status === STATUS_DEAD) {

			if (this.world.debug) {

				console.log('DIVE.Bot: Bot with ID %s died.', this.uuid);

			}

			this.reset();

			this.world.spawningManager.respawnCompetitor(this);

		}

		// always update animations

		this.updateAnimations(delta);

		return this;

	}

	/**
	* Ensures the enemy never leaves the level.
	*
	* @return {Enemy} A reference to this game entity.
	*/
	stayInLevel() {

		// "currentPosition" represents the final position after the movement for a single
		// simualation step. it's now necessary to check if this point is still on
		// the navMesh

		this.currentPosition.copy(this.position);

		this.currentRegion = this.world.navMesh.clampMovement(
			this.currentRegion,
			this.previousPosition,
			this.currentPosition,
			this.position // this is the result vector that gets clamped
		);

		// save this position for the next method invocation

		this.previousPosition.copy(this.position);

		// adjust height of the entity according to the ground

		const distance = this.currentRegion.plane.distanceToPoint(this.position);

		this.position.y -= distance * CONFIG.NAVMESH.HEIGHT_CHANGE_FACTOR; // smooth transition

		return this;

	}

	/**
	* Updates the vision component of this game entity and stores
	* the result in the respective memory system.
	*
	* @return {Enemy} A reference to this game entity.
	*/
	updateVision() {

		const memorySystem = this.memorySystem;
		const vision = this.vision;

		const competitors = this.world.competitors;

		for (let i = 0, l = competitors.length; i < l; i++) {

			const competitor = competitors[i];

			// ignore own entity and consider only living enemies

			if (competitor === this || competitor.status !== STATUS_ALIVE) continue;

			if (memorySystem.hasRecord(competitor) === false) {

				memorySystem.createRecord(competitor);

			}

			const record = memorySystem.getRecord(competitor);

			competitor.head.getWorldPosition(worldPosition);

			if (record && vision.visible(worldPosition) === true && competitor.active) {

				record.timeLastSensed = this.currentTime;
				record.lastSensedPosition.copy(competitor.position); // it's intended to use the body's position here
				if (record.visible === false) record.timeBecameVisible = this.currentTime;
				record.visible = true;

			} else if (record) {

				record.visible = false;

			}

		}

		return this;

	}

	/**
	* Updates the animations of this game entity.
	*
	* @param {Number} delta - The time delta.
	* @return {Enemy} A reference to this game entity.
	*/
	updateAnimations(delta: number) {

		if (this.status === STATUS_ALIVE) {

			// directions

			this.getDirection(lookDirection);
			moveDirection.copy(this.velocity).normalize();

			// rotation

			quaternion.lookAt(this.forward, moveDirection, this.up);

			// calculate weightings for movement animations

			positiveWeightings.length = 0;
			let sum = 0;

			for (let i = 0, l = directions.length; i < l; i++) {

				transformedDirection.copy(directions[i].direction).applyRotation(quaternion);
				const dot = transformedDirection.dot(lookDirection);
				weightings[i] = (dot < 0) ? 0 : dot;
				const animation = this.animations.get(directions[i].name);

				if (weightings[i] > 0.001) {

					animation.enabled = true;
					positiveWeightings.push(i);
					sum += weightings[i];

				} else {

					animation.enabled = false;
					animation.weight = 0;

				}

			}

			// the weightings for enabled animations have to be calculated in an additional
			// loop since the sum of weightings of all enabled animations has to be 1

			for (let i = 0, l = positiveWeightings.length; i < l; i++) {

				const index = positiveWeightings[i];
				const animation = this.animations.get(directions[index].name);
				animation.weight = weightings[index] / sum;

				// scale the animtion based on the actual velocity

				animation.timeScale = this.getSpeed() / this.maxSpeed;

			}

		}

		this.mixer.update(delta);

		return this;

	}

	/**
	* Adds the given health points to this entity.
	*
	* @param {Number} amount - The amount of health to add.
	* @return {Enemy} A reference to this game entity.
	*/
	addHealth(amount: number) {

		this.health += amount;

		if (amount < 0) {
			// Taking Damage
			this.tookDamageRecently = true;
			this.damageTime = this.currentTime;

			// Trigger aiming stress
			if (this.weaponSystem && this.weaponSystem.humanAim) {
				this.weaponSystem.humanAim.takeDamage(Math.abs(amount));
			}

			// Trigger tactical reaction (dodge/strafe)
			if (this.combatTacticsSystem) {
				this.combatTacticsSystem.onDamageTaken();
			}
		}

		this.health = Math.min(this.health, this.maxHealth); // ensure that health does not exceed maxHealth

		if (this.world.debug) {

			console.log('DIVE.Bot: Entity with ID %s receives %i health points.', this.uuid, amount);

		}

		return this;

	}



	/**
	* Sets the animations of this game entity by creating a
	* series of animation actions.
	*
	* @param {AnimationMixer} mixer - The animation mixer.
	* @param {Array} clips - An array of animation clips.
	* @return {Enemy} A reference to this game entity.
	*/
	setAnimations(mixer: any, clips: any) {

		this.mixer = mixer;

		// actions

		for (const clip of clips) {

			const action = mixer.clipAction(clip);
			action.play();
			action.enabled = false;
			action.name = clip.name;

			// Death animations should play once and stay at final frame
			if (clip.name.includes('death')) {
				action.loop = LoopOnce;
				action.clampWhenFinished = true;
			}

			// Map specific animation names to generic ones
			// e.g. 'amy_forward' -> 'forward', 'granny_idle' -> 'idle'
			let genericName = action.name;
			if (genericName.includes('_')) {
				genericName = genericName.split('_').slice(1).join('_');
			}

			this.animations.set(genericName, action);

		}

		return this;

	}

	/**
	* Resets the enemy after a death.
	*
	* @return {Enemy} A reference to this game entity.
	*/
	reset() {

		this.health = this.maxHealth;
		this.status = STATUS_ALIVE;

		// reset search for attacker

		this.resetSearch();

		// items

		this.ignoreHealth = false;
		this.ignoreWeapons = false;

		// clear brain and memory

		this.brain.clearSubgoals();

		this.memoryRecords.length = 0;
		this.memorySystem.clear();

		// reset target and weapon system

		this.targetSystem.reset();
		this.weaponSystem.reset();

		// reset all animations

		this.resetAnimations();

		// Note: Default animation will be set in start() after respawn

		return this;

	}

	/**
	* Resets all animations.
	*
	* @return {Enemy} A reference to this game entity.
	*/
	resetAnimations() {

		for (let animation of this.animations.values()) {

			animation.enabled = false;
			animation.time = 0;
			animation.timeScale = 1;

		}

		return this;

	}

	/**
	* Resets the search for an attacker.
	*
	* @return {Enemy} A reference to this game entity.
	*/
	resetSearch() {

		this.searchAttacker = false;
		this.attackDirection.set(0, 0, 0);
		this.endTimeSearch = Infinity;

		return this;

	}

	/**
	* Inits the death of an entity.
	*
	* @return {Enemy} A reference to this game entity.
	*/
	initDeath() {

		this.status = STATUS_DYING;
		this.endTimeDying = this.currentTime + this.dyingTime;

		this.velocity.set(0, 0, 0);

		// Immediately stop all weapon visual effects (muzzle flash, smoke)
		if (this.visualWeaponSystem) {
			this.visualWeaponSystem.stopAllEffects();
		}

		// reset all steering behaviors

		for (let behavior of this.steering.behaviors) {

			behavior.active = false;

		}

		// reset all animations

		this.resetAnimations();

		// start death animation (now with 3 variations)
		// Try to get a valid death animation, falling back if one is missing
		let dying = null;
		const index = MathUtils.randInt(1, 3);
		dying = this.animations.get('death' + index);

		// Fallback: if the randomly selected animation doesn't exist, try the others
		if (!dying) {
			for (let i = 1; i <= 3; i++) {
				dying = this.animations.get('death' + i);
				if (dying) break;
			}
		}

		if (dying) {
			// Reset the animation to start from beginning
			dying.reset();
			dying.enabled = true;
			dying.play();
		} else {
			console.warn(`[Bot] ${this.name}: No death animation found! Index: ${index}`);
		}

		// Play death sound
		const deathSound = this.audios.get('enemy_death');
		if (deathSound) {
			if (deathSound.isPlaying) deathSound.stop();
			deathSound.play();
		} else {
			console.warn('❌ No death sound found for enemy', this.name);
		}

		return this;

	}

	/**
	* Returns the intesection point if a projectile intersects with this entity.
	* If no intersection is detected, null is returned.
	*
	* @param {Ray} ray - The ray that defines the trajectory of this bullet.
	* @param {Vector3} intersectionPoint - The intersection point.
	* @return {Vector3} The intersection point.
	*/
	checkProjectileIntersection(ray: any, intersectionPoint: any) {

		// Don't allow hit detection if enemy is dead or dying
		if (this.status !== STATUS_ALIVE) {
			return null;
		}

		return this.bounds.intersectRay(ray, intersectionPoint);

	}

	/**
	* Returns true if the enemy is at the given target position. The result of the test
	* can be influenced with a configurable tolerance value.
	*
	* @param {Vector3} position - The target position.
	* @return {Boolean} Whether the enemy is at the given target position or not.
	*/
	atPosition(position: any) {

		const tolerance = CONFIG.BOT.NAVIGATION.ARRIVE_TOLERANCE * CONFIG.BOT.NAVIGATION.ARRIVE_TOLERANCE;

		const distance = this.position.squaredDistanceTo(position);

		return distance <= tolerance;

	}

	/**
	* Ignores the given item type for a certain amount of time.
	*
	* @param {Number} type - The item type.
	* @return {Enemy} A reference to this game entity.
	*/
	ignoreItem(type: any) {

		switch (type) {

			case HEALTH_PACK:
				this.ignoreHealth = true;
				this.endTimeIgnoreHealth = this.currentTime + this.ignoreItemsTimeout;
				break;

			case WEAPON_TYPES_SHOTGUN:
				this.ignoreShotgun = true;
				this.endTimeIgnoreShotgun = this.currentTime + this.ignoreItemsTimeout;
				break;

			case WEAPON_TYPES_ASSAULT_RIFLE:
				this.ignoreAssaultRifle = true;
				this.endTimeIgnoreAssaultRifle = this.currentTime + this.ignoreItemsTimeout;
				break;

			default:
				console.error('DIVE.Bot: Invalid item type:', type);
				break;

		}

		return this;

	}

	/**
	* Returns true if the given item type is currently ignored by the enemy.
	*
	* @param {Number} type - The item type.
	* @return {Boolean} Whether the given item type is ignored or not.
	*/
	isItemIgnored(type: number): boolean {

		let ignoreItem = false;

		switch (type) {

			case HEALTH_PACK:
				ignoreItem = this.ignoreHealth;
				break;

			case WEAPON_TYPES_SHOTGUN:
				ignoreItem = this.ignoreShotgun;
				break;

			case WEAPON_TYPES_ASSAULT_RIFLE:
				ignoreItem = this.ignoreAssaultRifle;
				break;

			default:
				console.error('DIVE.Bot: Invalid item type:', type);
				break;

		}

		return ignoreItem;

	}

	/**
	* Removes the given entity from the memory system.
	*
	* @param {GameEntity} entity - The entity to remove
	* @return {Enemy} A reference to this game entity.
	*/
	removeEntityFromMemory(entity: GameEntity): this {

		this.memorySystem.deleteRecord(entity);
		this.memorySystem.getValidMemoryRecords(this.currentTime, this.memoryRecords);

		return this;

	}

	/**
	* Returns true if the enemy can move a step to the given dirction without
	* leaving the level. The new position vector is stored into the given vector.
	*
	* @param {Vector3} direction - The direction vector.
	* @param {Vector3} position - The new position vector.
	* @return {Boolean} Whether the enemy can move a bit to the left or not.
	*/
	canMoveInDirection(direction: any, position: any) {

		position.copy(direction).applyRotation(this.rotation).normalize();
		position.multiplyScalar(CONFIG.BOT.MOVEMENT.DODGE_SIZE).add(this.position);

		const navMesh = this.world.navMesh;
		const region = navMesh.getRegionForPoint(position, 1);

		return region !== null;

	}

	/**
	* Ensure the enemy only changes it rotation around its y-axis by consider the target
	* in a logical xz-plane which has the same height as the current position.
	* In this way, the enemy never "tilts" its body. Necessary for levels with different heights.
	*
	* @param {Vector3} target - The target position.
	* @param {Number} delta - The time delta.
	* @param {Number} tolerance - A tolerance value in radians to tweak the result
	* when a game entity is considered to face a target.
	* @return {Boolean} Whether the entity is faced to the target or not.
	*/
	rotateTo(target: any, delta: number, tolerance: number) {

		customTarget.copy(target);
		customTarget.y = this.position.y;

		return super.rotateTo(customTarget, delta, tolerance);

	}

	/**
	* Initializes the visual weapon system for this enemy.
	* Creates a virtual camera and weapon renderer attached to enemy's head.
	*
	* @return {Enemy} A reference to this game entity.
	*/
	private _initVisualWeaponSystem(): this {
		// Create a virtual camera for this enemy (used for weapon aiming/raycast)
		this.botCamera = new PerspectiveCamera(75, 1, 0.1, 1000);

		// Position camera at enemy's head by finding the head bone in the skeleton
		let handBone: any = null;
		let headBone: any = null;

		if (this.renderComponent) {
			// Try to find head and hand bones in the skeleton
			this.renderComponent.traverse((child: any) => {
				if (child.isBone) {
					const boneName = child.name.toLowerCase();
					if (boneName.includes('head')) {
						headBone = child;
					}
					// Look for right hand bone (weapon hand) - prioritize actual hand bone over fingers
					// For Mixamo rigs, look for "righthand" without "finger" or "thumb"
					if (boneName.includes('righthand') && !boneName.includes('thumb') && !boneName.includes('index') &&
						!boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
						handBone = child;
					}
					// Generic hand bone patterns
					if (!handBone && (boneName.includes('hand') && boneName.includes('right') ||
						boneName.includes('r_hand') ||
						boneName.includes('hand_r') ||
						boneName.includes('rhand'))) {
						handBone = child;
					}
					// Fallback to forearm/arm if no hand found
					if (!handBone && (boneName.includes('forearm') && boneName.includes('right') ||
						boneName.includes('arm') && boneName.includes('right') ||
						boneName.includes('r_arm') ||
						boneName.includes('arm_r'))) {
						handBone = child;
					}
				}
			});

			// If we found a head bone, attach camera to it
			// Otherwise attach to the root render component
			const attachPoint = headBone || this.renderComponent;
			attachPoint.add(this.botCamera);

			// Position camera slightly forward and up if attached to root
			if (!headBone) {
				this.botCamera.position.set(0, CONFIG.BOT.HEAD_HEIGHT, 0.5);
			}
		}

		// Create visual weapon system for this enemy
		this.visualWeaponSystem = new PlayerWeaponSystem(
			this.world.scene,
			this.botCamera,
			this.world.assetManager,
			this.world.combat.audioManager
		);

		// Set up shell ejection callback
		this.visualWeaponSystem.setShellEjectCallback((pos: ThreeVector3, dir: ThreeVector3) => {
			// Ground level is the enemy's Y position (enemy.position is at feet level)
			const groundLevel = this.position.y;
			this.world.combat.particleSystem.spawnShellCasing(pos, dir, groundLevel);
		});

		// Configure for third-person mode so weapon is visible in enemy's hand
		if (handBone) {
			this.visualWeaponSystem.setThirdPersonMode(handBone);
		}

		if (!handBone && this.renderComponent) {
			// Create a weapon mount point if no hand bone found
			const weaponMount = new Object3D();
			weaponMount.name = 'weapon_mount';
			weaponMount.position.set(0.3, CONFIG.BOT.HEAD_HEIGHT * 0.6, 0.2); // Position at right side, chest height
			this.renderComponent.add(weaponMount);
			this.visualWeaponSystem.setThirdPersonMode(weaponMount);
		}



		// All weapons
		const allWeapons = Object.values(WeaponType);

		// Register all weapons with AI Brain
		for (const weapon of allWeapons) {
			this.weaponSystem.addWeapon(weapon);
		}

		// Start with Primary (e.g. AK47 or random from all)
		const randomStart = allWeapons[Math.floor(Math.random() * allWeapons.length)];
		this.weaponSystem.changeWeapon(randomStart);

		// Verify weapon was created in visual system (changeWeapon should trigger this)
		if (!this.visualWeaponSystem.weaponMesh) {
			console.error(`[Bot ${this.name}] NO WEAPON MESH CREATED!`);
			// Fallback
			this.visualWeaponSystem.switchWeapon(randomStart);
		}

		return this;
	}


	/**
	 * Adds a weapon to the bot's inventory.
	 * Can accept legacy numerical types (from pickups) or string types.
	 * 
	 * @param {Number|string} type - The weapon type.
	 */
	addWeapon(type: any): this {
		let weaponType: WeaponType | null = null;

		// Map legacy numerical types to new string enum
		if (typeof type === 'number') {
			switch (type) {
				case 1: // WEAPON_TYPES_BLASTER
					weaponType = WeaponType.Pistol; // Blaster maps to Pistol
					break;
				case 2: // WEAPON_TYPES_SHOTGUN
					weaponType = WeaponType.Shotgun;
					break;
				case 3: // WEAPON_TYPES_ASSAULT_RIFLE
					weaponType = WeaponType.M4; // AR maps to M4 by default
					break;
				default:
					console.warn(`[Bot] Unknown legacy weapon type: ${type}`);
					return this;
			}
		} else {
			weaponType = type as WeaponType;
		}

		if (weaponType) {
			this.weaponSystem.addWeapon(weaponType);
		}

		return this;
	}

	/**
	* Shoots using the visual weapon system at the target position.
	* This creates proper muzzle flash, tracers, and impacts.
	*
	* @param {Vector3} targetPosition - The target position in Yuka space.
	* @return {Enemy} A reference to this game entity.
	*/
	public _shootWithVisuals(targetPosition: Vector3): this {
		if (!this.visualWeaponSystem || !this.botCamera) return this;

		// Update camera orientation to match enemy
		if (this.renderComponent) {
			this.renderComponent.updateMatrixWorld(true);
			this.botCamera.updateMatrixWorld(true);

			// Make camera look at target
			const targetThree = new ThreeVector3(targetPosition.x, targetPosition.y, targetPosition.z);
			this.botCamera.lookAt(targetThree);
		}

		// Shoot using visual weapon system
		const result = this.visualWeaponSystem.shoot(
			this.botCamera,
			true, // onGround
			false, // isSprinting
			new ThreeVector3(this.velocity.x, this.velocity.y, this.velocity.z)
		);

		if (result.shotFired) {
			// Build obstacle list (same as Player)
			const obstacles: any[] = [];

			// Add level
			if (this.world.level && this.world.level.renderComponent) {
				obstacles.push(this.world.level.renderComponent);
			}

			// Add player
			if (this.world.player && this.world.player.renderComponent) {
				obstacles.push(this.world.player.renderComponent);
			}

			// Add other competitors (excluding self)
			for (const competitor of this.world.competitors) {
				if (competitor !== this && competitor.renderComponent && competitor.status === STATUS_ALIVE) {
					obstacles.push(competitor.renderComponent);
				}
			}

			// Get muzzle position from visual weapon system
			const muzzlePos = this.visualWeaponSystem.getMuzzleWorldPosition();
			const config = this.visualWeaponSystem.currentConfig;

			// Process shot(s) with combat system
			if (result.directions) {
				// Shotgun - multiple pellets
				for (const direction of result.directions) {
					this.world.combat.processEnemyShot(
						this.botCamera,
						direction,
						muzzlePos,
						obstacles,
						this,
						config
					);
				}
			} else {
				// Single shot
				this.world.combat.processEnemyShot(
					this.botCamera,
					result.direction,
					muzzlePos,
					obstacles,
					this,
					config
				);
			}
		}

		return this;
	}

	/**
	* Holds the implementation for the message handling of this game entity.
	*
	* @param {Telegram} telegram - The telegram with the message data.
	* @return {Boolean} Whether the message was processed or not.
	*/
	handleMessage(telegram: any) {

		switch (telegram.message) {

			case MESSAGE_HIT:

				// Ignore damage if already dead or dying
				if (this.status !== STATUS_ALIVE) {
					return true;
				}

				// Ignore damage during spawn protection.
				if (this.currentTime < this.spawnProtectedUntil) {
					return true;
				}

				// reduce health (clamp to 0 minimum)
				this.health = Math.max(0, this.health - telegram.data.damage);

				// React to incoming fire: throw off aim and trigger an evasive maneuver.
				this.tookDamageRecently = true;
				this.damageTime = this.currentTime;
				if (this.weaponSystem?.humanAim) {
					this.weaponSystem.humanAim.takeDamage(telegram.data.damage);
				}
				if (this.combatTacticsSystem) {
					this.combatTacticsSystem.onDamageTaken();
				}

				// logging

				if (this.world.debug) {

					console.log('DIVE.Bot: Bot with ID %s hit by Game Entity with ID %s receiving %i damage.', this.uuid, telegram.sender.uuid, telegram.data.damage);

				}

				// check if the enemy is death

				if (this.health <= 0 && this.status === STATUS_ALIVE) {

					this.initDeath();

					// Track kill for game mode statistics
					const killMode = this.world.gameModeManager?.getCurrentMode();
					if (killMode && telegram.sender) {
						const killerId = telegram.sender.uuid;
						const victimId = this.uuid;
						const weapon = telegram.data.weapon || 'Unknown';
						const isHeadshot = telegram.data.isHeadshot || false;

						killMode.onPlayerKill(
							killerId,
							victimId,
							weapon,
							isHeadshot
						);
					}

					// inform all other competitors about its death

					const competitors = this.world.competitors;

					for (let i = 0, l = competitors.length; i < l; i++) {

						const competitor = competitors[i];

						if (this !== competitor) this.sendMessage(competitor, MESSAGE_DEAD);

					}

					// update UI

					// Use game HUD Manager if available
					if (this.world.hudManager) {
						const killerName = telegram.sender.isPlayer ? 'Player' : telegram.sender.name || 'Enemy';
						const victimName = this.name || 'Enemy';
						const weapon = telegram.data.weapon || 'Unknown';
						const isHeadshot = telegram.data.isHeadshot || false;

						this.world.hudManager.addKillFeed(killerName, victimName, weapon, isHeadshot);
					} else {
						// Fallback to old UI
						this.world.uiManager.addFragMessage(telegram.sender, this);
					}

				} else {

					// if not, search for attacker if he is still alive

					if (telegram.sender.status === STATUS_ALIVE) {

						this.searchAttacker = true;
						this.endTimeSearch = this.currentTime + this.searchTime; // only search for a specific amount of time
						this.attackDirection.copy(telegram.data.direction).multiplyScalar(- 1); // negate the vector

					}

				}

				break;

			case MESSAGE_DEAD:

				const sender = telegram.sender;
				const memoryRecord = this.memorySystem.getRecord(sender);

				// delete the dead enemy from the memory system when it was visible.
				// also update the target system so the bot looks for a different target

				if (memoryRecord && memoryRecord.visible) {

					this.removeEntityFromMemory(sender);
					this.targetSystem.update();

				}

				break;

		}

		return true;

	}

}

export { Bot };
