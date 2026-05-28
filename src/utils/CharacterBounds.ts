import { AABB, Vector3, Ray } from 'yuka';
import { Matrix4 } from 'three';

const rayBindSpace = new Ray();

/**
* Class for representing the bounds of a character (player or bot). Its primary purpose is to avoid
* expensive operations on the actual geometry of a character. Hence, intersection tests
* are performed with a simple hierarchy of AABBs.
*/
class CharacterBounds {

	public owner: any;
	public _outerHitbox: AABB;
	public _outerHitboxDefinition: AABB;
	public _innerHitboxes: any[];
	public _cache: Map<any, any>;

	/**
	* Constructs a new character bounds instance.
	*
	* @param {Bot|Player} owner - The owner of this instance.
	*/
	constructor(owner: any) {

		this.owner = owner;

		// the outer and topmost bounding volume. used in the first
		// phase of an intersection test

		this._outerHitbox = new AABB();
		this._outerHitboxDefinition = new AABB();

		// the inner bounding volumes are assigned to certain bones

		this._innerHitboxes = [];

		// cache that holds the current bone's inverse matrices

		this._cache = new Map();

	}

	/**
	* Inits the bounding volumes of this instance.
	*
	* @return {CharacterBounds} A reference to this instance.
	*/
	init() {

		this._outerHitboxDefinition.set(new Vector3(- 0.5, 0, - 0.5), new Vector3(0.5, 1.8, 0.5));

		const owner = this.owner;

		// skeleton based AABBs

		const renderComponent = owner._renderComponent;
		const hitboxes = this._innerHitboxes;

		// ensure world matrices are up to date

		renderComponent.updateMatrixWorld(true);

		// Helper function to find bone by name variations
		const findBone = (names: string[]) => {
			for (const name of names) {
				const bone = renderComponent.getObjectByName(name);
				if (bone) return bone;
			}
			return null;
		};

		// head and torso

		const headBone = findBone(['Armature_mixamorigHead', 'mixamorigHead', 'Head', 'head']);
		if (headBone) {
			const head = new AABB(new Vector3(- 0.1, 1.6, - 0.1), new Vector3(0.1, 1.8, 0.1));
			let bindMatrix = new Matrix4().copy(headBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: head, bone: headBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		const spineBone = findBone(['Armature_mixamorigSpine1', 'mixamorigSpine1', 'Spine1', 'spine1']);
		if (spineBone) {
			const spine = new AABB(new Vector3(- 0.2, 1, - 0.2), new Vector3(0.2, 1.6, 0.2));
			let bindMatrix = new Matrix4().copy(spineBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: spine, bone: spineBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		// arms

		const rightArmBone = findBone(['Armature_mixamorigRightArm', 'mixamorigRightArm', 'RightArm', 'rightarm']);
		if (rightArmBone) {
			const rightArm = new AABB(new Vector3(- 0.4, 1.42, - 0.15), new Vector3(- 0.2, 1.58, 0.1));
			let bindMatrix = new Matrix4().copy(rightArmBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: rightArm, bone: rightArmBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		const rightForeArmBone = findBone(['Armature_mixamorigRightForeArm', 'mixamorigRightForeArm', 'RightForeArm', 'rightforearm']);
		if (rightForeArmBone) {
			const rightForeArm = new AABB(new Vector3(- 0.8, 1.42, - 0.15), new Vector3(- 0.4, 1.55, 0.05));
			let bindMatrix = new Matrix4().copy(rightForeArmBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: rightForeArm, bone: rightForeArmBone, bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		const leftArmBone = findBone(['Armature_mixamorigLeftArm', 'mixamorigLeftArm', 'LeftArm', 'leftarm']);
		if (leftArmBone) {
			const leftArm = new AABB(new Vector3(0.2, 1.42, - 0.15), new Vector3(0.4, 1.58, 0.1));
			let bindMatrix = new Matrix4().copy(leftArmBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: leftArm, bone: leftArmBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		const leftForeArmBone = findBone(['Armature_mixamorigLeftForeArm', 'mixamorigLeftForeArm', 'LeftForeArm', 'leftforearm']);
		if (leftForeArmBone) {
			const leftForeArm = new AABB(new Vector3(0.4, 1.42, - 0.15), new Vector3(0.8, 1.55, 0.05));
			let bindMatrix = new Matrix4().copy(leftForeArmBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: leftForeArm, bone: leftForeArmBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		// legs

		const rightUpLegBone = findBone(['Armature_mixamorigRightUpLeg', 'mixamorigRightUpLeg', 'RightUpLeg', 'rightupleg']);
		if (rightUpLegBone) {
			const rightUpLeg = new AABB(new Vector3(- 0.2, 0.6, - 0.15), new Vector3(0, 1, 0.15));
			let bindMatrix = new Matrix4().copy(rightUpLegBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: rightUpLeg, bone: rightUpLegBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		const rightLegBone = findBone(['Armature_mixamorigRightLeg', 'mixamorigRightLeg', 'RightLeg', 'rightleg']);
		if (rightLegBone) {
			const rightLeg = new AABB(new Vector3(- 0.2, 0, - 0.15), new Vector3(0, 0.6, 0.15));
			let bindMatrix = new Matrix4().copy(rightLegBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: rightLeg, bone: rightLegBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		const leftUpLegBone = findBone(['Armature_mixamorigLeftUpLeg', 'mixamorigLeftUpLeg', 'LeftUpLeg', 'leftupleg']);
		if (leftUpLegBone) {
			const leftUpLeg = new AABB(new Vector3(0, 0.6, - 0.15), new Vector3(0.2, 1, 0.15));
			let bindMatrix = new Matrix4().copy(leftUpLegBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: leftUpLeg, bone: leftUpLegBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		const leftLegBone = findBone(['Armature_mixamorigLeftLeg', 'mixamorigLeftLeg', 'LeftLeg', 'leftleg']);
		if (leftLegBone) {
			const leftLeg = new AABB(new Vector3(0, 0, - 0.15), new Vector3(0.2, 0.6, 0.15));
			let bindMatrix = new Matrix4().copy(leftLegBone.matrixWorld);
			let bindMatrixInverse = new Matrix4().copy(bindMatrix).invert();
			hitboxes.push({ aabb: leftLeg, bone: leftLegBone, bindMatrix: bindMatrix, bindMatrixInverse: bindMatrixInverse });
		}

		//

		// debugging the AABBs requires the skeleton the be in bind pose at the origin

		// for ( let i = 0, l = hitboxes.length; i < l; i ++ ) {

		// 	const hitbox = hitboxes[ i ];

		// 	const hitboxHelper = SceneUtils.createHitboxHelper( hitbox.aabb );
		// 	this.owner.world.scene.add( hitboxHelper );

		// }

		return this;

	}

	/**
	* Updates the outer bounding volume of this instance. Deeper bounding volumes
	* are only update if necessary.
	*
	* @return {CharacterBounds} A reference to this instance.
	*/
	update() {

		this._outerHitbox.copy(this._outerHitboxDefinition).applyMatrix4(this.owner.worldMatrix);

		return this;

	}

	/**
	* Computes the center point of this instance and stores it into the given vector.
	*
	* @param {Vector3} result - The result vector.
	* @return {Vector3} The result vector.
	*/
	getCenter(center: any) {

		return this._outerHitbox.getCenter(center);

	}

	/**
	* Returns the intesection point if the given ray hits one of the bounding volumes.
	* If no intersection is detected, null is returned.
	*
	* @param {Ray} ray - The ray.
	* @param {Vector3} intersectionPoint - The intersection point.
	* @return {Vector3} The intersection point.
	*/
	intersectRay(ray: any, intersectionPoint: any) {

		// first text outer hitbox

		if (ray.intersectAABB(this._outerHitbox, intersectionPoint)) {

			// now test with inner hitboxes

			const hitboxes = this._innerHitboxes;

			for (let i = 0, l = hitboxes.length; i < l; i++) {

				const hitbox = hitboxes[i];
				const bone = hitbox.bone;

				const inverseBoneMatrix = this._getInverseBoneMatrix(bone);

				// transform the ray from world space to local space of the bone

				rayBindSpace.copy(ray).applyMatrix4(inverseBoneMatrix);

				// transform the ray from local space of the bone to its bind space (T-Pose)

				rayBindSpace.applyMatrix4(hitbox.bindMatrix);

				// now perform the intersection test

				if (rayBindSpace.intersectAABB(hitbox.aabb, intersectionPoint)) {

					// since the intersection point is in bind space, it's necessary to convert back to world space

					intersectionPoint.applyMatrix4(hitbox.bindMatrixInverse).applyMatrix4(bone.matrixWorld);

					return intersectionPoint;

				}

			}

		}

		return null;

	}

	/**
	* Returns the current inverse matrix for the given bone. A cache system ensures, the inverse matrix
	* is computed only once per simulation step.
	*
	* @param {Bone} bone - The bone.
	* @return {Matrix4} The inverse matrix.
	*/
	_getInverseBoneMatrix(bone: any) {

		const world = this.owner.world;
		const tick = world.tick;

		// since computing inverse matrices is expensive, do it only once per simulation step

		let entry = this._cache.get(bone);

		if (entry === undefined) {

			entry = { tick: tick, inverseBoneMatrix: new Matrix4().copy(bone.matrixWorld).invert() };
			this._cache.set(bone, entry);


		} else {

			if (entry.tick < tick) {

				entry.tick = tick;
				entry.inverseBoneMatrix.copy(bone.matrixWorld).invert();

			} else {

				if (world.debug) {

					console.log('DIVE.CharacterBounds: Inverse matrix found in cache for bone.');

				}

			}

		}

		return entry.inverseBoneMatrix;

	}

}

export { CharacterBounds };
