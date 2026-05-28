// Game Configuration

import { PlayerConfig, CameraConfig } from '../types';

export const PLAYER_CONFIG: PlayerConfig = {
  maxHealth: 100,
  maxArmor: 100,
  maxStamina: 100,
  height: 1.7,
  walkSpeed: 8,
  sprintSpeed: 14, // Good sprint speed - 1.75x walk speed
  jumpForce: 12, // Moderate jump height
  gravity: 30, // Balanced gravity
  groundAccel: 80, // Responsive acceleration
  airAccel: 20,
  groundDecel: 40,
  airDecel: 8,
  jumpBuffer: 0.1,
  coyoteTime: 0.15,
  jumpCutMultiplier: 0.5,
  stepHeight: 0.5,
  staminaDrain: 18,
  staminaRegen: 30,
  slideSpeed: 16,
  slideDuration: 1.0,
  slideFriction: 2.5,
  slideCooldown: 0.8,
};

export const CAMERA_CONFIG: CameraConfig = {
  baseFOV: 75,
  sprintFOV: 85,
  jumpFOV: 78,
  landFOV: 70,
  fovLerpSpeed: 10,
  bobFrequency: 12,
  bobAmplitudeX: 0.015,
  bobAmplitudeY: 0.035,
  breathFrequency: 2,
  breathAmplitude: 0.005,
  jumpStretch: 0.2,
  mouseSensitivity: 0.002,
};

export const ARENA_CONFIG = {
  size: 60,
  wallHeight: 8,
};

export const LOBBY_URL = '/social/';
