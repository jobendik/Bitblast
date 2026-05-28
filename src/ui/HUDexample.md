<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AAA Tactical HUD</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
    
    <style>
        /* --- CORE THEME --- */
        :root {
            /* Palette: Tactical Cyan & Alert Red */
            --c-primary: #00f2ff;
            --c-primary-dim: rgba(0, 242, 255, 0.1);
            
            --c-health-high: #00ffa3;
            --c-health-low: #ff3333;
            
            --c-shield: #00a8ff;
            
            --c-bg-glass: rgba(10, 15, 20, 0.85);
            --c-bg-dark: #050505;
            
            --font-head: 'Teko', sans-serif;
            --font-mono: 'Rajdhani', monospace;
            
            --skew-deg: -12deg;
        }

        body {
            margin: 0; padding: 0;
            height: 100vh; width: 100vw;
            overflow: hidden;
            background: radial-gradient(circle at center, #1a202c 0%, #000000 100%);
            font-family: var(--font-mono);
            color: white;
            user-select: none;
        }

        /* --- UTILITY & FX --- */
        .hud-panel {
            background: var(--c-bg-glass);
            backdrop-filter: blur(4px);
            border: 1px solid rgba(255,255,255,0.08);
            transform: skewX(var(--skew-deg));
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        
        .hud-content {
            transform: skewX(calc(var(--skew-deg) * -1)); /* Counter-skew text */
        }

        .text-glow { text-shadow: 0 0 10px currentColor; }
        
        /* Scanlines Overlay */
        .scanlines {
            position: fixed; inset: 0; pointer-events: none; z-index: 10;
            background: repeating-linear-gradient(
                0deg,
                rgba(0,0,0,0.1) 0px,
                rgba(0,0,0,0.1) 1px,
                transparent 1px,
                transparent 2px
            );
            mask-image: radial-gradient(circle, white 60%, transparent 100%);
        }

        /* Vignette */
        .vignette {
            position: fixed; inset: 0; pointer-events: none; z-index: 5;
            background: radial-gradient(circle, transparent 50%, rgba(0,0,0,0.8) 100%);
        }

        /* --- COMPONENTS --- */

        /* 1. LEADERBOARD (Top Left) */
        .leaderboard {
            position: absolute; top: 2rem; left: 2rem;
            display: flex; flex-direction: column; gap: 0.5rem;
            width: 280px;
        }
        .lb-card {
            display: flex; align-items: center;
            padding: 0.25rem 1rem;
            border-left: 4px solid transparent;
            transition: all 0.3s ease;
        }
        .lb-card.active {
            background: linear-gradient(90deg, rgba(255,255,255,0.1) 0%, transparent 100%);
            border-left-color: var(--c-primary);
        }
        .lb-card.dead { opacity: 0.5; filter: grayscale(1); }

        /* 2. STATS (Kill/Headshot) - Floating, Minimal */
        .stats-panel {
            display: flex; gap: 1rem;
            margin-top: 0.25rem;
            padding-left: 0.5rem; /* Slight indentation */
        }
        .stat-block {
            /* Minimal styling: No BG, No Border */
            display: flex; flex-direction: column; 
            transform: skewX(var(--skew-deg));
        }

        /* NEW: KILLFEED (Top Right) */
        .killfeed-container {
            position: absolute; top: 2rem; right: 2rem;
            width: 350px;
            display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;
            pointer-events: none;
            overflow: hidden;
            padding-bottom: 2rem; /* Space for fades */
        }
        
        .kf-item {
            background: linear-gradient(90deg, transparent 0%, rgba(10, 15, 20, 0.9) 100%);
            border-right: 3px solid var(--c-primary); /* Default Team Kill */
            padding: 0.25rem 1rem;
            transform: skewX(var(--skew-deg));
            display: flex; align-items: center; justify-content: flex-end;
            min-width: 240px;
            animation: slideInRight 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            transition: opacity 0.5s, transform 0.5s;
        }
        .kf-item.enemy { border-right-color: var(--c-health-low); }
        .kf-item.fade-out { opacity: 0; transform: skewX(var(--skew-deg)) translateX(20px); }

        .kf-content {
            transform: skewX(calc(var(--skew-deg) * -1));
            display: flex; align-items: center; gap: 0.5rem;
            font-weight: 600; font-size: 0.9rem; text-shadow: 0 1px 2px black;
        }
        .icon-skull { width: 14px; height: 14px; fill: white; opacity: 0.8; }
        .icon-hs { fill: var(--c-health-low); width: 16px; height: 16px; }

        /* 3. VITALS (Bottom Left) - The "Hero" Element */
        .vitals-area {
            position: absolute; bottom: 2rem; left: 3rem;
            display: flex; flex-direction: column; gap: 0.5rem;
        }

        .hp-bar-container {
            width: 400px; height: 32px;
            background: rgba(0,0,0,0.6);
            border: 1px solid rgba(255,255,255,0.1);
            position: relative;
            overflow: hidden;
        }
        .hp-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--c-health-high), #00cc82);
            width: 100%;
            box-shadow: 0 0 20px var(--c-health-high);
            transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }
        /* Striped Pattern on HP */
        .hp-fill::after {
            content: ''; position: absolute; inset: 0;
            background-size: 10px 10px;
            background-image: linear-gradient(45deg, rgba(0,0,0,0.2) 25%, transparent 25%, transparent 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2) 75%, transparent 75%, transparent);
        }

        .shield-bar-container {
            width: 300px; height: 12px;
            background: rgba(0,0,0,0.6);
            border: 1px solid rgba(255,255,255,0.1);
            display: flex; gap: 2px; padding: 2px;
        }
        .shield-segment {
            flex: 1; background: var(--c-shield); opacity: 0.3;
            transition: opacity 0.2s;
        }
        .shield-segment.active { opacity: 1; box-shadow: 0 0 8px var(--c-shield); }

        /* 4. WEAPON (Bottom Right) */
        .weapon-area {
            position: absolute; bottom: 2rem; right: 3rem;
            display: flex; flex-direction: column; align-items: flex-end;
            gap: 1rem;
        }

        /* Removed old weapon-list/card styles */
        
        .weapon-name-display {
            font-family: var(--font-head);
            font-size: 2.5rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: white;
            text-shadow: 0 2px 10px rgba(0,0,0,0.8);
            line-height: 1;
            margin-bottom: 0px;
        }

        /* Ammo Section */
        .ammo-container {
            display: flex; flex-direction: column; align-items: flex-end;
            transform: skewX(var(--skew-deg));
            background: linear-gradient(270deg, rgba(0,0,0,0.6) 0%, transparent 100%);
            padding: 0.5rem 1.5rem;
            border-right: 4px solid var(--c-primary);
            position: relative;
        }
        
        .ammo-content-wrapper {
             transform: skewX(calc(var(--skew-deg) * -1));
             display: flex; flex-direction: column; align-items: flex-end;
        }

        .ammo-display {
            font-family: var(--font-head);
            line-height: 0.8;
            display: flex; align-items: baseline; gap: 0.5rem;
        }

        /* Ammo Bar */
        .ammo-bar-track {
            width: 200px; height: 6px;
            background: rgba(255,255,255,0.1);
            margin-top: 0.5rem;
            position: relative;
            overflow: hidden;
        }
        .ammo-bar-fill {
            height: 100%;
            background: var(--c-primary);
            width: 100%;
            transition: width 0.1s linear;
            box-shadow: 0 0 10px var(--c-primary);
        }
        
        .fire-mode {
            font-size: 0.9rem; letter-spacing: 0.2em; color: var(--c-primary);
            margin-bottom: 0.25rem; opacity: 0.8; font-weight: 600;
        }

        /* 5. CHAT (Above Vitals) */
        .chat-container {
            position: absolute; bottom: 180px; left: 3rem;
            width: 350px;
            display: flex; flex-direction: column; gap: 0.5rem;
            mask-image: linear-gradient(to bottom, transparent, black 20%);
        }
        .chat-msg {
            padding: 4px 8px;
            background: linear-gradient(90deg, rgba(0,0,0,0.8) 0%, transparent 100%);
            border-left: 2px solid transparent;
            font-size: 0.9rem; text-shadow: 0 1px 2px black;
            animation: slideIn 0.3s ease-out;
        }
        .chat-input {
            background: rgba(0,0,0,0.5);
            border: none; border-left: 2px solid var(--c-primary);
            color: white; padding: 4px 8px; font-family: var(--font-mono);
            outline: none; width: 100%;
        }

        /* Animations */
        @keyframes slideIn { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideInRight { from { transform: skewX(var(--skew-deg)) translateX(50px); opacity: 0; } to { transform: skewX(var(--skew-deg)) translateX(0); opacity: 1; } }
        .pulse-crit { animation: pulseRed 1s infinite; }
        @keyframes pulseRed { 0%,100% { box-shadow: 0 0 20px red; } 50% { box-shadow: 0 0 50px red; } }
        
        /* Hit Marker FX */
        .hit-marker {
            position: absolute; top: 50%; left: 50%;
            width: 40px; height: 40px;
            border: 2px solid white;
            transform: translate(-50%, -50%) rotate(45deg);
            opacity: 0; pointer-events: none;
        }
        .hit-active { animation: hitFlash 0.1s ease-out; }
        @keyframes hitFlash { 0% { opacity: 1; transform: translate(-50%, -50%) rotate(45deg) scale(0.5); } 100% { opacity: 0; transform: translate(-50%, -50%) rotate(45deg) scale(1.5); } }

    </style>
</head>
<body>

    <div class="vignette"></div>
    <div class="scanlines"></div>
    
    <!-- HIT MARKER -->
    <div id="hit-marker" class="hit-marker"></div>

    <!-- 1. LEADERBOARD -->
    <div class="leaderboard">
        <div class="hud-panel lb-card active">
            <div class="hud-content flex items-center justify-between w-full">
                <div class="flex items-center gap-3">
                    <span class="text-[var(--c-primary)] font-bold">1</span>
                    <span class="font-bold tracking-widest uppercase">Cyber.Ninja</span>
                </div>
                <div class="text-xs bg-[var(--c-primary)] text-black px-1 font-bold">LEADER</div>
            </div>
        </div>
        <div class="hud-panel lb-card">
            <div class="hud-content flex items-center justify-between w-full text-white/70">
                <div class="flex items-center gap-3">
                    <span class="font-bold">2</span>
                    <span class="tracking-widest uppercase">Viper_X</span>
                </div>
            </div>
        </div>
        <div class="hud-panel lb-card dead">
            <div class="hud-content flex items-center justify-between w-full text-red-500">
                <div class="flex items-center gap-3">
                    <span class="font-bold">3</span>
                    <span class="tracking-widest uppercase decoration-line-through">NoobMaster</span>
                </div>
                <div class="text-[10px] border border-red-500 px-1">KIA</div>
            </div>
        </div>

        <!-- STATS: No BG, Minimal, Transparent -->
        <div class="stats-panel">
            <div class="stat-block">
                <div class="hud-content">
                    <div class="text-[10px] text-white/40 tracking-[0.2em] uppercase leading-tight">Kills</div>
                    <div class="text-xl font-[var(--font-head)] leading-none text-white drop-shadow-md" id="stat-kills">12</div>
                </div>
            </div>
            <div class="stat-block">
                <div class="hud-content">
                    <div class="text-[10px] text-white/40 tracking-[0.2em] uppercase leading-tight">Headshots</div>
                    <div class="text-xl font-[var(--font-head)] leading-none text-[var(--c-health-low)] drop-shadow-md" id="stat-hs">4</div>
                </div>
            </div>
        </div>
    </div>

    <!-- KILLFEED -->
    <div class="killfeed-container" id="killfeed">
        <!-- JS Injected Items -->
    </div>

    <!-- 3. CHAT AREA -->
    <div class="chat-container">
        <div id="chat-feed" class="flex flex-col gap-1 h-32 overflow-hidden justify-end">
            <!-- JS will pop msgs here -->
        </div>
        <div class="hud-panel p-0">
            <input type="text" id="chat-input" class="hud-content chat-input" placeholder="Type to chat..." autocomplete="off">
        </div>
    </div>

    <!-- 4. VITALS (Bottom Left) -->
    <div class="vitals-area">
        <!-- Text Info -->
        <div class="flex items-end gap-2 mb-1 hud-content">
            <span class="text-6xl font-[var(--font-head)] font-bold leading-none text-white drop-shadow-md" id="hp-text">100</span>
            <span class="text-xl text-[var(--c-primary)] font-bold tracking-widest mb-1">HP</span>
        </div>

        <!-- Shield Bar (Segments) -->
        <div class="hud-panel shield-bar-container" id="shield-container">
            <!-- 5 Segments for 100 Armor -->
            <div class="shield-segment active"></div>
            <div class="shield-segment active"></div>
            <div class="shield-segment active"></div>
            <div class="shield-segment active"></div>
            <div class="shield-segment opacity-30"></div> 
        </div>

        <!-- Health Bar (Solid) -->
        <div class="hud-panel hp-bar-container">
            <div id="hp-bar" class="hp-fill"></div>
        </div>
        
        <!-- Stamina (Small line below) -->
        <div class="w-[400px] h-1 bg-gray-800 mt-1 relative skew-x-[-12deg]">
             <div id="stamina-bar" class="absolute inset-0 bg-yellow-400 w-full transition-all duration-75"></div>
        </div>
    </div>

    <!-- 5. WEAPON & AMMO (Bottom Right) -->
    <div class="weapon-area">
        
        <!-- Updated: No Icons, just name display -->
        <div class="ammo-container">
            <div class="ammo-content-wrapper">
                <div class="weapon-name-display" id="weapon-name">AK-47</div>
                <div class="fire-mode" id="fire-mode">FULL AUTO</div>
                
                <div class="ammo-display">
                    <div class="text-[var(--c-primary)] text-6xl font-bold drop-shadow-md leading-none" id="ammo-count">30</div>
                    <div class="text-2xl text-white/40">/ <span id="ammo-reserve">90</span></div>
                </div>

                <div class="ammo-bar-track">
                    <div class="ammo-bar-fill" id="ammo-bar"></div>
                </div>

                <!-- Reload Warning -->
                <div id="reload-warning" class="text-[var(--c-health-low)] font-bold tracking-[0.3em] text-xs mt-2 opacity-0 transition-opacity absolute bottom-[-20px] right-0 w-full text-right">
                    RELOAD
                </div>
            </div>
        </div>
    </div>

    <script>
        // --- CONFIG ---
        const weapons = [
            { name: "AK-47", clip: 30, max: 30, reserve: 90, mode: "AUTOMATIC" },
            { name: "AWP", clip: 5, max: 10, reserve: 30, mode: "BOLT ACTION" },
            { name: "LMG", clip: 100, max: 100, reserve: 200, mode: "AUTOMATIC" },
            { name: "M4", clip: 30, max: 30, reserve: 90, mode: "AUTOMATIC" },
            { name: "PISTOL", clip: 12, max: 12, reserve: 48, mode: "SEMI-AUTO" },
            { name: "SCAR", clip: 20, max: 20, reserve: 60, mode: "AUTOMATIC" },
            { name: "SHOTGUN", clip: 7, max: 7, reserve: 28, mode: "PUMP ACTION" },
            { name: "SNIPER RIFLE", clip: 10, max: 10, reserve: 30, mode: "SEMI-AUTO" },
            { name: "TEC-9", clip: 24, max: 24, reserve: 120, mode: "SEMI-AUTO" }
        ];

        let state = {
            hp: 100,
            armor: 75,
            stamina: 100,
            kills: 12,
            headshots: 4,
            wepIdx: 0,
            isReloading: false
        };

        // --- DOM ELEMENTS ---
        const els = {
            hpText: document.getElementById('hp-text'),
            hpBar: document.getElementById('hp-bar'),
            shieldContainer: document.getElementById('shield-container'),
            staminaBar: document.getElementById('stamina-bar'),
            ammoCount: document.getElementById('ammo-count'),
            ammoReserve: document.getElementById('ammo-reserve'),
            ammoBar: document.getElementById('ammo-bar'),
            weaponName: document.getElementById('weapon-name'),
            fireMode: document.getElementById('fire-mode'),
            reloadWarn: document.getElementById('reload-warning'),
            killStat: document.getElementById('stat-kills'),
            hsStat: document.getElementById('stat-hs'),
            chatFeed: document.getElementById('chat-feed'),
            chatInput: document.getElementById('chat-input'),
            hitMarker: document.getElementById('hit-marker'),
            killFeed: document.getElementById('killfeed')
        };
        
        // --- RENDER FUNCTIONS ---
        
        function updateVitals() {
            // HP
            els.hpText.innerText = Math.ceil(state.hp);
            els.hpBar.style.width = `${state.hp}%`;
            
            // Color Shift on Low HP
            if(state.hp < 30) {
                els.hpBar.style.background = 'var(--c-health-low)';
                els.hpBar.style.boxShadow = '0 0 20px var(--c-health-low)';
            } else {
                els.hpBar.style.background = 'linear-gradient(90deg, var(--c-health-high), #00cc82)';
                els.hpBar.style.boxShadow = '0 0 20px var(--c-health-high)';
            }

            // Armor (5 segments, 20hp each)
            const segments = els.shieldContainer.children;
            const activeSegments = Math.ceil(state.armor / 20);
            for(let i=0; i<5; i++) {
                if(i < activeSegments) segments[i].classList.add('active');
                else segments[i].classList.remove('active');
            }
            
            // Stamina
            els.staminaBar.style.width = `${state.stamina}%`;
        }

        function updateWeapon() {
            const wep = weapons[state.wepIdx];
            
            // Update Text Elements
            els.weaponName.innerText = wep.name;
            els.fireMode.innerText = wep.mode;

            // Ammo
            els.ammoCount.innerText = state.isReloading ? 'REL' : wep.clip;
            els.ammoReserve.innerText = wep.reserve;

            // Ammo Bar Width
            const pct = (wep.clip / wep.max) * 100;
            els.ammoBar.style.width = `${pct}%`;
            
            // Color Logic
            if(wep.clip <= wep.max * 0.3) {
                els.ammoCount.style.color = 'var(--c-health-low)';
                els.ammoBar.style.background = 'var(--c-health-low)';
                els.ammoBar.style.boxShadow = '0 0 10px var(--c-health-low)';
                els.reloadWarn.style.opacity = 1;
                els.ammoContainer.style.borderRightColor = 'var(--c-health-low)';
            } else {
                els.ammoCount.style.color = 'var(--c-primary)';
                els.ammoBar.style.background = 'var(--c-primary)';
                els.ammoBar.style.boxShadow = '0 0 10px var(--c-primary)';
                els.reloadWarn.style.opacity = 0;
                // Since ammoContainer isn't an element in els, we need to query it or add it
                document.querySelector('.ammo-container').style.borderRightColor = 'var(--c-primary)';
            }
        }

        function addChat(name, msg, type='system') {
            const div = document.createElement('div');
            div.className = 'chat-msg';
            
            let color = 'text-gray-400';
            if(type === 'player') color = 'text-[var(--c-primary)]';
            if(type === 'enemy') color = 'text-[var(--c-health-low)]';
            
            div.innerHTML = `<span class="font-bold ${color}">${name}:</span> <span class="text-white/80">${msg}</span>`;
            els.chatFeed.appendChild(div);
            els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
        }

        // --- KILLFEED LOGIC ---
        function addKill(killer, victim, weapon, isHs, isPlayerKill = false) {
            const div = document.createElement('div');
            const typeClass = isPlayerKill ? '' : 'enemy'; 
            
            div.className = `kf-item ${typeClass}`;
            
            // Icons
            const iconSkull = `<svg class="icon-skull" viewBox="0 0 24 24"><path d="M12 2c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10-4.48-10-10-10zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-5.5l2-2 2 2 1.5-1.5-3.5-3.5-2 2-1.5-1.5-2 2 2 2 1.5 1.5 2 2 2-2z"/></svg>`; 
            const iconHs = isHs ? `<svg class="icon-hs" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-5.5l2-2 2 2 1.5-1.5L13.5 11l2-2-1.5-1.5-2 2-2-2-1.5 1.5 2 2-2 2z"/></svg>` : '';

            // Colors
            const killerColor = isPlayerKill ? 'text-[var(--c-primary)]' : 'text-white/70';
            const victimColor = isPlayerKill ? 'text-[var(--c-health-low)]' : 'text-[var(--c-health-low)]';

            div.innerHTML = `
                <div class="kf-content">
                    <span class="${killerColor} tracking-wider">${killer}</span>
                    ${iconHs}
                    <div class="opacity-50 text-[10px] tracking-widest uppercase">[${weapon}]</div>
                    ${iconSkull}
                    <span class="${victimColor} tracking-wider">${victim}</span>
                </div>
            `;

            els.killFeed.appendChild(div);
            
            setTimeout(() => {
                div.classList.add('fade-out');
                setTimeout(() => { if(div.parentNode) div.remove(); }, 500);
            }, 5000);
        }

        // --- GAMEPLAY LOGIC ---

        function shoot() {
            const wep = weapons[state.wepIdx];
            if(state.isReloading) return;

            if(wep.clip > 0) {
                wep.clip--;
                
                // Hit Marker Logic (Simulated)
                if(Math.random() > 0.7) {
                    const isHs = Math.random() > 0.7;
                    els.hitMarker.classList.remove('hit-active');
                    void els.hitMarker.offsetWidth;
                    els.hitMarker.style.borderColor = isHs ? 'red' : 'white';
                    els.hitMarker.classList.add('hit-active');
                    
                    if(Math.random() > 0.8) {
                        state.kills++;
                        if(isHs) state.headshots++;
                        els.killStat.innerText = state.kills;
                        els.hsStat.innerText = state.headshots;
                        
                        const enemyName = `Enemy_${Math.floor(Math.random()*99)}`;
                        addKill('Cyber.Ninja', enemyName, wep.name, isHs, true);
                    }
                }
                
                updateWeapon();
            }
        }

        function reload() {
            const wep = weapons[state.wepIdx];
            if(wep.clip < wep.max && wep.reserve > 0 && !state.isReloading) {
                state.isReloading = true;
                updateWeapon();
                
                setTimeout(() => {
                    const needed = wep.max - wep.clip;
                    const take = Math.min(needed, wep.reserve);
                    wep.clip += take;
                    wep.reserve -= take;
                    state.isReloading = false;
                    updateWeapon();
                }, 1200);
            }
        }

        function takeDamage() {
            const dmg = 20;
            if (state.armor > 0) {
                state.armor = Math.max(0, state.armor - (dmg * 0.5));
                state.hp = Math.max(0, state.hp - (dmg * 0.5));
            } else {
                state.hp = Math.max(0, state.hp - dmg);
            }
            updateVitals();
        }

        function heal() {
            state.hp = Math.min(100, state.hp + 20);
            state.armor = Math.min(100, state.armor + 10);
            updateVitals();
        }

        // --- INPUTS ---
        window.addEventListener('keydown', (e) => {
            if(document.activeElement === els.chatInput) {
                if(e.key === 'Enter') {
                    const txt = els.chatInput.value.trim();
                    if(txt) {
                        addChat('Cyber.Ninja', txt, 'player');
                        els.chatInput.value = '';
                    }
                }
                return;
            }

            if(e.code === 'Space') shoot();
            if(e.code === 'KeyR') reload();
            if(e.code === 'KeyD') takeDamage();
            if(e.code === 'KeyH') heal();
            
            // Map 1-9 to weapons
            if(e.key >= '1' && e.key <= '9') {
                const idx = parseInt(e.key) - 1;
                if(idx < weapons.length) {
                    state.wepIdx = idx;
                    updateWeapon();
                }
            }
        });

        // Chat Focus Key
        window.addEventListener('keydown', (e) => {
            if(e.key === 'Enter' && document.activeElement !== els.chatInput) {
                e.preventDefault();
                els.chatInput.focus();
            }
        });

        // Loop
        setInterval(() => {
            state.stamina = Math.min(100, state.stamina + 1);
            updateVitals();
        }, 50);

        // Simulation Loop
        setInterval(() => {
            if(Math.random() > 0.7) {
                const names = ['Viper_X', 'NoobMaster', 'Ghost', 'Spectre', 'Reaper', 'Rookie'];
                const killer = names[Math.floor(Math.random() * names.length)];
                let victim = names[Math.floor(Math.random() * names.length)];
                while(victim === killer) victim = names[Math.floor(Math.random() * names.length)];
                
                const randWep = weapons[Math.floor(Math.random() * weapons.length)].name;
                const isHs = Math.random() > 0.8;
                
                addKill(killer, victim, randWep, isHs, false);
            }
        }, 2000);

        // Init
        addChat('System', 'Match Started - Search and Destroy', 'system');
        addChat('TeamLeader', 'Everyone rush A site!', 'player');
        updateVitals();
        updateWeapon();

    </script>
</body>
</html>