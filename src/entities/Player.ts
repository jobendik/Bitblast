import { GameEntity, MovingEntity, Vector3, AABB, MathUtils } from 'yuka';
import { LoopOnce, AnimationMixer, AnimationAction, PositionalAudio, Audio, Vector3 as ThreeVector3, Object3D } from 'three';
import { AIWeaponSystem } from '../core/AIWeaponSystem';
import { CONFIG } from '../core/Config';
import { PLAYER_CONFIG } from '../config/gameConfig';
import { Projectile } from '../weapons/Projectile';
import { STATUS_ALIVE, WEAPON_TYPES_BLASTER, WEAPON_TYPES_SHOTGUN, WEAPON_TYPES_ASSAULT_RIFLE, MESSAGE_HIT, MESSAGE_DEAD, STATUS_DYING, STATUS_DEAD } from '../core/Constants';
import World from '../core/World';

const intersectionPoint = new Vector3();
const targetPosition = new Vector3();
const projectile = new Projectile();
const attackDirection = new Vector3();
const lookDirection = new Vector3();
const cross = new Vector3();

/**
* Class for representing the human player of the game.
*/
class Player extends MovingEntity {

	public world: typeof World;
	public head: GameEntity;
	public weaponContainer: GameEntity;
	public weaponSystem: AIWeaponSystem;
	public bounds: AABB;
	public boundsDefinition: AABB;
	public currentRegion: any;
	public currentPosition: Vector3;
	public previousPosition: Vector3;
	public audios: Map<string, PositionalAudio | Audio>;
	public mixer: AnimationMixer | null;
	public animations: Map<string, AnimationAction>;
	public ui: { health: HTMLElement | null };
	public status: number;
	public currentTime: number;
	public endTimeDying: number;
	public dyingTime: number;
	public isPlayer: boolean;
	public health: number;
	public maxHealth: number;
	public height: number;
	public updateOrientation: boolean;
	public maxSpeed: number;
	public name: string;
	declare public active: boolean;

	// Getter for protected _renderComponent from Yuka's GameEntity
	public get renderComponent(): Object3D | null {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._renderComponent || null;
	}

	// Physics Properties
	public velocity: Vector3; // Override Yuka velocity with same type but managed differently if needed
	public onGround: boolean = true;
	public isSprinting: boolean = false;
	public isSliding: boolean = false;
	public slideTimer: number = 0;
	public slideCooldownTimer: number = 0;
	public slideDirection: Vector3 = new Vector3();
	public coyoteTimer: number = 0;
	public jumpBufferTimer: number = 0;
	public isJumping: boolean = false;
	public canCutJump: boolean = false;
	public wasJumpPressed: boolean = false;
	public prevVelocity: Vector3 = new Vector3();
	public groundNormal: Vector3 = new Vector3(0, 1, 0);
	public slopeAngle: number = 0;
	public maxSlopeAngle: number = Math.PI / 4;
	public stamina: number = 100;
	public landingImpact: number = 0;
	public headBobTime: number = 0;

	// Audio state
	public lastFootstepTime: number = 0;
	private footstepInterval: number = 0.35; // Time between footsteps
	private sprintFootstepInterval: number = 0.25; // Faster footsteps when sprinting
	private heartbeatActive: boolean = false;
	private heartbeatAudio: any = null;

	// Camera Zoom State
	private cameraStartPosition: Vector3 = new Vector3();
	private cameraTargetPosition: Vector3 = new Vector3();
	private cameraLerpFactor: number = 0;
	private deathCameraAngle: number = 0;

	/**
	* Constructs a new player object.
	*
	* @param {World} world - A reference to the world.
	*/
	constructor(world: typeof World) {

		super();

		this.world = world;

		this.currentTime = 0;
		this.boundingRadius = CONFIG.PLAYER.BOUNDING_RADIUS;
		this.height = CONFIG.PLAYER.HEAD_HEIGHT;
		this.updateOrientation = false;
		this.maxSpeed = PLAYER_CONFIG.sprintSpeed || 30; // Use enhanced config for max speed, must allow sprint speed
		this.health = CONFIG.PLAYER.MAX_HEALTH;
		this.maxHealth = CONFIG.PLAYER.MAX_HEALTH;
		this.isPlayer = true;

		// Initialize Physics
		this.velocity = new Vector3();

		this.status = STATUS_ALIVE;

		// the camera is attached to the player's head

		this.head = new GameEntity();
		this.head.forward.set(0, 0, - 1);
		this.add(this.head);

		// death animation

		this.endTimeDying = Infinity;
		this.dyingTime = CONFIG.PLAYER.DYING_TIME;

		// the weapons are attached to the following container entity

		this.weaponContainer = new GameEntity();
		this.head.add(this.weaponContainer);

		// AI weapon system for basic weapon management (ammo, switching)
		// Visual rendering is handled by PlayerWeaponSystem via CombatManager
		this.weaponSystem = new AIWeaponSystem(this);

		// the player's bounds (using a single AABB is sufficient for now)

		this.bounds = new AABB();
		this.boundsDefinition = new AABB(new Vector3(- 0.25, 0, - 0.25), new Vector3(0.25, 1.8, 0.25));

		// current convex region of the navmesh the entity is in

		this.currentRegion = null;
		this.currentPosition = new Vector3();
		this.previousPosition = new Vector3();

		// audio

		this.audios = new Map();

		// animation

		this.mixer = null;
		this.animations = new Map();

		// ui
		this.ui = {

			health: document.getElementById('health'),

		};

		this.name = 'Player';

	}

