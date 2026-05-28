// Player Types

export interface PlayerConfig {
  maxHealth: number;
  maxArmor: number;
  maxStamina: number;
  height: number;
  walkSpeed: number;
  sprintSpeed: number;
  jumpForce: number;
  gravity: number;
  groundAccel: number;
  airAccel: number;
  groundDecel: number;
  airDecel: number;
  jumpBuffer: number;
  coyoteTime: number;
  jumpCutMultiplier: number;
  stepHeight: number;
  staminaDrain: number;
  staminaRegen: number;
  slideSpeed: number;
  slideDuration: number;
  slideFriction: number;
  slideCooldown: number;
}

export interface CameraConfig {
  baseFOV: number;
  sprintFOV: number;
  jumpFOV: number;
  landFOV: number;
  fovLerpSpeed: number;
  bobFrequency: number;
  bobAmplitudeX: number;
  bobAmplitudeY: number;
  breathFrequency: number;
  breathAmplitude: number;
  jumpStretch: number;
  mouseSensitivity: number;
}
