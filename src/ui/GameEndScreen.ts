// Game End Screen with Statistics - Tactical Benchmark Edition

declare const THREE: any;

// Interface for each player's end-game stats
export interface PlayerEndStats {
  id: string;
  name: string;
  team: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damageDealt: number;
  accuracy: number;
  placement: number;
  isMe: boolean;
}

export interface GameStatistics {
  // Match Info
  gameMode: string;
  duration: number; // seconds
  winner: string;
  placement: number;

  // All players in the match
  allPlayers: PlayerEndStats[];

  // Combat Stats
  kills: number;
  deaths: number;
  assists: number;
  suicides: number;

  // Weapon Stats
  shotsFired: number;
  shotsHit: number;
  headshotKills: number;
  accuracy: number; // percentage

  // Damage Stats
  damageDealt: number;
  damageTaken: number;
  highestDamageInOneLife: number;

  // Performance Stats
  killStreak: number;
  longestKillStreak: number;
  killsPerMinute: number;
  kdRatio: number;

  // Weapon Breakdown
  weaponStats: Map<string, {
    kills: number;
    shots: number;
    hits: number;
    damage: number;
    headshots: number;
  }>;

  // Additional Stats
  healthPacksCollected: number;
  distanceTraveled: number;
  totalScore: number;
  timeAlive: number; // seconds spent alive
  averageLifeTime: number; // average seconds per life
}

export class GameEndScreen {
  private container: HTMLElement | null = null;
  private isShowing: boolean = false;
  private countdownInterval: number | null = null;
  private countdownValue: number = 30;

  constructor() {
    this.injectDependencies();
    this.createEndScreen();
  }

  private injectDependencies(): void {
    // Tailwind CSS
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }

    // Google Fonts
    if (!document.getElementById('google-fonts-tactical')) {
      const link = document.createElement('link');
      link.id = 'google-fonts-tactical';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap';
      document.head.appendChild(link);
    }