	/**
	* Updates the internal state of this game entity.
	*
	* @param {Number} delta - The time delta.
	* @return {Player} A reference to this game entity.
	*/
	update(delta: number) {

		// Only process input and physics if alive
		if (this.status === STATUS_ALIVE) {
			// Track time alive for statistics
			const currentMode = this.world.gameModeManager?.getCurrentMode();
			if (currentMode) {
				currentMode.onTimeAlive(this.uuid, delta);
			}

			// Capture Input from Controls
			const input = this.world.fpsControls.input;
			const inputDir = new Vector3();
			if (input.forward) inputDir.z -= 1;
			if (input.backward) inputDir.z += 1;
			if (input.left) inputDir.x -= 1;
			if (input.right) inputDir.x += 1;

			if (inputDir.squaredLength() > 0) {
				// console.log(`[Player] Input dir: ${inputDir.x}, ${inputDir.y}, ${inputDir.z} | OnGround: ${this.onGround}`);
			}

			// Track airborne state before physics
			const wasAirborneBeforePhysics = !this.onGround;

			// Track position before physics for distance calculation
			const prevPos = this.position.clone();

			// Run Physics Simulation
			this.updatePhysics(
				delta,
				inputDir,
				input.sprint,
				input.jump,
				input.crouch,
				this.world.arenaObjects
			);

			// Track distance traveled for statistics
			const gameMode = this.world.gameModeManager?.getCurrentMode();
			if (gameMode?.onDistanceTraveled) {
				const distance = prevPos.distanceTo(this.position);
				if (distance > 0.01) { // Only track significant movement
					gameMode.onDistanceTraveled(this.uuid, distance);
				}
			}

			// Play landing sound when we just landed
			if (wasAirborneBeforePhysics && this.onGround) {
				this.playLandingSound();
			}

			// Play footstep sounds while moving on ground
			this.updateFootsteps(delta, inputDir);

			// Update heartbeat for low health
			this.updateHeartbeat();

			// Ensure visual model is hidden while alive
			if (this.renderComponent && this.renderComponent.userData.visualModel) {
				this.renderComponent.userData.visualModel.visible = false;
			}
		}

		// Sync Yuka Entity State
		// Yuka uses 'position' and 'velocity' which we are updating in updatePhysics
		// But we need to ensure Yuka's internal state is happy

		// Call super.update to handle Yuka specific things (like behaviors if any, though Player usually doesn't have them)
		super.update(delta);

		this.currentTime += delta;

		// ensure the enemy never leaves the level (Legacy check, physics handles bounds now but good backup)
		// this.stayInLevel(); 

		if (this.status === STATUS_ALIVE) {
			if (!this.isPlayer) {
				this.weaponSystem.updateWeaponChange();
			}
			this.bounds.copy(this.boundsDefinition).applyMatrix4(this.worldMatrix);
		}

		if (this.status === STATUS_DYING) {
			if (this.currentTime >= this.endTimeDying) {
				this.status = STATUS_DEAD;
				this.endTimeDying = Infinity;
			}

			// Camera Zoom Out Logic
			if (this.head && !isNaN(delta)) {
				this.cameraLerpFactor += delta * 2; // Adjust speed as needed
				if (this.cameraLerpFactor > 1) this.cameraLerpFactor = 1;

				// Interpolate position
				// Manual lerp: start + (target - start) * factor
				const diff = this.cameraTargetPosition.clone().sub(this.cameraStartPosition).multiplyScalar(this.cameraLerpFactor);
				this.head.position.copy(this.cameraStartPosition).add(diff);

				// Look at player body (approximate center)
				// We want to look at the player's world position + offset
				// Since this.head.lookAt takes a world position target
				const lookTarget = new Vector3();
				const e = this.worldMatrix.elements;
				lookTarget.set(e[12], e[13], e[14]);
				lookTarget.y += 0.5; // Look at chest height

				// Ensure we don't look at ourselves (singularity check)
				const headWorldPos = new Vector3();
				const he = this.head.worldMatrix.elements;
				headWorldPos.set(he[12], he[13], he[14]);

				if (headWorldPos.squaredDistanceTo(lookTarget) > 0.1) {
					this.head.lookAt(lookTarget);
				}

				// Slow rotation around the body during death
				this.deathCameraAngle += delta * 0.3; // Slow rotation speed
				const rotationRadius = 1.1 + this.cameraLerpFactor * 1.9; // Orbit distance grows (reduced by 75% total)
				const rotationOffset = new Vector3(
					Math.sin(this.deathCameraAngle) * rotationRadius,
					0,
					Math.cos(this.deathCameraAngle) * rotationRadius
				);
				this.head.position.x += rotationOffset.x * this.cameraLerpFactor;
				this.head.position.z += rotationOffset.z * this.cameraLerpFactor;

				// Apply desaturation effect (black and white)
				if (this.world.combat && this.world.combat.screenEffects) {
					this.world.combat.screenEffects.setDesaturation(this.cameraLerpFactor);
				}
			}
		}

		if (this.status === STATUS_DEAD) {
			if (this.world.debug) console.log('DIVE.Player: Player died.');
			this.reset();
			this.world.spawningManager.respawnCompetitor(this);
			this.world.fpsControls.sync();
			// Update health UI after respawn position is set
			this.world.uiManager.updateHealthStatus();
		}

		// Update stamina UI if game HUD is available
		if (this.world.combat && this.world.combat.hudManager && this.status === STATUS_ALIVE) {
			this.world.combat.hudManager.updateStamina(this.stamina, PLAYER_CONFIG.maxStamina || 100);
			// Update sprint visual effect
			this.world.combat.hudManager.setSprintEffect(this.isSprinting);
		}

		this.mixer!.update(delta);

		return this;

	}

