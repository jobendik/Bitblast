import { EventDispatcher, Vector3, Logger } from 'yuka';
import { WEAPON_TYPES_BLASTER, WEAPON_TYPES_SHOTGUN, WEAPON_TYPES_ASSAULT_RIFLE } from '../core/Constants';
import { CONFIG } from '../core/Config';
import { Player } from '../entities/Player';
import { MobileControls } from './MobileControls';
import { WeaponType } from '../types/weapons';

const PI05 = Math.PI / 2;
const velocity = new Vector3();

let elapsed = 0;

const euler = { x: 0, y: 0, z: 0 };

/**
* Holds the implementation of the First-Person Controls.
* Supports both desktop (keyboard/mouse) and mobile (touch) input.
*/
class FirstPersonControls extends EventDispatcher {

	public owner: Player | null;
	public active: boolean;
	public movementX: number;
	public movementY: number;
	public lookingSpeed: number;
	public brakingPower: number;
	public headMovement: number;
	public weaponMovement: number;
	public input: any;
	public sounds: Map<string, any>;

	// Enhanced movement enhancements
	public isSprinting: boolean;
	public sprintMultiplier: number;

	// Mobile controls support
	public isMobile: boolean;
	public mobileControls: MobileControls | null;

	public _mouseDownHandler: any;
	public _mouseUpHandler: any;
	public _mouseMoveHandler: any;
	public _pointerlockChangeHandler: any;
	public _pointerlockErrorHandler: any;
	public _keyDownHandler: any;
	public _keyUpHandler: any;
	public _wheelHandler: any;
	public _contextMenuHandler: any;

	/**
	* Constructs a new first person controls.
	*
	* @param {Player} owner - A refernce to the player object.
	*/
	constructor(owner: Player | null = null) {

		super();

		this.owner = owner;

		this.active = true;

		this.movementX = 0; // mouse left/right
		this.movementY = 0; // mouse up/down

		this.lookingSpeed = CONFIG.CONTROLS.LOOKING_SPEED;
		this.brakingPower = CONFIG.CONTROLS.BRAKING_POWER;
		this.headMovement = CONFIG.CONTROLS.HEAD_MOVEMENT;
		this.weaponMovement = CONFIG.CONTROLS.WEAPON_MOVEMENT;

		// Enhanced movement
		this.isSprinting = false;
		this.sprintMultiplier = 1.6; // Sprint speed multiplier

		// Mobile controls
		this.isMobile = MobileControls.isMobileDevice();
		this.mobileControls = null;

		this.input = {
			forward: false,
			backward: false,
			right: false,
			left: false,
			mouseDown: false,
			sprint: false,
			jump: false,
			crouch: false
		};

		this.sounds = new Map();

		this._mouseDownHandler = onMouseDown.bind(this);
		this._mouseUpHandler = onMouseUp.bind(this);
		this._mouseMoveHandler = onMouseMove.bind(this);
		this._pointerlockChangeHandler = onPointerlockChange.bind(this);
		this._pointerlockErrorHandler = onPointerlockError.bind(this);
		this._keyDownHandler = onKeyDown.bind(this);
		this._keyUpHandler = onKeyUp.bind(this);
		this._wheelHandler = onWheel.bind(this);
		this._contextMenuHandler = onContextMenu.bind(this);

	}

	/**
	* Connects the event listeners and activates the controls.
	* For mobile devices, initializes touch controls instead of pointer lock.
	*
	* @return {FirstPersonControls} A reference to this instance.
	*/
	connect() {

		if (this.isMobile) {
			// Mobile: Initialize touch controls
			if (!this.mobileControls) {
				this.mobileControls = new MobileControls();
			}
			this.mobileControls.show();

			// Update aim button visibility based on current weapon
			this.updateAimButtonVisibility();

			// Add mobile class to body for CSS
			document.body.classList.add('mobile-device');

			// Show orientation warning if in portrait
			MobileControls.showOrientationWarning();

			this.dispatchEvent({ type: 'lock' }); // Simulate lock for game to start

			return this;
		}

		// Desktop: Use traditional mouse/keyboard controls
		document.addEventListener('mousedown', this._mouseDownHandler, false);
		document.addEventListener('mouseup', this._mouseUpHandler, false);
		document.addEventListener('mousemove', this._mouseMoveHandler, false);
		document.addEventListener('wheel', this._wheelHandler, { passive: false });
		document.addEventListener('pointerlockchange', this._pointerlockChangeHandler, false);
		document.addEventListener('pointerlockerror', this._pointerlockErrorHandler, false);
		document.addEventListener('keydown', this._keyDownHandler, false);
		document.addEventListener('keyup', this._keyUpHandler, false);
		document.addEventListener('contextmenu', this._contextMenuHandler, false);

		// Request pointer lock - may not be granted immediately if not from user gesture
		document.body.requestPointerLock().catch(err => {
		});

		return this;

	}

