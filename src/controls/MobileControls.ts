import * as THREE from 'three';

interface TouchData {
  identifier: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  prevX: number;
  prevY: number;
  startTime: number;
  zone: 'move' | 'look' | 'button';
}

/**
 * Mobile Controls for BITBLAST FPS Game
 * Provides touch-based input for movement, aiming, and actions on mobile devices.
 * 
 * Features:
 * - Virtual joystick for movement (left side)
 * - Touch-to-look camera control (right side of screen)
 * - Fire button with drag-to-aim support
 * - Jump, reload, and weapon switch buttons
 * - Optional gyroscope aiming
 * - Haptic feedback support
 */
export class MobileControls {
  private container: HTMLElement;
  private joystickContainer: HTMLDivElement;
  private joystickStick: HTMLDivElement;
  private rightButtonContainer: HTMLDivElement;
  private leftButtonContainer: HTMLDivElement;
  private fireButton!: HTMLButtonElement;
  private aimButton!: HTMLButtonElement;

  // Touch tracking - strictly isolated by zone
  private moveTouch: TouchData | null = null;
  private lookTouch: TouchData | null = null;
  private activeTouches: Map<number, TouchData> = new Map();

  // Public inputs - consumed by game systems
  public movementInput = new THREE.Vector2(0, 0);
  public lookDelta = new THREE.Vector2(0, 0);
  public firePressed = false;
  public jumpPressed = false;
  public reloadPressed = false;
  public aimPressed = false;
  public crouchPressed = false;
  public sprintPressed = false;
  public weaponSwitchRequested: number = 0; // -1, 0, or 1

  // Tuning parameters
  private joystickMaxDistance = 50;
  private lookSensitivity = 0.35;
  private lookDeadzone = 2;
  private lookSmoothing = 0.4;

  // Smoothed look input for polish
  private smoothedLookDelta = new THREE.Vector2(0, 0);

  // Gyroscope support
  private gyroEnabled = false;
  private gyroSensitivity = 0.02;
  private gyroData: { alpha: number; beta: number; gamma: number } | null = null;
  private gyroBaseline: { alpha: number; beta: number; gamma: number } | null = null;

  // Haptic feedback
  private hapticEnabled = true;

  // Cleanup watchdog
  private touchCleanupInterval: number | null = null;

  // Visibility state
  private isVisible = false;

