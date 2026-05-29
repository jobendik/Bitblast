// Weapon Types

export enum WeaponType {
  AK47 = 'AK47',
  AWP = 'AWP',
  LMG = 'LMG',
  M4 = 'M4',
  Pistol = 'Pistol',
  Scar = 'Scar',
  Shotgun = 'Shotgun',
  Sniper = 'Sniper',
  Tec9 = 'Tec9',
}

export interface RecoilConfig {
  pitchAmount: number;
  pitchRandom: number;
  yawAmount: number;
  yawRandom: number;
  recoveryRate: number;
  kickZ: number;
  kickRotX: number;
}

export interface SpreadConfig {
  base: number;
  max: number;
  increasePerShot: number;
  recoveryRate: number;
}

export interface MuzzleConfig {
  lightColor: number;
  lightRange: number;
  flashScale: { min: number; max: number };
  flashDuration: number;
  lightIntensity: number;
  smokeParticles: number;
  smokeSpeed: number;
  position: { x: number; y: number; z: number };
}

export interface SprayPatternConfig {
  enabled: boolean;
  resetTime: number;
  scale: number;
  vertical: number[];
  horizontal: number[];
}

export interface ScreenEffectsConfig {
  maxFovPunch: number;
  fovPunch: number;
  shakeIntensity: number;
  maxChroma: number;
  chromaIntensity: number;
  shakeDecay: number;
  fovPunchRecovery: number;
  chromaDecay: number;
}

export interface AnimationConfig {
  swayAmount: number;
  swayRecovery: number;
  sprintLerpSpeed: number;
  reloadLerpSpeed: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  bobInfluence: number;
  sprintOffsetX: number;
  sprintOffsetY: number;
  reloadDipY: number;
  reloadRotX: number;
  sprintRotZ: number;
}

export interface FalloffConfig {
  startDistance: number;
  endDistance: number;
  minDamage: number;
}

export interface WeaponAudioConfig {
  fire: string;
  reload: string;
  tail?: string;
  cock?: string;
  load?: string;
  zoom?: string;
}

export interface SingleWeaponConfig {
  name: string;
  damage: number;
  /** Headshot damage multiplier (applied to the falloff-adjusted body damage). */
  headshotMultiplier: number;
  fireRate: number;
  magSize: number;
  reserveAmmo: number;
  reloadTime: number;
  automatic: boolean;
  pelletCount?: number;
  falloff?: FalloffConfig;
  audio: WeaponAudioConfig;
  recoil: RecoilConfig;
  spread: SpreadConfig;
  muzzle: MuzzleConfig;
  sprayPattern: SprayPatternConfig;
  screen: ScreenEffectsConfig;
  animation: AnimationConfig;
}

export type WeaponConfig = {
  [key in WeaponType]: SingleWeaponConfig;
};
