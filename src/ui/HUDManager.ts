import { KillfeedManager } from './KillfeedManager';
import { DamageNumberManager } from './DamageNumberManager';
import { Vector3, Camera } from 'three';
import { WeaponType } from '../types/weapons';

// Interface for leaderboard player data
export interface LeaderboardEntry {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  isLocalPlayer: boolean;
  isDead?: boolean;
}

export class HUDManager {
  // New tactical HUD elements
  private vitalsArea: HTMLElement;
  private hpText: HTMLElement;
  private hpBar: HTMLElement;
  private shieldContainer: HTMLElement;
  private staminaBar: HTMLElement;
  private weaponName: HTMLElement;
  private ammoCount: HTMLElement;
  private ammoReserve: HTMLElement;
  private ammoBar: HTMLElement;
  private ammoContainer: HTMLElement;
  private fireMode: HTMLElement;
  private reloadIndicator: HTMLElement;
  private killStat: HTMLElement;
  private headShotStat: HTMLElement;
  private hitMarker: HTMLElement;
  private leaderboard: HTMLElement;
  private chatContainer: HTMLElement;
  private chatFeed: HTMLElement;
  private chatInput: HTMLInputElement;

  // Legacy elements that still exist
  private waveDisplay: HTMLElement;
  private scoreDisplay: HTMLElement;
  private enemiesDisplay: HTMLElement;
  private powerupIndicator: HTMLElement;
  private damageOverlay: HTMLElement;
  private sniperScope: HTMLElement;
  private crosshair: HTMLElement;
  private crosshairTop: HTMLElement;
  private crosshairBottom: HTMLElement;
  private crosshairLeft: HTMLElement;
  private crosshairRight: HTMLElement;
  private crosshairCircle: HTMLElement;
  private killIcon: HTMLElement;
  private headshotIcon: HTMLElement;
  private multiKillDisplay: HTMLElement;
  private streakDisplay: HTMLElement;
  private multiKillTimeout: number | null = null;
  private streakTimeout: number | null = null;

  public killfeed: KillfeedManager;
  public damageNumbers: DamageNumberManager;

  // Vignette system
  private vignetteImpactFlash: HTMLElement;
  private vignetteDamagePulse: HTMLElement;
  private vignetteCritical: HTMLElement;
  private impactFlashTimeout: number | null = null;
  private damagePulseTimeout: number | null = null;
  private damageOverlayTimeout: number | null = null;

  // Sprint overlay
  private sprintOverlay: HTMLElement;

  // Stats tracking
  private killCount: number = 0;
  private headshotCount: number = 0;
  private maxClip: number = 30;

  constructor() {
    this.killfeed = new KillfeedManager();
    this.damageNumbers = new DamageNumberManager();

    // New tactical HUD elements
    this.vitalsArea = document.getElementById('vitals-area')!;
    this.hpText = document.getElementById('hp-text')!;
    this.hpBar = document.getElementById('hp-bar')!;
    this.shieldContainer = document.getElementById('shield-container')!;
    this.staminaBar = document.getElementById('stamina-bar')!;
    this.weaponName = document.getElementById('weapon-name')!;
    this.ammoCount = document.getElementById('ammo-count')!;
    this.ammoReserve = document.getElementById('ammo-reserve')!;
    this.ammoBar = document.getElementById('ammo-bar')!;
    this.ammoContainer = document.querySelector('.ammo-container')!;
    this.fireMode = document.getElementById('fire-mode')!;
    this.reloadIndicator = document.getElementById('reload-indicator')!;
    this.killStat = document.getElementById('stat-kills')!;
    this.headShotStat = document.getElementById('stat-hs')!;
    this.hitMarker = document.getElementById('hit-marker')!;
    this.leaderboard = document.getElementById('leaderboard')!;
    this.chatContainer = document.getElementById('chat-container')!;
    this.chatFeed = document.getElementById('chat-feed')!;
    this.chatInput = document.getElementById('game-chat-input') as HTMLInputElement;

    // Setup chat input handler
    this.setupChatInput();

    // Legacy elements
    this.waveDisplay = document.getElementById('wave-display')!;
    this.scoreDisplay = document.getElementById('score-display')!;
    this.enemiesDisplay = document.getElementById('enemies-remaining')!;
    this.powerupIndicator = document.getElementById('powerup-indicator')!;
    this.damageOverlay = document.getElementById('damage-overlay')!;
    this.sniperScope = document.getElementById('sniper-scope')!;
    this.crosshair = document.getElementById('crosshair')!;
    this.crosshairTop = document.getElementById('cross-top')!;
    this.crosshairBottom = document.getElementById('cross-bottom')!;
    this.crosshairLeft = document.getElementById('cross-left')!;
    this.crosshairRight = document.getElementById('cross-right')!;
    this.crosshairCircle = document.getElementById('crosshair-circle')!;
    this.killIcon = document.getElementById('kill-icon')!;
    this.headshotIcon = document.getElementById('headshot-icon')!;
    this.multiKillDisplay = document.getElementById('multi-kill')!;
    this.streakDisplay = document.getElementById('kill-streak')!;

    // Vignette system
    this.vignetteImpactFlash = document.getElementById('vignette-impact-flash')!;
    this.vignetteDamagePulse = document.getElementById('vignette-damage-pulse')!;
    this.vignetteCritical = document.getElementById('vignette-critical')!;

    // Sprint overlay
    this.sprintOverlay = document.getElementById('sprint-overlay')!;

    // Hide wave display by default
    if (this.waveDisplay) this.waveDisplay.style.display = 'none';
  }

