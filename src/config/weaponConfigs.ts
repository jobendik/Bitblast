// Weapon Configurations

import { WeaponType, WeaponConfig, SprayPatternConfig, ScreenEffectsConfig, AnimationConfig } from '../types/weapons';

const BASE_AUDIO_PATH = 'assets/audio/sfx/weapons/';

const DEFAULT_SPRAY_PATTERN: SprayPatternConfig = {
  enabled: true,
  resetTime: 300,
  scale: 0.002,
  vertical: [1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 7, 6, 5],
  horizontal: [0, 0, 1, -1, 2, -2, 3, -3, 2, -2, 1, -1],
};

const DEFAULT_SCREEN: ScreenEffectsConfig = {
  maxFovPunch: 5,
  fovPunch: 0.5,
  shakeIntensity: 0.1,
  maxChroma: 0.02,
  chromaIntensity: 0.005,
  shakeDecay: 0.9,
  fovPunchRecovery: 10,
  chromaDecay: 0.8,
};

const DEFAULT_ANIMATION: AnimationConfig = {
  swayAmount: 0.05,
  swayRecovery: 5,
  sprintLerpSpeed: 10,
  reloadLerpSpeed: 10,
  baseX: 0.25,
  baseY: -0.2,
  baseZ: -0.5,
  bobInfluence: 1,
  sprintOffsetX: -0.1,
  sprintOffsetY: -0.1,
  reloadDipY: 0.15,
  reloadRotX: 0.4,
  sprintRotZ: 0.5,
};