	/**
	* Disconnects the event listeners and deactivates the controls.
	*
	* @return {FirstPersonControls} A reference to this instance.
	*/
	disconnect() {

		if (this.isMobile) {
			// Mobile: Hide touch controls
			if (this.mobileControls) {
				this.mobileControls.hide();
				this.mobileControls.reset();
			}
			document.body.classList.remove('mobile-device');
			return this;
		}

		// Desktop: Remove event listeners
		document.removeEventListener('mousedown', this._mouseDownHandler, false);
		document.removeEventListener('mouseup', this._mouseUpHandler, false);
		document.removeEventListener('mousemove', this._mouseMoveHandler, false);
		document.removeEventListener('wheel', this._wheelHandler, { passive: false } as EventListenerOptions);
		document.removeEventListener('pointerlockchange', this._pointerlockChangeHandler, false);
		document.removeEventListener('pointerlockerror', this._pointerlockErrorHandler, false);
		document.removeEventListener('keydown', this._keyDownHandler, false);
		document.removeEventListener('keyup', this._keyUpHandler, false);
		document.removeEventListener('contextmenu', this._contextMenuHandler, false);

		if (document.pointerLockElement === document.body) {
			document.exitPointerLock();
		}

		return this;

	}

	/**
	* Ensures the controls reflect the current orientation of the owner. This method is
	* always used if the player's orientation is set manually. In this case, it's necessary
	* to adjust internal variables.
	*
	* @return {FirstPersonControls} A reference to this instance.
	*/
	sync(): this {

		if (!this.owner) return this;

		this.owner.rotation.toEuler(euler);
		this.movementX = euler.y; // yaw

		this.owner.head.rotation.toEuler(euler);
		this.movementY = euler.x; // pitch

		return this;

	}

	/**
	* Resets the controls (e.g. after a respawn).
	*
	* @param {Number} delta - The time delta.
	* @return {FirstPersonControls} A reference to this instance.
	*/
	reset() {

		this.active = true;

		this.movementX = 0;
		this.movementY = 0;

		this.input.forward = false;
		this.input.backward = false;
		this.input.right = false;
		this.input.left = false;
		this.input.mouseDown = false;
		this.input.sprint = false;

		this.isSprinting = false;

		elapsed = 0;
		velocity.set(0, 0, 0);

		// Reset mobile controls if active
		if (this.mobileControls) {
			this.mobileControls.reset();
		}

	}

	/**
	* Updates the aim button visibility based on current weapon.
	* Only shows the aim/scope button for sniper-type weapons.
	*/
	updateAimButtonVisibility(): void {
		if (!this.mobileControls || !this.owner?.world?.combat?.weaponSystem) {
			return;
		}

		const currentWeapon = this.owner.world.combat.weaponSystem.currentWeapon;
		const isScopedWeapon = currentWeapon === WeaponType.Sniper ||
			currentWeapon === WeaponType.AWP;

		this.mobileControls.setAimButtonVisible(isScopedWeapon);
	}

