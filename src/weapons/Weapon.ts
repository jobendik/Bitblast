import { GameEntity, MathUtils } from 'yuka';
import { Sprite, SpriteMaterial, AdditiveBlending } from 'three';
import { WEAPON_STATUS_READY, WEAPON_STATUS_UNREADY, WEAPON_STATUS_EQUIP, WEAPON_STATUS_HIDE } from '../core/Constants';

// Smoke particle interface
interface SmokeParticle {
	sprite: Sprite;
	life: number;
	maxLife: number;
	velocity: { x: number; y: number; z: number };
	startScale: number;
	frame: number;
	frameTime: number;
}

/**
* Base class for all weapons.
*/
class Weapon extends GameEntity {

	public owner: any;
	public type: number | null;
	public status: number;
	public previousState: number;
	public roundsLeft: number;
	public roundsPerClip: number;
	public ammo: number;
	public maxAmmo: number;
	public currentTime: number;
	public shotTime: number;
	public reloadTime: number;
	public equipTime: number;
	public hideTime: number;
	public endTimeShot: number;
	public endTimeReload: number;
	public endTimeEquip: number;
	public endTimeHide: number;
	public endTimeMuzzleFire: number;
	public fuzzyModule: any;
	public muzzle: any;
	public audios: any;
	public mixer: any;
	public animations: any;
	
	// Enhanced muzzle flash properties
	public muzzleFlashIntensity: number = 1.0;
	private smokeParticles: SmokeParticle[] = [];
	private static readonly MAX_SMOKE = 8;
	private static readonly SMOKE_COLS = 4;
	private static readonly SMOKE_ROWS = 4;

	/**
	* Constructs a new weapon with the given values.
	*
	* @param {GameEntity} owner - The owner of this weapon.
	*/
	constructor(owner: any) {

		super();

		this.owner = owner;

		this.canActivateTrigger = false;

		this.type = null;
		this.status = WEAPON_STATUS_UNREADY;

		// use to restore the state after a weapon change

		this.previousState = WEAPON_STATUS_READY;

		// ammo related stuff

		this.roundsLeft = 0;
		this.roundsPerClip = 0;
		this.ammo = 0;
		this.maxAmmo = 0;

		// times are in seconds

		this.currentTime = 0;

		this.shotTime = Infinity;
		this.reloadTime = Infinity;
		this.equipTime = Infinity;
		this.hideTime = Infinity;

		this.endTimeShot = Infinity;
		this.endTimeReload = Infinity;
		this.endTimeEquip = Infinity;
		this.endTimeHide = Infinity;
		this.endTimeMuzzleFire = Infinity;

		// used for weapon selection

		this.fuzzyModule = null;

		// render specific properties

		this.muzzle = null;
		this.audios = null;
		this.mixer = null;
		this.animations = null;

	}

	/**
	* Adds the given amount of rounds to the ammo.
	*
	* @param {Number} rounds - The amount of ammo.
	* @return {Weapon} A reference to this weapon.
	*/
	/**
	* Adds the given amount of rounds to the ammo.
	*
	* @param {Number} rounds - The amount of ammo.
	* @return {Weapon} A reference to this weapon.
	*/
	addRounds(rounds: number) {

		this.ammo = MathUtils.clamp(this.ammo + rounds, 0, this.maxAmmo);

		return this;

	}

	/**
	* Returns the remaining rounds/ammo of this weapon.
	*
	* @return {Number} The reamining rounds/ammo for this weapon.
	*/
	getRemainingRounds() {

		return this.ammo;

	}

	/**
	* Returns a value representing the desirability of using the weapon.
	*
	* @param {Number} distance - The distance to the target.
	* @return {Number} A score between 0 and 1 representing the desirability.
	*/
	getDesirability(_distance: number) {

		return 0;

	}

	/**
	* Equips the weapon.
	*
	* @return {Weapon} A reference to this weapon.
	*/
	equip() {

		this.status = WEAPON_STATUS_EQUIP;
		this.endTimeEquip = this.currentTime + this.equipTime;

		if (this.mixer) {

			let animation = this.animations.get('hide');
			animation.stop();

			animation = this.animations.get('equip');
			animation.stop();
			animation.play();

		}

		if (this.owner.isPlayer) {

			this.owner.world.uiManager.updateAmmoStatus();


		}

		return this;

	}

