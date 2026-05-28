// Competitor Interface
// Unified interface for all player types (human players, bots, remote players)
// This allows the game to treat all competitors uniformly during gameplay

import { Vector3 } from 'yuka';

/**
 * Competitor type discriminator
 */
export type CompetitorType = 'human' | 'bot' | 'remote';

/**
 * Common competitor state for networking and game logic
 */
export interface CompetitorState {
  id: string;
  type: CompetitorType;
  health: number;
  maxHealth: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number };
  team?: string;
  isAlive: boolean;
  kills: number;
  deaths: number;
}

/**
 * ICompetitor - Unified interface for all game participants
 * 
 * Implemented by:
 * - Player (local human player)
 * - Bot (AI-controlled)
 * - RemotePlayer (networked human player)
 */
export interface ICompetitor {
  // ========== Identity ==========
  /** Unique identifier */
  readonly competitorId: string;
  
  /** Type of competitor */
  readonly competitorType: CompetitorType;
  
  /** Display name */
  readonly displayName: string;
  
  /** Team identifier (optional, for team modes) */
  team?: string;

  // ========== State ==========
  /** Current health */
  health: number;
  
  /** Maximum health */
  readonly maxHealth: number;
  
  /** Whether the competitor is alive */
  isAlive(): boolean;
  
  /** Current world position */
  getPosition(): Vector3;
  
  /** Current forward direction */
  getForward(): Vector3;

  // ========== Combat ==========
  /**
   * Apply damage to this competitor
   * @param amount - Amount of damage
   * @param attacker - The competitor who dealt the damage
   * @param weaponType - Type of weapon used
   * @returns Actual damage dealt (may be modified by armor, etc.)
   */
  takeDamage(amount: number, attacker: ICompetitor | null, weaponType?: string): number;
  
  /**
   * Called when this competitor dies
   * @param killer - The competitor who killed this one (null for environmental)
   * @param weaponType - Type of weapon used
   */
  onDeath(killer: ICompetitor | null, weaponType?: string): void;
  
  /**
   * Respawn the competitor at a given position
   * @param position - Spawn position
   */
  respawn(position: Vector3): void;

  // ========== Statistics ==========
  /** Number of kills */
  kills: number;
  
  /** Number of deaths */
  deaths: number;

  // ========== Serialization ==========
  /**
   * Get serializable state for networking
   */
  getState(): CompetitorState;
}

/**
 * Match participant info sent from server during matchmaking
 */
export interface MatchParticipant {
  id: string;
  type: CompetitorType;
  username: string;
  team?: string;
}

/**
 * Match configuration received when match is found
 */
export interface MatchConfig {
  matchId: string;
  modeId: string;
  participants: MatchParticipant[];
  settings: {
    maxScore: number;
    timeLimit: number;
    respawnTime: number;
    friendlyFire: boolean;
  };
  serverUrl?: string; // For networked matches
}

/**
 * Bot configuration for AI backfill
 */
export interface BotConfig {
  id: string;
  displayName: string;
  team?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  skin?: string;
}

/**
 * Helper to check if a competitor is a bot
 */
export function isBot(competitor: ICompetitor): boolean {
  return competitor.competitorType === 'bot';
}

/**
 * Helper to check if a competitor is a human (local or remote)
 */
export function isHuman(competitor: ICompetitor): boolean {
  return competitor.competitorType === 'human' || competitor.competitorType === 'remote';
}

/**
 * Helper to check if a competitor is on the same team
 */
export function isSameTeam(a: ICompetitor, b: ICompetitor): boolean {
  if (!a.team || !b.team) return false;
  return a.team === b.team;
}
