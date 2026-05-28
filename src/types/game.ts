// Game Types

import { Vector3 } from 'three';

export interface GameState {
  running: boolean;
  paused: boolean;
  wave: number;
  score: number;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  timeStarted: number;
  waveInProgress: boolean;
  betweenWaves: boolean;
  inStartScreen: boolean;
}

export interface DamageInfo {
  amount: number;
  type: DamageType;
  sourcePosition?: Vector3;
  knockbackForce?: number;
  hitLocation?: 'head' | 'body';
  instigator?: any;
}

export enum DamageType {
  Bullet = 'bullet',
  Explosion = 'explosion',
  Melee = 'melee',
  Fall = 'fall',
  Zone = 'zone',
}

export interface Damageable {
  takeDamage(info: DamageInfo | number): void;
  isDead(): boolean;
}

export interface MatchState {
  players: Record<string, PlayerState>;
  teams: Record<string, string>;
  startTime: number;
  endTime?: number;
}

export interface PlayerState {
  kills: number;
  deaths: number;
  ping: number;
  username: string;
}

export interface GameStats {
  kills: number;
  score: number;
  timePlayed: number;
  won: boolean;
}

export interface Loadout {
  currency: {
    gameTokens: number;
    plasmaCredits: number;
  };
  inventory: Array<{
    itemId: string;
    type: string;
    quantity: number;
  }>;
  equipped: {
    primary: string;
    secondary: string;
  };
}
