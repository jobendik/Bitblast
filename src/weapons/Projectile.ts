import { MovingEntity, Ray, Vector3, GameEntity } from 'yuka';
import { MESSAGE_HIT } from '../core/Constants';
import * as THREE from 'three';
import { SurfaceMaterial } from '../systems/DecalSystem';

const intersectionPoint = new Vector3();
const ray = new Ray();

/**
* Base class for representing a projectile.
*/
class Projectile extends MovingEntity {

	public owner: any; // Using any for now to avoid circular dependency issues, or use GameEntity if possible
	public ray: Ray;
	public lifetime: number;
	public currentTime: number;
	public damage: number;

	/**
	* Constructs a new projectile with the given values.
	*
	* @param {GameEntity} owner - The owner of this projectile.
	* @param {Ray} ray - The ray that defines the trajectory of this projectile.
	*/
	constructor(owner: GameEntity | null = null, ray = new Ray()) {

		super();

		this.canActivateTrigger = false;

		this.owner = owner;
		this.ray = ray;

		this.lifetime = 0;
		this.currentTime = 0;

		this.damage = 0;

		return this;

	}

	/**
	* Update method of this projectile.
	*
	* @param {Number} delta - The time delta value;
	* @return {Projectile} A reference to this projectile.
	*/
	update(delta: number) {

		const world = this.owner.world;

		this.currentTime += delta;

		if (this.currentTime > this.lifetime) {

			world.remove(this);

		} else {

			ray.copy(this.ray);
			ray.origin.copy(this.position);

			super.update(delta);

			const entity = world.checkProjectileIntersection(this, intersectionPoint);

			if (entity !== null) {

				// calculate distance from origin to intersection point

				const distanceToIntersection = ray.origin.squaredDistanceTo(intersectionPoint);
				const validDistance = ray.origin.squaredDistanceTo(this.position);

				if (distanceToIntersection <= validDistance) {

					// Create bullet hole decal for level hits
					if (entity === world.level && world.combat && world.combat.decalSystem) {
						const hitNormal = (this as any)._lastHitNormal;
						if (hitNormal) {
							// Convert Yuka Vector3 to Three.js Vector3
							const threeHitPoint = new THREE.Vector3(intersectionPoint.x, intersectionPoint.y, intersectionPoint.z);
							const threeNormal = new THREE.Vector3(hitNormal.x, hitNormal.y, hitNormal.z);
							
							world.combat.decalSystem.createDecal(threeHitPoint, threeNormal, SurfaceMaterial.ROCK);
						}
					}

					// inform game entity about hit

					this.owner.sendMessage(entity, MESSAGE_HIT, 0, { damage: this.damage, direction: this.ray.direction });

					// remove projectile from world

					world.remove(this);

				}

			}

		}

		return this;

	}

}

export { Projectile };
