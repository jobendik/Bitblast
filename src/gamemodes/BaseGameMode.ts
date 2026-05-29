// Base Game Mode

import {
  IGameMode,
  GameModeType,
  GameModeConfig,
  GameModeState,
  PlayerScore,
  Team
} from './IGameMode';
import { HUDManager } from '../ui/HUDManager';

// Forward declare World type to avoid circular dependency
interface World {
  player: {
    uuid: string;
    name?: string;
    health: number;
    maxHealth: number;
    respawn: () => void;
  };
  competitors: Array<{
    uuid: string;
    name: string;
    health: number;
  }>;
  remoteBots: Map<string, {
    uuid: string;
    name: string;
    username: string;
    health: number;
    isDead: boolean;
  }>;
  isMultiplayerMode: boolean;
  networkManager?: {
    getRemotePlayers: () => Array<{ uuid: string; name?: string; health: number }>;
  };
  spawningManager: {
    respawnCompetitor: (entity: unknown) => void;
  };
  assetManager: {
    audios: Map<string, any>;
  };
}

/**
 * Base class for all game modes
 * Provides common functionality and structure
 */
export abstract class BaseGameMode implements IGameMode {
  protected world: World;
  protected hudManager: HUDManager;
  protected config: GameModeConfig;
  protected state: GameModeState;
  protected isActive: boolean = false;

  constructor(world: World, hudManager: HUDManager, config: GameModeConfig) {
    this.world = world;
    this.hudManager = hudManager;
    this.config = config;

    this.state = {
      isRunning: false,
      isPaused: false,
      timeRemaining: config.timeLimit || 0,
      redScore: 0,
      blueScore: 0,
      wave: 1,
      roundNumber: 1,
      scores: new Map(),
    };
  }

  public init(): void {
    this.resetState();
    this.setupHUD();
  }

  public start(): void {
    this.isActive = true;
    this.state.isRunning = true;
    this.hudManager.showMessage(`${this.getName()} Started!`, 3000);
  }

  public update(delta: number): void {
    if (!this.isActive || this.state.isPaused) {
      return;
    }

    // Only update timer if game is actually running (not during loading)
    if (!this.state.isRunning) {
      return;
    }

    // Update time if time-limited
    if (this.config.timeLimit && this.config.timeLimit > 0) {
      this.state.timeRemaining = Math.max(0, this.state.timeRemaining - delta);
      this.updateTimer();

      if (this.state.timeRemaining <= 0) {
        this.onTimeUp();
        return; // game over this frame; don't also trigger the score-limit end
      }
    }

    // Check score limit
    if (this.config.scoreLimit && this.config.scoreLimit > 0) {
      if (this.checkScoreLimit()) {
        this.onScoreLimitReached();
      }
    }
  }

  public cleanup(): void {
    this.isActive = false;
    this.state.isRunning = false;
    this.hideHUD();
  }

  public abstract getName(): string;
  public abstract getType(): GameModeType;

  public isGameOver(): boolean {
    return !this.state.isRunning;
  }

  public onPlayerKill(
    killerId: string,
    victimId: string,
    weapon: string,
    headshot: boolean
  ): void {
    // Suicide / environmental death: count the death, never award a kill.
    if (!killerId || killerId === victimId) {
      const selfScore = this.getOrCreateScore(victimId);
      selfScore.deaths++;
      selfScore.suicides = (selfScore.suicides ?? 0) + 1;
      selfScore.currentKillStreak = 0;
      selfScore.currentLifeDamage = 0;
      selfScore.livesLived++;
      this.state.scores.set(victimId, selfScore);
      if (this.config.respawnTime && this.config.respawnTime > 0) {
        setTimeout(() => this.respawnPlayer(victimId), this.config.respawnTime * 1000);
      }
      return;
    }

    const killerScore = this.getOrCreateScore(killerId);
    const victimScore = this.getOrCreateScore(victimId);

    // Update kills
    killerScore.kills++;
    killerScore.currentKillStreak++;
    if (killerScore.currentKillStreak > killerScore.longestKillStreak) {
      killerScore.longestKillStreak = killerScore.currentKillStreak;
    }

    // Update headshots
    if (headshot) {
      killerScore.headshots++;
    }

    // Update weapon stats (ensure Map is initialized)
    if (!killerScore.weaponStats) {
      killerScore.weaponStats = new Map();
    }
    if (!killerScore.weaponStats.has(weapon)) {
      killerScore.weaponStats.set(weapon, {
        kills: 0,
        shots: 0,
        hits: 0,
        damage: 0,
        headshots: 0,
      });
    }
    const weaponStat = killerScore.weaponStats.get(weapon)!;
    weaponStat.kills++;
    if (headshot) {
      weaponStat.headshots++;
    }

    // Update score (10 points per kill, +5 for headshot)
    killerScore.score += headshot ? 15 : 10;

    // Update deaths
    victimScore.deaths++;
    victimScore.currentKillStreak = 0;

    // Track life damage
    if (victimScore.currentLifeDamage > victimScore.highestDamageInOneLife) {
      victimScore.highestDamageInOneLife = victimScore.currentLifeDamage;
    }
    victimScore.currentLifeDamage = 0;
    victimScore.livesLived++;

    this.state.scores.set(killerId, killerScore);
    this.state.scores.set(victimId, victimScore);

    // Update HUD for local player kills
    if (killerId === this.world.player.uuid) {
      this.hudManager.incrementKills();
      if (headshot) {
        this.hudManager.incrementHeadshots();
      }
    }

    // Respawn victim after delay
    if (this.config.respawnTime && this.config.respawnTime > 0) {
      setTimeout(() => this.respawnPlayer(victimId), this.config.respawnTime * 1000);
    }
  }