	updatePhysics(
		delta: number,
		inputDir: Vector3,
		wantsToSprint: boolean,
		wantsJump: boolean,
		wantsCrouch: boolean,
		_arenaObjects: Array<{ mesh: any; box: any }>
	) {

		this.prevVelocity.copy(this.velocity);

		const hasInput = inputDir.squaredLength() > 0;
		if (hasInput) {
			inputDir.normalize();
			// Apply rotation to input
			inputDir.applyRotation(this.rotation);

			// Slope adjustment
			if (this.onGround && this.slopeAngle > 0) {
				// Project inputDir onto the plane defined by groundNormal
				// Yuka Vector3 doesn't have projectOnPlane, so we do it manually
				// v - n * (v . n)
				const dot = inputDir.dot(this.groundNormal);
				const proj = this.groundNormal.clone().multiplyScalar(dot);
				inputDir.sub(proj).normalize();
			}
		}

		// Slide Cooldown
		if (this.slideCooldownTimer > 0) {
			this.slideCooldownTimer -= delta;
		}

		// Slide Initiation
		if (wantsCrouch && this.isSprinting && this.onGround && this.slideCooldownTimer <= 0 && !this.isSliding) {
			this.isSliding = true;
			this.slideTimer = PLAYER_CONFIG.slideDuration || 1.0;
			this.slideDirection.copy(this.velocity).normalize();
			this.velocity.add(this.slideDirection.clone().multiplyScalar(2));
		}

		// Slide State Management
		if (this.isSliding) {
			this.slideTimer -= delta;
			if (this.slideTimer <= 0 || this.velocity.length() < (PLAYER_CONFIG.walkSpeed || 8) * 0.5) {
				this.isSliding = false;
				this.slideCooldownTimer = PLAYER_CONFIG.slideCooldown || 1.0;
			}
		}

		// Sprint and stamina - allow sprinting with input even in air for responsive feel
		this.isSprinting = wantsToSprint && this.stamina > 0 && !this.isSliding && hasInput;
		if (this.isSprinting) {
			this.stamina -= (PLAYER_CONFIG.staminaDrain || 20) * delta;
			if (this.stamina < 0) {
				this.stamina = 0;
				this.isSprinting = false;
			}
		} else {
			this.stamina = Math.min(PLAYER_CONFIG.maxStamina || 100, this.stamina + (PLAYER_CONFIG.staminaRegen || 30) * delta);
		}

		// Movement - ensure sprint is noticeably faster
		let targetSpeed = PLAYER_CONFIG.walkSpeed || 8;
		if (this.isSprinting) {
			targetSpeed = PLAYER_CONFIG.sprintSpeed || 13;
		}

		const isGrounded = this.onGround;

		// Horizontal velocity
		const horizVel = new Vector3(this.velocity.x, 0, this.velocity.z);

		if (this.isSliding) {
			const slideSpeed = (PLAYER_CONFIG.slideSpeed || 18) * (this.slideTimer / (PLAYER_CONFIG.slideDuration || 1.0));
			const targetSlideVel = new Vector3(this.slideDirection.x, 0, this.slideDirection.z).multiplyScalar(slideSpeed);

			// Lerp horizontal velocity
			// Yuka Vector3 doesn't have lerp, do manual
			const alpha = (PLAYER_CONFIG.slideFriction || 2.5) * delta;
			horizVel.x += (targetSlideVel.x - horizVel.x) * alpha;
			horizVel.z += (targetSlideVel.z - horizVel.z) * alpha;
		} else {
			const accel = isGrounded ? (PLAYER_CONFIG.groundAccel || 50) : (PLAYER_CONFIG.airAccel || 20);
			const decel = isGrounded ? (PLAYER_CONFIG.groundDecel || 30) : (PLAYER_CONFIG.airDecel || 5);

			if (hasInput) {
				const targetVel = new Vector3(inputDir.x, 0, inputDir.z).multiplyScalar(targetSpeed);
				const alpha = accel * delta;
				// Simple lerp approximation for accel
				const diff = new Vector3().copy(targetVel).sub(horizVel);
				if (diff.length() > alpha) {
					diff.normalize().multiplyScalar(alpha);
				}
				horizVel.add(diff);
			} else {
				const decayFactor = Math.exp(-decel * delta);
				horizVel.multiplyScalar(decayFactor);
			}
		}

		this.velocity.x = horizVel.x;
		this.velocity.z = horizVel.z;

		// Head bob
		const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
		this.headBobTime += delta * speed * 2;

		// Apply head bob to camera (head entity)
		if (this.head) {
			const motion = Math.sin(this.headBobTime);
			// Head position = base height + bob offset
			this.head.position.y = this.height + Math.abs(motion) * 0.06;
			this.head.position.x = motion * 0.08;
		}

		// Jump with buffer and coyote time
		if (this.onGround) {
			this.coyoteTimer = PLAYER_CONFIG.coyoteTime || 0.15;
			this.isJumping = false;
		} else {
			this.coyoteTimer = Math.max(0, this.coyoteTimer - delta);
		}

		// Countdown existing buffer
		if (this.jumpBufferTimer > 0) {
			this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - delta);
		}

