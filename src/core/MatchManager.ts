// Match Manager
// Coordinates the flow from lobby matchmaking to game initialization
// Handles spawning the right mix of players, bots, and remote players

import { LobbyManager } from '../lobby/LobbyManager';
import { NetworkManager } from '../network/NetworkManager';
import { LobbyEventType, MatchFoundData } from '../lobby/types';
import { MatchConfig, MatchParticipant, BotConfig, ICompetitor } from '../types/competitor';
import World from './World';

/**
 * Match state during the game
 */
export interface ActiveMatch {
  id: string;
  modeId: string;
  participants: MatchParticipant[];
  competitors: Map<string, ICompetitor>;
  localPlayerId: string;
  isNetworked: boolean;
  startTime: number;
}

/**
 * Match Manager - Bridges lobby matchmaking with game world initialization
 */
export class MatchManager {
  private world: typeof World;
  private lobbyManager: LobbyManager | null = null;
  private networkManager: NetworkManager | null = null;

  private currentMatch: ActiveMatch | null = null;
  private pendingMatchConfig: MatchConfig | null = null;

  // Callbacks
  private onMatchReadyCallback?: (config: MatchConfig) => void;
  private onMatchStartCallback?: (match: ActiveMatch) => void;
  private onMatchEndCallback?: (match: ActiveMatch, winner: string | null) => void;

  constructor(world: typeof World) {
    this.world = world;
  }

  /**
   * Initialize with lobby and network managers
   */
  public init(lobbyManager: LobbyManager, networkManager?: NetworkManager): void {
    this.lobbyManager = lobbyManager;
    this.networkManager = networkManager || null;

    this.setupLobbyListeners();
  }

  /**
   * Setup lobby event listeners
   */
  private setupLobbyListeners(): void {
    if (!this.lobbyManager) return;

    // Match found - waiting for accept
    this.lobbyManager.on(LobbyEventType.MATCH_FOUND, (data) => {
      const matchData = data as MatchFoundData;

      // Convert to MatchConfig format
      this.pendingMatchConfig = this.convertMatchData(matchData);

      if (this.onMatchReadyCallback) {
        this.onMatchReadyCallback(this.pendingMatchConfig);
      }
    });

    // Match starting - all players accepted
    this.lobbyManager.on(LobbyEventType.MATCH_STARTING, (data) => {
      if (this.pendingMatchConfig) {
        this.startMatch(this.pendingMatchConfig);
      }
    });

    // Match cancelled
    this.lobbyManager.on(LobbyEventType.MATCH_CANCELLED, () => {
      this.pendingMatchConfig = null;
    });
  }

  /**
   * Convert MatchFoundData to MatchConfig
   */
  private convertMatchData(data: MatchFoundData): MatchConfig {
    // Build participants from opponent IDs
    const participants: MatchParticipant[] = [];

    // Add local player
    const localId = this.lobbyManager?.getUserId() || 'local';
    participants.push({
      id: localId,
      type: 'human',
      username: 'Player',
    });

    // Add opponents (could be humans or bots)
    for (const odId of data.opponentIds) {
      const isBot = odId.startsWith('bot_');
      participants.push({
        id: odId,
        type: isBot ? 'bot' : 'remote',
        username: isBot ? this.generateBotName(odId) : `Player_${odId.slice(-4)}`,
      });
    }

    return {
      matchId: data.id,
      modeId: data.modeId,
      participants,
      settings: this.getDefaultSettings(data.modeId),
      serverUrl: data.gameUrl,
    };
  }

  /**
   * Get default settings for a game mode
   */
  private getDefaultSettings(modeId: string): MatchConfig['settings'] {
    const defaults: Record<string, MatchConfig['settings']> = {
      ffa: { maxScore: 30, timeLimit: 600, respawnTime: 3, friendlyFire: false },
      tdm: { maxScore: 75, timeLimit: 900, respawnTime: 5, friendlyFire: false },
      survival: { maxScore: 0, timeLimit: 0, respawnTime: 10, friendlyFire: false },
    };
    return defaults[modeId] || defaults.ffa;
  }

  /**
   * Generate a display name for a bot - uses realistic gamer names
   */
  private generateBotName(botId: string): string {
    const gamerNames = [
      'xShadowKiller', 'NightHawk99', 'VelocityX', 'StormBringer', 'PhantomAce',
      'CyberWolf', 'BlazeMaster', 'IronReaper', 'QuantumFury', 'SteelVenom',
      'DarkSpectre', 'ThunderBolt', 'RapidFire', 'SilentStrike', 'NovaFlash',
      'ZeroGravity', 'ToxicViper', 'GhostRider', 'AlphaStorm', 'NeonBlade',
      'SkyFall', 'OmegaWolf', 'CrimsonFang', 'FrostBite', 'EliteSniper',
      'WarMachine', 'ShadowFox', 'BulletProof', 'DeathMatch', 'HyperX',
      'TurboKill', 'NightOwl', 'FireStorm', 'IceBreaker', 'VenomStrike',
      'DarkKnight', 'StealthMode', 'RogueAgent', 'SpeedDemon', 'AcidRain'
    ];
    const hash = botId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return gamerNames[hash % gamerNames.length];
  }

