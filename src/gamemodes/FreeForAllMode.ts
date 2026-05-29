// Free For All (Deathmatch) Mode

import { BaseGameMode } from './BaseGameMode';
import { GameModeType, GameModeConfig, Team } from './IGameMode';
import { HUDManager, LeaderboardEntry } from '../ui/HUDManager';

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
    getRemotePlayers: () => Array<{ uuid: string; health: number }>;
  };
  spawningManager: {
    respawnCompetitor: (entity: unknown) => void;
  };
  assetManager: {
    audios: Map<string, unknown>;
  };
}

const FFA_CONFIG: GameModeConfig = {
  name: 'Free For All',
  type: GameModeType.FREE_FOR_ALL,
  description: 'Every player for themselves. First to reach the score limit wins!',
  minPlayers: 2,
  maxPlayers: 16,
  timeLimit: 60, // 60 seconds (1 minute)
  scoreLimit: 15, // 15 kills to win
  respawnTime: 3,
  teamBased: false,
  friendlyFire: true,
};

/**
 * Free For All (Deathmatch) game mode
 * Every player fights against everyone else
 */
export class FreeForAllMode extends BaseGameMode {
  private leaderId: string | null = null;
  private leaderboardTimer: number = 0;
  private static readonly LEADERBOARD_INTERVAL = 0.25; // seconds between HUD rebuilds

  constructor(world: World, hudManager: HUDManager, customConfig?: Partial<GameModeConfig>) {
    super(world, hudManager, { ...FFA_CONFIG, ...customConfig });
  }

  public getName(): string {
    return 'Free For All';
  }

  public getType(): GameModeType {
    return GameModeType.FREE_FOR_ALL;
  }

  public init(): void {
    super.init();
    this.leaderId = null;
  }

  public start(): void {
    super.start();
    
    // Initialize all players with NONE team (FFA)
    this.state.scores.forEach((score, id) => {
      score.team = Team.NONE;
      this.state.scores.set(id, score);
    });

    // Show timer
    const timer = document.getElementById('game-timer');
    if (timer) {
      timer.style.display = 'block';
    }
  }

  public update(delta: number): void {
    super.update(delta);

    if (!this.state.isRunning) return;

    // Throttle the (relatively expensive) leaderboard rebuild to a few times a
    // second instead of every frame.
    this.leaderboardTimer += delta;
    if (this.leaderboardTimer >= FreeForAllMode.LEADERBOARD_INTERVAL) {
      this.leaderboardTimer = 0;
      this.updateLeader();
      this.updateLeaderboardHUD();
    }
  }

  /**
   * Updates the HUD leaderboard with current player standings
   */
  private updateLeaderboardHUD(): void {
    const entries: LeaderboardEntry[] = [];
    
    this.state.scores.forEach((score, id) => {
      // Check if this entity is dead
      let isDead = false;
      if (id === this.world.player.uuid) {
        isDead = this.world.player.health <= 0;
      } else {
        // Check local bots (competitors) - single player mode
        const competitor = this.world.competitors.find(c => c.uuid === id);
        if (competitor) {
          isDead = competitor.health <= 0;
        } else {
          // Check remote bots (server-controlled) - multiplayer mode
          const remoteBot = this.world.remoteBots?.get(id);
          if (remoteBot) {
            isDead = remoteBot.isDead || remoteBot.health <= 0;
          } else {
            // Check remote players
            const remotePlayers = this.world.networkManager?.getRemotePlayers() || [];
            const remotePlayer = remotePlayers.find(rp => rp.uuid === id);
            if (remotePlayer) {
              isDead = remotePlayer.health <= 0;
            }
          }
        }
      }

      entries.push({
        id: id,
        name: score.name,
        kills: score.kills,
        deaths: score.deaths,
        isLocalPlayer: id === this.world.player.uuid,
        isDead: isDead
      });
    });

    this.hudManager.updateLeaderboard(entries);
  }

  public onPlayerKill(
    killerId: string,
    victimId: string,
    weapon: string,
    headshot: boolean
  ): void {
    super.onPlayerKill(killerId, victimId, weapon, headshot);

    // Check if killer is now in the lead
    const killerScore = this.state.scores.get(killerId);
    if (killerScore && this.leaderId !== killerId) {
      const leaderScore = this.leaderId ? this.state.scores.get(this.leaderId) : null;
      
      if (!leaderScore || killerScore.kills > leaderScore.kills) {
        const previousLeader = this.leaderId;
        this.leaderId = killerId;
        
        // Announce lead change
        if (previousLeader && killerId === this.world.player.uuid) {
          this.hudManager.showMessage('YOU TOOK THE LEAD!', 2000);
        }
      }
    }

    // Check for kill streaks
    if (killerId === this.world.player.uuid && killerScore) {
      this.checkKillStreak(killerScore.kills);
    }
  }

  protected checkScoreLimit(): boolean {
    if (!this.config.scoreLimit) return false;

    for (const [_id, score] of this.state.scores) {
      if (score.kills >= this.config.scoreLimit) {
        return true;
      }
    }
    return false;
  }

  protected determineWinner(): string {
    let highestKills = -1;
    let winnerName = 'No Winner';
    let winnerId = '';

    this.state.scores.forEach((score, id) => {
      if (score.kills > highestKills) {
        highestKills = score.kills;
        winnerName = score.name;
        winnerId = id;
      }
    });

    if (winnerId === this.world.player.uuid) {
      return 'YOU WIN!';
    }

    return `Winner: ${winnerName} (${highestKills} kills)`;
  }

  private updateLeader(): void {
    let highestKills = -1;
    let newLeader: string | null = null;

    this.state.scores.forEach((score, id) => {
      if (score.kills > highestKills) {
        highestKills = score.kills;
        newLeader = id;
      }
    });

    this.leaderId = newLeader;
  }

  private checkKillStreak(kills: number): void {
    // Announce kill streaks
    const streakMessages: { [key: number]: string } = {
      3: 'KILLING SPREE',
      5: 'RAMPAGE',
      7: 'DOMINATING',
      10: 'UNSTOPPABLE',
      15: 'GODLIKE',
      20: 'LEGENDARY',
    };

    if (streakMessages[kills]) {
      this.hudManager.showMessage(streakMessages[kills], 2000);
    }
  }

  public cleanup(): void {
    super.cleanup();
    
    // Hide timer
    const timer = document.getElementById('game-timer');
    if (timer) {
      timer.style.display = 'none';
    }
  }
}