  public updateHealth(health: number, maxHealth: number): void {
    const pct = Math.max(0, Math.min(100, (health / maxHealth) * 100));

    // Update HP Text
    if (this.hpText) {
      this.hpText.textContent = Math.ceil(health).toString();
    }

    // Update HP Bar
    if (this.hpBar) {
      this.hpBar.style.width = `${pct}%`;

      // Color shift on low HP
      if (pct < 30) {
        this.hpBar.classList.add('low');
        this.vitalsArea?.classList.add('critical');
      } else {
        this.hpBar.classList.remove('low');
        this.vitalsArea?.classList.remove('critical');
      }
    }

    // Update critical vignette based on HP
    this.updateCriticalVignette(pct);
  }

  private updateCriticalVignette(healthPercent: number): void {
    if (!this.vignetteCritical) return;
    if (healthPercent < 15) {
      this.vignetteCritical.style.opacity = '1';
      this.vignetteCritical.classList.add('pulsing');
    } else if (healthPercent < 30) {
      this.vignetteCritical.style.opacity = '0.85';
      this.vignetteCritical.classList.add('pulsing');
    } else if (healthPercent < 50) {
      this.vignetteCritical.style.opacity = '0.55';
      this.vignetteCritical.classList.remove('pulsing');
    } else if (healthPercent < 75) {
      this.vignetteCritical.style.opacity = '0.25';
      this.vignetteCritical.classList.remove('pulsing');
    } else {
      this.vignetteCritical.style.opacity = '0';
      this.vignetteCritical.classList.remove('pulsing');
    }
  }

  public updateArmor(armor: number, maxArmor: number): void {
    if (!this.shieldContainer) return;

    // 5 segments, each represents 20% of max armor
    const segments = this.shieldContainer.querySelectorAll('.shield-segment');
    const activeSegments = Math.ceil((armor / maxArmor) * 5);

    segments.forEach((segment, i) => {
      if (i < activeSegments) {
        segment.classList.add('active');
      } else {
        segment.classList.remove('active');
      }
    });
  }

  public updateStamina(stamina: number, maxStamina: number): void {
    if (!this.staminaBar) return;
    const pct = Math.max(0, Math.min(100, (stamina / maxStamina) * 100));
    this.staminaBar.style.width = `${pct}%`;
  }

  public setSprintEffect(isSprinting: boolean): void {
    if (!this.sprintOverlay) return;
    if (isSprinting) {
      this.sprintOverlay.classList.add('active');
    } else {
      this.sprintOverlay.classList.remove('active');
    }
  }

  public updateWeaponName(name: string): void {
    if (this.weaponName) this.weaponName.textContent = name;
  }

  public updateAmmo(current: number, reserve: number): void {
    if (!this.ammoCount) return;

    this.ammoCount.textContent = current.toString();
    if (this.ammoReserve) this.ammoReserve.textContent = reserve.toString();

    // Update ammo bar
    if (this.ammoBar) {
      const pct = (current / this.maxClip) * 100;
      this.ammoBar.style.width = `${pct}%`;

      // Low ammo styling
      if (current <= this.maxClip * 0.3) {
        this.ammoCount.classList.add('low');
        this.ammoBar.classList.add('low');
        this.ammoContainer?.classList.add('low');
        if (this.reloadIndicator) this.reloadIndicator.classList.add('active');
      } else {
        this.ammoCount.classList.remove('low');
        this.ammoBar.classList.remove('low');
        this.ammoContainer?.classList.remove('low');
        if (this.reloadIndicator) this.reloadIndicator.classList.remove('active');
      }
    }
  }

  public setMaxClip(maxClip: number): void {
    this.maxClip = maxClip;
  }

  public setFireMode(mode: string): void {
    if (this.fireMode) this.fireMode.textContent = mode;
  }

  public incrementKills(): void {
    this.killCount++;
    if (this.killStat) this.killStat.textContent = this.killCount.toString();
  }

  public incrementHeadshots(): void {
    this.headshotCount++;
    if (this.headShotStat) this.headShotStat.textContent = this.headshotCount.toString();
  }

  public updateStats(kills: number, headshots: number): void {
    this.killCount = kills;
    this.headshotCount = headshots;
    if (this.killStat) this.killStat.textContent = kills.toString();
    if (this.headShotStat) this.headShotStat.textContent = headshots.toString();
  }

  public showTacticalHitMarker(isHeadshot: boolean = false): void {
    if (!this.hitMarker) return;
    this.hitMarker.classList.remove('hit-active');
    void this.hitMarker.offsetWidth; // Force reflow
    this.hitMarker.style.borderColor = isHeadshot ? '#ff3333' : 'white';
    this.hitMarker.classList.add('hit-active');
  }

  /**
   * Updates the leaderboard with current player standings
   * @param entries - Array of leaderboard entries sorted by kills (highest first)
   */
  public updateLeaderboard(entries: LeaderboardEntry[]): void {
    if (!this.leaderboard) {
      console.warn('[HUDManager] updateLeaderboard: leaderboard element not found!');
      return;
    }

    // Debug: console.log(`[HUDManager] updateLeaderboard called with ${entries.length} entries:`, entries.map(e => e.name));

    // Sort by kills descending
    const sorted = [...entries].sort((a, b) => b.kills - a.kills);

    // Build HTML for leaderboard
    let html = '';
    sorted.forEach((entry, index) => {
      const rank = index + 1;
      const isLeader = index === 0;
      const activeClass = entry.isLocalPlayer ? 'active' : '';
      const deadClass = entry.isDead ? 'dead' : '';

      html += `
        <div class="hud-panel lb-card ${activeClass} ${deadClass}">
          <div class="hud-content lb-content">
            <div class="lb-left">
              <span class="lb-rank">${rank}</span>
              <span class="lb-name">${entry.name}</span>
            </div>
            <div class="lb-stats">
              <span class="lb-kills">${entry.kills}</span>
            </div>
            ${isLeader ? '<div class="lb-badge">LEADER</div>' : ''}
          </div>
        </div>
      `;
    });

    this.leaderboard.innerHTML = html;
  }