  /**
   * Start a match with the given configuration
   */
  public async startMatch(config: MatchConfig): Promise<void> {
    const localId = this.lobbyManager?.getUserId() || 'local';

    // Create active match state
    this.currentMatch = {
      id: config.matchId,
      modeId: config.modeId,
      participants: config.participants,
      competitors: new Map(),
      localPlayerId: localId,
      isNetworked: config.participants.some(p => p.type === 'remote'),
      startTime: Date.now(),
    };

    // Connect to game server if networked match
    if (this.currentMatch.isNetworked && this.networkManager && config.serverUrl) {
      const token = `token-${localId}`;
      await this.networkManager.connect(config.serverUrl, token, config.matchId);

      // Setup Network Callbacks
      this.networkManager.onDamage((targetId, attackerId, damage) => {
        // If target is local player
        if (targetId === localId && (this.world as any).player) {
          const p = (this.world as any).player;
          const telegram = {
            message: 'HIT', // Using string literal to avoid import issues for now
            data: {
              damage: damage,
              direction: new THREE.Vector3(0, 0, 1), // Fallback direction
              isHeadshot: false
            },
            sender: { uuid: attackerId }
          };
          if (typeof p.handleMessage === 'function') {
            p.handleMessage(telegram);
          }
        }
      });

      this.networkManager.onKill((attackerId, victimId, weapon) => {
        // If victim is local player
        if (victimId === localId && (this.world as any).player) {
          const p = (this.world as any).player;
          if (p.health > 0) {
            p.health = 0;
            if (typeof p.initDeath === 'function') p.initDeath();
          }
        }

        // Show killfeed - use hudManager directly from world, not combat
        if ((this.world as any).hudManager) {
          const attackerName = this.getCompetitor(attackerId)?.displayName || attackerId.slice(0, 8);
          const victimName = this.getCompetitor(victimId)?.displayName || victimId.slice(0, 8);
          (this.world as any).hudManager.addKillFeed(attackerName, victimName, weapon, false);
        }
      });
    }

    // Configure world for this match
    this.configureWorld(config);

    // Notify callback
    if (this.onMatchStartCallback) {
      this.onMatchStartCallback(this.currentMatch);
    }
  }

  /**
   * Configure the world for the match
   */
  private configureWorld(config: MatchConfig): void {
    // Count bots needed
    const botParticipants = config.participants.filter(p => p.type === 'bot');

    // Set bot count in world
    this.world.botCount = botParticipants.length;

    // Store bot configs for custom names
    this.storeBotConfigs(botParticipants);

    // Note: Remote players are spawned dynamically via NetworkManager events
  }

  /**
   * Store bot configurations for use during spawning
   */
  private storeBotConfigs(bots: MatchParticipant[]): void {
    // Store in world for access during _initBots
    (this.world as any)._matchBotConfigs = bots.map(b => ({
      id: b.id,
      displayName: b.username,
      team: b.team,
      difficulty: 'medium' as const,
    }));
  }

  /**
   * Get bot config by index (called from World._initBots)
   */
  public getBotConfig(index: number): BotConfig | null {
    const configs = (this.world as any)._matchBotConfigs as BotConfig[] | undefined;
    return configs?.[index] || null;
  }

  /**
   * Register a competitor (called when Player, Bot, or RemotePlayer is created)
   */
  public registerCompetitor(competitor: ICompetitor): void {
    if (!this.currentMatch) return;

    this.currentMatch.competitors.set(competitor.competitorId, competitor);
  }

  /**
   * Get competitor by ID
   */
  public getCompetitor(id: string): ICompetitor | undefined {
    return this.currentMatch?.competitors.get(id);
  }

  /**
   * Get all competitors
   */
  public getAllCompetitors(): ICompetitor[] {
    if (!this.currentMatch) return [];
    return Array.from(this.currentMatch.competitors.values());
  }

  /**
   * Get current match
   */
  public getCurrentMatch(): ActiveMatch | null {
    return this.currentMatch;
  }

  /**
   * End the current match
   */
  public endMatch(winner: string | null): void {
    if (!this.currentMatch) return;

    if (this.onMatchEndCallback) {
      this.onMatchEndCallback(this.currentMatch, winner);
    }

    // Disconnect from game server
    if (this.networkManager) {
      this.networkManager.disconnect();
    }

    this.currentMatch = null;
    this.pendingMatchConfig = null;
  }

  /**
   * Start a local match (no networking, for testing/single player)
   */
  public startLocalMatch(modeId: string, botCount: number): void {
    const participants: MatchParticipant[] = [
      { id: 'local', type: 'human', username: 'Player' },
    ];

    // Add bots
    for (let i = 0; i < botCount; i++) {
      participants.push({
        id: `bot_${i}`,
        type: 'bot',
        username: this.generateBotName(`bot_${i}`),
      });
    }

    const config: MatchConfig = {
      matchId: `local_${Date.now()}`,
      modeId,
      participants,
      settings: this.getDefaultSettings(modeId),
    };

    this.startMatch(config);
  }

  // ========== Callbacks ==========

  public onMatchReady(callback: (config: MatchConfig) => void): void {
    this.onMatchReadyCallback = callback;
  }

  public onMatchStart(callback: (match: ActiveMatch) => void): void {
    this.onMatchStartCallback = callback;
  }

  public onMatchEnd(callback: (match: ActiveMatch, winner: string | null) => void): void {
    this.onMatchEndCallback = callback;
  }
}

// Singleton instance
let matchManagerInstance: MatchManager | null = null;

export function getMatchManager(world?: typeof World): MatchManager {
  if (!matchManagerInstance && world) {
    matchManagerInstance = new MatchManager(world);
  }
  return matchManagerInstance!;
}