  // Track shot fired
  public onShotFired(playerId: string, weapon: string): void {
    const score = this.getOrCreateScore(playerId);
    score.shotsFired++;

    if (!score.weaponStats) {
      score.weaponStats = new Map();
    }
    if (!score.weaponStats.has(weapon)) {
      score.weaponStats.set(weapon, {
        kills: 0,
        shots: 0,
        hits: 0,
        damage: 0,
        headshots: 0,
      });
    }
    const weaponStat = score.weaponStats.get(weapon)!;
    weaponStat.shots++;

    // Ensure we update the Map with the modified score
    this.state.scores.set(playerId, score);
  }

  // Track shot hit
  public onShotHit(
    attackerId: string,
    weapon: string,
    damage: number,
    _distance: number = 0,
    targetInfo: { isHeadshot: boolean; isKill: boolean; targetId?: string } = { isHeadshot: false, isKill: false }
  ): void {
    // Safety check just in case
    const safeTargetInfo = targetInfo || { isHeadshot: false, isKill: false };
    const score = this.getOrCreateScore(attackerId);
    score.shotsHit++;
    score.damageDealt += damage;
    score.currentLifeDamage += damage;

    if (score.currentLifeDamage > score.highestDamageInOneLife) {
      score.highestDamageInOneLife = score.currentLifeDamage;
    }

    if (safeTargetInfo.isHeadshot) {
      score.headshots++;
    }

    if (!score.weaponStats) {
      score.weaponStats = new Map();
    }
    if (!score.weaponStats.has(weapon)) {
      score.weaponStats.set(weapon, {
        kills: 0,
        shots: 0,
        hits: 0,
        damage: 0,
        headshots: 0,
      });
    }
    const weaponStat = score.weaponStats.get(weapon)!;
    weaponStat.hits++;
    weaponStat.damage += damage;
    if (safeTargetInfo.isHeadshot) {
      weaponStat.headshots++;
    }

    // Ensure we update the Map with the modified score
    this.state.scores.set(attackerId, score);
  }

  // Track damage taken
  public onDamageTaken(playerId: string, damage: number): void {
    const score = this.getOrCreateScore(playerId);
    score.damageTaken += damage;
    this.state.scores.set(playerId, score);
  }

  // Track health pack collection
  public onHealthPackCollected(playerId: string): void {
    const score = this.getOrCreateScore(playerId);
    score.healthPacksCollected++;
    this.state.scores.set(playerId, score);
  }

  // Track distance traveled
  public onDistanceTraveled(playerId: string, distance: number): void {
    const score = this.getOrCreateScore(playerId);
    score.distanceTraveled += distance;
    this.state.scores.set(playerId, score);
  }

  // Track time alive
  public onTimeAlive(playerId: string, delta: number): void {
    const score = this.getOrCreateScore(playerId);
    score.timeAlive += delta;
    this.state.scores.set(playerId, score);
  }

  // Register a remote player who joined the match
  public registerRemotePlayer(playerId: string, username: string): void {
    // Check if already registered
    if (this.state.scores.has(playerId)) {
      return;
    }

    // Create a new score for this remote player
    const score: PlayerScore = {
      id: playerId,
      name: username,
      team: Team.NONE,
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      headshots: 0,
      damageDealt: 0,
      damageTaken: 0,
      shotsFired: 0,
      shotsHit: 0,
      suicides: 0,
      currentKillStreak: 0,
      longestKillStreak: 0,
      healthPacksCollected: 0,
      distanceTraveled: 0,
      timeAlive: 0,
      livesLived: 0,
      highestDamageInOneLife: 0,
      currentLifeDamage: 0,
      weaponStats: new Map(),
    };

    this.state.scores.set(playerId, score);
  }

