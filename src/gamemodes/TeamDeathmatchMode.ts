// Team Deathmatch Mode

import { BaseGameMode } from './BaseGameMode';
import { GameModeType, GameModeConfig, Team } from './IGameMode';
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
}

const TDM_CONFIG: GameModeConfig = {
  name: 'Team Deathmatch',
  type: GameModeType.TEAM_DEATHMATCH,
  description: 'Red vs Blue. First team to reach the score limit wins!',
  minPlayers: 4,
  maxPlayers: 16,
  timeLimit: 900, // 15 minutes
  scoreLimit: 75,
  respawnTime: 5,
  teamBased: true,
  friendlyFire: false,
};

/**
 * Team Deathmatch game mode
 * Two teams compete to reach the score limit
 */
export class TeamDeathmatchMode extends BaseGameMode {
  private playerTeam: Team = Team.BLUE;

  constructor(world: World, hudManager: HUDManager, customConfig?: Partial<GameModeConfig>) {
    super(world, hudManager, { ...TDM_CONFIG, ...customConfig });
  }

  public getName(): string {
    return 'Team Deathmatch';
  }

  public getType(): GameModeType {
    return GameModeType.TEAM_DEATHMATCH;
  }

  public init(): void {
    super.init();
    this.state.redScore = 0;
    this.state.blueScore = 0;
  }

  public start(): void {
    super.start();
    
    // Assign teams to players
    this.assignTeams();
    
    // Show team scoreboard
    this.showTeamScoreboard();
    
    // Update HUD with team colors
    this.updateTeamHUD();
  }

  public update(delta: number): void {
    super.update(delta);

    if (!this.state.isRunning) return;

    // Update team score display
    this.updateTeamScores();
  }

  public onPlayerKill(
    killerId: string,
    victimId: string,
    weapon: string,
    headshot: boolean
  ): void {
    const killerScore = this.state.scores.get(killerId);
    const victimScore = this.state.scores.get(victimId);

    if (!killerScore || !victimScore) return;

    // Check for team kill (friendly fire)
    if (killerScore.team === victimScore.team) {
      // Don't count team kills
      if (!this.config.friendlyFire) return;
      
      // Penalize team killer
      killerScore.score -= 50;
      this.state.scores.set(killerId, killerScore);
      
      if (killerId === this.world.player.uuid) {
        this.hudManager.showMessage('TEAM KILL! (-50)', 2000);
      }
      return;
    }

    // Award team point
    if (killerScore.team === Team.RED) {
      this.state.redScore++;
    } else if (killerScore.team === Team.BLUE) {
      this.state.blueScore++;
    }

    // Call parent for individual score tracking
    super.onPlayerKill(killerId, victimId, weapon, headshot);

    // Update team scores display
    this.updateTeamScores();
  }

  protected checkScoreLimit(): boolean {
    if (!this.config.scoreLimit) return false;
    return this.state.redScore >= this.config.scoreLimit || 
           this.state.blueScore >= this.config.scoreLimit;
  }

  protected determineWinner(): string {
    if (this.state.redScore > this.state.blueScore) {
      if (this.playerTeam === Team.RED) {
        return 'YOUR TEAM WINS!';
      }
      return 'RED TEAM WINS!';
    } else if (this.state.blueScore > this.state.redScore) {
      if (this.playerTeam === Team.BLUE) {
        return 'YOUR TEAM WINS!';
      }
      return 'BLUE TEAM WINS!';
    }
    return 'DRAW!';
  }

  private assignTeams(): void {
    const players = Array.from(this.state.scores.keys());
    const half = Math.ceil(players.length / 2);

    players.forEach((playerId, index) => {
      const score = this.state.scores.get(playerId)!;
      score.team = index < half ? Team.RED : Team.BLUE;
      this.state.scores.set(playerId, score);

      // Track local player's team
      if (playerId === this.world.player.uuid) {
        this.playerTeam = score.team;
      }
    });
  }

  private showTeamScoreboard(): void {
    const scoreContainer = document.getElementById('score-container');
    if (scoreContainer) {
      scoreContainer.style.display = 'flex';
    }

    const timer = document.getElementById('game-timer');
    if (timer) {
      timer.style.display = 'block';
      timer.style.top = '60px'; // Move down to make room for scores
    }
  }

  private updateTeamScores(): void {
    const redScoreEl = document.getElementById('red-score');
    const blueScoreEl = document.getElementById('blue-score');

    if (redScoreEl) {
      redScoreEl.textContent = this.state.redScore.toString();
    }
    if (blueScoreEl) {
      blueScoreEl.textContent = this.state.blueScore.toString();
    }
  }

  private updateTeamHUD(): void {
    // Could change HUD colors based on team
    const hudContainer = document.getElementById('game-hud');
    if (hudContainer) {
      hudContainer.classList.remove('team-red', 'team-blue');
      hudContainer.classList.add(this.playerTeam === Team.RED ? 'team-red' : 'team-blue');
    }
  }

  public getPlayerTeam(playerId: string): Team {
    const score = this.state.scores.get(playerId);
    return score?.team || Team.NONE;
  }

  public getTeamScores(): { red: number; blue: number } {
    return {
      red: this.state.redScore,
      blue: this.state.blueScore,
    };
  }

  public cleanup(): void {
    super.cleanup();

    // Hide team scoreboard
    const scoreContainer = document.getElementById('score-container');
    if (scoreContainer) {
      scoreContainer.style.display = 'none';
    }

    const timer = document.getElementById('game-timer');
    if (timer) {
      timer.style.display = 'none';
      timer.style.top = '20px';
    }

    const hudContainer = document.getElementById('game-hud');
    if (hudContainer) {
      hudContainer.classList.remove('team-red', 'team-blue');
    }
  }
}