		// Set jump buffer only on NEW press (not while held)
		if (wantsJump && !this.wasJumpPressed && !this.isJumping) {
			this.jumpBufferTimer = 0.1;
		}
		this.wasJumpPressed = wantsJump;

		// Execute jump if conditions met
		let jumpedThisFrame = false;
		const canJump = (this.coyoteTimer > 0 || this.onGround) && !this.isJumping;
		if (canJump && this.jumpBufferTimer > 0) {
			this.velocity.y = PLAYER_CONFIG.jumpForce || 15;
			this.isJumping = true;
			this.canCutJump = true;
			this.coyoteTimer = 0;
			this.jumpBufferTimer = 0;
			this.onGround = false; // Force off ground immediately
			jumpedThisFrame = true;

			if (this.isSliding) {
				this.isSliding = false;
				this.slideCooldownTimer = PLAYER_CONFIG.slideCooldown || 1.0;
			}

			// Play jump sound
			this.playJumpSound();
		}

		// Variable height jump - cut jump short when button released
		if (this.canCutJump && !wantsJump && this.velocity.y > 0) {
			this.velocity.y *= (PLAYER_CONFIG.jumpCutMultiplier || 0.5);
			this.canCutJump = false;
		}

		// Gravity
		this.velocity.y -= (PLAYER_CONFIG.gravity || 35) * delta;

		// Move
		const moveStep = this.velocity.clone().multiplyScalar(delta);
		const newPos = this.position.clone().add(moveStep);

		// Ground collision using navMesh (like original BitBlast)
		this.onGround = false;

		if (this.world.navMesh && this.currentRegion) {
			// Save Y for vertical movement (navMesh is 2D on XZ plane)
			const savedY = newPos.y;
			const savedVelY = this.velocity.y;
			const isAirborne = jumpedThisFrame || this.isJumping || savedVelY > 0.1;

			// For navMesh collision, work on the XZ plane only
			// Set Y to ground level for proper region detection
			const groundY = this.currentRegion.plane.distanceToPoint(this.position);
			newPos.y = this.position.y - groundY; // Project to ground for navMesh

			// Copy current position for navMesh (XZ collision)
			this.currentPosition.copy(newPos);

			// Clamp movement against walls (XZ only)
			this.currentRegion = this.world.navMesh.clampMovement(
				this.currentRegion,
				this.previousPosition,
				this.currentPosition,
				newPos // Gets modified - XZ clamped against walls
			);

			// Update previousPosition for next frame (use ground-projected pos)
			this.previousPosition.copy(newPos);

			if (isAirborne) {
				// Restore Y position for airborne movement
				newPos.y = savedY;
				this.velocity.y = savedVelY;

				// Check for landing
				const groundHeight = this.currentRegion.plane.distanceToPoint(newPos);
				if (groundHeight <= 0 && savedVelY <= 0) {
					// Landed
					newPos.y -= groundHeight;
					this.landingImpact = Math.abs(savedVelY); // Store landing velocity for sound
					this.velocity.y = 0;
					this.onGround = true;
					this.isJumping = false;
				}
			} else {
				// On ground: snap to navMesh surface
				const groundHeight = this.currentRegion.plane.distanceToPoint(newPos);
				newPos.y -= groundHeight;
				this.velocity.y = 0;
				this.onGround = true;
			}
		} else {
			// Fallback: simple ground plane at y=0
			if (newPos.y <= 0) {
				newPos.y = 0;
				this.velocity.y = 0;
				this.onGround = true;
			}
		}