  /**
   * Sync local scores with server-provided data (multiplayer mode)
   * This ensures the leaderboard reflects the authoritative server state
   */
  public syncScoresFromServer(scoresData: Record<string, { kills: number; deaths: number; username?: string; isBot?: boolean; shotsFired?: number; shotsHit?: number; damageDealt?: number }>): void {
    // Get current local player's UUID for comparison
    const localPlayerId = this.world.player.uuid;

    // Remove entries that aren't in server data (fixes duplicate player issue)
    const serverIds = new Set(Object.keys(scoresData));
    for (const localId of this.state.scores.keys()) {
      if (!serverIds.has(localId)) {
        this.state.scores.delete(localId);
      }
    }

    for (const [playerId, serverScore] of Object.entries(scoresData)) {
      let score = this.state.scores.get(playerId);
      const isLocalPlayer = playerId === localPlayerId;

      if (!score) {
        // Create new score entry for unknown player/bot
        score = this.initializePlayerScore(playerId);
        score.name = serverScore.username || `Player_${playerId.slice(0, 4)}`;
      }

      // Update kills and deaths from server (authoritative)
      score.kills = serverScore.kills;
      score.deaths = serverScore.deaths;

      // Update additional stats for bots and remote players (server-tracked)
      // But preserve local player's stats - they are tracked accurately locally
      if (!isLocalPlayer) {
        if (serverScore.shotsFired !== undefined) {
          score.shotsFired = serverScore.shotsFired;
        }
        if (serverScore.shotsHit !== undefined) {
          score.shotsHit = serverScore.shotsHit;
        }
        if (serverScore.damageDealt !== undefined) {
          score.damageDealt = serverScore.damageDealt;
        }
      }

      // Update name if provided
      if (serverScore.username) {
        score.name = serverScore.username;
      }

      // Mark if this is the local player
      if (isLocalPlayer) {
        score.id = localPlayerId;
        // Update HUD counters for local player from server data
        this.hudManager.updateStats(score.kills, score.headshots);
      }

      this.state.scores.set(playerId, score);
    }
  }

  public onPlayerDeath(playerId: string): void {
    const score = this.state.scores.get(playerId);
    if (score) {
      score.deaths++;
      score.livesLived++;
      score.currentKillStreak = 0;
      score.currentLifeDamage = 0;
      this.state.scores.set(playerId, score);
    }

    // Schedule respawn if applicable
    if (this.config.respawnTime !== undefined) {
      setTimeout(() => {
        this.respawnPlayer(playerId);
      }, this.config.respawnTime * 1000);
    }
  }

  protected getOrCreateScore(playerId: string): PlayerScore {
    let score = this.state.scores.get(playerId);
    if (!score) {
      score = this.initializePlayerScore(playerId);
      this.state.scores.set(playerId, score);
    }
    return score;
  }

  protected initializePlayerScore(playerId: string): PlayerScore {
    const isPlayer = playerId === this.world.player.uuid;

    // Get name from actual entity - player name, bot name, or remote player name
    let name = 'Unknown';
    if (isPlayer) {
      name = this.world.player.name || 'Player';
    } else {
      // First check competitors (bots)
      const competitor = this.world.competitors.find(c => c.uuid === playerId);
      if (competitor) {
        name = competitor.name || 'Player';
      } else {
        // Check remote players from network manager
        const remotePlayers = this.world.networkManager?.getRemotePlayers() || [];
        const remotePlayer = remotePlayers.find(rp => rp.uuid === playerId);
        if (remotePlayer) {
          name = remotePlayer.name || 'Remote Player';
        }
      }
    }

    return {
      id: playerId,
      name: name,
      team: Team.NONE,
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      headshots: 0,
      damageDealt: 0,
      damageTaken: 0,
      shotsFired: 0,
      shotsHit: 0,
      suicides: 0,
      currentKillStreak: 0,
      longestKillStreak: 0,
      healthPacksCollected: 0,
      distanceTraveled: 0,
      timeAlive: 0,
      livesLived: 0,
      highestDamageInOneLife: 0,
      currentLifeDamage: 0,
      weaponStats: new Map(),
    };
  }

  // ========== Protected Methods ==========

