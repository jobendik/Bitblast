import { SphericalTriggerRegion, Vector3 } from 'yuka';
import * as THREE from 'three';
import { HealthPack } from '../entities/HealthPack.js';
import { ItemGiver } from '../triggers/ItemGiver.js';
import { SceneUtils } from '../utils/SceneUtils.js';
import { HEALTH_PACK, WEAPON_TYPES_ASSAULT_RIFLE, WEAPON_TYPES_BLASTER, WEAPON_TYPES_SHOTGUN } from './Constants.js';
import { WeaponItem } from '../entities/WeaponItem.js';
import { CONFIG } from './Config.js';

/**
* This class is responsible for (re)spawning enemies.
*
*/
class SpawningManager {

	public world: any;
	public spawningPoints: Array<any>;
	public itemTriggerMap: Map<any, any>;
	public healthPacks: Array<any>;
	public healthPackSpawningPoints: Array<any>;
	public blasters: Array<any>;
	public blasterSpawningPoints: Array<any>;
	public shotguns: Array<any>;
	public shotgunSpawningPoints: Array<any>;
	public assaultRilfles: Array<any>;
	public assaultRilflesSpawningPoints: Array<any>;

	/**
	* Constructor to create a new SpawningManager.
	*
	* @param {World} world - A reference to the world.
	*/
	constructor(world: any) {

		this.world = world;

		// spawning points for competitors

		this.spawningPoints = new Array();

		// items

		this.itemTriggerMap = new Map(); // for mapping item -> trigger

		// health packs

		this.healthPacks = new Array();
		this.healthPackSpawningPoints = new Array();

		// weapons

		this.blasters = new Array();
		this.blasterSpawningPoints = new Array();

		this.shotguns = new Array();
		this.shotgunSpawningPoints = new Array();

		this.assaultRilfles = new Array();
		this.assaultRilflesSpawningPoints = new Array();

	}

	/**
	* Update method of this manager. Called per simluation step.
	*
	* @param {Number} delta - The time delta.
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	update(delta: number): this {

		this.updateItemList(this.healthPacks, delta);
		this.updateItemList(this.blasters, delta);
		this.updateItemList(this.shotguns, delta);
		this.updateItemList(this.assaultRilfles, delta);

		return this;

	}

	/**
	* Updates the given item list.
	*
	* @param {Array} itemsList - A list of items.
	* @param {Number} delta - The time delta.
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	updateItemList(itemsList: any[], delta: number): this {

		// check if a respawn is necessary

		for (let i = 0, il = itemsList.length; i < il; i++) {

			const item = itemsList[i];

			item.currentTime += delta;

			if (item.currentTime >= item.nextSpawnTime) {

				this._respawnItem(item);

			}

		}

		return this;

	}

	/**
	* Returns an array with items of the given type.
	*
	* @param {Number} type - The requested item type.
	* @return {Array} An array with items (game entities).
	*/
	getItemList(type: number): any[] | null {

		let itemList = null;

		switch (type) {

			case HEALTH_PACK:
				itemList = this.healthPacks;
				break;

			case WEAPON_TYPES_BLASTER:
				itemList = this.blasters;
				break;

			case WEAPON_TYPES_SHOTGUN:
				itemList = this.shotguns;
				break;

			case WEAPON_TYPES_ASSAULT_RIFLE:
				itemList = this.assaultRilfles;
				break;

			default:
				console.error('DIVE.SpawningManager: Invalid item type:', type);
				break;

		}

		return itemList;

	}

