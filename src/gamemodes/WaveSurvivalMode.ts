// Wave Survival Mode (Like BitBlast's original bot fights)

import { BaseGameMode } from './BaseGameMode';
import { GameModeType, GameModeConfig } from './IGameMode';
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
    active?: boolean;
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

const WAVE_CONFIG: GameModeConfig = {
  name: 'Wave Survival',
  type: GameModeType.WAVE_SURVIVAL,
  description: 'Survive endless waves of enemies. How long can you last?',
  minPlayers: 1,
  maxPlayers: 4, // Co-op
  timeLimit: 0, // No time limit
  scoreLimit: 0, // No score limit
  respawnTime: 0, // No respawn in survival (1 life per wave)
  teamBased: false,
  friendlyFire: false,
};

/**
 * Wave Survival game mode
 * Players fight against waves of enemies with increasing difficulty
 */
export class WaveSurvivalMode extends BaseGameMode {
  private waveInProgress: boolean = false;
  private betweenWaves: boolean = false;
  private enemiesRemaining: number = 0;
  private waveStartTime: number = 0;
  private timeBetweenWaves: number = 5000; // 5 seconds
  private lastCountdownShown: number = -1; // last "next wave in N" second displayed

  constructor(world: World, hudManager: HUDManager, customConfig?: Partial<GameModeConfig>) {
    super(world, hudManager, { ...WAVE_CONFIG, ...customConfig });
  }

  public getName(): string {
    return 'Wave Survival';
  }

  public getType(): GameModeType {
    return GameModeType.WAVE_SURVIVAL;
  }

  public init(): void {
    super.init();
    this.state.wave = 0;
    this.waveInProgress = false;
    this.betweenWaves = false;
    this.enemiesRemaining = 0;
  }

  public start(): void {
    super.start();
    
    // Reset wave state
    this.state.wave = 0;
    const playerScore = this.state.scores.get(this.world.player.uuid);
    if (playerScore) {
      playerScore.score = 0;
      playerScore.kills = 0;
      this.state.scores.set(this.world.player.uuid, playerScore);
    }

    // Show wave display
    this.showWaveDisplay();
    
    // Start first wave
    this.startNextWave();
  }

  public update(_delta: number): void {
    // Don't call parent update (no time/score limits in wave mode)
    if (!this.isActive || !this.state.isRunning || this.state.isPaused) {
      return;
    }

    // Count remaining enemies
    this.enemiesRemaining = this.countActiveEnemies();

    // Update enemy counter display
    this.updateEnemyCounter();

    // Check for wave completion
    if (this.waveInProgress && this.enemiesRemaining === 0) {
      this.completeWave();
    }

    // Check if between waves timer is complete
    if (this.betweenWaves) {
      const elapsed = Date.now() - this.waveStartTime;
      if (elapsed >= this.timeBetweenWaves) {
        this.startNextWave();
      } else {
        // Update countdown only when the displayed second changes (was every frame).
        const remaining = Math.ceil((this.timeBetweenWaves - elapsed) / 1000);
        if (remaining !== this.lastCountdownShown) {
          this.lastCountdownShown = remaining;
          this.hudManager.showMessage(`Next wave in ${remaining}...`, 1000);
        }
      }
    }

    // Check if player died
    if (this.world.player.health <= 0 && !this.betweenWaves) {
      this.onPlayerDeath(this.world.player.uuid);
    }
  }

  public onPlayerKill(
    killerId: string,
    _victimId: string,
    _weapon: string,
    headshot: boolean
  ): void {
    // Only count kills by the player
    if (killerId !== this.world.player.uuid) return;

    const playerScore = this.state.scores.get(this.world.player.uuid);
    if (playerScore) {
      playerScore.kills++;
      
      // Score based on wave difficulty
      const baseScore = 100 * this.state.wave;
      const headshotBonus = headshot ? 50 : 0;
      playerScore.score += baseScore + headshotBonus;
      
      if (headshot) {
        playerScore.headshots++;
      }
      
      this.state.scores.set(this.world.player.uuid, playerScore);
    }

    // Show kill feedback
    this.hudManager.showHitmarker(true);
    
    // Update score display
    this.updateScoreDisplay();
  }

  public onPlayerDeath(_playerId: string): void {
    // Game over in survival mode
    this.endGame('YOU DIED');
  }

  private startNextWave(): void {
    this.state.wave++;
    this.waveInProgress = true;
    this.betweenWaves = false;

    // Calculate enemies for this wave
    const baseEnemies = 3;
    const enemiesPerWave = 2;
    const maxEnemies = Math.min(baseEnemies + (this.state.wave - 1) * enemiesPerWave, 20);
    
    // Spawn enemies
    this.spawnWaveEnemies(maxEnemies);

    // Announce wave
    this.hudManager.showMessage(`WAVE ${this.state.wave}`, 2000);
    this.updateWaveDisplay();
  }