  protected resetState(): void {
    this.state = {
      isRunning: false,
      isPaused: false,
      timeRemaining: this.config.timeLimit || 0,
      redScore: 0,
      blueScore: 0,
      wave: 1,
      roundNumber: 1,
      scores: new Map(),
    };

    // Initialize player scores
    this.initializePlayerScores();
  }

  protected initializePlayerScores(): void {
    // Track which IDs have been added to prevent duplicates
    const addedIds = new Set<string>();

    // Add local player first
    const localPlayerId = this.world.player.uuid;
    this.state.scores.set(localPlayerId, this.initializePlayerScore(localPlayerId));
    addedIds.add(localPlayerId);

    // Add competitors (bots/enemies) - used in single player mode
    // Skip any competitor that matches the local player (by reference OR by uuid)
    for (const competitor of this.world.competitors) {
      // Skip if this IS the local player (reference check) or already added (uuid check)
      if (competitor === this.world.player || addedIds.has(competitor.uuid)) {
        continue;
      }

      this.state.scores.set(competitor.uuid, this.initializePlayerScore(competitor.uuid));
      addedIds.add(competitor.uuid);
    }

    // Add remote bots (server-controlled bots) - used in multiplayer mode
    if (this.world.remoteBots) {
      for (const [botId, remoteBot] of this.world.remoteBots) {
        if (!addedIds.has(botId)) {
          const score = this.initializePlayerScore(botId);
          score.name = remoteBot.name || remoteBot.username || `Bot_${botId.slice(0, 4)}`;
          this.state.scores.set(botId, score);
          addedIds.add(botId);
        }
      }
    }
  }

  protected createEmptyScore(id: string, name: string, team: Team): PlayerScore {
    return {
      id,
      name,
      team,
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      headshots: 0,
      damageDealt: 0,
      damageTaken: 0,
      shotsFired: 0,
      shotsHit: 0,
      suicides: 0,
      currentKillStreak: 0,
      longestKillStreak: 0,
      healthPacksCollected: 0,
      distanceTraveled: 0,
      timeAlive: 0,
      livesLived: 0,
      highestDamageInOneLife: 0,
      currentLifeDamage: 0,
      weaponStats: new Map(),
    };
  }

  protected getPlayerName(playerId: string): string {
    const score = this.state.scores.get(playerId);
    if (score) {
      return score.name;
    }
    return playerId === this.world.player.uuid ? 'You' : `Player_${playerId.slice(0, 4)}`;
  }

  protected setupHUD(): void {
    // Override in subclasses for mode-specific HUD
  }

  protected hideHUD(): void {
    // Override in subclasses for mode-specific HUD cleanup
  }