	/**
	* Update method of this controls. Computes the current velocity and head bobbing
	* of the owner (player).
	*
	* @param {Number} delta - The time delta.
	* @return {FirstPersonControls} A reference to this instance.
	*/
	update(delta: number): this {

		if (this.active && this.owner) {

			// Update mobile controls and process mobile input
			if (this.isMobile && this.mobileControls) {
				this._updateMobileInput(delta);
			}

			this._updateVelocity(delta);

			const speed = this.owner.getSpeed();
			elapsed += delta * speed;

			// elapsed is used by the following two methods. it is scaled with the speed
			// to modulate the head bobbing and weapon movement

			this._updateHead();
			this._updateWeapon();

			// if the mouse is pressed and an automatic weapon is equipped
			// support automatic fire using combat system

			if (this.input.mouseDown && this.owner) {
				// Check if using combat system and weapon is automatic
				if (this.owner.world.combat) {
					const weaponConfig = this.owner.world.combat.weaponSystem.currentConfig;
					if (weaponConfig.automatic) {
						this.owner.shoot();
					}
				} else if (this.owner.isAutomaticWeaponUsed()) {
					// Fallback to old system
					this.owner.shoot();
				}
			}

		} else {
			// console.log(`[Controls] Inactive or no owner. Active:${this.active} Owner:${!!this.owner}`);
		}

		return this;

	}

	/**
	* Processes input from mobile touch controls.
	* Converts touch input to the same format as keyboard/mouse input.
	*
	* @param {Number} delta - The time delta.
	* @return {FirstPersonControls} A reference to this instance.
	*/
	_updateMobileInput(_delta: number): this {

		if (!this.mobileControls || !this.owner) return this;

		const mobile = this.mobileControls;
		mobile.update();

		// Convert joystick input to movement
		const movement = mobile.movementInput;
		const deadzone = 0.15;

		// Forward/backward (Y axis)
		this.input.forward = movement.y > deadzone;
		this.input.backward = movement.y < -deadzone;

		// Left/right (X axis)
		this.input.left = movement.x < -deadzone;
		this.input.right = movement.x > deadzone;

		// Sprint from mobile controls
		this.input.sprint = mobile.sprintPressed;

		// Jump and crouch
		this.input.jump = mobile.jumpPressed;
		this.input.crouch = mobile.crouchPressed;

		// Fire button
		this.input.mouseDown = mobile.firePressed;

		// Handle look/camera rotation using consumed delta
		const lookDelta = mobile.consumeLookDelta();
		if (lookDelta.x !== 0 || lookDelta.y !== 0) {
			// Reduce sensitivity when zoomed for precision aiming
			let sensitivityMultiplier = 1.0;
			if (this.owner.world?.combat?.weaponSystem?.isZoomed) {
				sensitivityMultiplier = 0.3;
			}

			// Apply look delta to camera rotation
			this.movementX -= lookDelta.x * 0.01 * this.lookingSpeed * sensitivityMultiplier;
			this.movementY -= lookDelta.y * 0.01 * this.lookingSpeed * sensitivityMultiplier;

			// Clamp pitch
			this.movementY = Math.max(-PI05, Math.min(PI05, this.movementY));

			// Update owner rotation
			this.owner.rotation.fromEuler(0, this.movementX, 0); // yaw
			this.owner.head.rotation.fromEuler(this.movementY, 0, 0); // pitch

			// Pass to combat system
			if (this.owner.world?.onMouseMove) {
				this.owner.world.onMouseMove(lookDelta.x * 10, lookDelta.y * 10);
			}
		}

		// Aim/zoom (ADS)
		if (this.owner.world?.combat?.weaponSystem) {
			const weaponSystem = this.owner.world.combat.weaponSystem;
			if (mobile.aimPressed && !weaponSystem.isZoomed) {
				weaponSystem.setZoom(true);
			} else if (!mobile.aimPressed && weaponSystem.isZoomed) {
				weaponSystem.setZoom(false);
			}
		}

		// Handle reload
		if (mobile.reloadPressed) {
			this.owner.reload();
		}

		// Handle weapon switching
		if (mobile.weaponSwitchRequested !== 0 && this.owner.world?.combat) {
			this.owner.world.combat.weaponSystem.scrollWeapon(mobile.weaponSwitchRequested);

			// Send weapon switch over network
			const networkManager = this.owner.world.networkManager;
			if (networkManager?.isConnected) {
				const weaponName = this.owner.world.combat.weaponSystem.currentWeapon;
				networkManager.sendWeaponSwitch(weaponName);
			}

			// Update aim button visibility based on new weapon (only show for scoped weapons)
			this.updateAimButtonVisibility();
		}

		// Handle jump action
		if (mobile.jumpPressed && this.owner.world) {
			// Jump is handled through the input.jump flag above
			// The player physics system checks this flag
		}

		return this;

	}