	/**
	* Respawns the given competitor.
	*
	* @param {GameEntity} competitor - The entity to respawn.
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	respawnCompetitor(competitor: any): this {

		const spawnPoint = this.getSpawnPoint(competitor);

		competitor.position.copy(spawnPoint.position);
		competitor.rotation.fromEuler(spawnPoint.rotation.x, spawnPoint.rotation.y, spawnPoint.rotation.z);

		if (competitor.isPlayer) competitor.head.rotation.set(0, 0, 0, 1);

		// Initialize the current region for navMesh-based collision
		if (this.world.navMesh) {
			competitor.currentRegion = this.world.navMesh.getRegionForPoint(competitor.position, 1);
			competitor.previousPosition.copy(competitor.position);
		}

		return this;

	}

	/**
	* Gets a suitable respawn point for the given enemy.
	*
	* @param {Enemy} enemy - The enemy for which a suitable point is searched.
	* @returns {Vector3} The spawning point.
	*/
	getSpawnPoint(enemy: any): any {

		const spawningPoints = this.spawningPoints;
		const competitors = this.world.competitors;

		// Collect all entities to avoid (bots, local player, remote players)
		const allEntities: any[] = [...competitors];
		
		// Add local player if exists and not the spawning entity
		if (this.world.player && this.world.player !== enemy) {
			allEntities.push(this.world.player);
		}
		
		// Add remote players if network manager exists
		if (this.world.networkManager) {
			const remotePlayers = this.world.networkManager.getRemotePlayers();
			for (const rp of remotePlayers) {
				if (rp !== enemy) {
					allEntities.push(rp);
				}
			}
		}

		let maxDistance = - Infinity;
		let bestSpawningPoint = null;

		// searching for the spawning point furthest away from all entities

		for (let i = 0, il = spawningPoints.length; i < il; i++) {

			const spawningPoint = spawningPoints[i];

			let closestDistance = Infinity;

			for (let j = 0, jl = allEntities.length; j < jl; j++) {

				const entity = allEntities[j];

				if (entity !== enemy && entity.position) {

					// Handle both Yuka Vector3 (squaredDistanceTo) and THREE.Vector3 (distanceToSquared)
					let distance: number;
					const entityPos = entity.position;
					if (typeof spawningPoint.position.squaredDistanceTo === 'function') {
						// Yuka Vector3 - convert THREE.Vector3 if needed
						if (typeof entityPos.x === 'number') {
							distance = spawningPoint.position.squaredDistanceTo({ x: entityPos.x, y: entityPos.y, z: entityPos.z });
						} else {
							distance = spawningPoint.position.squaredDistanceTo(entityPos);
						}
					} else {
						// Fallback
						const dx = spawningPoint.position.x - entityPos.x;
						const dy = spawningPoint.position.y - entityPos.y;
						const dz = spawningPoint.position.z - entityPos.z;
						distance = dx * dx + dy * dy + dz * dz;
					}

					if (distance < closestDistance) {

						closestDistance = distance;

					}

				}

			}

			if (closestDistance > maxDistance) {

				maxDistance = closestDistance;
				bestSpawningPoint = spawningPoint;

			}

		}

		return bestSpawningPoint;

	}