	/**
	* Hides the weapon.
	*
	* @return {Weapon} A reference to this weapon.
	*/
	hide() {

		this.previousState = this.status;
		this.status = WEAPON_STATUS_HIDE;
		this.endTimeHide = this.currentTime + this.hideTime;

		if (this.mixer) {

			const animation = this.animations.get('hide');
			animation.stop();
			animation.play();

		}

		return this;

	}

	/**
	* Reloads the weapon.
	*
	* @return {Weapon} A reference to this weapon.
	*/
	reload() { }

	/**
	* Shoots at the given position.
	*
	* @param {Vector3} targetPosition - The target position.
	* @return {Weapon} A reference to this weapon.
	*/
	shoot(_targetPosition: any) { }
	
	/**
	* Triggers enhanced muzzle flash with multiple layers and optional smoke.
	* Call this from shoot() in derived weapon classes.
	*/
	triggerEnhancedMuzzleFlash(): void {
		if (!this.muzzle) return;
		
		// Check if it's a Group (enhanced) or single Sprite (legacy)
		if (this.muzzle.isGroup) {
			// Enhanced multi-layer muzzle flash
			this.muzzle.visible = true;
			
			const baseRotation = Math.random() * Math.PI * 2;
			const scaleVariation = 0.85 + Math.random() * 0.3;
			
			// Animate each layer
			this.muzzle.traverse((child: any) => {
				if (child.isSprite && child.material) {
					child.material.rotation = baseRotation + Math.random() * 0.5;
					child.material.opacity = this.muzzleFlashIntensity;
					
					// Scale variation per layer
					const baseScale = child.name === 'muzzleCore' ? 0.25 : 
					                  child.name === 'muzzleMid' ? 0.35 : 0.45;
					child.scale.setScalar(baseScale * scaleVariation);
				}
				
				// Set light intensity
				if (child.isPointLight) {
					child.intensity = 2.5 * this.muzzleFlashIntensity;
				}
			});
			
			// Spawn smoke particles
			this.spawnSmokeParticles();
			
		} else if (this.muzzle.isMesh || this.muzzle.isSprite) {
			// Legacy single sprite
			this.muzzle.visible = true;
			if (this.muzzle.material) {
				this.muzzle.material.rotation = Math.random() * Math.PI;
			}
		}
	}
	
	/**
	* Initialize smoke particle pool
	*/
	initSmokeParticles(): void {
		if (!this.owner?.world?.assetManager) return;
		
		const smokeTexture = this.owner.world.assetManager.textures.get('smoke');
		if (!smokeTexture) return;
		
		for (let i = 0; i < Weapon.MAX_SMOKE; i++) {
			const smokeMat = new SpriteMaterial({
				map: smokeTexture.clone(),
				color: 0x888888,
				transparent: true,
				opacity: 0,
				blending: AdditiveBlending,
				depthWrite: false
			});
			
			// Set up UV for spritesheet
			smokeMat.map!.repeat.set(1 / Weapon.SMOKE_COLS, 1 / Weapon.SMOKE_ROWS);
			
			const sprite = new Sprite(smokeMat);
			sprite.scale.set(0.05, 0.05, 0.05);
			sprite.visible = false;
			
			this.smokeParticles.push({
				sprite,
				life: 0,
				maxLife: 0,
				velocity: { x: 0, y: 0, z: 0 },
				startScale: 0.05,
				frame: 0,
				frameTime: 0
			});
		}
	}
	