	/**
	* Computes the current velocity of the owner (player).
	*
	* @param {Number} delta - The time delta.
	* @return {FirstPersonControls} A reference to this instance.
	*/
	_updateVelocity(_delta: number): this {

		const input = this.input;

		// Enhanced sprint detection
		const isMovingForward = input.forward && !input.backward;
		this.isSprinting = input.sprint && isMovingForward;

		return this;

	}

	/**
	* Computes the head bobbing of the owner (player).
	*
	* @return {FirstPersonControls} A reference to this instance.
	*/
	_updateHead() {
		// Head bobbing is now handled by the Player entity (physics system)
		return this;
	}

	/**
	* Computes the movement of the current armed weapon.
	*
	* @return {FirstPersonControls} A reference to this instance.
	*/
	_updateWeapon() {

		const owner = this.owner;
		if (!owner) return this;

		const weaponContainer = owner.weaponContainer;

		const motion = Math.sin(elapsed * this.weaponMovement);

		weaponContainer.position.x = motion * 0.005;
		weaponContainer.position.y = Math.abs(motion) * 0.002;

		return this;

	}

}

// event listeners

function onMouseDown(this: FirstPersonControls, event: any) {

	if (this.active && event.which === 1) {

		// Ensure pointer is locked first
		if (document.pointerLockElement !== document.body) {
			event.preventDefault();
			document.body.requestPointerLock();
			return; // Don't shoot on the lock-requesting click
		}

		event.preventDefault();
		this.input.mouseDown = true;

		// Always fire on first click for all weapons
		if (this.owner) {
			this.owner.shoot();
		}
	}

	// Right mouse button - zoom/ADS (aim down sights)
	if (this.active && event.which === 3) {
		event.preventDefault();

		// Ensure pointer is locked first
		if (document.pointerLockElement !== document.body) {
			return;
		}

		// Trigger zoom on via World's combat system
		if (this.owner && this.owner.world && this.owner.world.combat) {
			this.owner.world.combat.weaponSystem.setZoom(true);
		}
	}

}

function onMouseUp(this: FirstPersonControls, event: any) {

	if (this.active && event.which === 1) {
		event.preventDefault();
		this.input.mouseDown = false;
	}

	// Right mouse button release - unzoom
	if (this.active && event.which === 3) {
		event.preventDefault();

		// Trigger zoom off via World's combat system
		if (this.owner && this.owner.world && this.owner.world.combat) {
			this.owner.world.combat.weaponSystem.setZoom(false);
		}
	}

}

function onMouseMove(this: FirstPersonControls, event: any) {

	if (this.active && document.pointerLockElement === document.body) {

		// Reduce sensitivity when zoomed for precision aiming
		let sensitivityMultiplier = 1.0;
		if (this.owner && this.owner.world && this.owner.world.combat && this.owner.world.combat.weaponSystem.isZoomed) {
			sensitivityMultiplier = 0.3; // 30% sensitivity when scoped
		}

		this.movementX -= event.movementX * 0.001 * this.lookingSpeed * sensitivityMultiplier;
		this.movementY -= event.movementY * 0.001 * this.lookingSpeed * sensitivityMultiplier;

		this.movementY = Math.max(- PI05, Math.min(PI05, this.movementY));

		if (this.owner) {
			this.owner.rotation.fromEuler(0, this.movementX, 0); // yaw
			this.owner.head.rotation.fromEuler(this.movementY, 0, 0); // pitch

			// Pass mouse movement to World for combat system
			if (this.owner.world && this.owner.world.onMouseMove) {
				this.owner.world.onMouseMove(event.movementX, event.movementY);
			}
		}

	}

}

function onPointerlockChange(this: FirstPersonControls) {

	const isLocked = document.pointerLockElement === document.body;

	if (isLocked) {

		this.dispatchEvent({ type: 'lock' });

	} else {

		// Do NOT disconnect, just dispatch unlock so UI can update
		// this.disconnect(); 

		this.dispatchEvent({ type: 'unlock' });

	}

}

