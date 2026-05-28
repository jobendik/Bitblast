// Network Types

import * as THREE from 'three';

/**
 * Player position and state data sent over network
 */
export interface NetworkPlayerState {
  userId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number };
  velocity?: { x: number; y: number; z: number };
  isSprinting: boolean;
  isGrounded: boolean;
  timestamp: number;
}

/**
 * Weapon shoot event data
 */
export interface NetworkShootData {
  userId: string;
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  weaponType: string;
}

/**
 * Damage event data
 */
export interface NetworkDamageData {
  targetId: string;
  attackerId: string;
  damage: number;
  hitLocation: { x: number; y: number; z: number };
}

/**
 * Kill event data
 */
export interface NetworkKillData {
  victimId: string;
  attackerId: string;
  weaponType: string;
}

/**
 * Player score data from server
 */
export interface NetworkPlayerScore {
  kills: number;
  deaths: number;
  ping: number;
  username: string;
}

/**
 * Match state from server
 */
export interface NetworkMatchState {
  players: Record<string, NetworkPlayerScore>;
  teams: Record<string, string>;
  startTime: number;
  endTime?: number;
}

/**
 * Connection configuration
 */
export interface NetworkConfig {
  serverUrl: string;
  updateRate: number; // milliseconds between updates
  interpolationDelay: number; // milliseconds
  maxPredictionTime: number; // milliseconds
}

/**
 * Default network configuration
 */
export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  serverUrl: '/',
  updateRate: 50, // 20 updates per second
  interpolationDelay: 100, // 100ms interpolation delay
  maxPredictionTime: 200, // 200ms max prediction
};

/**
 * Network event types
 */
export enum NetworkEventType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
  PLAYER_UPDATE = 'player_update',
  PLAYER_SHOOT = 'player_shoot',
  PLAYER_DAMAGED = 'player_damaged',
  PLAYER_KILLED = 'player_killed',
  PLAYER_RESPAWNED = 'player_respawned',
  MATCH_STATE = 'match_state',
  SCORE_UPDATE = 'score_update',
  MATCH_ENDED = 'match_ended',
  FLAG_UPDATE = 'flag_update',
}

/**
 * Remote player data for rendering
 */
export interface RemotePlayerData {
  id: string;
  username: string;
  team: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  health: number;
  isDead: boolean;
  currentWeapon: string;
}