    // Font Awesome
    if (!document.getElementById('font-awesome-cdn')) {
      const link = document.createElement('link');
      link.id = 'font-awesome-cdn';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
      document.head.appendChild(link);
    }
  }

  private createEndScreen(): void {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'game-end-screen';
    this.container.className = 'hidden'; // Initially hidden

    // HTML Structure from Markdown
    this.container.innerHTML = `
        <!-- CSS Background -->
        <div id="background-layer">
            <div class="bg-image"></div>
            <div class="tech-grid"></div>
            <div class="vignette"></div>
            <!-- Particles injected by JS -->
        </div>

        <!-- UI Overlay -->
        <div id="ui-layer" class="p-4 md:p-8 flex flex-col h-screen justify-between pointer-events-none">
            
            <!-- TOP BAR -->
            <div class="w-full flex justify-between items-stretch h-16 mb-2 pointer-events-auto animate-slide-down">
                <div class="flex items-center">
                    <div id="result-badge" class="bg-blue-600/90 h-full px-12 flex items-center skew-box relative z-20 shadow-[0_0_15px_rgba(37,99,235,0.5)]">
                        <h1 id="match-result" class="text-4xl font-black italic tracking-wider text-yellow-400 unskew-content font-orbitron drop-shadow-md">VICTORY</h1>
                    </div>
                    <div class="bg-blue-900/80 h-10 self-center -ml-4 pl-8 pr-6 flex items-center skew-box z-10">
                        <div class="unskew-content text-slate-300 text-sm font-bold flex gap-2">
                            <span id="map-name" class="text-white">ARENA</span>
                            <span id="match-time" class="opacity-50">12:45</span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center">
                    <div class="bg-blue-900/90 h-full px-8 flex items-center skew-box shadow-lg border-b-2 border-blue-500">
                        <span class="unskew-content text-xl font-bold text-white italic">NEXT GAME : <span id="timer" class="text-yellow-400 text-2xl">15</span></span>
                    </div>
                </div>
            </div>

            <!-- CENTER AREA: TABS & CONTENT -->
            <div class="flex-1 flex flex-col max-w-6xl mx-auto w-full pointer-events-auto relative mt-4">
                
                <!-- TABS -->
                <div class="flex space-x-2 mb-4 pl-4 animate-slide-down" style="animation-delay: 0.1s;">
                    <button id="tab-btn-scoreboard" class="tab-btn active px-8 py-2">
                        <div class="unskew-content font-bold tracking-widest uppercase text-sm">Scoreboard</div>
                    </button>
                    <button id="tab-btn-stats" class="tab-btn px-8 py-2">
                        <div class="unskew-content font-bold tracking-widest uppercase text-sm">Performance</div>
                    </button>
                    <button id="tab-btn-weapons" class="tab-btn px-8 py-2">
                        <div class="unskew-content font-bold tracking-widest uppercase text-sm">Weapons</div>
                    </button>
                </div>

                <!-- VIEW: SCOREBOARD -->
                <div id="view-scoreboard" class="w-full flex-col transition-all duration-300 flex">
                    <!-- Headers -->
                    <div class="flex w-full px-4 py-2 text-slate-300 font-bold text-sm tracking-widest uppercase mb-1 border-b border-white/10">
                        <div class="w-1/3 pl-12">Player</div>
                        <div class="w-10 text-center">K</div>
                        <div class="w-2 text-center text-slate-600">/</div>
                        <div class="w-10 text-center">D</div>
                        <div class="w-2 text-center text-slate-600">/</div>
                        <div class="w-10 text-center">A</div>
                        <div class="w-24 text-center hidden md:block">Headshot</div>
                        <div class="w-24 text-center hidden md:block">Damage</div>
                        <div class="w-24 text-center text-green-400 hidden md:block">Acc %</div>
                        <div class="w-24 text-right text-yellow-400">Score</div>
                        <div class="w-16 text-center"></div>
                    </div>
                    <!-- Rows Container -->
                    <div id="scoreboard-rows" class="space-y-2 overflow-hidden py-2">
                        <!-- JS Injected -->
                    </div>
                </div>

                <!-- VIEW: DETAILED STATS -->
                <div id="view-stats" class="hidden w-full h-[50vh] overflow-y-auto pr-2">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
                        <!-- Stat Tiles injected by JS -->
                    </div>
                </div>

                <!-- VIEW: WEAPONS -->
                <div id="view-weapons" class="hidden w-full h-[50vh] overflow-y-auto pr-2">
                    <div class="flex flex-col gap-2 p-4">
                        <!-- Weapon Rows injected by JS -->
                    </div>
                </div>

            </div>

            <!-- BOTTOM SECTION -->
            <div class="w-full grid grid-cols-1 md:grid-cols-3 gap-6 items-end mt-4 pointer-events-auto h-48">
                
                <!-- LEFT: Chat Box -->
                <div class="hidden md:flex flex-col justify-end h-full animate-slide-up">
                    <div id="end-chat-feed" class="bg-slate-900/60 p-2 h-32 overflow-y-auto text-xs space-y-1 rounded-sm border-l-2 border-slate-600">
                        <p><span class="text-slate-400 font-bold">[System]:</span> Match ended. Next game starting soon...</p>
                    </div>
                    <div class="mt-2 relative">
                        <input type="text" id="end-chat-input" placeholder="Press [ENTER] to message" class="w-full bg-slate-900/80 text-white text-sm py-2 px-3 border border-slate-700 outline-none focus:border-blue-500 rounded-sm">
                        <i class="fa-regular fa-comment absolute right-3 top-2.5 text-slate-500"></i>
                    </div>
                </div>

                <!-- CENTER: Map Selection -->
                <div class="flex flex-col items-center justify-end h-full animate-slide-up" style="animation-delay: 0.1s;">
                    <div class="bg-black/60 rounded-t-lg px-6 py-1 text-xs font-bold tracking-wider text-slate-400 uppercase">Current Map</div>
                    <div class="bg-slate-900/90 p-1 w-full max-w-md border-t-2 border-blue-500 shadow-2xl">
                        <div class="flex justify-between items-center bg-blue-900/30 mb-3 p-2 border border-blue-500/50 cursor-default">
                            <div class="flex items-center gap-2">
                                <img src="https://placehold.co/40x25/1e293b/FFF?text=A" class="w-10 h-6 object-cover border border-blue-500">
                                <span class="font-bold text-sm text-blue-400">Arena</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="bg-blue-600 px-2 py-0.5 text-xs font-bold rounded text-white">ACTIVE</span>
                            </div>
                        </div>
                        <div class="flex justify-between items-center px-1">
                            <button id="btn-leave" class="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-1.5 flex items-center gap-2 rounded-sm transition-colors">
                                <i class="fa-solid fa-xmark"></i> Leave
                            </button>
                            <div class="bg-slate-700/50 px-4 py-1.5 text-xs font-bold text-slate-300 uppercase tracking-wide">
                                Next game in <span id="ready-timer" class="text-yellow-400">30</span>s
                            </div>
                        </div>
                    </div>
                </div>

                <!-- RIGHT: XP Summary -->
                <div class="flex flex-col justify-end h-full animate-slide-up" style="animation-delay: 0.2s;">
                    <div class="bg-slate-900/80 p-4 border-l-4 border-slate-600 relative overflow-hidden">
                        <div class="flex justify-between text-xs font-bold text-slate-300 mb-1">
                            <span>Match XP</span>
                            <span class="text-[#84cc16]" id="xp-match">+0</span>
                        </div>
                        <div class="h-1.5 w-full xp-bar-bg mb-2 rounded-full overflow-hidden">
                            <div id="bar-match" style="width: 0%" class="h-full bg-[#84cc16] xp-fill"></div>
                        </div>
                        <div class="flex justify-between text-xs font-bold text-slate-300 mb-1">
                            <span>Performance Bonus</span>
                            <span class="text-[#84cc16]" id="xp-bonus">+0</span>
                        </div>
                        <div class="h-1.5 w-full xp-bar-bg mb-3 rounded-full overflow-hidden">
                            <div id="bar-bonus" style="width: 0%" class="h-full bg-[#84cc16] xp-fill"></div>
                        </div>
                        <div class="flex justify-between text-sm font-bold text-white mb-2 border-t border-slate-700 pt-1">
                            <span>Total Experience</span>
                            <span class="text-yellow-400" id="xp-total">+0</span>
                        </div>
                        <button id="btn-claim-rewards" class="w-full group bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-600 hover:to-indigo-700 p-0.5 skew-x-[-5deg] transition-all transform hover:-translate-y-1">
                            <div class="bg-slate-900/30 w-full h-full px-2 py-2 flex justify-between items-center unskew-content">
                                 <div class="bg-slate-800 px-2 py-0.5 text-lg font-bold text-slate-400">1</div>
                                 <span class="font-bold text-purple-200 uppercase text-sm tracking-wide">Claim Rewards</span>
                                 <i class="fa-solid fa-gift text-yellow-400"></i>
                            </div>
                        </button>
                    </div>
                </div>

            </div>
    `;

    document.body.appendChild(this.container);

    // Setup Listeners
    this.setupTabListeners();
    document.getElementById('btn-leave')?.addEventListener('click', () => {
      this.hide();
      window.location.reload();
    });

    // Setup chat input handler
    this.setupChatHandler();

    // Setup claim rewards button
    document.getElementById('btn-claim-rewards')?.addEventListener('click', () => {
      this.showRewardsPopup();
    });
  }

  private setupChatHandler(): void {
    const chatInput = document.getElementById('end-chat-input') as HTMLInputElement;
    const chatFeed = document.getElementById('end-chat-feed');

    if (!chatInput || !chatFeed) return;

    chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const msg = chatInput.value.trim();
        if (msg) {
          this.addChatMessage('You', msg);
          chatInput.value = '';
        }
      }
    });

    // Focus chat on Enter when not in input
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement !== chatInput && this.isShowing) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          chatInput.focus();
        }
      }
    });
  }

  private addChatMessage(author: string, message: string): void {
    const chatFeed = document.getElementById('end-chat-feed');
    if (!chatFeed) return;

    const p = document.createElement('p');
    p.innerHTML = `<span class="text-blue-400 font-bold">${author}:</span> ${message}`;
    chatFeed.appendChild(p);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    // Limit to 20 messages
    while (chatFeed.children.length > 20) {
      chatFeed.removeChild(chatFeed.firstChild!);
    }
  }

  private startCountdown(): void {
    this.countdownValue = 30;
    const timerEl = document.getElementById('timer');
    const readyTimerEl = document.getElementById('ready-timer');

    // Clear any existing interval
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    this.countdownInterval = window.setInterval(() => {
      this.countdownValue--;

      if (timerEl) timerEl.textContent = this.countdownValue.toString();
      if (readyTimerEl) readyTimerEl.textContent = this.countdownValue.toString();

      if (this.countdownValue <= 0) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
        }
        // Show loading screen before restarting game
        this.showLoadingScreen();
      }
    }, 1000);
  }

  private showRewardsPopup(): void {
    // Create popup overlay
    const popup = document.createElement('div');
    popup.id = 'rewards-popup';
    popup.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[1000]';
    popup.innerHTML = `
      <div class="bg-gradient-to-b from-slate-800 to-slate-900 p-6 rounded-lg border border-purple-500/50 shadow-2xl max-w-md w-full mx-4 animate-scale-in">
        <div class="text-center mb-4">
          <i class="fa-solid fa-gift text-5xl text-yellow-400 mb-3"></i>
          <h2 class="text-2xl font-bold text-white font-orbitron">REWARDS CLAIMED!</h2>
        </div>
        <div class="space-y-3 mb-6">
          <div class="flex justify-between items-center bg-slate-700/50 p-3 rounded">
            <span class="text-slate-300">Match XP</span>
            <span class="text-green-400 font-bold">+${document.getElementById('xp-match')?.textContent || '+0'}</span>
          </div>
          <div class="flex justify-between items-center bg-slate-700/50 p-3 rounded">
            <span class="text-slate-300">Performance Bonus</span>
            <span class="text-green-400 font-bold">+${document.getElementById('xp-bonus')?.textContent || '+0'}</span>
          </div>
          <div class="flex justify-between items-center bg-purple-900/50 p-3 rounded border border-purple-500/30">
            <span class="text-purple-200 font-bold">Total XP</span>
            <span class="text-yellow-400 font-bold text-xl">${document.getElementById('xp-total')?.textContent || '+0'}</span>
          </div>
        </div>
        <button id="btn-close-rewards" class="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded transition-colors">
          CONTINUE
        </button>
      </div>
    `;

    document.body.appendChild(popup);

    // Close button handler
    document.getElementById('btn-close-rewards')?.addEventListener('click', () => {
      popup.remove();
    });

    // Click outside to close
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.remove();
      }
    });
  }

  private setupTabListeners(): void {
    const tabs = ['scoreboard', 'stats', 'weapons'];

    tabs.forEach(tab => {
      document.getElementById(`tab-btn-${tab}`)?.addEventListener('click', () => {
        this.switchTab(tab);
      });
    });
  }

  private switchTab(tabId: string): void {
    // Hide all views
    document.getElementById('view-scoreboard')?.classList.add('hidden');
    document.getElementById('view-scoreboard')?.classList.remove('flex');
    document.getElementById('view-stats')?.classList.add('hidden');
    document.getElementById('view-weapons')?.classList.add('hidden');

    // Deactivate all buttons
    document.getElementById('tab-btn-scoreboard')?.classList.remove('active');
    document.getElementById('tab-btn-stats')?.classList.remove('active');
    document.getElementById('tab-btn-weapons')?.classList.remove('active');

    // Show target view
    const targetView = document.getElementById('view-' + tabId);
    if (targetView) {
      targetView.classList.remove('hidden');
      if (tabId === 'scoreboard') targetView.classList.add('flex');
    }

    // Activate target button
    document.getElementById('tab-btn-' + tabId)?.classList.add('active');
  }

  // --- Main Logic ---

  public show(stats: GameStatistics, audio?: any): void {
    if (!this.container || this.isShowing) return;

    this.isShowing = true;
    this.container.classList.remove('hidden');

    // Play victory/defeat audio if provided
    if (audio && typeof audio.play === 'function') {
      audio.play();
    }

    this.initParticles();
    this.renderScoreboard(stats); // Pass stats to render
    this.renderStats(stats);
    this.renderWeapons(stats);

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    // Start the countdown timer
    this.startCountdown();
  }

  public hide(): void {
    if (!this.container) return;
    this.isShowing = false;
    this.container.classList.add('hidden');

    // Clear countdown timer
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private showLoadingScreen(): void {
    // Create loading screen overlay
    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'loading-screen-overlay';
    loadingScreen.className = 'fixed inset-0 z-[2000] flex items-center justify-center bg-black';
    loadingScreen.innerHTML = `
      <div class="loading-image-container">
        <img src="/assets/images/loadingScreen.png" alt="Loading" class="loading-image" />
      </div>
    `;

    // Add styles for zoom-in animation
    const style = document.createElement('style');
    style.textContent = `
      .loading-image-container {
        width: 100%;
        height: 100%;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .loading-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        animation: zoomIn 3s ease-out forwards;
      }
      
      @keyframes zoomIn {
        0% {
          transform: scale(1);
        }
        100% {
          transform: scale(1.2);
        }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(loadingScreen);

    // Reload after animation completes
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  }

  private initParticles(): void {
    const container = document.getElementById('background-layer');
    if (!container) return;

    // Clear existing particles to prevent buildup
    const existingParticles = container.querySelectorAll('.particle');
    existingParticles.forEach(p => p.remove());

    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 5 + 's';
      p.style.animationDuration = (10 + Math.random() * 20) + 's';
      container.appendChild(p);
    }
  }

  private renderScoreboard(stats: GameStatistics): void {
    const container = document.getElementById('scoreboard-rows');
    if (!container) return;
    container.innerHTML = '';

    // Use actual player data from stats.allPlayers, sorted by kills
    const players = (stats.allPlayers || []).sort((a, b) => b.kills - a.kills);

    players.forEach((p, i) => {
      const accentColor = p.team === "blue" ? "bg-blue-500" : "bg-red-500";
      const animClass = i % 2 === 0 ? 'row-animate-left' : 'row-animate-right';
      const placement = i + 1; // Calculate placement from sorted position

      const row = document.createElement('div');
      row.className = `flex w-full items-stretch h-14 relative scoreboard-row group cursor-pointer opacity-0 ${animClass}`;
      row.style.animationDelay = `${i * 100}ms`;

      row.innerHTML = `
            <div class="w-3 ${accentColor} skew-x-[-15deg] mr-2 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
            <div class="flex-1 bg-slate-800/80 skew-x-[-15deg] flex items-center pr-8 pl-4 border-b border-white/5 relative overflow-hidden">
                ${p.isMe ? '<div class="absolute inset-0 bg-gradient-to-r from-blue-900/40 to-transparent pointer-events-none"></div>' : ''}
                <div class="unskew-content flex w-full items-center text-sm font-bold">
                    <div class="w-1/3 flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-slate-600 overflow-hidden border border-slate-500 shadow-lg">
                            <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=${p.name}" class="w-full h-full object-cover">
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-white text-base tracking-wide">${p.name}</span>
                            ${p.isMe ? '<span class="bg-orange-500 text-black text-[10px] px-1.5 py-0.5 font-black rounded uppercase">YOU</span>' : ''}
                            ${placement === 1 ? '<i class="fa-solid fa-crown text-yellow-400 text-xs"></i>' : ''}
                        </div>
                    </div>
                    <div class="w-10 text-center text-white text-lg">${p.kills}</div>
                    <div class="w-2 text-center text-slate-600">/</div>
                    <div class="w-10 text-center text-slate-400 text-lg">${p.deaths}</div>
                    <div class="w-2 text-center text-slate-600">/</div>
                    <div class="w-10 text-center text-slate-400 text-lg">${p.assists}</div>
                    <div class="w-24 text-center text-slate-300 hidden md:block">${p.headshots}</div>
                    <div class="w-24 text-center text-slate-300 hidden md:block">${Math.round(p.damageDealt)}</div>
                    <div class="w-24 text-center text-green-400 drop-shadow-sm hidden md:block">${p.accuracy.toFixed(1)}%</div>
                    <div class="w-24 text-right text-yellow-400 text-xl font-orbitron tracking-wider">0</div>
                </div>
            </div>
            <div class="w-16 ml-2 bg-slate-800/80 skew-x-[-15deg] flex items-center justify-center border-b border-white/5">
                <div class="unskew-content text-4xl font-black text-yellow-600/40 group-hover:text-yellow-500/80 transition-colors rank-number italic">${placement}</div>
            </div>
        `;
      container.appendChild(row);

      if (p.isMe) {
        this.populateXP(stats);
        this.updateMatchHeader(stats);
      }
    });
  }

  private renderStats(stats: GameStatistics): void {
    const container = document.getElementById('view-stats')?.firstElementChild;
    if (!container) return;
    container.innerHTML = ''; // Clear previous

    const metrics = [
      { label: 'K/D Ratio', value: stats.kdRatio.toFixed(2), unit: '', icon: 'fa-scale-balanced', color: 'text-yellow-400' },
      { label: 'Kills / Min', value: stats.killsPerMinute.toFixed(2), unit: '', icon: 'fa-stopwatch', color: 'text-blue-400' },
      { label: 'Longest Streak', value: stats.longestKillStreak, unit: '', icon: 'fa-fire', color: 'text-red-500' },
      { label: 'Suicides', value: stats.suicides, unit: '', icon: 'fa-skull', color: 'text-slate-500' },

      { label: 'Damage Taken', value: Math.round(stats.damageTaken), unit: '', icon: 'fa-shield-heart', color: 'text-red-400' },
      { label: 'Max Dmg / Life', value: Math.round(stats.highestDamageInOneLife), unit: '', icon: 'fa-burst', color: 'text-orange-400' },
      { label: 'Time Alive', value: this.formatTime(stats.timeAlive), unit: '', icon: 'fa-hourglass-half', color: 'text-cyan-400' },
      { label: 'Avg Life Time', value: Math.round(stats.averageLifeTime), unit: 's', icon: 'fa-heart-pulse', color: 'text-emerald-400' },

      { label: 'Shots Fired', value: stats.shotsFired, unit: '', icon: 'fa-crosshairs', color: 'text-slate-400' },
      { label: 'Shots Hit', value: stats.shotsHit, unit: '', icon: 'fa-bullseye', color: 'text-green-500' },
      { label: 'Distance', value: Math.round(stats.distanceTraveled), unit: 'm', icon: 'fa-person-running', color: 'text-indigo-400' },
      { label: 'Health Packs', value: stats.healthPacksCollected, unit: '', icon: 'fa-briefcase-medical', color: 'text-pink-400' }
    ];

    metrics.forEach((m, i) => {
      const tile = document.createElement('div');
      tile.className = "stat-tile p-4 skew-box relative overflow-hidden group opacity-0";
      tile.style.animation = `fadeIn 0.5s ease-out forwards ${i * 50}ms`;
      tile.innerHTML = `
            <div class="unskew-content flex flex-col items-center justify-center h-full relative z-10">
                <i class="fa-solid ${m.icon} text-2xl mb-2 opacity-50 group-hover:opacity-100 transition-opacity ${m.color}"></i>
                <span class="text-xs uppercase tracking-widest text-slate-400 font-bold">${m.label}</span>
                <span class="text-3xl font-orbitron font-bold text-white mt-1 group-hover:scale-110 transition-transform">${m.value}<span class="text-sm text-slate-500 ml-1">${m.unit}</span></span>
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
        `;
      container.appendChild(tile);
    });
  }

  private renderWeapons(stats: GameStatistics): void {
    const container = document.getElementById('view-weapons')?.firstElementChild;
    if (!container) return;
    container.innerHTML = '';

    let i = 0;
    stats.weaponStats.forEach((w, name) => {
      const acc = w.shots > 0 ? ((w.hits / w.shots) * 100).toFixed(1) : 0;
      const row = document.createElement('div');
      row.className = "skew-box bg-slate-800/60 p-4 border-l-4 border-yellow-500 mb-2 opacity-0";
      row.style.animation = `rowSlideInRight 0.5s ease-out forwards ${i * 100}ms`;
      row.innerHTML = `
            <div class="unskew-content flex items-center justify-between">
                <div class="flex items-center gap-4 w-1/3">
                    <div class="bg-slate-900 p-2 rounded border border-slate-700">
                        <i class="fa-solid fa-gun text-slate-300"></i>
                    </div>
                    <span class="font-bold text-xl text-yellow-400 uppercase tracking-widest">${name}</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 flex-1 text-center">
                    <div><div class="text-xs text-slate-500 uppercase">Kills</div><div class="text-xl font-bold">${w.kills}</div></div>
                    <div><div class="text-xs text-slate-500 uppercase">Accuracy</div><div class="text-xl font-bold text-green-400">${acc}%</div></div>
                    <div><div class="text-xs text-slate-500 uppercase">Headshots</div><div class="text-xl font-bold text-red-400">${w.headshots}</div></div>
                    <div><div class="text-xs text-slate-500 uppercase">Damage</div><div class="text-xl font-bold text-blue-400">${Math.round(w.damage)}</div></div>
                </div>
            </div>
        `;
      container.appendChild(row);
      i++;
    });
  }

  private updateMatchHeader(stats: GameStatistics): void {
    const resultBadge = document.getElementById('result-badge');
    const resultText = document.getElementById('match-result');

    if (resultText && resultBadge) {
      if (stats.placement === 1) {
        resultText.innerText = "VICTORY";
        resultText.classList.add('text-yellow-400');
      } else {
        resultText.innerText = "DEFEAT";
        resultText.classList.remove('text-yellow-400');
        resultText.classList.add('text-red-500');
        resultBadge.classList.remove('bg-blue-600/90');
        resultBadge.classList.add('bg-red-900/90');
      }
    }

    const timeEl = document.getElementById('match-time');
    if (timeEl) {
      timeEl.innerText = this.formatTime(stats.duration);
    }
  }

  private populateXP(stats: GameStatistics): void {
    const matchXP = Math.floor(stats.totalScore * 0.1);
    const bonusXP = Math.floor(stats.kills * 10 + stats.headshotKills * 5);
    const totalXP = matchXP + bonusXP;

    this.animateValue("xp-match", 0, matchXP, 1000);
    this.animateValue("xp-bonus", 0, bonusXP, 1000);
    this.animateValue("xp-total", 0, totalXP, 1500);

    setTimeout(() => {
      const bar = document.getElementById('bar-match');
      if (bar) bar.style.width = '70%';
    }, 500);
    setTimeout(() => {
      const bar = document.getElementById('bar-bonus');
      if (bar) bar.style.width = '45%';
    }, 800);
  }

  private animateValue(id: string, start: number, end: number, duration: number): void {
    const obj = document.getElementById(id);
    if (!obj) return;

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      obj.innerHTML = "+" + Math.floor(progress * (end - start) + start);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}