	/**
	* Inits the spawning manager.
	*
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	init(): this {

		this.initSpawningPoints();
		this.initHealthPacks();
		this.initWeapons();

		return this;

	}

	/**
	* Inits the spawning points from the parsed configuration file.
	*
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	initSpawningPoints(): this {

		const levelConfig = this.world.assetManager.configs.get('level');

		for (const spawningPoint of levelConfig.competitorSpawningPoints) {

			const position = spawningPoint.position;
			const rotation = spawningPoint.rotation;

			this.spawningPoints.push({
				position: new Vector3().fromArray(position),
				rotation: { x: rotation[0], y: rotation[1], z: rotation[2] } // euler angles
			});

		}

		for (const spawningPoint of levelConfig.healthPackSpawningPoints) {

			this.healthPackSpawningPoints.push(new Vector3().fromArray(spawningPoint));

		}

		for (const spawningPoint of levelConfig.shotgunSpawningPoints) {

			this.shotgunSpawningPoints.push(new Vector3().fromArray(spawningPoint));

		}

		for (const spawningPoint of levelConfig.assaultRilflesSpawningPoints) {

			this.assaultRilflesSpawningPoints.push(new Vector3().fromArray(spawningPoint));

		}

		return this;

	}

	/**
	* Inits the collectable health packs.
	*
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	initHealthPacks(): this {

		const world = this.world;
		const assetManager = world.assetManager;

		for (let spawningPoint of this.healthPackSpawningPoints) {

			// health pack entity

			const healthPack = new HealthPack();
			healthPack.position.copy(spawningPoint);

			const renderComponent = world.assetManager.models.get('healthPack').clone();
			renderComponent.position.copy(healthPack.position);
			healthPack.setRenderComponent(renderComponent, sync);

			this.healthPacks.push(healthPack);
			world.add(healthPack);

			// navigation

			healthPack.currentRegion = world.navMesh.getRegionForPoint(healthPack.position, 1);

			// audio

			const audio = assetManager.cloneAudio(assetManager.audios.get('health'));
			healthPack._audio = audio;
			renderComponent.add(audio);

			// trigger

			this.createTrigger(healthPack, CONFIG.HEALTH_PACK.RADIUS);

		}

		return this;

	}

	/**
	* Inits the collectable weapons.
	*
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	initWeapons(): this {

		const world = this.world;
		const assetManager = world.assetManager;

		for (let spawningPoint of this.blasterSpawningPoints) {

			// blaster item

			const blasterItem = new WeaponItem(WEAPON_TYPES_BLASTER, CONFIG.BLASTER.RESPAWN_TIME, CONFIG.BLASTER.AMMO);
			blasterItem.position.copy(spawningPoint);

			const renderComponent = assetManager.models.get('blaster_low').clone();
			renderComponent.position.copy(blasterItem.position);
			// Scale down weapon pickup (weapon models are larger)
			renderComponent.scale.set(0.1, 0.1, 0.1);
			// Fix material lighting for visibility
			renderComponent.traverse((obj: any) => {
				if (obj.isMesh && obj.material) {
					obj.material.emissive = new THREE.Color(0x444444);
					obj.material.emissiveIntensity = 0.3;
					obj.material.needsUpdate = true;
				}
			});
			blasterItem.setRenderComponent(renderComponent, sync);

			this.blasters.push(blasterItem);
			world.add(blasterItem);

			// navigation

			blasterItem.currentRegion = world.navMesh.getRegionForPoint(blasterItem.position, 1);

			// audio

			const audio = assetManager.cloneAudio(assetManager.audios.get('ammo'));
			blasterItem._audio = audio;
			audio.setVolume(0.5);
			renderComponent.add(audio);

			// trigger

			this.createTrigger(blasterItem, CONFIG.BLASTER.RADIUS);

		}

		for (let spawningPoint of this.shotgunSpawningPoints) {

			// shotgun item

			const shotgunItem = new WeaponItem(WEAPON_TYPES_SHOTGUN, CONFIG.SHOTGUN.RESPAWN_TIME, CONFIG.SHOTGUN.AMMO);
			shotgunItem.position.copy(spawningPoint);

			const renderComponent = assetManager.models.get('shotgun_low').clone();
			renderComponent.position.copy(shotgunItem.position);
			// Scale down weapon pickup (weapon models are larger)
			renderComponent.scale.set(0.1, 0.1, 0.1);
			// Fix material lighting for visibility
			renderComponent.traverse((obj: any) => {
				if (obj.isMesh && obj.material) {
					obj.material.emissive = new THREE.Color(0x444444);
					obj.material.emissiveIntensity = 0.3;
					obj.material.needsUpdate = true;
				}
			});
			shotgunItem.setRenderComponent(renderComponent, sync);

			this.shotguns.push(shotgunItem);
			world.add(shotgunItem);

			// navigation

			shotgunItem.currentRegion = world.navMesh.getRegionForPoint(shotgunItem.position, 1);

			// audio

			const audio = assetManager.cloneAudio(assetManager.audios.get('ammo'));
			shotgunItem._audio = audio;
			audio.setVolume(0.5);
			renderComponent.add(audio);

			// trigger

			this.createTrigger(shotgunItem, CONFIG.SHOTGUN.RADIUS);

		}

		for (let spawningPoint of this.assaultRilflesSpawningPoints) {

			// assault rifle item

			const assaultRilfleItem = new WeaponItem(WEAPON_TYPES_ASSAULT_RIFLE, CONFIG.ASSAULT_RIFLE.RESPAWN_TIME, CONFIG.ASSAULT_RIFLE.AMMO);
			assaultRilfleItem.position.copy(spawningPoint);

			const renderComponent = assetManager.models.get('assaultRifle_low').clone();
			renderComponent.position.copy(assaultRilfleItem.position);
			// Scale down weapon pickup (weapon models are larger)
			renderComponent.scale.set(0.1, 0.1, 0.1);
			// Fix material lighting for visibility
			renderComponent.traverse((obj: any) => {
				if (obj.isMesh && obj.material) {
					obj.material.emissive = new THREE.Color(0x444444);
					obj.material.emissiveIntensity = 0.3;
					obj.material.needsUpdate = true;
				}
			});
			assaultRilfleItem.setRenderComponent(renderComponent, sync);

			this.assaultRilfles.push(assaultRilfleItem);
			this.world.add(assaultRilfleItem);

			// navigation

			assaultRilfleItem.currentRegion = world.navMesh.getRegionForPoint(assaultRilfleItem.position, 1);

			// audio

			const audio = assetManager.cloneAudio(assetManager.audios.get('ammo'));
			audio.setVolume(0.5);
			assaultRilfleItem._audio = audio;
			renderComponent.add(audio);

			// trigger

			this.createTrigger(assaultRilfleItem, CONFIG.ASSAULT_RIFLE.RADIUS);

		}

		return this;

	}

	/**
	* Creates a trigger for the given item.
	*
	* @param {Item} item - The collectable item.
	* @param {Number} radius - The radius of the trigger.
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	createTrigger(item: any, radius: number): this {

		const sphericalTriggerRegion = new SphericalTriggerRegion(radius);

		const trigger = new ItemGiver(sphericalTriggerRegion, item);
		item.add(trigger);

		this.itemTriggerMap.set(item, trigger);

		// debugging

		if (this.world.debug) {

			const triggerHelper = SceneUtils.createTriggerHelper(trigger);
			trigger.setRenderComponent(triggerHelper, sync);

			this.world.helpers.itemHelpers.push(triggerHelper);
			this.world.scene.add(triggerHelper);

		}

		return this;

	}

	/**
	* Respawns the given item.
	*
	* @return {SpawningManager} A reference to this spawning manager.
	*/
	_respawnItem(item: any): this {

		// reactivate trigger

		const trigger = this.itemTriggerMap.get(item);
		trigger.active = true;

		// reactivate item

		item.finishRespawn();

		return this;

	}

}
export { SpawningManager };

// used to sync Yuka Game Entities with three.js objects

function sync(entity: any, renderComponent: any): void {

	renderComponent.matrix.copy(entity.worldMatrix);

}