		this.position.copy(newPos);
	}

	checkSlope(_arenaObjects: any[]) {
		// Simplified slope check
		this.slopeAngle = 0;
		this.groundNormal.set(0, 1, 0);
		// Raycast down would be better, but for now assume flat or handle via collision
	}

	/**
	* Resets the player after a death.
	*
	* @return {Player} A reference to this game entity.
	*/
	reset() {

		this.health = this.maxHealth;
		this.status = STATUS_ALIVE;

		// Reset physics state
		this.velocity.set(0, 0, 0);
		this.prevVelocity.set(0, 0, 0);
		this.onGround = true;
		this.isSprinting = false;
		this.isSliding = false;
		this.slideTimer = 0;
		this.slideCooldownTimer = 0;
		this.slideDirection.set(0, 0, 0);
		this.coyoteTimer = 0;
		this.jumpBufferTimer = 0;
		this.isJumping = false;
		this.canCutJump = false;
		this.wasJumpPressed = false;
		this.groundNormal.set(0, 1, 0);
		this.slopeAngle = 0;
		this.stamina = 100;
		this.landingImpact = 0;
		this.headBobTime = 0;

		this.weaponSystem.reset();

		this.world.fpsControls.reset();
		this.world.fpsControls.active = true;

		this.world.uiManager.showFPSInterface();
		// Note: Health UI is updated after respawn position is set, not here

		// Broadcast respawn to network
		if (this.world.networkManager) {
			this.world.networkManager.sendPlayerRespawn();
		}

		// Reset death animation properly so it can play again
		const playerDeathAnim = this.animations.get('player_death');
		if (playerDeathAnim) {
			playerDeathAnim.stop();
			playerDeathAnim.reset(); // Reset time to 0 so it can play from beginning next time
		}
		// Also reset amy death animations
		const amyDeath1 = this.animations.get('amy_death1');
		if (amyDeath1) {
			amyDeath1.stop();
			amyDeath1.reset();
		}
		const amyDeath2 = this.animations.get('amy_death2');
		if (amyDeath2) {
			amyDeath2.stop();
			amyDeath2.reset();
		}
		const amyDeath3 = this.animations.get('amy_death3');
		if (amyDeath3) {
			amyDeath3.stop();
			amyDeath3.reset();
		}

		// Hide visual model
		if (this.renderComponent && this.renderComponent.userData.visualModel) {
			this.renderComponent.userData.visualModel.visible = false;
		}

		// Reset camera position to default head height
		if (this.head) {
			this.head.position.set(0, this.height, 0);
			this.head.rotation.fromEuler(0, 0, 0);
		}

		// Show weapon container
		if (this.weaponContainer && (this.weaponContainer as any)._renderComponent) {
			(this.weaponContainer as any)._renderComponent.visible = true;
		}

		// Show the visual weapon (PlayerWeaponSystem attached to camera)
		if (this.world.combat && this.world.combat.weaponSystem) {
			this.world.combat.weaponSystem.setVisible(true);
		}

		// Reset desaturation effect (restore color)
		if (this.world.combat && this.world.combat.screenEffects) {
			this.world.combat.screenEffects.setDesaturation(0);
		}

		// Show the HUD again after respawn
		if (this.world.combat && this.world.combat.hudManager) {
			this.world.combat.hudManager.show();
		}

		// Reset endTimeDying to prevent immediate re-death
		this.endTimeDying = Infinity;

		return this;

	}

	/**
	* Alias for reset, required by GameModeManager
	*/
	respawn() {
		this.reset();
	}

	/**
	* Inits the death of the player.
	*
	* @return {Player} A reference to this game entity.
	*/
	initDeath() {
		// Guard against multiple calls (can happen if local takeDamage and server player_killed both trigger)
		if (this.status === STATUS_DYING || this.status === STATUS_DEAD) {
			return this;
		}

		try {
			this.status = STATUS_DYING;
			this.endTimeDying = this.currentTime + this.dyingTime;

			this.velocity.set(0, 0, 0);

			// Play death sound
			this.playDeathSound();

			// Stop heartbeat if playing
			// this.stopHeartbeat(); // method exists?

			// Show visual model
			if (this.renderComponent && this.renderComponent.userData.visualModel) {
				this.renderComponent.userData.visualModel.visible = true;
			}

			// Play death animation
			// Try 'amy_death1' first, then fallback to 'player_death'
			let animation = this.animations.get('amy_death1');
			if (!animation) animation = this.animations.get('player_death');

			if (animation) {
				animation.reset(); // Ensure animation starts from beginning
				animation.loop = LoopOnce;
				animation.repetitions = 1;
				animation.clampWhenFinished = true;
				animation.play();
			} else {
				console.warn('[Player] No death animation found!');
			}

			this.weaponSystem.hideCurrentWeapon();
			if (this.weaponContainer && (this.weaponContainer as any)._renderComponent) {
				(this.weaponContainer as any)._renderComponent.visible = false;
			}

			// Hide the visual weapon (PlayerWeaponSystem attached to camera)
			if (this.world.combat && this.world.combat.weaponSystem) {
				this.world.combat.weaponSystem.setVisible(false);
			}

			// Hide the HUD during death
			if (this.world.combat && this.world.combat.hudManager) {
				this.world.combat.hudManager.hide();
			}

			// Apply immediate grayscale effect (black and white) for death
			if (this.world.combat && this.world.combat.screenEffects) {
				this.world.combat.screenEffects.setDesaturation(1.0);
			}

			this.world.fpsControls.active = false;
			this.world.uiManager.hideFPSInterface();

			// Setup Camera Zoom Out
			if (this.head) {
				// Start from current head position (which might have bob offset)
				this.cameraStartPosition.copy(this.head.position);

				// Safety check for NaNs in start position
				if (isNaN(this.cameraStartPosition.x) || isNaN(this.cameraStartPosition.y) || isNaN(this.cameraStartPosition.z)) {
					this.cameraStartPosition.set(0, this.height, 0);
				}

				// Target position: Up ~2.5m, Back 3m (higher angle above character)
				// NOTE: This is in LOCAL space of the player entity
				// The player entity is at the feet.
				this.cameraTargetPosition.set(0, 2.5, 3);

				this.cameraLerpFactor = 0;
				this.deathCameraAngle = 0;
			}

		} catch (err) {
			console.error('[Player] CRITICAL ERROR in initDeath:', err);
			// Attempt to ensure death state even if crash
			this.status = STATUS_DYING;
		}
		return this;

	}




	/**
	 * Apply damage to local player
	 */
	takeDamage(damage: number): void {
		if (this.status !== STATUS_ALIVE) {
			return;
		}

		try {
			this.health = Math.max(0, this.health - damage);

			// Play pain sound (safely)
			const rand = 1 + Math.floor(Math.random() * 7);
			const sound = this.audios.get(`impact${rand}`);
			if (sound && !sound.isPlaying) {
				sound.play();
			}

			// Update HUD
			if (this.world.combat && this.world.combat.hudManager) {
				this.world.combat.hudManager.updateHealth(this.health, this.maxHealth);

				// Show damage indicator (red flash)
				if (this.world.combat.screenEffects) {
					// Check if damageFlash method exists (it was added recently)
					if (typeof this.world.combat.screenEffects.damageFlash === 'function') {
						this.world.combat.screenEffects.damageFlash();
					} else {
						// Fallback if method missing
						this.world.combat.screenEffects.addDamageShake(damage / this.maxHealth);
					}
				}
			}

			// Trigger low health effects (Heartbeat) - check for existence first
			// This was likely the cause of the 25% freeze if method was missing or crashed
			if (typeof this.updateHeartbeat === 'function') {
				this.updateHeartbeat();
			}

			// Check for death
			if (this.health <= 0) {
				this.initDeath();
			}
		} catch (err) {
			console.error('CRITICAL ERROR in Player.takeDamage:', err);
			// Force death if we reached 0 health despite error
			if (this.health <= 0 && this.status === STATUS_ALIVE) {
				this.initDeath();
			}
		}
	}


	/**
	* Fires a round at the player's target with the current armed weapon.
	*
	* @return {Player} A reference to this game entity.
	*/
	shoot() {

		// Cannot shoot if dead or dying
		if (this.status !== STATUS_ALIVE) {
			return this;
		}

		const head = this.head;
		const world = this.world;

		// Use visual weapon system if available
		if (world.combat && world.combat.weaponSystem) {
			const onGround = this.velocity.y === 0;
			const isSprinting = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2) > 10;
			const velocity = new ThreeVector3(this.velocity.x, this.velocity.y, this.velocity.z);

			// Build obstacle list: level geometry + enemy render components
			const obstacles: any[] = [];

			// Add level geometry
			if (world.level && world.level.renderComponent) {
				obstacles.push(world.level.renderComponent);
			}

			// Add all competitors (enemies) render components
			world.competitors.forEach((competitor: any) => {
				if (competitor !== this && competitor.active && competitor.renderComponent) {
					obstacles.push(competitor.renderComponent);
				}
			});

			// ADDED: Include RemotePlayers in hit detection
			if ((world as any).networkManager && (world as any).networkManager.remotePlayers) {
				(world as any).networkManager.remotePlayers.forEach((rp: any) => {
					// Access the raw mesh group for raycasting
					// Access rp.mesh (which has userData.entity = rp)
					if (rp.mesh) {
						obstacles.push(rp.mesh);
					}
				});
			}

			// ADDED: Include RemoteBots (server-authoritative) in hit detection
			if ((world as any).remoteBots) {
				(world as any).remoteBots.forEach((bot: any) => {
					if (bot && !bot.isDead) {
						const mesh = bot.getMesh ? bot.getMesh() : bot.mesh;
						if (mesh) {
							obstacles.push(mesh);
						}
					}
				});
			}

			world.combat.handleShooting(onGround, isSprinting, velocity, obstacles);

			return this;
		}

		// Fallback to old system if combat system not available
		const ray = projectile.ray;
		head.getWorldPosition(ray.origin);
		head.getWorldDirection(ray.direction);
		projectile.owner = this;

		const result = world.checkProjectileIntersection(projectile, intersectionPoint);
		const distance = (result === null) ? 1000 : ray.origin.distanceTo(intersectionPoint);
		targetPosition.copy(ray.origin).add(ray.direction.multiplyScalar(distance));

		this.weaponSystem.shoot(targetPosition);
		world.uiManager.updateAmmoStatus();

		return this;

	}

	/**
	* Reloads the current weapon of the player.
	*
	* @return {Player} A reference to this game entity.
	*/
	reload() {

		// Use visual weapon system if available
		if (this.world.combat && this.world.combat.weaponSystem) {
			this.world.combat.weaponSystem.reload();
		} else {
			this.weaponSystem.reload();
		}

		return this;

	}

	/**
	* Changes the weapon to the defined type.
	*
	* @param {WEAPON_TYPES} type - The weapon type.
	* @return {Player} A reference to this game entity.
	*/
	changeWeapon(type: number) {

		// Use visual weapon system if available
		if (this.world.combat && this.world.combat.weaponSystem) {
			// Map old weapon types to visual weapon indices (0-8)
			const weaponMap: { [key: number]: number } = {
				[WEAPON_TYPES_BLASTER]: 4, // Pistol
				[WEAPON_TYPES_SHOTGUN]: 6, // Shotgun
				[WEAPON_TYPES_ASSAULT_RIFLE]: 0, // AK47
			};
			const weaponIndex = weaponMap[type] !== undefined ? weaponMap[type] : 0;
			this.world.combat.weaponSystem.switchWeapon(weaponIndex);
		} else {
			this.weaponSystem.setNextWeapon(type);
		}

		return this;

	}

	/**
	* Returns true if the player has a weapon of the given type.
	*
	* @param {WEAPON_TYPES} type - The weapon type.
	* @return {Boolean} Whether the player has a weapon of the given type or not.
	*/
	hasWeapon(type: number) {

		return this.weaponSystem.getWeapon(type) !== null;

	}

	/**
	* Indicates if the player does currently use an automatic weapon.
	*
	* @return {Boolean} Whether an automatic weapon is used or not.
	*/
	isAutomaticWeaponUsed() {
		// New weapon system uses string types
		const type = this.weaponSystem.currentWeaponType;
		return (type === 'M4' || type === 'AK47' || type === 'Scar' || type === 'LMG');
	}

	/**
	* Activates this game entity. Enemies will shot at the player and
	* the current weapon is rendered.
	*
	* @return {Player} A reference to this game entity.
	*/
	activate() {

		this.active = true;
		// AIWeaponSystem no longer manages visual components directly
		// Visual toggling handles by PlayerWeaponSystem or specific render logic
		// if (this.weaponSystem.currentWeapon) {
		// 	this.weaponSystem.currentWeapon._renderComponent.visible = true;
		// }

		return this;

	}

	/**
	* Deactivates this game entity. Enemies will not shot at the player and
	* the current weapon is not rendered.
	*
	* @return {Player} A reference to this game entity.
	*/
	deactivate() {

		this.active = false;
		// if (this.weaponSystem.currentWeapon) {
		// 	this.weaponSystem.currentWeapon._renderComponent.visible = false;
		// }

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

		return ray.intersectAABB(this.bounds, intersectionPoint);

	}

	/**
	* Ensures the player never leaves the level.
	*
	* @return {Player} A reference to this game entity.
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

	/*
	* Adds the given health points to this entity.
	*
	* @param {Number} amount - The amount of health to add.
	* @return {Player} A reference to this game entity.
	*/
	addHealth(amount: number) {

		// Track health pack collection for statistics (only if amount is from health pack)
		const mode = this.world.gameModeManager?.getCurrentMode();
		if (amount === CONFIG.HEALTH_PACK.HEALTH && mode?.onHealthPackCollected) {
			mode.onHealthPackCollected(this.uuid);
		}

		this.health += amount;

		this.health = Math.min(this.health, this.maxHealth); // ensure that health does not exceed maxHealth

		this.world.uiManager.updateHealthStatus();

		//

		if (this.world.debug) {

			console.log('DIVE.Player: Entity with ID %s receives %i health points.', this.uuid, amount);

		}

		return this;

	}

	/*
	* Adds the given weapon to the internal weapon system.
	*
	* @param {WEAPON_TYPES} type - The weapon type.
	* @return {Player} A reference to this game entity.
	*/
	addWeapon(_type: number) {

		// DISABLED - using visual weapon system instead
		// this.weaponSystem.addWeapon(type);

		// if the entity already has the weapon, increase the ammo

		this.world.uiManager.updateAmmoStatus();

		return this;

	}

	/**
	* Sets the animations of this game entity by creating a
	* series of animation actions.
	*
	* @param {AnimationMixer} mixer - The animation mixer.
	* @param {Array} clips - An array of animation clips.
	* @return {Player} A reference to this game entity.
	*/
	setAnimations(mixer: any, clips: any) {

		this.mixer = mixer;

		// actions

		for (const clip of clips) {

			const action = mixer.clipAction(clip);
			action.loop = LoopOnce;
			action.clampWhenFinished = true; // Hold at the end frame
			action.name = clip.name;

			this.animations.set(action.name, action);

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

				// Play damage grunt sound via audio manager
				this.playDamageGrunt();

				// Track damage taken for statistics
				const dmgMode = this.world.gameModeManager?.getCurrentMode();
				if (dmgMode?.onDamageTaken) {
					dmgMode.onDamageTaken(this.uuid, telegram.data.damage);
				}

				// reduce health (clamp to 0 minimum)

				this.health = Math.max(0, this.health - telegram.data.damage);

				// update UI

				this.world.uiManager.updateHealthStatus();

				// Apply damage effects (screen shake, vignette)
				if (this.world.combat) {
					const angle = this.computeAngleToAttacker(telegram.data.direction);
					const angleDegrees = (angle * 180) / Math.PI;
					this.world.combat.applyDamageEffects(telegram.data.damage, this.maxHealth, angleDegrees, this.world.postProcessing);
				}

				// logging

				if (this.world.debug) {

					console.log('DIVE.Player: Player hit by Game Entity with ID %s receiving %i damage.', telegram.sender.uuid, telegram.data.damage);

				}

				// check if the player is dead

				if (this.health <= 0 && this.status === STATUS_ALIVE) {

					this.initDeath();

					// Track death for game mode statistics
					const killMode = this.world.gameModeManager?.getCurrentMode();
					if (killMode && telegram.sender) {
						const killerId = telegram.sender.uuid || 'unknown';
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

					if (this.world.hudManager) {
						const killerName = telegram.sender.isPlayer ? this.name : telegram.sender.name || 'Enemy';
						const victimName = this.name || 'Player';
						const weapon = telegram.data.weapon || 'Unknown';
						const isHeadshot = telegram.data.isHeadshot || false;

						this.world.hudManager.addKillFeed(killerName, victimName, weapon, isHeadshot);
					} else {
						this.world.uiManager.addFragMessage(telegram.sender, this);
					}
				}

				break;
		}

		return true;

	}

	/**
	* Computes the angle between the current look direction and the attack direction in
	* the range of [-π, π].
	*
	* @param {Vector3} projectileDirection - The direction of the projectile.
	* @return {Number} The angle in radians.
	*/
	computeAngleToAttacker(projectileDirection: any) {

		attackDirection.copy(projectileDirection).multiplyScalar(- 1);
		attackDirection.y = 0; // project plane on (0,1,0) plane
		attackDirection.normalize();

		this.head.getWorldDirection(lookDirection);
		lookDirection.y = 0;
		lookDirection.normalize();

		// since both direction vectors lie in the same plane, use the following formula
		//
		// dot = a * b
		// det = n * (a x b)
		// angle = atan2(det, dot)
		//
		// Note: We can't use Vector3.angleTo() since the result is always in the range [0,π]

		const dot = attackDirection.dot(lookDirection);
		const det = this.up.dot(cross.crossVectors(attackDirection, lookDirection)); // triple product

		return Math.atan2(det, dot);

	}

	// ========== PLAYER AUDIO METHODS ==========

	/**
	 * Updates footstep sounds based on movement.
	 */
	private updateFootsteps(delta: number, inputDir: Vector3): void {
		this.lastFootstepTime += delta;

		// Only play footsteps when on ground and moving
		const isMoving = inputDir.length() > 0.1;
		if (!this.onGround || !isMoving) {
			return;
		}

		const interval = this.isSprinting ? this.sprintFootstepInterval : this.footstepInterval;

		if (this.lastFootstepTime >= interval) {
			this.lastFootstepTime = 0;
			this.playFootstepSound();
		}
	}

	/**
	 * Plays a random footstep sound.
	 */
	private playFootstepSound(): void {
		if (!this.world.combat?.audioManager) return;

		// Pick random footstep (Concrete-Run-1 through 6)
		const footstepNum = MathUtils.randInt(1, 6);
		const footstepPath = `/assets/audio/sfx/player/Concrete-Run-${footstepNum}.mp3_${this.getFootstepHash(footstepNum)}.mp3`;

		this.world.combat.audioManager.playSound(footstepPath, 'sfx', {
			volume: this.isSprinting ? 0.8 : 0.6
		});
	}

	/**
	 * Returns the hash suffix for footstep files.
	 */
	private getFootstepHash(num: number): string {
		const hashes: { [key: number]: string } = {
			1: 'c0954406',
			2: 'bcd23528',
			3: '721706e6',
			4: '4f98c76e',
			5: '121ee958',
			6: 'a62fc298'
		};
		return hashes[num] || 'c0954406';
	}

	/**
	 * Plays a landing sound based on impact velocity.
	 */
	private playLandingSound(): void {
		if (!this.world.combat?.audioManager) return;

		// Pick random landing sound
		const landNum = MathUtils.randInt(1, 2);
		const hash = landNum === 1 ? '58b9ba36' : 'de259dd1';
		const landPath = `/assets/audio/sfx/player/Land-${landNum}.mp3_${hash}.mp3`;

		// Louder for harder impacts
		const volume = Math.min(1.0, 0.5 + (this.landingImpact / 30) * 0.5);

		this.world.combat.audioManager.playSound(landPath, 'sfx', { volume });
	}

	/**
	 * Plays jump sound.
	 */
	private playJumpSound(): void {
		if (!this.world.combat?.audioManager) return;

		const jumpPath = '/assets/audio/sfx/player/Jump.mp3_523dd26f.mp3';
		this.world.combat.audioManager.playSound(jumpPath, 'sfx', { volume: 0.7 });
	}

	/**
	 * Plays a random damage grunt sound.
	 */
	private playDamageGrunt(): void {
		if (!this.world.combat?.audioManager) return;

		const gruntNum = MathUtils.randInt(1, 3);
		const hashes: { [key: number]: string } = {
			1: '1cd206a1',
			2: '17321d9c',
			3: '31597fb1'
		};
		const gruntPath = `/assets/audio/sfx/player/Echo-Grunt-${gruntNum}.mp3_${hashes[gruntNum]}.mp3`;

		this.world.combat.audioManager.playSound(gruntPath, 'sfx', { volume: 1.0 });
	}

	/**
	 * Plays death sound.
	 */
	private playDeathSound(): void {
		if (!this.world.combat?.audioManager) return;

		const deathPath = '/assets/audio/sfx/player/Echo-Death-1.mp3_4264c0fa.mp3';
		this.world.combat.audioManager.playSound(deathPath, 'sfx', { volume: 1.0 });
	}

	/**
	 * Updates heartbeat sound based on health level.
	 */
	private updateHeartbeat(): void {
		if (!this.world.combat?.audioManager) return;

		const healthPercent = this.health / this.maxHealth;
		const shouldPlayHeartbeat = healthPercent <= 0.25 && healthPercent > 0;

		if (shouldPlayHeartbeat && !this.heartbeatActive) {
			// Start heartbeat
			this.heartbeatActive = true;
			const heartbeatPath = '/assets/audio/sfx/player/Heart-Beat.mp3_1e759b97.mp3';
			this.heartbeatAudio = this.world.combat.audioManager.playSound(heartbeatPath, 'sfx', {
				volume: 0.8,
				loop: true
			});
		} else if (!shouldPlayHeartbeat && this.heartbeatActive) {
			this.stopHeartbeat();
		}
	}

	/**
	 * Stops the heartbeat sound.
	 */
	private stopHeartbeat(): void {
		this.heartbeatActive = false;
		if (this.heartbeatAudio && this.heartbeatAudio.isPlaying) {
			this.heartbeatAudio.stop();
		}
		this.heartbeatAudio = null;
	}

}

export { Player };