export const WEAPON_CONFIG: WeaponConfig = {
  [WeaponType.AK47]: {
    name: 'AK-47',
    damage: 14, // 7-8 shot kill (High TTK)
    headshotMultiplier: 2.5, // ~3 headshots to kill
    fireRate: 10, // 600 RPM
    magSize: 30,
    reserveAmmo: 90,
    reloadTime: 2.0,
    automatic: true,
    falloff: {
      startDistance: 30,
      endDistance: 60,
      minDamage: 10 // Reduced damage at long range (falloff, not buff)
    },
    audio: {
      fire: BASE_AUDIO_PATH + 'AK47-Fire.mp3',
      reload: BASE_AUDIO_PATH + 'LMG-Reload.mp3',
    },
    recoil: {
      pitchAmount: 0.05,
      pitchRandom: 0.02,
      yawAmount: 0.02,
      yawRandom: 0.03,
      recoveryRate: 5,
      kickZ: 0.1,
      kickRotX: 0.1,
    },
    spread: {
      base: 0.0015,
      max: 0.008,
      increasePerShot: 0.0008,
      recoveryRate: 8,
    },
    muzzle: {
      lightColor: 0xffaa00,
      lightRange: 5,
      flashScale: { min: 0.7, max: 1.2 },
      flashDuration: 0.06,
      lightIntensity: 2.5,
      smokeParticles: 4,
      smokeSpeed: 0.6,
      position: { x: 0, y: 0.04, z: -0.8 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: DEFAULT_SCREEN,
    animation: DEFAULT_ANIMATION,
  },

  [WeaponType.AWP]: {
    name: 'AWP',
    damage: 105, // One shot kill to body (High Power) -- KEPT
    headshotMultiplier: 1.5, // Already lethal to body; headshot guarantees it
    fireRate: 0.65, // Reduced from 0.8 (40 RPM)
    magSize: 10,
    reserveAmmo: 30,
    reloadTime: 2.8,
    automatic: false,
    falloff: {
      startDistance: 150, // Massive range
      endDistance: 300,
      minDamage: 100 // Always one shot kill basically
    },
    audio: {
      fire: BASE_AUDIO_PATH + 'AWP-Fire.mp3',
      reload: BASE_AUDIO_PATH + 'Sniper-Reload.mp3',
      zoom: BASE_AUDIO_PATH + 'Sniper-Zoom.mp3',
    },
    recoil: {
      pitchAmount: 0.2,
      pitchRandom: 0.05,
      yawAmount: 0.05,
      yawRandom: 0.05,
      recoveryRate: 2,
      kickZ: 0.3,
      kickRotX: 0.3,
    },
    spread: {
      base: 0.0005,
      max: 0.006,
      increasePerShot: 0.005,
      recoveryRate: 3,
    },
    muzzle: {
      lightColor: 0xffcc00,
      lightRange: 10,
      flashScale: { min: 1.5, max: 2.5 },
      flashDuration: 0.08,
      lightIntensity: 4,
      smokeParticles: 6,
      smokeSpeed: 0.8,
      position: { x: 0, y: 0.05, z: -1.3 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: { ...DEFAULT_SCREEN, fovPunch: 2, shakeIntensity: 0.3 },
    animation: DEFAULT_ANIMATION,
  },

  [WeaponType.LMG]: {
    name: 'LMG',
    damage: 13, // 8 shot kill
    headshotMultiplier: 2.2,
    fireRate: 11.6, // ~700 RPM
    magSize: 100,
    reserveAmmo: 200,
    reloadTime: 3.5,
    automatic: true,
    audio: {
      fire: BASE_AUDIO_PATH + 'LMG-Fire.mp3',
      reload: BASE_AUDIO_PATH + 'LMG-Reload.mp3',
    },
    recoil: {
      pitchAmount: 0.04,
      pitchRandom: 0.03,
      yawAmount: 0.03,
      yawRandom: 0.04,
      recoveryRate: 4,
      kickZ: 0.15,
      kickRotX: 0.15,
    },
    spread: {
      base: 0.0025,
      max: 0.012,
      increasePerShot: 0.0004,
      recoveryRate: 6,
    },
    muzzle: {
      lightColor: 0xffaa00,
      lightRange: 6,
      flashScale: { min: 0.8, max: 1.4 },
      flashDuration: 0.07,
      lightIntensity: 2.8,
      smokeParticles: 5,
      smokeSpeed: 0.7,
      position: { x: 0, y: 0, z: -0.95 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: DEFAULT_SCREEN,
    animation: DEFAULT_ANIMATION,
  },

  [WeaponType.M4]: {
    name: 'M4',
    damage: 12, // 8-9 shot kill
    headshotMultiplier: 2.5,
    fireRate: 12.5, // 750 RPM
    magSize: 30,
    reserveAmmo: 90,
    reloadTime: 1.8,
    automatic: true,
    audio: {
      fire: BASE_AUDIO_PATH + 'M4-Fire.mp3',
      reload: BASE_AUDIO_PATH + 'LMG-Reload.mp3',
    },
    recoil: {
      pitchAmount: 0.04,
      pitchRandom: 0.01,
      yawAmount: 0.01,
      yawRandom: 0.02,
      recoveryRate: 6,
      kickZ: 0.08,
      kickRotX: 0.08,
    },
    spread: {
      base: 0.0012,
      max: 0.007,
      increasePerShot: 0.0007,
      recoveryRate: 9,
    },
    muzzle: {
      lightColor: 0xffffaa,
      lightRange: 4.5,
      flashScale: { min: 0.6, max: 1.0 },
      flashDuration: 0.05,
      lightIntensity: 2.2,
      smokeParticles: 3,
      smokeSpeed: 0.5,
      position: { x: 0, y: 0.02, z: -0.6 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: DEFAULT_SCREEN,
    animation: DEFAULT_ANIMATION,
  },

  [WeaponType.Pistol]: {
    name: 'Pistol',
    damage: 11, // 9-10 shot kill
    headshotMultiplier: 2.5, // rewards precision on the weak sidearm
    fireRate: 8,
    magSize: 12,
    reserveAmmo: 48,
    reloadTime: 1.2,
    automatic: false,
    audio: {
      fire: BASE_AUDIO_PATH + 'Pistol-Fire.mp3',
      reload: BASE_AUDIO_PATH + 'Pistol-Reload.mp3',
    },
    recoil: {
      pitchAmount: 0.08,
      pitchRandom: 0.02,
      yawAmount: 0.01,
      yawRandom: 0.01,
      recoveryRate: 8,
      kickZ: 0.05,
      kickRotX: 0.05,
    },
    spread: {
      base: 0.001,
      max: 0.005,
      increasePerShot: 0.0015,
      recoveryRate: 10,
    },
    muzzle: {
      lightColor: 0xffffcc,
      lightRange: 3,
      flashScale: { min: 0.3, max: 0.6 },
      flashDuration: 0.04,
      lightIntensity: 1.5,
      smokeParticles: 2,
      smokeSpeed: 0.4,
      position: { x: 0, y: 0.05, z: -0.15 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: DEFAULT_SCREEN,
    animation: DEFAULT_ANIMATION,
  },

  [WeaponType.Scar]: {
    name: 'SCAR',
    damage: 16, // 6-7 shot kill
    headshotMultiplier: 2.5,
    fireRate: 7.5, // 450 RPM
    magSize: 20,
    reserveAmmo: 60,
    reloadTime: 2.4,
    automatic: true,
    audio: {
      fire: BASE_AUDIO_PATH + 'Scar-Fire-1.mp3',
      reload: BASE_AUDIO_PATH + 'Scar-Reload.mp3',
      tail: BASE_AUDIO_PATH + 'Scar-Tail-Fire.mp3',
    },
    recoil: {
      pitchAmount: 0.06,
      pitchRandom: 0.02,
      yawAmount: 0.02,
      yawRandom: 0.02,
      recoveryRate: 4,
      kickZ: 0.12,
      kickRotX: 0.12,
    },
    spread: {
      base: 0.0018,
      max: 0.009,
      increasePerShot: 0.001,
      recoveryRate: 8,
    },
    muzzle: {
      lightColor: 0xffbb00,
      lightRange: 5.5,
      flashScale: { min: 0.9, max: 1.5 },
      flashDuration: 0.065,
      lightIntensity: 2.7,
      smokeParticles: 4,
      smokeSpeed: 0.65,
      position: { x: 0, y: 0.08, z: -0.5 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: DEFAULT_SCREEN,
    animation: DEFAULT_ANIMATION,
  },

  [WeaponType.Shotgun]: {
    name: 'Shotgun',
    damage: 8, // 8x8 = 64 max damage (2 solid pumps to kill)
    headshotMultiplier: 1.5, // per-pellet; devastating point-blank
    fireRate: 1.5,
    magSize: 8,
    reserveAmmo: 32,
    reloadTime: 2.5,
    automatic: false,
    pelletCount: 8, // Fires 8 pellets in a spread pattern
    falloff: {
      startDistance: 8,
      endDistance: 25,
      minDamage: 3 // Sharp falloff
    },
    audio: {
      fire: BASE_AUDIO_PATH + 'Shotgun-Fire.mp3',
      reload: BASE_AUDIO_PATH + 'Shotgun-Load.mp3',
      cock: BASE_AUDIO_PATH + 'Shotgun-Cock.mp3',
    },
    recoil: {
      pitchAmount: 0.3,
      pitchRandom: 0.1,
      yawAmount: 0.1,
      yawRandom: 0.1,
      recoveryRate: 2,
      kickZ: 0.4,
      kickRotX: 0.4,
    },
    spread: {
      base: 0.035, // Wide spread for shotgun pattern
      max: 0.055,
      increasePerShot: 0.012,
      recoveryRate: 6,
    },
    muzzle: {
      lightColor: 0xffaa33,
      lightRange: 7,
      flashScale: { min: 1.2, max: 2.0 },
      flashDuration: 0.075,
      lightIntensity: 3.5,
      smokeParticles: 7,
      smokeSpeed: 0.9,
      position: { x: 0, y: 0.02, z: -1.0 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: { ...DEFAULT_SCREEN, fovPunch: 1.5, shakeIntensity: 0.2 },
    animation: DEFAULT_ANIMATION,
  },

  [WeaponType.Sniper]: {
    name: 'Sniper Rifle',
    damage: 85, // 2 shot body kill; headshot one-shots (170)
    headshotMultiplier: 2.0,
    fireRate: 1.0,
    magSize: 5,
    reserveAmmo: 20,
    reloadTime: 2.8,
    automatic: false,
    audio: {
      fire: BASE_AUDIO_PATH + 'Sniper-Fire.mp3',
      reload: BASE_AUDIO_PATH + 'Sniper-Reload.mp3',
      load: BASE_AUDIO_PATH + 'Sniper-Load.mp3',
      zoom: BASE_AUDIO_PATH + 'Sniper-Zoom.mp3',
    },
    recoil: {
      pitchAmount: 0.25,
      pitchRandom: 0.05,
      yawAmount: 0.05,
      yawRandom: 0.05,
      recoveryRate: 2,
      kickZ: 0.35,
      kickRotX: 0.35,
    },
    spread: {
      base: 0.0003,
      max: 0.005,
      increasePerShot: 0.004,
      recoveryRate: 3,
    },
    muzzle: {
      lightColor: 0xffffdd,
      lightRange: 8,
      flashScale: { min: 1.3, max: 2.2 },
      flashDuration: 0.08,
      lightIntensity: 3.8,
      smokeParticles: 5,
      smokeSpeed: 0.75,
      position: { x: 0, y: 0.05, z: -1.25 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: { ...DEFAULT_SCREEN, fovPunch: 2, shakeIntensity: 0.3 },
    animation: DEFAULT_ANIMATION,
  },

  [WeaponType.Tec9]: {
    name: 'Tec-9',
    damage: 10, // 10 shot kill
    headshotMultiplier: 2.0,
    fireRate: 14,
    magSize: 24,
    reserveAmmo: 72,
    reloadTime: 1.6,
    automatic: true,
    audio: {
      fire: BASE_AUDIO_PATH + 'Tec-9-Fire.mp3',
      reload: BASE_AUDIO_PATH + 'Tec-9-Reload.mp3',
      load: BASE_AUDIO_PATH + 'Tec-9-Load.mp3',
      tail: BASE_AUDIO_PATH + 'Tec-9-Tail-Fire.mp3',
    },
    recoil: {
      pitchAmount: 0.06,
      pitchRandom: 0.03,
      yawAmount: 0.04,
      yawRandom: 0.04,
      recoveryRate: 6,
      kickZ: 0.07,
      kickRotX: 0.07,
    },
    spread: {
      base: 0.003,
      max: 0.011,
      increasePerShot: 0.0006,
      recoveryRate: 9,
    },
    muzzle: {
      lightColor: 0xffdd88,
      lightRange: 4,
      flashScale: { min: 0.5, max: 0.9 },
      flashDuration: 0.045,
      lightIntensity: 2.0,
      smokeParticles: 3,
      smokeSpeed: 0.55,
      position: { x: 0, y: 0.05, z: -0.35 },
    },
    sprayPattern: DEFAULT_SPRAY_PATTERN,
    screen: DEFAULT_SCREEN,
    animation: DEFAULT_ANIMATION,
  },
};