  /**
   * Hides the leaderboard (for game end screen)
   */
  public hideLeaderboard(): void {
    if (this.leaderboard) {
      this.leaderboard.style.display = 'none';
    }
  }

  /**
   * Shows the leaderboard
   */
  public showLeaderboard(): void {
    if (this.leaderboard) {
      this.leaderboard.style.display = '';
    }
  }

  // ============================================
  // CHAT SYSTEM
  // ============================================

  private setupChatInput(): void {
    if (!this.chatInput) {
      console.warn('[HUD] Chat input element not found!');
      return;
    }

    // Allow pointer events on chat input
    this.chatInput.style.pointerEvents = 'auto';

    // Handle chat input
    this.chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const msg = this.chatInput.value.trim();
        if (msg) {
          // Send chat message over network if connected
          const world = (window as any).world;
          if (world?.networkManager?.isConnected()) {
            world.networkManager.sendChatMessage(msg);
          } else {
            // Local-only fallback
            this.addChatMessage('You', msg, 'player');
          }
          this.chatInput.value = '';
        }
        this.chatInput.blur();
      } else if (e.key === 'Escape') {
        this.chatInput.blur();
      }
    });

    // Global Enter key to focus chat (when not already focused)
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      // Only handle Enter key
      if (e.key !== 'Enter') return;

      // Don't process if chat is already focused
      if (document.activeElement === this.chatInput) return;

      // Don't process if any other input is focused
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      e.preventDefault();
      this.chatInput.focus();
    });
  }

  public focusChat(): void {
    if (this.chatInput) {
      this.chatInput.focus();
    }
  }

  public isChatFocused(): boolean {
    return document.activeElement === this.chatInput;
  }

  public addChatMessage(author: string, message: string, type: 'player' | 'enemy' | 'system' = 'system'): void {
    if (!this.chatFeed) return;

    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;

    const authorClass = `${type}-author`;
    div.innerHTML = `<span class="chat-author ${authorClass}">${author}:</span> ${message}`;

    this.chatFeed.appendChild(div);

    // Keep only last 10 messages
    while (this.chatFeed.children.length > 10) {
      this.chatFeed.removeChild(this.chatFeed.firstChild!);
    }

    // Scroll to bottom
    this.chatFeed.scrollTop = this.chatFeed.scrollHeight;

    // Auto-fade old messages after 10 seconds
    setTimeout(() => {
      div.style.opacity = '0.4';
    }, 10000);
  }

  public addSystemMessage(message: string): void {
    this.addChatMessage('System', message, 'system');
  }

  private currentWave: number = 0;

  public updateWave(wave: number): void {
    if (!this.waveDisplay) return;
    // Only show animation when wave actually changes
    if (wave === this.currentWave) return;
    this.currentWave = wave;

    // Update wave text inside the span (not the whole container)
    const waveText = this.waveDisplay.querySelector('.wave-text');
    if (waveText) {
      waveText.textContent = `WAVE ${wave}`;
    } else {
      this.waveDisplay.textContent = `WAVE ${wave}`;
    }

    // Trigger wave start animation
    this.waveDisplay.classList.remove('active', 'wave-start');

    // Use requestAnimationFrame to restart animation without blocking
    requestAnimationFrame(() => {
      this.waveDisplay.classList.add('wave-start');
    });

    // After animation, settle into active state
    setTimeout(() => {
      this.waveDisplay.classList.remove('wave-start');
      this.waveDisplay.classList.add('active');
    }, 1500); // Match animation duration (1.5s from CSS)
  }

  public updateScore(score: number): void {
    if (!this.scoreDisplay) return;
    const currentScore = parseInt(this.scoreDisplay.textContent || '0');
    if (score > currentScore) {
      this.scoreDisplay.classList.remove('pop');

      // Use requestAnimationFrame to restart animation without blocking
      requestAnimationFrame(() => {
        this.scoreDisplay.classList.add('pop');
      });
    }
    this.scoreDisplay.textContent = score.toString();
  }

  public updateEnemiesRemaining(count: number): void {
    if (!this.enemiesDisplay) return;
    // Update the count element inside the enemies display
    const countEl = this.enemiesDisplay.querySelector('.enemies-count');
    if (countEl) {
      countEl.textContent = count.toString();
    } else {
      this.enemiesDisplay.textContent = `Enemies: ${count}`;
    }
  }

  public showReloading(isReloading: boolean): void {
    if (!this.reloadIndicator) return;
    if (isReloading) {
      this.reloadIndicator.style.opacity = '1';
      this.reloadIndicator.classList.add('active');
    } else {
      this.reloadIndicator.style.opacity = '0';
      this.reloadIndicator.classList.remove('active');
    }
  }

  public showPowerup(text: string, show: boolean): void {
    if (!this.powerupIndicator) return;
    this.powerupIndicator.textContent = text;
    this.powerupIndicator.style.opacity = show ? '1' : '0';
  }

  public flashDamage(directionAngle?: number): void {
    if (!this.damageOverlay) return;
    // Debounce to prevent duplicate visual indicators
    if (this.damageOverlayTimeout !== null) {
      // Already showing damage indicator, skip this call
      return;
    }

    this.damageOverlay.style.opacity = '1';
    // RED indicator - drop-shadow creates a red glow effect
    this.damageOverlay.style.filter = 'drop-shadow(0 0 8px red) drop-shadow(0 0 15px red)';

    if (directionAngle !== undefined) {
      // Rotate the damage indicator to point towards the source of damage
      // The image points down by default, so we adjust accordingly
      this.damageOverlay.style.transform = `translate(-50%, -50%) rotate(${(directionAngle + 180) % 360}deg)`;
    } else {
      // Generic damage (no specific direction)
      this.damageOverlay.style.transform = 'translate(-50%, -50%)';
    }

    this.damageOverlayTimeout = setTimeout(() => {
      this.damageOverlay.style.opacity = '0';
      this.damageOverlay.style.filter = 'none';
      this.damageOverlayTimeout = null;
    }, 300) as unknown as number;
  }

  public showNearMissIndicator(directionAngle: number): void {
    if (!this.damageOverlay) return;
    // Clear any existing timeout to prevent conflicts
    if (this.damageOverlayTimeout !== null) {
      clearTimeout(this.damageOverlayTimeout);
    }

    // WHITE indicator for near misses - bright white glow
    this.damageOverlay.style.opacity = '0.5'; // Less intense than actual hit
    this.damageOverlay.style.filter = 'drop-shadow(0 0 8px white) drop-shadow(0 0 15px white)';

    // Rotate to show direction of incoming fire (flip front/back only)
    this.damageOverlay.style.transform = `translate(-50%, -50%) rotate(${(directionAngle + 180) % 360}deg)`;

    this.damageOverlayTimeout = setTimeout(() => {
      this.damageOverlay.style.opacity = '0';
      this.damageOverlay.style.filter = 'none'; // Reset filter
      this.damageOverlayTimeout = null;
    }, 150) as unknown as number; // Shorter duration than actual hit
  }

  public showDamageVignette(damageAmount: number, maxHealth: number, directionAngle?: number): void {
    if (!this.vignetteImpactFlash || !this.vignetteDamagePulse) return;
    // Calculate damage intensity (0-1)
    const damagePercent = (damageAmount / maxHealth) * 100;
    const intensity = Math.min(damagePercent / 50, 1.0); // Cap at 50% of max health for full intensity

    // LAYER 1: Impact Flash (instant, sharp)
    if (this.impactFlashTimeout) clearTimeout(this.impactFlashTimeout);
    this.vignetteImpactFlash.style.opacity = Math.min(0.9, 0.5 + intensity * 0.7).toString();

    // Optional directional impact (stronger on the side of the hit)
    if (directionAngle !== undefined) {
      const radians = (directionAngle * Math.PI) / 180;
      const x = Math.sin(radians) * 10;
      const y = -Math.cos(radians) * 10;
      this.vignetteImpactFlash.style.transform = `translate(${x}%, ${y}%)`;
    } else {
      this.vignetteImpactFlash.style.transform = 'translate(0, 0)';
    }

    this.impactFlashTimeout = window.setTimeout(() => {
      this.vignetteImpactFlash.style.opacity = '0';
      this.vignetteImpactFlash.style.transform = 'translate(0, 0)';
    }, 120);

    // LAYER 2: Damage Pulse (expanding glow)
    if (this.damagePulseTimeout) clearTimeout(this.damagePulseTimeout);

    // Color based on damage severity
    const pulseColor = damagePercent > 30
      ? 'rgba(255, 0, 51, INTENSITY)' // Heavy hit - bright red
      : 'rgba(255, 165, 0, INTENSITY)'; // Light hit - orange

    const pulseIntensity = Math.max(0.6, intensity * 1.2); // Much more visible
    this.vignetteDamagePulse.style.background = `
      radial-gradient(
        ellipse at center,
        transparent 30%,
        ${pulseColor.replace('INTENSITY', (pulseIntensity * 0.3).toString())} 45%,
        ${pulseColor.replace('INTENSITY', (pulseIntensity * 0.7).toString())} 60%,
        ${pulseColor.replace('INTENSITY', (pulseIntensity * 0.95).toString())} 75%,
        ${pulseColor.replace('INTENSITY', (pulseIntensity * 0.8).toString())} 90%
      )
    `;

    this.vignetteDamagePulse.style.opacity = Math.min(pulseIntensity, 0.95).toString();
    this.vignetteDamagePulse.classList.add('pulsing');

    // Expand pulse
    setTimeout(() => {
      this.vignetteDamagePulse.classList.remove('pulsing');
    }, 100);

    this.damagePulseTimeout = window.setTimeout(() => {
      this.vignetteDamagePulse.style.opacity = '0';
    }, 400);

    // Show directional damage arrow (red for hits)
    if (directionAngle !== undefined) {
      this.flashDamage(directionAngle);
    }
  }

  public showHitmarker(isKill: boolean): void {
    const hitmarker = document.getElementById('hitmarker')!;
    if (!hitmarker) return;
    const img = hitmarker.querySelector('img');

    hitmarker.style.opacity = '1';
    hitmarker.style.transform = isKill
      ? 'translate(-50%, -50%) scale(1.5)'
      : 'translate(-50%, -50%) scale(1.2)';

    if (img) {
      img.style.filter = isKill
        ? 'drop-shadow(0 0 5px #ef4444) sepia(1) saturate(1000%) hue-rotate(-50deg)' // Red for kill
        : 'drop-shadow(0 0 2px #ffffff)'; // White for hit
    }

    setTimeout(() => {
      hitmarker.style.opacity = '0';
      hitmarker.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 100);
  }

  public toggleScope(show: boolean): void {
    if (this.sniperScope) this.sniperScope.style.opacity = show ? '1' : '0';
    if (this.crosshair) this.crosshair.style.opacity = show ? '0' : '1';
  }

  public showMessage(message: string, duration: number = 2000): void {
    const msgDisplay = document.getElementById('message-display');
    if (msgDisplay) {
      msgDisplay.textContent = message;

      // Clear previous classes
      msgDisplay.className = '';

      // Determine visual tier based on message type (kill streaks)
      let tierClass = '';
      const upperMessage = message.toUpperCase();

      if (upperMessage.includes('LEGENDARY') || upperMessage.includes('GODLIKE')) {
        tierClass = 'impact-tier-4';
      } else if (upperMessage.includes('UNSTOPPABLE') || upperMessage.includes('DOMINATING')) {
        tierClass = 'impact-tier-3';
      } else if (upperMessage.includes('RAMPAGE')) {
        tierClass = 'impact-tier-2';
      } else if (upperMessage.includes('KILLING SPREE') || upperMessage.includes('TOOK THE LEAD')) {
        tierClass = 'impact-tier-1';
      }

      msgDisplay.style.opacity = '1';

      // Apply visual effects if this is a streak/achievement message
      if (tierClass) {
        requestAnimationFrame(() => {
          msgDisplay.classList.add('impact-text', tierClass, 'shake');
        });
      }

      setTimeout(() => {
        msgDisplay.style.opacity = '0';
        msgDisplay.className = '';
      }, duration);
    }
  }

  public showHeadshotMessage(): void {
    const msgDisplay = document.getElementById('message-display');
    if (msgDisplay) {
      msgDisplay.textContent = 'HEADSHOT';

      // Clear previous classes
      msgDisplay.className = '';

      // Use the highest impact tier for headshots + unique headshot class
      msgDisplay.style.opacity = '1';

      requestAnimationFrame(() => {
        msgDisplay.classList.add('impact-text', 'impact-tier-4', 'headshot-text', 'shake');
      });

      // Shorter duration for headshot pop
      setTimeout(() => {
        msgDisplay.style.opacity = '0';
        msgDisplay.className = '';
      }, 1500);
    }
  }

  public showGameOver(stats: { wave: number; kills: number; accuracy: number; time: string; score: number }): void {
    const gameOver = document.getElementById('game-over');
    if (gameOver) {
      gameOver.style.display = 'flex';
      const finalScore = document.getElementById('final-score');
      const finalWaves = document.getElementById('final-waves');
      const finalKills = document.getElementById('final-kills');
      const finalAccuracy = document.getElementById('final-accuracy');
      const finalTime = document.getElementById('final-time');

      if (finalScore) finalScore.textContent = stats.score.toString();
      if (finalWaves) finalWaves.textContent = stats.wave.toString();
      if (finalKills) finalKills.textContent = stats.kills.toString();
      if (finalAccuracy) finalAccuracy.textContent = stats.accuracy.toString();
      if (finalTime) finalTime.textContent = stats.time;
    }
  }

  public hideGameOver(): void {
    const gameOver = document.getElementById('game-over');
    if (gameOver) {
      gameOver.style.display = 'none';
    }
  }

  public updateCrosshair(spread: number, isMoving: boolean = false, isSprinting: boolean = false, isAirborne: boolean = false, weaponType: WeaponType | string = ''): void {
    if (!this.crosshairTop) return;

    // Check for shotgun to toggle crosshair style
    const isShotgun = weaponType === WeaponType.Shotgun || weaponType === 'Shotgun';

    if (isShotgun) {
      // Show circle, hide lines
      if (this.crosshairCircle) {
        this.crosshairCircle.style.opacity = '1';
        this.crosshairCircle.style.display = 'block';
      }
      this.crosshairTop.style.opacity = '0';
      this.crosshairBottom.style.opacity = '0';
      this.crosshairLeft.style.opacity = '0';
      this.crosshairRight.style.opacity = '0';

      // Circle scaling logic
      // Base size 64px, scale up with spread
      // Shotgun spread is much larger (0.035 base), so we need less multiplier
      let scale = 1 + spread * 15;

      // Apply movement penalties to scale
      if (isAirborne) scale *= 1.2;
      else if (isSprinting) scale *= 1.1;
      else if (isMoving) scale *= 1.05;

      scale = Math.min(scale, 2.5); // Cap max scale

      if (this.crosshairCircle) {
        this.crosshairCircle.style.transform = `translate(-50%, -50%) scale(${scale})`;
      }

    } else {
      // Show lines, hide circle
      if (this.crosshairCircle) {
        this.crosshairCircle.style.opacity = '0';
        this.crosshairCircle.style.display = 'none';
      }
      this.crosshairTop.style.opacity = '1';
      this.crosshairBottom.style.opacity = '1';
      this.crosshairLeft.style.opacity = '1';
      this.crosshairRight.style.opacity = '1';

      // Map spread directly to crosshair gap - AAA FPS standard
      // Base gap 4px (minimal visual separation) + spread multiplier for dynamic expansion
      let gap = 4 + spread * 20000;

      // Movement penalties (visual representation of accuracy loss)
      if (isAirborne) {
        gap *= 1.8; // Significant penalty when jumping
      } else if (isSprinting) {
        gap *= 1.4; // Running reduces accuracy
      } else if (isMoving) {
        gap *= 1.15; // Walking slightly reduces accuracy
      }

      // Clamp maximum gap to prevent screen-filling crosshair (AAA games cap at ~50-60px)
      gap = Math.min(gap, 60);

      // Apply the gap to each line
      this.crosshairTop.style.transform = `translateX(-50%) translateY(-${gap}px)`;
      this.crosshairBottom.style.transform = `translateX(-50%) translateY(${gap}px)`;
      this.crosshairLeft.style.transform = `translateY(-50%) translateX(-${gap}px)`;
      this.crosshairRight.style.transform = `translateY(-50%) translateX(${gap}px)`;
    }
  }

  public showHitFeedback(isKill: boolean, isHeadshot: boolean): void {
    if (!this.crosshair) return;
    // Remove any existing feedback classes
    this.crosshair.classList.remove('hit', 'headshot', 'kill');

    // Add appropriate feedback class
    if (isKill) {
      this.crosshair.classList.add('kill');
    } else if (isHeadshot) {
      this.crosshair.classList.add('headshot');
    } else {
      this.crosshair.classList.add('hit');
    }

    // Remove the class after animation
    setTimeout(() => {
      this.crosshair.classList.remove('hit', 'headshot', 'kill');
    }, 100);
  }

  public showPauseMenu(show: boolean): void {
    const menu = document.getElementById('pause-menu');
    if (menu) menu.style.display = show ? 'flex' : 'none';
  }

  public hideWaveDisplay(): void {
    if (this.waveDisplay) this.waveDisplay.style.display = 'none';
  }

  public showWaveDisplay(): void {
    if (this.waveDisplay) this.waveDisplay.style.display = 'block';
  }

  public hideStartScreen(): void {
    const screen = document.getElementById('start-screen');
    if (screen) screen.style.display = 'none';
  }

  public showKillIcon(): void {
    if (!this.killIcon) return;
    this.killIcon.style.opacity = '1';
    this.killIcon.style.transform = 'translate(-50%, -50%) scale(1.2)';

    setTimeout(() => {
      this.killIcon.style.transform = 'translate(-50%, -50%) scale(1.0)';
    }, 50);

    setTimeout(() => {
      this.killIcon.style.opacity = '0';
    }, 500);
  }

  public showHeadshotIcon(): void {
    if (!this.headshotIcon) return;
    this.headshotIcon.style.opacity = '1';
    this.headshotIcon.style.transform = 'translate(-50%, -50%) scale(1.2)';

    setTimeout(() => {
      this.headshotIcon.style.transform = 'translate(-50%, -50%) scale(1.0)';
    }, 50);

    setTimeout(() => {
      this.headshotIcon.style.opacity = '0';
    }, 500);
  }

  public showMultiKill(count: number): void {
    if (!this.multiKillDisplay) return;
    let text = '';
    let tierClass = '';

    switch (count) {
      case 2: text = 'DOUBLE KILL'; tierClass = 'impact-tier-1'; break;
      case 3: text = 'TRIPLE KILL'; tierClass = 'impact-tier-2'; break;
      case 4: text = 'QUAD KILL'; tierClass = 'impact-tier-3'; break;
      case 5: text = 'PENTA KILL'; tierClass = 'impact-tier-3'; break;
      default: text = 'GODLIKE'; tierClass = 'impact-tier-4'; break;
    }

    // Update text inside the span (if exists) or container
    const textEl = this.multiKillDisplay.querySelector('.multikill-text');
    if (textEl) {
      textEl.textContent = text;
    } else {
      this.multiKillDisplay.textContent = text;
    }

    this.multiKillDisplay.className = ''; // Clear classes
    this.multiKillDisplay.style.opacity = '1';

    // Use requestAnimationFrame to restart animation without blocking
    requestAnimationFrame(() => {
      this.multiKillDisplay.classList.add('impact-text', tierClass, 'shake');
    });

    if (this.multiKillTimeout) clearTimeout(this.multiKillTimeout);
    this.multiKillTimeout = window.setTimeout(() => {
      this.multiKillDisplay.style.opacity = '0';
      this.multiKillDisplay.className = '';
    }, 3000);
  }

  public showHitStreak(count: number): void {
    if (!this.streakDisplay) return;
    if (count < 3) return; // Show from 3 hits

    // Update text inside the span (if exists) or container
    const textEl = this.streakDisplay.querySelector('.streak-text');
    if (textEl) {
      textEl.textContent = `${count} HIT STREAK`;
    } else {
      this.streakDisplay.textContent = `${count} HIT STREAK`;
    }

    this.streakDisplay.className = '';
    this.streakDisplay.style.opacity = '1';

    // Determine tier based on streak
    let tierClass = 'impact-tier-1';
    if (count >= 10) tierClass = 'impact-tier-4';
    else if (count >= 7) tierClass = 'impact-tier-3';
    else if (count >= 5) tierClass = 'impact-tier-2';

    // Use requestAnimationFrame to restart animation without blocking
    requestAnimationFrame(() => {
      this.streakDisplay.classList.add('impact-text', tierClass);
      if (count >= 5) this.streakDisplay.classList.add('shake');
    });

    if (this.streakTimeout) clearTimeout(this.streakTimeout);
    this.streakTimeout = window.setTimeout(() => {
      this.streakDisplay.style.opacity = '0';
      this.streakDisplay.className = '';
    }, 2000);
  }

  public addKillFeed(killer: string, victim: string, weapon: string, isHeadshot: boolean, isMultiKill: boolean = false): void {
    this.killfeed.addKill(killer, victim, weapon, isHeadshot, isMultiKill);
  }

  public hideHUD(): void {
    const hud = document.getElementById('hud');
    if (hud) {
      hud.style.display = 'none';
    }
  }

  public showHUD(): void {
    const hud = document.getElementById('hud');
    if (hud) {
      hud.style.display = 'block';
    }
  }

  public reset(): void {
    // Reset wave tracker so first wave animation shows
    this.currentWave = 0;
  }

  public updateScoreboard(scores: any, myUserId: string) {
    const tbody = document.getElementById('scoreboard-body');
    if (!tbody) return;

    tbody.innerHTML = ''; // Clear existing

    // Convert players object to array and sort by kills
    const players = Object.entries(scores.players).map(([id, stats]: [string, any]) => ({
      id,
      ...stats
    })).sort((a: any, b: any) => b.kills - a.kills);

    players.forEach((p: any) => {
      const tr = document.createElement('tr');
      if (p.id === myUserId) {
        tr.classList.add('local-player');
      }

      const name = p.id === myUserId ? 'YOU' : `Player ${p.id.substr(0, 4)}`;

      tr.innerHTML = `
                <td>${name}</td>
                <td>${p.kills}</td>
                <td>${p.deaths}</td>
                <td>${p.ping || 0}ms</td>
            `;
      tbody.appendChild(tr);
    });
  }

  public toggleScoreboard(visible: boolean) {
    const scoreboard = document.getElementById('scoreboard');
    if (scoreboard) {
      scoreboard.style.display = visible ? 'block' : 'none';
    }
  }

  public showWaitingForPlayers(show: boolean): void {
    let waitingEl = document.getElementById('waiting-message');
    if (!waitingEl) {
      waitingEl = document.createElement('div');
      waitingEl.id = 'waiting-message';
      waitingEl.style.position = 'absolute';
      waitingEl.style.top = '20%';
      waitingEl.style.left = '50%';
      waitingEl.style.transform = 'translate(-50%, -50%)';
      waitingEl.style.color = '#ffffff';
      waitingEl.style.fontFamily = "'Orbitron', sans-serif";
      waitingEl.style.fontSize = '24px';
      waitingEl.style.fontWeight = 'bold';
      waitingEl.style.textShadow = '0 0 10px rgba(0, 255, 255, 0.5)';
      waitingEl.style.zIndex = '100';
      waitingEl.textContent = 'WAITING FOR PLAYERS...';
      document.body.appendChild(waitingEl);
    }
    waitingEl.style.display = show ? 'block' : 'none';
  }

  public showTeamScoreboard(show: boolean): void {
    let teamScoreEl = document.getElementById('team-scores');
    if (!teamScoreEl) {
      teamScoreEl = document.createElement('div');
      teamScoreEl.id = 'team-scores';
      teamScoreEl.style.position = 'absolute';
      teamScoreEl.style.top = '20px';
      teamScoreEl.style.left = '50%';
      teamScoreEl.style.transform = 'translateX(-50%)';
      teamScoreEl.style.display = 'flex';
      teamScoreEl.style.gap = '20px';
      teamScoreEl.style.fontFamily = "'Orbitron', sans-serif";
      teamScoreEl.style.fontSize = '32px';
      teamScoreEl.style.fontWeight = 'bold';
      teamScoreEl.style.zIndex = '90';
      teamScoreEl.innerHTML = `
        <div id="score-blue" style="color: #3b82f6; text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);">0</div>
        <div style="color: #fff;">-</div>
        <div id="score-red" style="color: #ef4444; text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);">0</div>
      `;
      document.body.appendChild(teamScoreEl);
    }
    teamScoreEl.style.display = show ? 'flex' : 'none';
  }

  public updateTeamScores(red: number, blue: number): void {
    const redEl = document.getElementById('score-red');
    const blueEl = document.getElementById('score-blue');
    if (redEl) redEl.textContent = red.toString();
    if (blueEl) blueEl.textContent = blue.toString();
  }

  public showFlagStatus(redStatus: string, blueStatus: string): void {
    let flagStatusEl = document.getElementById('flag-status');
    if (!flagStatusEl) {
      flagStatusEl = document.createElement('div');
      flagStatusEl.id = 'flag-status';
      flagStatusEl.style.position = 'absolute';
      flagStatusEl.style.top = '60px';
      flagStatusEl.style.left = '50%';
      flagStatusEl.style.transform = 'translateX(-50%)';
      flagStatusEl.style.display = 'flex';
      flagStatusEl.style.gap = '40px';
      flagStatusEl.style.fontFamily = "'Orbitron', sans-serif";
      flagStatusEl.style.fontSize = '18px';
      flagStatusEl.style.fontWeight = 'bold';
      flagStatusEl.style.zIndex = '90';
      flagStatusEl.style.textShadow = '0 0 5px rgba(0,0,0,0.8)';
      document.body.appendChild(flagStatusEl);
    }

    const getStatusColor = (status: string) => {
      if (status === 'TAKEN') return '#ffaa00'; // Orange for danger
      if (status === 'DROPPED') return '#ffff00'; // Yellow for caution
      return '#ffffff'; // White for safe
    };

    flagStatusEl.innerHTML = `
      <div style="color: #ef4444; display: flex; align-items: center; gap: 10px;">
        <span>RED FLAG:</span>
        <span style="color: ${getStatusColor(redStatus)}">${redStatus}</span>
      </div>
      <div style="color: #3b82f6; display: flex; align-items: center; gap: 10px;">
        <span>BLUE FLAG:</span>
        <span style="color: ${getStatusColor(blueStatus)}">${blueStatus}</span>
      </div>
    `;
    flagStatusEl.style.display = 'flex';
  }

  public hideFlagStatus(): void {
    const el = document.getElementById('flag-status');
    if (el) el.style.display = 'none';
  }

  public updateZoneInfo(radius: number, timeToShrink: number): void {
    let zoneEl = document.getElementById('zone-info');
    if (!zoneEl) {
      zoneEl = document.createElement('div');
      zoneEl.id = 'zone-info';
      zoneEl.style.position = 'absolute';
      zoneEl.style.top = '100px';
      zoneEl.style.right = '20px';
      zoneEl.style.textAlign = 'right';
      zoneEl.style.fontFamily = "'Orbitron', sans-serif";
      zoneEl.style.color = '#fff';
      zoneEl.style.textShadow = '0 0 5px rgba(0,0,0,0.8)';
      document.body.appendChild(zoneEl);
    }

    const timeStr = timeToShrink > 0 ? `SHRINKING IN: ${Math.ceil(timeToShrink)}s` : 'ZONE SHRINKING!';
    const color = timeToShrink > 0 ? '#fff' : '#ef4444';

    zoneEl.innerHTML = `
          <div style="font-size: 18px; font-weight: bold; color: ${color}">${timeStr}</div>
          <div style="font-size: 14px; color: #aaa">ZONE RADIUS: ${Math.round(radius)}m</div>
      `;
    zoneEl.style.display = 'block';
  }

  public updateAliveCount(count: number): void {
    let aliveEl = document.getElementById('alive-count');
    if (!aliveEl) {
      aliveEl = document.createElement('div');
      aliveEl.id = 'alive-count';
      aliveEl.style.position = 'absolute';
      aliveEl.style.top = '20px';
      aliveEl.style.right = '20px';
      aliveEl.style.fontFamily = "'Orbitron', sans-serif";
      aliveEl.style.fontSize = '24px';
      aliveEl.style.fontWeight = 'bold';
      aliveEl.style.color = '#fff';
      aliveEl.style.textShadow = '0 0 5px rgba(0,0,0,0.8)';
      document.body.appendChild(aliveEl);
    }
    aliveEl.textContent = `ALIVE: ${count}`;
    aliveEl.style.display = 'block';
  }

  public showSpectatorUI(targetName: string): void {
    let specEl = document.getElementById('spectator-ui');
    if (!specEl) {
      specEl = document.createElement('div');
      specEl.id = 'spectator-ui';
      specEl.style.position = 'absolute';
      specEl.style.bottom = '100px';
      specEl.style.left = '50%';
      specEl.style.transform = 'translateX(-50%)';
      specEl.style.fontFamily = "'Orbitron', sans-serif";
      specEl.style.fontSize = '20px';
      specEl.style.fontWeight = 'bold';
      specEl.style.color = '#fbbf24'; // Amber
      specEl.style.textShadow = '0 0 5px rgba(0,0,0,0.8)';
      document.body.appendChild(specEl);
    }
    specEl.textContent = `SPECTATING: ${targetName}`;
    specEl.style.display = 'block';
  }

  public hideSpectatorUI(): void {
    const specEl = document.getElementById('spectator-ui');
    if (specEl) specEl.style.display = 'none';
  }

  public update(delta: number): void {
    this.damageNumbers.update(delta);
  }

  public setCamera(camera: Camera): void {
    this.damageNumbers.setCamera(camera);
  }

  public showDamageNumber(position: Vector3, damage: number, isCritical: boolean): void {
    this.damageNumbers.showDamage(position, damage, isCritical);
  }

  public updateMinimap(playerPos: { x: number, z: number }, mapSize: number, zoneRadius: number, zoneCenter: { x: number, z: number }, remotePlayers: Array<{ x: number, z: number, team?: string }>): void {
    let minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!minimapCanvas) {
      const container = document.createElement('div');
      container.id = 'minimap-container';
      container.style.position = 'absolute';
      container.style.bottom = '20px';
      container.style.right = '20px';
      container.style.width = '200px';
      container.style.height = '200px';
      container.style.border = '2px solid #fff';
      container.style.borderRadius = '50%';
      container.style.overflow = 'hidden';
      container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      document.body.appendChild(container);

      minimapCanvas = document.createElement('canvas');
      minimapCanvas.id = 'minimap-canvas';
      minimapCanvas.width = 200;
      minimapCanvas.height = 200;
      container.appendChild(minimapCanvas);
    }

    const ctx = minimapCanvas.getContext('2d');
    if (!ctx) return;

    const size = 200;
    const center = size / 2;
    const scale = size / mapSize; // Map world units to pixels

    ctx.clearRect(0, 0, size, size);

    // Draw Zone
    ctx.beginPath();
    ctx.arc(
      center + zoneCenter.x * scale,
      center + zoneCenter.z * scale,
      zoneRadius * scale,
      0, Math.PI * 2
    );
    ctx.fillStyle = 'rgba(0, 100, 255, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#0066ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Remote Players (if visible/teammates)
    remotePlayers.forEach(p => {
      ctx.beginPath();
      ctx.arc(center + p.x * scale, center + p.z * scale, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.team === 'blue' ? '#3b82f6' : '#ef4444';
      ctx.fill();
    });

    // Draw Local Player
    ctx.beginPath();
    ctx.arc(center + playerPos.x * scale, center + playerPos.z * scale, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff00';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  public setupSettingsMenu(
    settingsManager: any,
    onBack: () => void,
    onChange?: () => void
  ): void {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const backBtn = document.getElementById('settings-back-btn');
    const pauseMenu = document.getElementById('pause-menu');

    const sensSlider = document.getElementById('sensitivity-slider') as HTMLInputElement;
    const sensValue = document.getElementById('sensitivity-value');
    const volSlider = document.getElementById('volume-slider') as HTMLInputElement;
    const volValue = document.getElementById('volume-value');
    const fovSlider = document.getElementById('fov-slider') as HTMLInputElement;
    const fovValue = document.getElementById('fov-value');

    if (settingsBtn && settingsMenu && backBtn && pauseMenu) {
      settingsBtn.addEventListener('click', () => {
        pauseMenu.style.display = 'none';
        settingsMenu.style.display = 'flex';

        // Load current values
        const current = settingsManager.getSettings();
        if (sensSlider && sensValue) {
          sensSlider.value = current.sensitivity.toString();
          sensValue.textContent = current.sensitivity.toFixed(4);
        }
        if (volSlider && volValue) {
          volSlider.value = current.volume.toString();
          volValue.textContent = `${Math.round(current.volume * 100)}%`;
        }
        if (fovSlider && fovValue) {
          fovSlider.value = current.fov.toString();
          fovValue.textContent = current.fov.toString();
        }
      });

      backBtn.addEventListener('click', () => {
        settingsMenu.style.display = 'none';
        pauseMenu.style.display = 'flex';
        onBack();
      });
    }

    // Bind sliders
    if (sensSlider && sensValue) {
      sensSlider.addEventListener('input', (e: any) => {
        const val = parseFloat(e.target.value);
        settingsManager.setSensitivity(val);
        sensValue.textContent = val.toFixed(4);
        if (onChange) onChange();
      });
    }

    if (volSlider && volValue) {
      volSlider.addEventListener('input', (e: any) => {
        const val = parseFloat(e.target.value);
        settingsManager.setVolume(val);
        volValue.textContent = `${Math.round(val * 100)}%`;
        if (onChange) onChange();
      });
    }

    if (fovSlider && fovValue) {
      fovSlider.addEventListener('input', (e: any) => {
        const val = parseInt(e.target.value);
        settingsManager.setFOV(val);
        fovValue.textContent = val.toString();
        if (onChange) onChange();
      });
    }
  }

  public show(): void {
    this.showHUD();
  }

  public hide(): void {
    this.hideHUD();
  }

  public updateKillfeed(_delta: number): void {
    // Logic to update killfeed animations if needed
  }
}