  private completeWave(): void {
    this.waveInProgress = false;
    this.betweenWaves = true;
    this.waveStartTime = Date.now();
    this.lastCountdownShown = -1;

    // Award wave completion bonus
    const playerScore = this.state.scores.get(this.world.player.uuid);
    if (playerScore) {
      const waveBonus = this.state.wave * 500;
      playerScore.score += waveBonus;
      this.state.scores.set(this.world.player.uuid, playerScore);
    }

    this.hudManager.showMessage(`WAVE ${this.state.wave} COMPLETE!\n+${this.state.wave * 500} BONUS`, 3000);
    this.updateScoreDisplay();

    // Heal player slightly between waves as a survival reward.
    const healAmount = Math.min(25, this.world.player.maxHealth - this.world.player.health);
    if (healAmount > 0) {
      this.world.player.addHealth(healAmount);
    }
  }

  private spawnWaveEnemies(count: number): void {
    // Use existing spawning manager to respawn enemies
    // In a real implementation, you might want to spawn specific enemy types
    // based on wave difficulty
    
    let spawned = 0;
    for (const competitor of this.world.competitors) {
      if (competitor.uuid !== this.world.player.uuid && spawned < count) {
        // Make enemy active and respawn
        (competitor as { active?: boolean }).active = true;
        this.world.spawningManager.respawnCompetitor(competitor);
        spawned++;
      }
    }

    this.enemiesRemaining = count;
  }

  private countActiveEnemies(): number {
    let count = 0;
    for (const competitor of this.world.competitors) {
      const comp = competitor as { active?: boolean; uuid: string; health: number };
      if (comp.uuid !== this.world.player.uuid && 
          comp.active && 
          comp.health > 0) {
        count++;
      }
    }
    return count;
  }

  private showWaveDisplay(): void {
    // Create wave display if it doesn't exist
    let waveDisplay = document.getElementById('wave-display');
    if (!waveDisplay) {
      waveDisplay = document.createElement('div');
      waveDisplay.id = 'wave-display';
      waveDisplay.style.cssText = `
        position: absolute;
        top: 20px;
        left: 20px;
        font-size: 24px;
        font-weight: bold;
        color: white;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      `;
      document.getElementById('game-hud')?.appendChild(waveDisplay);
    }
    waveDisplay.style.display = 'block';
  }

  private updateWaveDisplay(): void {
    const waveDisplay = document.getElementById('wave-display');
    if (waveDisplay) {
      waveDisplay.innerHTML = `
        <div>WAVE ${this.state.wave}</div>
        <div id="enemy-counter" style="font-size: 16px; color: #ff6666;">
          Enemies: ${this.enemiesRemaining}
        </div>
      `;
    }
  }

  private updateEnemyCounter(): void {
    const counter = document.getElementById('enemy-counter');
    if (counter) {
      counter.textContent = `Enemies: ${this.enemiesRemaining}`;
    }
  }

  private updateScoreDisplay(): void {
    const playerScore = this.state.scores.get(this.world.player.uuid);
    if (playerScore) {
      // Update HUD score display
      const scoreDisplay = document.getElementById('wave-score');
      if (!scoreDisplay) {
        const waveDisplay = document.getElementById('wave-display');
        if (waveDisplay) {
          const scoreEl = document.createElement('div');
          scoreEl.id = 'wave-score';
          scoreEl.style.cssText = 'font-size: 18px; color: #ffdd00;';
          waveDisplay.appendChild(scoreEl);
        }
      }
      const scoreEl = document.getElementById('wave-score');
      if (scoreEl) {
        scoreEl.textContent = `Score: ${playerScore.score}`;
      }
    }
  }

  protected determineWinner(): string {
    const playerScore = this.state.scores.get(this.world.player.uuid);
    return `Survived ${this.state.wave - 1} waves\nKills: ${playerScore?.kills || 0}\nFinal Score: ${playerScore?.score || 0}`;
  }

  public getWaveInfo(): { wave: number; enemiesRemaining: number; inProgress: boolean } {
    return {
      wave: this.state.wave,
      enemiesRemaining: this.enemiesRemaining,
      inProgress: this.waveInProgress,
    };
  }

  public cleanup(): void {
    super.cleanup();
    
    // Hide wave display
    const waveDisplay = document.getElementById('wave-display');
    if (waveDisplay) {
      waveDisplay.style.display = 'none';
    }
  }
}