function onPointerlockError(this: FirstPersonControls) {

	Logger.warn('Dive.FirstPersonControls: Unable to use Pointer Lock API.');

}

function onKeyDown(this: FirstPersonControls, event: any) {

	// Skip if an input element is focused (e.g., chat input)
	const activeElement = document.activeElement;
	if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
		return;
	}

	if (this.active) {

		switch (event.keyCode) {

			case 38: // up
			case 87: // w
				this.input.forward = true;
				break;

			case 37: // left
			case 65: // a
				this.input.left = true;
				break;

			case 40: // down
			case 83: // s
				this.input.backward = true;
				break;

			case 39: // right
			case 68: // d
				this.input.right = true;
				break;

			case 16: // shift (sprint)
				this.input.sprint = true;
				break;

			case 32: // space (jump)
				this.input.jump = true;
				break;

			case 67: // c (crouch/slide)
			case 17: // ctrl
				this.input.crouch = true;
				break;

			case 82: // r
				if (!this.owner) break;
				this.owner.reload();
				break;

			case 49: // 1
			case 50: // 2
			case 51: // 3
			case 52: // 4
			case 53: // 5
			case 54: // 6
			case 55: // 7
			case 56: // 8
			case 57: // 9
				if (this.owner && this.owner.world.combat) {
					const weaponIndex = event.keyCode - 49; // 0-8 for keys 1-9
					const equippedWeapons = this.owner.world.combat.weaponSystem.getEquippedWeapons();
					if (weaponIndex < equippedWeapons.length) {
						this.owner.world.combat.weaponSystem.switchWeapon(weaponIndex);
						// Send weapon switch to network
						const weaponName = equippedWeapons[weaponIndex];
						if (this.owner.world.networkManager) {
							this.owner.world.networkManager.sendWeaponSwitch(weaponName);
						}
					}
				} else {
					// Fallback to old system
					if (event.keyCode === 49 && this.owner) {
						this.owner.changeWeapon(WEAPON_TYPES_BLASTER);
					} else if (event.keyCode === 50 && this.owner && this.owner.hasWeapon(WEAPON_TYPES_SHOTGUN)) {
						this.owner.changeWeapon(WEAPON_TYPES_SHOTGUN);
					} else if (event.keyCode === 51 && this.owner && this.owner.hasWeapon(WEAPON_TYPES_ASSAULT_RIFLE)) {
						this.owner.changeWeapon(WEAPON_TYPES_ASSAULT_RIFLE);
					}
				}
				break;

		}

	}

}

function onKeyUp(this: FirstPersonControls, event: any) {

	if (this.active) {

		switch (event.keyCode) {

			case 38: // up
			case 87: // w
				this.input.forward = false;
				break;

			case 37: // left
			case 65: // a
				this.input.left = false;
				break;

			case 40: // down
			case 83: // s
				this.input.backward = false;
				break;

			case 39: // right
			case 68: // d
				this.input.right = false;
				break;

			case 16: // shift (sprint)
				this.input.sprint = false;
				break;

			case 32: // space (jump)
				this.input.jump = false;
				break;

			case 67: // c (crouch/slide)
			case 17: // ctrl
				this.input.crouch = false;
				break;

		}

	}

}

function onWheel(this: FirstPersonControls, event: WheelEvent) {

	if (this.active && this.owner && this.owner.world.combat) {

		event.preventDefault();

		const direction = event.deltaY > 0 ? 1 : -1;
		this.owner.world.combat.weaponSystem.scrollWeapon(direction);

		// Send weapon switch over network
		const networkManager = this.owner.world.networkManager;
		if (networkManager && networkManager.isConnected) {
			const weaponName = this.owner.world.combat.weaponSystem.currentWeapon;
			networkManager.sendWeaponSwitch(weaponName);
		}

	}

}

function onContextMenu(this: FirstPersonControls, event: Event) {
	// Prevent context menu from appearing on right-click (used for zoom/ADS)
	event.preventDefault();
}

export { FirstPersonControls };
