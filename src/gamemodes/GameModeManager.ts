// Game Mode Manager

import { IGameMode, GameModeType, GameModeConfig } from './IGameMode';
import { FreeForAllMode } from './FreeForAllMode';
import { TeamDeathmatchMode } from './TeamDeathmatchMode';
import { WaveSurvivalMode } from './WaveSurvivalMode';
import { HUDManager } from '../ui/HUDManager';

// Forward declare World type
interface World {
  player: {
    uuid: string;
    health: number;
    maxHealth: number;
    respawn: () => void;
  };
  competitors: Array<{
    uuid: string;
    name: string;
    health: number;
    active: boolean;
  }>;
  remoteBots: Map<string, {
    uuid: string;
    name: string;
    username: string;
    health: number;
    isDead: boolean;
  }>;
  isMultiplayerMode: boolean;
  spawningManager: {
    respawnCompetitor: (entity: unknown) => void;
  };
  assetManager: {
    audios: Map<string, unknown>;
  };
  botCount: number;
}

/**
 * Game Mode Manager
 * Manages switching between and updating game modes
 */
export class GameModeManager {
  private world: World;
  private hudManager: HUDManager;
  private modes: Map<GameModeType, IGameMode>;
  private currentMode: IGameMode | null = null;

  constructor(world: World, hudManager: HUDManager) {
    this.world = world;
    this.hudManager = hudManager;
    this.modes = new Map();

    // Initialize all game modes
    this.initializeModes();
  }

  private initializeModes(): void {
    this.modes.set(GameModeType.FREE_FOR_ALL, this.createMode(GameModeType.FREE_FOR_ALL));
    this.modes.set(GameModeType.TEAM_DEATHMATCH, this.createMode(GameModeType.TEAM_DEATHMATCH));
    this.modes.set(GameModeType.WAVE_SURVIVAL, this.createMode(GameModeType.WAVE_SURVIVAL));
  }

  private createMode(type: GameModeType, customConfig?: Partial<GameModeConfig>): IGameMode {
    switch (type) {
      case GameModeType.TEAM_DEATHMATCH:
        return new TeamDeathmatchMode(this.world, this.hudManager, customConfig);
      case GameModeType.WAVE_SURVIVAL:
        return new WaveSurvivalMode(this.world, this.hudManager, customConfig);
      case GameModeType.FREE_FOR_ALL:
      default:
        return new FreeForAllMode(this.world, this.hudManager, customConfig);
    }
  }

  /**
   * Set and start a game mode. Recreating the mode guarantees fresh per-match
   * state and lets callers apply per-match config overrides (score/time limits).
   */
  public setMode(type: GameModeType, customConfig?: Partial<GameModeConfig>): void {
    // Cleanup current mode if exists
    if (this.currentMode) {
      this.currentMode.cleanup();
    }

    const newMode = this.createMode(type, customConfig);
    this.modes.set(type, newMode);

    this.currentMode = newMode;
    this.currentMode.init();
    this.currentMode.start();
  }

  /**
   * Update the current game mode
   */
  public update(delta: number): void {
    if (this.currentMode) {
      this.currentMode.update(delta);
    }
  }

  /**
   * Get the current game mode
   */
  public getCurrentMode(): IGameMode | null {
    return this.currentMode;
  }

  /**
   * Get current mode type
   */
  public getCurrentModeType(): GameModeType | null {
    return this.currentMode?.getType() || null;
  }

  /**
   * Get available game modes
   */
  public getAvailableModes(): GameModeType[] {
    return Array.from(this.modes.keys());
  }

  /**
   * Get mode by type
   */
  public getMode(type: GameModeType): IGameMode | undefined {
    return this.modes.get(type);
  }

  /**
   * Register a custom game mode
   */
  public registerMode(type: GameModeType, mode: IGameMode): void {
    this.modes.set(type, mode);
  }

  /**
   * Handle player kill event - forwards to current mode
   */
  public onPlayerKill(
    killerId: string,
    victimId: string,
    weapon: string,
    headshot: boolean
  ): void {
    if (this.currentMode) {
      this.currentMode.onPlayerKill(killerId, victimId, weapon, headshot);
    }
  }

  /**
   * Handle player death event - forwards to current mode
   */
  public onPlayerDeath(playerId: string): void {
    if (this.currentMode) {
      this.currentMode.onPlayerDeath(playerId);
    }
  }

  /**
   * Pause current game
   */
  public pause(): void {
    if (this.currentMode) {
      (this.currentMode as unknown as { pause: () => void }).pause?.();
    }
  }

  /**
   * Resume current game
   */
  public resume(): void {
    if (this.currentMode) {
      (this.currentMode as unknown as { resume: () => void }).resume?.();
    }
  }

  /**
   * Restart current game mode
   */
  public restart(): void {
    if (this.currentMode) {
      this.currentMode.cleanup();
      this.currentMode.init();
      this.currentMode.start();
    }
  }

  /**
   * Check if game is over
   */
  public isGameOver(): boolean {
    return this.currentMode?.isGameOver() ?? true;
  }

  /**
   * Clean up all modes
   */
  public dispose(): void {
    if (this.currentMode) {
      this.currentMode.cleanup();
      this.currentMode = null;
    }
    this.modes.clear();
  }
}