  protected updateTimer(): void {
    // Format time as MM:SS
    const minutes = Math.floor(Math.max(0, this.state.timeRemaining) / 60);
    const seconds = Math.floor(Math.max(0, this.state.timeRemaining) % 60);
    const timerElement = document.getElementById('game-timer');
    if (timerElement) {
      timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  protected checkScoreLimit(): boolean {
    // Override in subclasses
    return false;
  }

  protected onTimeUp(): void {
    this.endGame('TIME UP');
  }

  protected onScoreLimitReached(): void {
    this.endGame('SCORE LIMIT REACHED');
  }

  protected endGame(_reason: string): void {
    // Idempotent: the timer and score-limit checks can both resolve on the same
    // frame, and network/local death paths can overlap. Only end once.
    if (!this.state.isRunning) {
      return;
    }
    this.state.isRunning = false;
    this.isActive = false;
    this.determineWinner(); // Called for side effects

    // Disconnect FPS controls to prevent shooting/weapon switching
    if ((this.world as any).fpsControls) {
      (this.world as any).fpsControls.disconnect();
    }

    // Hide entire HUD before showing end screen
    this.hudManager.hideHUD();

    // Show end screen with statistics
    import('../ui/GameEndScreen').then(({ GameEndScreen }) => {
      const endScreen = new GameEndScreen();
      const stats = this.compileStatistics();
      // Get Victory/Defeat audio
      const isVictory = stats.placement === 1;
      const audioKey = isVictory ? 'victory' : 'defeat';
      const audio = this.world.assetManager.audios.get(audioKey);

      endScreen.show(stats, audio);
    });
  }

  protected compileStatistics(): any {
    const playerScore = this.state.scores.get(this.world.player.uuid);

    if (!playerScore) {
      console.warn('No player score found! Returning defaults.');
      return this.getDefaultStatistics();
    }

    const totalTime = (this.config.timeLimit || 0) - this.state.timeRemaining;
    const accuracy = playerScore.shotsFired > 0
      ? (playerScore.shotsHit / playerScore.shotsFired) * 100
      : 0;
    const kdRatio = playerScore.deaths > 0
      ? playerScore.kills / playerScore.deaths
      : playerScore.kills;
    const kpm = totalTime > 0
      ? (playerScore.kills / totalTime) * 60
      : 0;
    const avgLife = playerScore.livesLived > 0
      ? playerScore.timeAlive / playerScore.livesLived
      : 0;

    // Determine placement
    const sortedScores = Array.from(this.state.scores.values())
      .sort((a, b) => b.kills - a.kills);
    const placement = sortedScores.findIndex(s => s.id === this.world.player.uuid) + 1;

    // Build all players array for end screen
    const allPlayers = sortedScores.map((score, index) => {
      const isMe = score.id === this.world.player.uuid;
      const playerAccuracy = score.shotsFired > 0
        ? (score.shotsHit / score.shotsFired) * 100
        : 0;
      return {
        id: score.id,
        name: score.name,
        team: score.team === Team.RED ? 'red' : score.team === Team.BLUE ? 'blue' : 'none',
        kills: score.kills || 0,
        deaths: score.deaths || 0,
        assists: score.assists || 0,
        headshots: score.headshots || 0,
        damageDealt: score.damageDealt || 0,
        accuracy: playerAccuracy,
        placement: index + 1,
        isMe: isMe,
      };
    });

    return {
      gameMode: this.getName(),
      duration: totalTime,
      winner: sortedScores[0]?.name || 'Unknown',
      placement: placement,

      // All players for scoreboard
      allPlayers: allPlayers,

      kills: playerScore.kills || 0,
      deaths: playerScore.deaths || 0,
      assists: playerScore.assists || 0,
      suicides: playerScore.suicides || 0,

      shotsFired: playerScore.shotsFired || 0,
      shotsHit: playerScore.shotsHit || 0,
      headshotKills: playerScore.headshots || 0,
      accuracy: accuracy,

      damageDealt: playerScore.damageDealt || 0,
      damageTaken: playerScore.damageTaken || 0,
      highestDamageInOneLife: playerScore.highestDamageInOneLife || 0,

      killStreak: playerScore.currentKillStreak || 0,
      longestKillStreak: playerScore.longestKillStreak || 0,
      killsPerMinute: kpm,
      kdRatio: kdRatio,

      weaponStats: playerScore.weaponStats || new Map(),

      healthPacksCollected: playerScore.healthPacksCollected,
      distanceTraveled: playerScore.distanceTraveled,
      totalScore: playerScore.score,
      timeAlive: playerScore.timeAlive,
      averageLifeTime: avgLife,
    };
  }

  protected getDefaultStatistics(): any {
    return {
      gameMode: this.getName(),
      duration: 0,
      winner: 'Unknown',
      placement: 0,
      allPlayers: [],
      kills: 0,
      deaths: 0,
      assists: 0,
      suicides: 0,
      shotsFired: 0,
      shotsHit: 0,
      headshotKills: 0,
      accuracy: 0,
      damageDealt: 0,
      damageTaken: 0,
      highestDamageInOneLife: 0,
      killStreak: 0,
      longestKillStreak: 0,
      killsPerMinute: 0,
      kdRatio: 0,
      weaponStats: new Map(),
      healthPacksCollected: 0,
      distanceTraveled: 0,
      totalScore: 0,
      timeAlive: 0,
      averageLifeTime: 0,
    };
  }

  protected determineWinner(): string {
    // Override in subclasses for mode-specific win conditions
    let highestScore = -1;
    let winnerName = 'No Winner';

    this.state.scores.forEach((score, _id) => {
      if (score.score > highestScore) {
        highestScore = score.score;
        winnerName = score.name;
      }
    });

    return `Winner: ${winnerName} (${highestScore} points)`;
  }

  protected respawnPlayer(playerId: string): void {
    if (playerId === this.world.player.uuid) {
      // Respawn local player
      if (this.world.player.respawn) {
        this.world.player.respawn();
      }
    } else {
      // Find and respawn competitor
      const competitor = this.world.competitors.find(c => c.uuid === playerId);
      if (competitor) {
        this.world.spawningManager.respawnCompetitor(competitor);
      }
    }
  }

  // ========== Public Getters ==========

  public getState(): GameModeState {
    return { ...this.state };
  }

  public getConfig(): GameModeConfig {
    return { ...this.config };
  }

  public getScores(): PlayerScore[] {
    return Array.from(this.state.scores.values()).sort((a, b) => b.score - a.score);
  }

  public pause(): void {
    this.state.isPaused = true;
  }

  public resume(): void {
    this.state.isPaused = false;
  }
}