  constructor() {
    // Main container
    this.container = document.createElement('div');
    this.container.id = 'mobile-controls';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2000;
      display: none;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    `;

    // Create joystick
    const { container: joyContainer, stick } = this.createJoystick();
    this.joystickContainer = joyContainer;
    this.joystickStick = stick;
    this.container.appendChild(this.joystickContainer);

    // Create left side buttons (jump, crouch)
    this.leftButtonContainer = this.createLeftButtons();
    this.container.appendChild(this.leftButtonContainer);

    // Create right side buttons (fire, reload, weapon switch, aim)
    this.rightButtonContainer = this.createRightButtons();
    this.container.appendChild(this.rightButtonContainer);

    // Add to DOM
    document.body.appendChild(this.container);

    // Setup event listeners
    this.setupEventListeners();
    this.initGyroscope();
    this.startTouchCleanupWatchdog();
  }

  // ==================== UI CREATION ====================

  private createJoystick(): { container: HTMLDivElement; base: HTMLDivElement; stick: HTMLDivElement } {
    const container = document.createElement('div');
    container.className = 'mobile-joystick-container';
    container.style.cssText = `
      position: absolute;
      bottom: 40px;
      left: 30px;
      width: 140px;
      height: 140px;
      pointer-events: auto;
      touch-action: none;
      z-index: 100;
    `;

    const base = document.createElement('div');
    base.className = 'mobile-joystick-base';
    base.style.cssText = `
      position: absolute;
      width: 100%;
      height: 100%;
      /* INVISIBLE JOYSTICK - Logic remains, visuals hidden */
      background: transparent;
      border: none;
      border-radius: 50%;
      box-shadow: none;
    `;

    const stick = document.createElement('div');
    stick.className = 'mobile-joystick-stick';
    stick.style.cssText = `
      position: absolute;
      width: 55px;
      height: 55px;
      /* INVISIBLE JOYSTICK STICK */
      background: transparent;
      border: none;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      transition: transform 0.05s ease-out;
      box-shadow: none;
      pointer-events: none;
    `;

    container.appendChild(base);
    container.appendChild(stick);

    return { container, base, stick };
  }

  private createLeftButtons(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'mobile-left-buttons';
    container.style.cssText = `
      position: absolute;
      bottom: 40px;
      left: 190px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: auto;
      touch-action: none;
      z-index: 100;
    `;

    // Jump button - HIDDEN but created to prevent errors
    const jumpBtn = this.createButton('', '60px', 'rgba(100, 255, 150, 0.0)', 'rgba(100, 255, 150, 0.5)');
    jumpBtn.id = 'mobile-jump-btn';
    jumpBtn.title = 'Jump';
    jumpBtn.style.display = 'none'; // USER REQUEST: Hide jump button
    this.setupButtonEvents(jumpBtn, 'jump');

    // Crouch button
    const crouchBtn = this.createButton('', '55px', 'rgba(150, 150, 255, 0.0)', 'rgba(150, 150, 255, 0.5)');
    crouchBtn.id = 'mobile-crouch-btn';
    crouchBtn.title = 'Crouch';
    crouchBtn.style.display = 'none'; // Simplify: Hide crouch if mostly jumping
    // this.setupButtonEvents(crouchBtn, 'crouch');

    container.appendChild(jumpBtn);
    // container.appendChild(crouchBtn);

    return container;
  }

  private createRightButtons(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'mobile-right-buttons';
    container.style.cssText = `
      position: absolute;
      bottom: 40px;
      right: 30px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: flex-end;
      pointer-events: auto;
      touch-action: none;
      z-index: 100;
    `;

    // Single Weapon Switch Button
    const swapBtn = this.createButton('', '60px', 'rgba(200, 150, 255, 0.0)', 'rgba(200, 150, 255, 0.5)');
    swapBtn.id = 'mobile-swap-btn';
    this.setupButtonEvents(swapBtn, 'nextWeapon'); // Cycle forward only

    /*
    // Old Weapon switch row
    const weaponRow = document.createElement('div');
    weaponRow.style.cssText = `
      display: flex;
      gap: 8px;
      margin-bottom: 5px;
    `;

    const prevWeaponBtn = this.createButton('◀', '45px', 'rgba(200, 150, 255, 0.25)', 'rgba(200, 150, 255, 0.7)');
    prevWeaponBtn.style.fontSize = '16px';
    this.setupButtonEvents(prevWeaponBtn, 'prevWeapon');

    const nextWeaponBtn = this.createButton('▶', '45px', 'rgba(200, 150, 255, 0.25)', 'rgba(200, 150, 255, 0.7)');
    nextWeaponBtn.style.fontSize = '16px';
    this.setupButtonEvents(nextWeaponBtn, 'nextWeapon');

    weaponRow.appendChild(prevWeaponBtn);
    weaponRow.appendChild(nextWeaponBtn);
    */

    // Reload button
    const reloadBtn = this.createButton('', '55px', 'rgba(255, 200, 100, 0.0)', 'rgba(255, 200, 100, 0.5)');
    reloadBtn.id = 'mobile-reload-btn';
    this.setupButtonEvents(reloadBtn, 'reload');

    // Aim button (ADS) - hidden by default, shown only for scoped weapons
    const aimBtn = this.createButton('🎯', '55px', 'rgba(100, 200, 255, 0.25)', 'rgba(100, 200, 255, 0.7)');
    aimBtn.id = 'mobile-aim-btn';
    aimBtn.style.fontSize = '22px';
    aimBtn.style.display = 'none'; // Hidden by default
    this.aimButton = aimBtn;
    this.setupButtonEvents(aimBtn, 'aim');

    // FIRE button - large and prominent
    this.fireButton = this.createButton('', '90px', 'rgba(255, 50, 50, 0.0)', 'rgba(255, 50, 50, 0.5)');
    this.fireButton.id = 'mobile-fire-btn';
    this.fireButton.style.fontSize = '16px';
    this.fireButton.style.fontWeight = 'bold';
    this.fireButton.style.letterSpacing = '2px';
    this.setupFireButtonEvents(this.fireButton);

    container.appendChild(swapBtn);
    container.appendChild(reloadBtn);
    container.appendChild(aimBtn);
    container.appendChild(this.fireButton);

    return container;
  }

  private createButton(text: string, size: string, bgColor: string, activeColor: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.dataset.bgColor = bgColor;
    btn.dataset.activeColor = activeColor;
    btn.style.cssText = `
      width: ${size};
      height: ${size};
      background: ${bgColor};
      border: 2px solid ${activeColor};
      border-radius: 50%;
      color: white;
      font-weight: bold;
      font-size: 14px;
      font-family: 'Rajdhani', 'Teko', sans-serif;
      backdrop-filter: blur(5px);
      cursor: pointer;
      box-shadow: 
        0 0 15px ${activeColor.replace(/[\d.]+\)$/, '0.3)')},
        inset 0 0 10px rgba(0, 0, 0, 0.3);
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      transition: all 0.1s ease;
      pointer-events: auto;
      outline: none;
    `;

    return btn;
  }

  // ==================== BUTTON EVENT HANDLERS ====================

  private setupButtonEvents(btn: HTMLButtonElement, action: string): void {
    btn.addEventListener('touchstart', (e) => this.handleButtonStart(e, action), { passive: false });
    btn.addEventListener('touchend', (e) => this.handleButtonEnd(e, action), { passive: false });
    btn.addEventListener('touchcancel', (e) => this.handleButtonEnd(e, action), { passive: false });
  }

  private setupFireButtonEvents(btn: HTMLButtonElement): void {
    btn.addEventListener('touchstart', (e) => this.handleFireStart(e), { passive: false });
    btn.addEventListener('touchmove', (e) => this.handleFireMove(e), { passive: false });
    btn.addEventListener('touchend', (e) => this.handleFireEnd(e), { passive: false });
    btn.addEventListener('touchcancel', (e) => this.handleFireEnd(e), { passive: false });
  }

  private handleButtonStart(e: TouchEvent, action: string): void {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0];
    const target = e.currentTarget as HTMLButtonElement;

    // Visual feedback - pressed state
    const activeColor = target.dataset.activeColor || 'rgba(255, 255, 255, 0.6)';
    target.style.background = activeColor;
    target.style.transform = 'scale(0.9)';
    target.style.boxShadow = `0 0 25px ${activeColor}`;

    // Track touch
    this.activeTouches.set(touch.identifier, {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      prevX: touch.clientX,
      prevY: touch.clientY,
      startTime: Date.now(),
      zone: 'button'
    });

    // Trigger action
    this.triggerHaptic('light');

    switch (action) {
      case 'jump':
        this.jumpPressed = true;
        break;
      case 'crouch':
        this.crouchPressed = true;
        break;
      case 'reload':
        this.reloadPressed = true;
        // Auto-release reload after brief press
        setTimeout(() => { this.reloadPressed = false; }, 100);
        break;
      case 'aim':
        this.aimPressed = true;
        break;
      case 'nextWeapon':
        this.weaponSwitchRequested = 1;
        break;
      case 'prevWeapon':
        this.weaponSwitchRequested = -1;
        break;
    }
  }

  private handleButtonEnd(e: TouchEvent, action: string): void {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0];
    const target = e.currentTarget as HTMLButtonElement;

    // Visual feedback - released state
    const bgColor = target.dataset.bgColor || 'rgba(0, 0, 0, 0.3)';
    const activeColor = target.dataset.activeColor || 'rgba(255, 255, 255, 0.6)';
    target.style.background = bgColor;
    target.style.transform = 'scale(1)';
    target.style.boxShadow = `0 0 15px ${activeColor.replace(/[\d.]+\)$/, '0.3)')}`;

    // Clean up touch
    this.activeTouches.delete(touch.identifier);

    // Release action
    switch (action) {
      case 'jump':
        this.jumpPressed = false;
        break;
      case 'crouch':
        this.crouchPressed = false;
        break;
      case 'aim':
        this.aimPressed = false;
        break;
    }
  }

  // Fire button with drag-to-aim support
  private fireButtonTouchId: number | null = null;

  private handleFireStart(e: TouchEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0];

    // Visual feedback
    this.fireButton.style.background = 'rgba(255, 50, 50, 0.8)';
    this.fireButton.style.transform = 'scale(0.92)';
    this.fireButton.style.boxShadow = '0 0 30px rgba(255, 50, 50, 0.8)';

    // Track touch
    this.fireButtonTouchId = touch.identifier;
    this.activeTouches.set(touch.identifier, {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      prevX: touch.clientX,
      prevY: touch.clientY,
      startTime: Date.now(),
      zone: 'button'
    });

    this.firePressed = true;
    this.triggerHaptic('medium');
  }

  private handleFireMove(e: TouchEvent): void {
    e.preventDefault();
    e.stopPropagation();

    if (this.fireButtonTouchId === null) return;

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (touch.identifier === this.fireButtonTouchId) {
        const touchData = this.activeTouches.get(touch.identifier);
        if (!touchData) return;

        // Calculate delta for drag-to-aim
        const rawDeltaX = touch.clientX - touchData.currentX;
        const rawDeltaY = touch.clientY - touchData.currentY;

        // Apply deadzone
        const deltaX = Math.abs(rawDeltaX) > this.lookDeadzone ? rawDeltaX : 0;
        const deltaY = Math.abs(rawDeltaY) > this.lookDeadzone ? rawDeltaY : 0;

        // Add to look delta (reduced sensitivity for fire-aim)
        this.lookDelta.x += deltaX * this.lookSensitivity * 0.7;
        this.lookDelta.y += deltaY * this.lookSensitivity * 0.7;

        // Update touch position
        touchData.prevX = touchData.currentX;
        touchData.prevY = touchData.currentY;
        touchData.currentX = touch.clientX;
        touchData.currentY = touch.clientY;
        break;
      }
    }
  }

  private handleFireEnd(e: TouchEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0];

    // Visual feedback
    this.fireButton.style.background = 'rgba(255, 50, 50, 0.3)';
    this.fireButton.style.transform = 'scale(1)';
    this.fireButton.style.boxShadow = '0 0 15px rgba(255, 50, 50, 0.3)';

    // Clean up
    this.activeTouches.delete(touch.identifier);
    if (touch.identifier === this.fireButtonTouchId) {
      this.fireButtonTouchId = null;
    }

    this.firePressed = false;
  }

  // ==================== JOYSTICK HANDLERS ====================

  private handleJoystickStart(e: TouchEvent): void {
    const touch = e.changedTouches[0];

    // Clean up any existing move touch
    if (this.moveTouch) {
      this.activeTouches.delete(this.moveTouch.identifier);
      this.moveTouch = null;
      this.movementInput.set(0, 0);
      this.resetJoystickVisual();
    }

    this.moveTouch = {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      prevX: touch.clientX,
      prevY: touch.clientY,
      startTime: Date.now(),
      zone: 'move'
    };

    this.activeTouches.set(touch.identifier, this.moveTouch);
    this.updateJoystickVisual();
  }

  private handleJoystickMove(e: TouchEvent): void {
    if (!this.moveTouch) return;

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (touch.identifier === this.moveTouch.identifier) {
        this.moveTouch.prevX = this.moveTouch.currentX;
        this.moveTouch.prevY = this.moveTouch.currentY;
        this.moveTouch.currentX = touch.clientX;
        this.moveTouch.currentY = touch.clientY;
        this.updateJoystickVisual();
        return;
      }
    }

    // Touch lost - cleanup
    this.cleanupMoveTouch();
  }

  private handleJoystickEnd(e: TouchEvent): void {
    if (!this.moveTouch) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.moveTouch.identifier) {
        this.cleanupMoveTouch();
        return;
      }
    }
  }

  private cleanupMoveTouch(): void {
    if (this.moveTouch) {
      this.activeTouches.delete(this.moveTouch.identifier);
      this.moveTouch = null;
    }
    this.movementInput.set(0, 0);
    this.resetJoystickVisual();
  }

  private updateJoystickVisual(): void {
    if (!this.moveTouch) return;

    const deltaX = this.moveTouch.currentX - this.moveTouch.startX;
    const deltaY = this.moveTouch.currentY - this.moveTouch.startY;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const clampedDistance = Math.min(distance, this.joystickMaxDistance);

    const angle = Math.atan2(deltaY, deltaX);

    const stickX = Math.cos(angle) * clampedDistance;
    const stickY = Math.sin(angle) * clampedDistance;

    // Update stick position
    this.joystickStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

    // Intensity-based glow
    const intensity = clampedDistance / this.joystickMaxDistance;
    this.joystickStick.style.boxShadow = `
      0 0 ${15 + intensity * 20}px rgba(0, 242, 255, ${0.7 + intensity * 0.3}),
      0 4px 8px rgba(0, 0, 0, 0.4),
      inset 0 0 10px rgba(255, 255, 255, 0.3)
    `;

    // Normalize and set movement input
    const normalizedX = stickX / this.joystickMaxDistance;
    const normalizedY = stickY / this.joystickMaxDistance;

    // Note: Y is inverted for game coordinates (forward = -Y in screen)
    this.movementInput.set(normalizedX, -normalizedY);

    // Enable sprint when joystick is pushed far forward
    this.sprintPressed = normalizedY > 0.85;
  }

  private resetJoystickVisual(): void {
    this.joystickStick.style.transform = 'translate(-50%, -50%)';
    this.joystickStick.style.boxShadow = `
      0 0 15px rgba(0, 242, 255, 0.7),
      0 4px 8px rgba(0, 0, 0, 0.4),
      inset 0 0 10px rgba(255, 255, 255, 0.3)
    `;
    this.sprintPressed = false;
  }

  // ==================== LOOK/CAMERA HANDLERS ====================

  private handleLookStart(e: TouchEvent): void {
    const touch = e.changedTouches[0];

    // Skip if already tracked
    if (this.activeTouches.has(touch.identifier)) {
      return;
    }

    // Look zone: entire screen EXCEPT joystick area (left side bottom) and button areas
    // This allows camera rotation from anywhere that isn't a control
    const joystickAreaWidth = 200; // Left side reserved for joystick
    const joystickAreaHeight = 250; // Bottom-left for joystick and jump/crouch
    const rightButtonAreaWidth = 180; // Right side reserved for fire/reload/aim buttons
    const rightButtonAreaHeight = 320; // Bottom-right button area

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Check if touch is in joystick area (bottom-left)
    const isInJoystickArea = touch.clientX < joystickAreaWidth &&
      touch.clientY > screenHeight - joystickAreaHeight;

    // Check if touch is in right button area (bottom-right)
    const isInButtonArea = touch.clientX > screenWidth - rightButtonAreaWidth &&
      touch.clientY > screenHeight - rightButtonAreaHeight;

    // Look zone is everywhere except control areas
    const isInLookZone = !isInJoystickArea && !isInButtonArea;

    if (!isInLookZone) {
      return;
    }

    e.preventDefault();

    // Clean up existing look touch
    if (this.lookTouch) {
      this.activeTouches.delete(this.lookTouch.identifier);
      this.lookTouch = null;
    }

    this.lookTouch = {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      prevX: touch.clientX,
      prevY: touch.clientY,
      startTime: Date.now(),
      zone: 'look'
    };

    this.activeTouches.set(touch.identifier, this.lookTouch);
  }

  private handleLookMove(e: TouchEvent): void {
    if (!this.lookTouch) return;

    e.preventDefault();

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (touch.identifier === this.lookTouch.identifier) {
        // Calculate frame delta
        const rawDeltaX = touch.clientX - this.lookTouch.currentX;
        const rawDeltaY = touch.clientY - this.lookTouch.currentY;

        // Apply deadzone
        const deltaX = Math.abs(rawDeltaX) > this.lookDeadzone ? rawDeltaX : 0;
        const deltaY = Math.abs(rawDeltaY) > this.lookDeadzone ? rawDeltaY : 0;

        // Apply sensitivity
        const targetX = deltaX * this.lookSensitivity;
        const targetY = deltaY * this.lookSensitivity;

        // Smooth input
        this.smoothedLookDelta.x += (targetX - this.smoothedLookDelta.x) * this.lookSmoothing;
        this.smoothedLookDelta.y += (targetY - this.smoothedLookDelta.y) * this.lookSmoothing;

        // Accumulate look delta (will be consumed by game each frame)
        this.lookDelta.x += this.smoothedLookDelta.x;
        this.lookDelta.y += this.smoothedLookDelta.y;

        // Update position
        this.lookTouch.prevX = this.lookTouch.currentX;
        this.lookTouch.prevY = this.lookTouch.currentY;
        this.lookTouch.currentX = touch.clientX;
        this.lookTouch.currentY = touch.clientY;
        return;
      }
    }

    // Touch lost
    this.cleanupLookTouch();
  }

  private handleLookEnd(e: TouchEvent): void {
    if (!this.lookTouch) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.lookTouch.identifier) {
        this.cleanupLookTouch();
        return;
      }
    }
  }

  private cleanupLookTouch(): void {
    if (this.lookTouch) {
      this.activeTouches.delete(this.lookTouch.identifier);
      this.lookTouch = null;
    }
    this.lookDelta.set(0, 0);
    this.smoothedLookDelta.set(0, 0);
  }

  // ==================== EVENT LISTENER SETUP ====================

  private setupEventListeners(): void {
    // Joystick events
    this.joystickContainer.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleJoystickStart(e);
    }, { passive: false });

    this.joystickContainer.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleJoystickMove(e);
    }, { passive: false });

    this.joystickContainer.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleJoystickEnd(e);
    }, { passive: false });

    this.joystickContainer.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleJoystickEnd(e);
    }, { passive: false });

    // Document-level touch events for look area
    document.addEventListener('touchstart', (e) => this.handleLookStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.handleLookMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.handleLookEnd(e), { passive: false });
    document.addEventListener('touchcancel', (e) => this.handleLookEnd(e), { passive: false });

    // Prevent default behaviors that interfere with controls
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
  }

  // ==================== WATCHDOG ====================

  private startTouchCleanupWatchdog(): void {
    this.touchCleanupInterval = window.setInterval(() => {
      // Check for stuck move touch
      if (this.moveTouch) {
        const touchData = this.activeTouches.get(this.moveTouch.identifier);
        if (!touchData || touchData.zone !== 'move') {
          console.warn('[MobileControls] Watchdog: Cleaning stuck move touch');
          this.cleanupMoveTouch();
        }
      }

      // Check for stuck look touch
      if (this.lookTouch) {
        const touchData = this.activeTouches.get(this.lookTouch.identifier);
        if (!touchData || touchData.zone !== 'look') {
          console.warn('[MobileControls] Watchdog: Cleaning stuck look touch');
          this.cleanupLookTouch();
        }
      }
    }, 500);
  }

  private stopTouchCleanupWatchdog(): void {
    if (this.touchCleanupInterval !== null) {
      clearInterval(this.touchCleanupInterval);
      this.touchCleanupInterval = null;
    }
  }

  // ==================== GYROSCOPE ====================

  private initGyroscope(): void {
    if (window.DeviceOrientationEvent) {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        console.log('[MobileControls] Gyroscope available but requires permission (iOS)');
      } else {
        this.setupGyroscope();
      }
    }
  }

  private setupGyroscope(): void {
    window.addEventListener('deviceorientation', (e) => {
      if (!this.gyroEnabled) return;

      if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
        const current = {
          alpha: e.alpha,
          beta: e.beta,
          gamma: e.gamma
        };

        if (!this.gyroBaseline) {
          this.gyroBaseline = current;
        }

        this.gyroData = current;
      }
    });
  }

  public async requestGyroscopePermission(): Promise<boolean> {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          this.setupGyroscope();
          this.gyroEnabled = true;
          return true;
        }
      } catch (e) {
        console.error('[MobileControls] Gyroscope permission denied:', e);
      }
    }
    return false;
  }

  public setGyroEnabled(enabled: boolean): void {
    this.gyroEnabled = enabled;
    if (enabled && !this.gyroBaseline) {
      this.gyroBaseline = this.gyroData;
    }
  }

  public resetGyroBaseline(): void {
    this.gyroBaseline = this.gyroData;
  }

  private updateGyroscope(): void {
    if (!this.gyroEnabled || !this.gyroData || !this.gyroBaseline) return;

    const deltaGamma = (this.gyroData.gamma - this.gyroBaseline.gamma) * this.gyroSensitivity;
    const deltaBeta = (this.gyroData.beta - this.gyroBaseline.beta) * this.gyroSensitivity;

    this.lookDelta.x += deltaGamma * 0.5;
    this.lookDelta.y += deltaBeta * 0.5;
  }

  // ==================== HAPTICS ====================

  private triggerHaptic(intensity: 'light' | 'medium' | 'heavy'): void {
    if (!this.hapticEnabled || !navigator.vibrate) return;

    const patterns = {
      light: 10,
      medium: 25,
      heavy: 50
    };

    navigator.vibrate(patterns[intensity]);
  }

  public triggerHitHaptic(): void {
    this.triggerHaptic('heavy');
  }

  public triggerKillHaptic(): void {
    if (!this.hapticEnabled || !navigator.vibrate) return;
    navigator.vibrate([30, 30, 50]);
  }

  public triggerDamageHaptic(): void {
    if (!this.hapticEnabled || !navigator.vibrate) return;
    navigator.vibrate([20, 10, 20]);
  }

  // ==================== PUBLIC API ====================

  public show(): void {
    this.container.style.display = 'block';
    this.isVisible = true;
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  public isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * Call this every frame to update controls state.
   * Handles look delta decay and gyroscope updates.
   */
  public update(): void {
    // Update gyroscope
    if (this.gyroEnabled) {
      this.updateGyroscope();
    }

    // Only decay smoothed delta when not actively touching
    // lookDelta is consumed each frame by consumeLookDelta()
    if (!this.lookTouch && !this.fireButtonTouchId) {
      this.smoothedLookDelta.multiplyScalar(0.3);
    }

    // Reset weapon switch request after one frame
    if (this.weaponSwitchRequested !== 0) {
      // Will be consumed by game, reset next frame
      setTimeout(() => { this.weaponSwitchRequested = 0; }, 16);
    }
  }

  /**
   * Get and consume the accumulated look delta.
   * Call this once per frame to get the camera movement.
   */
  public consumeLookDelta(): THREE.Vector2 {
    const delta = this.lookDelta.clone();
    this.lookDelta.set(0, 0);
    return delta;
  }

  /**
   * Reset all inputs to default state
   */
  public reset(): void {
    this.movementInput.set(0, 0);
    this.lookDelta.set(0, 0);
    this.smoothedLookDelta.set(0, 0);
    this.firePressed = false;
    this.jumpPressed = false;
    this.reloadPressed = false;
    this.aimPressed = false;
    this.crouchPressed = false;
    this.sprintPressed = false;
    this.weaponSwitchRequested = 0;

    this.cleanupMoveTouch();
    this.cleanupLookTouch();
  }

  // ==================== SETTINGS ====================

  public setLookSensitivity(value: number): void {
    this.lookSensitivity = Math.max(0.05, Math.min(0.5, value));
  }

  public getLookSensitivity(): number {
    return this.lookSensitivity;
  }

  public setLookSmoothing(value: number): void {
    this.lookSmoothing = Math.max(0.1, Math.min(0.9, value));
  }

  public getLookSmoothing(): number {
    return this.lookSmoothing;
  }

  public setLookDeadzone(pixels: number): void {
    this.lookDeadzone = Math.max(0, Math.min(10, pixels));
  }

  public getLookDeadzone(): number {
    return this.lookDeadzone;
  }

  public setHapticEnabled(enabled: boolean): void {
    this.hapticEnabled = enabled;
  }

  public isHapticEnabled(): boolean {
    return this.hapticEnabled;
  }

  public isGyroEnabled(): boolean {
    return this.gyroEnabled;
  }

  /**
   * Show or hide the aim/scope button.
   * Should be called when weapon changes - only show for scoped weapons like sniper.
   */
  public setAimButtonVisible(visible: boolean): void {
    if (this.aimButton) {
      this.aimButton.style.display = visible ? 'flex' : 'none';
      // Reset aim state when hiding
      if (!visible) {
        this.aimPressed = false;
      }
    }
  }

  /**
   * Check if aim button is currently visible
   */
  public isAimButtonVisible(): boolean {
    return this.aimButton?.style.display !== 'none';
  }

  // ==================== CLEANUP ====================

  public dispose(): void {
    this.stopTouchCleanupWatchdog();
    this.container.remove();
  }

  // ==================== STATIC UTILITIES ====================

  /**
   * Detect if current device is mobile/tablet
   */
  public static isMobileDevice(): boolean {
    // Check user agent
    const userAgentCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Check for touch capability and small screen
    const touchCheck = navigator.maxTouchPoints > 0 && window.innerWidth < 1280;

    // Check for mobile-specific APIs
    const orientationCheck = 'orientation' in window;

    return userAgentCheck || (touchCheck && orientationCheck);
  }

  /**
   * Check if device is in landscape orientation (preferred for FPS)
   */
  public static isLandscape(): boolean {
    return window.innerWidth > window.innerHeight;
  }

  /**
   * Request fullscreen mode (best for mobile gaming)
   */
  public static async requestFullscreen(): Promise<boolean> {
    try {
      const elem = document.documentElement;

      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        // Safari
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        // IE/Edge
        await (elem as any).msRequestFullscreen();
      }

      // Lock orientation to landscape if supported
      if (screen.orientation && (screen.orientation as any).lock) {
        try {
          await (screen.orientation as any).lock('landscape');
        } catch (e) {
          console.log('[MobileControls] Could not lock orientation:', e);
        }
      }

      return true;
    } catch (e) {
      console.error('[MobileControls] Fullscreen request failed:', e);
      return false;
    }
  }

  /**
   * Exit fullscreen mode
   */
  public static async exitFullscreen(): Promise<void> {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (e) {
      console.error('[MobileControls] Exit fullscreen failed:', e);
    }
  }

  /**
   * Check if currently in fullscreen
   */
  public static isFullscreen(): boolean {
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).msFullscreenElement
    );
  }

  /**
   * Show orientation warning if in portrait mode
   */
  public static showOrientationWarning(): void {
    if (MobileControls.isLandscape()) return;

    // Check if warning already exists
    if (document.getElementById('orientation-warning')) return;

    const warning = document.createElement('div');
    warning.id = 'orientation-warning';
    warning.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      color: white;
      font-family: 'Rajdhani', sans-serif;
      text-align: center;
      padding: 20px;
    `;

    warning.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 20px;">📱↩️</div>
      <h2 style="font-size: 24px; margin-bottom: 10px; color: #00f2ff;">Rotate Your Device</h2>
      <p style="font-size: 16px; color: rgba(255,255,255,0.7);">
        BITBLAST plays best in landscape mode.<br>
        Please rotate your device to continue.
      </p>
    `;

    document.body.appendChild(warning);

    // Remove warning when landscape is detected
    const checkOrientation = () => {
      if (MobileControls.isLandscape()) {
        warning.remove();
        window.removeEventListener('resize', checkOrientation);
        window.removeEventListener('orientationchange', checkOrientation);
      }
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
  }

  /**
   * Create a "Play in Fullscreen" button for mobile lobby
   */
  public static createFullscreenButton(container: HTMLElement, onTap?: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'mobile-fullscreen-btn';
    btn.innerHTML = '⛶ Fullscreen';
    btn.style.cssText = `
      background: linear-gradient(135deg, rgba(0, 242, 255, 0.2) 0%, rgba(0, 180, 255, 0.3) 100%);
      border: 2px solid rgba(0, 242, 255, 0.6);
      color: white;
      font-family: 'Rajdhani', 'Teko', sans-serif;
      font-size: 16px;
      font-weight: 600;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      margin: 10px 0;
      touch-action: manipulation;
      transition: all 0.2s ease;
    `;

    btn.addEventListener('touchstart', async (e) => {
      e.preventDefault();
      await MobileControls.requestFullscreen();
      if (onTap) onTap();
    }, { passive: false });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await MobileControls.requestFullscreen();
      if (onTap) onTap();
    });

    container.appendChild(btn);
    return btn;
  }
}