	/**
	* Spawn smoke particles at muzzle position
	*/
	private spawnSmokeParticles(): void {
		if (this.smokeParticles.length === 0) return;
		
		const numParticles = 2 + Math.floor(Math.random() * 2);
		
		for (let i = 0; i < numParticles; i++) {
			const particle = this.smokeParticles.find(p => p.life <= 0);
			if (!particle) continue;
			
			// Position at muzzle
			if (this.muzzle) {
				particle.sprite.position.copy(this.muzzle.position);
				particle.sprite.position.x += (Math.random() - 0.5) * 0.02;
				particle.sprite.position.y += (Math.random() - 0.5) * 0.02;
			}
			
			// Set velocity - smoke rises and bitblasts
			particle.velocity.x = (Math.random() - 0.5) * 0.1;
			particle.velocity.y = 0.06 + Math.random() * 0.08;
			particle.velocity.z = -0.02 - Math.random() * 0.05;
			
			particle.maxLife = 0.3 + Math.random() * 0.3;
			particle.life = particle.maxLife;
			particle.startScale = 0.02 + Math.random() * 0.02;
			particle.frame = Math.floor(Math.random() * Weapon.SMOKE_COLS * Weapon.SMOKE_ROWS);
			particle.frameTime = 0;
			
			particle.sprite.scale.setScalar(particle.startScale);
			(particle.sprite.material as SpriteMaterial).opacity = 0.25 + Math.random() * 0.15;
			particle.sprite.visible = true;
			
			// Add to muzzle parent if not already
			if (this.muzzle?.parent && !particle.sprite.parent) {
				this.muzzle.parent.add(particle.sprite);
			}
		}
	}
	
	/**
	* Update smoke particles
	*/
	protected updateSmokeParticles(delta: number): void {
		for (const particle of this.smokeParticles) {
			if (particle.life <= 0) continue;
			
			particle.life -= delta;
			
			if (particle.life <= 0) {
				particle.sprite.visible = false;
				continue;
			}
			
			const lifeRatio = particle.life / particle.maxLife;
			
			// Move smoke
			particle.sprite.position.x += particle.velocity.x * delta;
			particle.sprite.position.y += particle.velocity.y * delta;
			particle.sprite.position.z += particle.velocity.z * delta;
			
			// Slow down
			particle.velocity.x *= 0.97;
			particle.velocity.z *= 0.97;
			
			// Expand
			const scale = particle.startScale * (1 + (1 - lifeRatio) * 2.5);
			particle.sprite.scale.setScalar(scale);
			
			// Fade out
			(particle.sprite.material as SpriteMaterial).opacity = lifeRatio * 0.3;
			
			// Animate spritesheet
			particle.frameTime += delta;
			if (particle.frameTime > 0.04) {
				particle.frameTime = 0;
				particle.frame = (particle.frame + 1) % (Weapon.SMOKE_COLS * Weapon.SMOKE_ROWS);
				
				const col = particle.frame % Weapon.SMOKE_COLS;
				const row = Math.floor(particle.frame / Weapon.SMOKE_COLS);
				const mat = particle.sprite.material as SpriteMaterial;
				if (mat.map) {
					mat.map.offset.set(
						col / Weapon.SMOKE_COLS,
						1 - (row + 1) / Weapon.SMOKE_ROWS
					);
				}
			}
		}
	}
	
	/**
	* Update enhanced muzzle flash fade-out
	*/
	protected updateMuzzleFlash(_delta: number, _muzzleFireTime: number): void {
		if (!this.muzzle || this.currentTime < this.endTimeMuzzleFire) return;
		
		// Muzzle fire ended
		if (this.muzzle.isGroup) {
			this.muzzle.traverse((child: any) => {
				if (child.isSprite && child.material) {
					child.material.opacity = 0;
				}
				if (child.isPointLight) {
					child.intensity = 0;
				}
			});
		}
		this.muzzle.visible = false;
	}

	/**
	* Update method of this weapon.
	*
	* @param {Number} delta - The time delta value;
	* @return {Weapon} A reference to this weapon.
	*/
	update(delta: number) {

		this.currentTime += delta;

		if (this.currentTime >= this.endTimeEquip) {

			this.status = this.previousState; // restore previous state
			this.endTimeEquip = Infinity;

		}

		if (this.currentTime >= this.endTimeHide) {

			this.status = WEAPON_STATUS_UNREADY;
			this.endTimeHide = Infinity;

		}

		// update animations

		if (this.mixer) {

			this.mixer.update(delta);

		}
		
		// Update smoke particles
		this.updateSmokeParticles(delta);

		return this;

	}

}

export { Weapon };
