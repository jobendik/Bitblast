import { GameEntity, BVH } from 'yuka';
import { Object3D } from 'three';

/**
* Class for representing the level of this game.
*
*/
class Level extends GameEntity {

	public bvh: any;

	// Getter for protected _renderComponent from Yuka's GameEntity
	public get renderComponent(): Object3D | null {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._renderComponent || null;
	}

	/**
	* Constructs a new level entity with the given values.
	*
	* @param {MeshGeometry} geometry - The geometry of this level.
	*/
	constructor(geometry: any) {

		super();

		this.bvh = new BVH().fromMeshGeometry(geometry);
		this.canActivateTrigger = false;

	}

	/**
	* Holds the implementation for the message handling of this game entity.
	*
	* @param {Telegram} telegram - The telegram with the message data.
	* @return {Boolean} Whether the message was processed or not.
	*/
	handleMessage() {

		// do nothing

		return true;

	}

	/**
	* Returns the intesection point if a projectile intersects with this entity.
	* If no intersection is detected, null is returned.
	*
	* @param {Ray} ray - The ray that defines the trajectory of this bullet.
	* @param {Vector3} intersectionPoint - The intersection point.
	* @return {Vector3} The intersection point.
	*/
	checkProjectileIntersection(ray: any, intersectionPoint: any): any {

		return ray.intersectBVH(this.bvh, intersectionPoint);

	}

	/**
	* Returns the intesection point if this entity lies within the given line of sight.
	* If no intersection is detected, null is returned.
	*
	* @param {Ray} ray - The ray that defines the line of sight.
	* @param {Vector3} intersectionPoint - The intersection point.
	* @return {Vector3} The intersection point.
	*/
	lineOfSightTest(ray: any, intersectionPoint: any): any {

		return ray.intersectBVH(this.bvh, intersectionPoint);

	}

}

export { Level };
