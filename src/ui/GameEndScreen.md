<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FPS Round Summary</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        body {
            margin: 0;
            overflow: hidden;
            background-color: #0f172a;
            font-family: 'Rajdhani', sans-serif;
            color: white;
        }

        /* --- BACKGROUND STYLES --- */
        #background-layer {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            z-index: 0;
            overflow: hidden;
        }

        /* 1. Blurred Map Image with Slow Pan */
        .bg-image {
            position: absolute;
            top: -10%; left: -10%; width: 120%; height: 120%;
            background-image: url('https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=2070&auto=format&fit=crop'); /* Sci-fi/Gaming Vibe */
            background-size: cover;
            background-position: center;
            filter: blur(8px) brightness(0.4);
            animation: bgPan 60s ease-in-out infinite alternate;
        }

        @keyframes bgPan {
            0% { transform: scale(1) translate(0, 0); }
            100% { transform: scale(1.1) translate(-2%, -2%); }
        }

        /* 2. Tech Grid Overlay */
        .tech-grid {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background-image: 
                linear-gradient(rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.4) 100%),
                repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(6, 182, 212, 0.03) 1px, rgba(6, 182, 212, 0.03) 2px);
            background-size: 100% 100%, 100% 4px;
            pointer-events: none;
        }

        /* 3. Vignette */
        .vignette {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: radial-gradient(circle at center, transparent 40%, #0f172a 100%);
            pointer-events: none;
        }

        /* 4. CSS Particles */
        .particle {
            position: absolute;
            width: 4px; height: 4px;
            background: rgba(234, 179, 8, 0.3); /* Gold dust */
            border-radius: 50%;
            animation: floatUp linear infinite;
        }
        @keyframes floatUp {
            0% { transform: translateY(100vh) scale(0); opacity: 0; }
            50% { opacity: 0.6; }
            100% { transform: translateY(-10vh) scale(1); opacity: 0; }
        }

        /* --- UI STYLES --- */

        /* Skew Utilities */
        .skew-x-20 { transform: skewX(-20deg); }
        .unskew-x-20 { transform: skewX(20deg); }
        
        .skew-box {
            transform: skewX(-15deg);
        }
        .unskew-content {
            transform: skewX(15deg);
        }

        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }

        /* Animations */
        @keyframes slideDown {
            from { transform: translateY(-100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .animate-slide-down { animation: slideDown 0.5s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.5s ease-out forwards; }

        /* Row Animations - Zipper Effect */
        @keyframes rowSlideInLeft {
            0% { transform: translateX(-100%); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes rowSlideInRight {
            0% { transform: translateX(100%); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
        }

        .row-animate-left { animation: rowSlideInLeft 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .row-animate-right { animation: rowSlideInRight 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }

        .xp-bar-bg {
            background: #1e293b;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
        }
        .xp-fill {
            transition: width 1s ease-out;
            box-shadow: 0 0 10px #84cc16;
        }

        /* Table Row Hover Effect */
        .scoreboard-row {
            transition: all 0.2s;
            background: rgba(15, 23, 42, 0.6);
        }
        .scoreboard-row:hover {
            background: rgba(30, 41, 59, 0.8);
            transform: scale(1.01);
            z-index: 10;
        }
        
        #ui-layer {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 10;
            display: flex; flex-direction: column;
        }

        .rank-number {
            font-family: 'Orbitron', sans-serif;
            text-shadow: 2px 2px 0px rgba(0,0,0,0.5);
        }

        /* Tab Styles */
        .tab-btn {
            background: rgba(15, 23, 42, 0.6);
            border-bottom: 2px solid transparent;
            transition: all 0.3s;
            cursor: pointer;
            transform: skewX(-15deg);
        }
        .tab-btn:hover {
            background: rgba(30, 41, 59, 0.9);
        }
        .tab-btn.active {
            background: rgba(37, 99, 235, 0.2);
            border-bottom: 2px solid #3b82f6;
            color: #fff;
        }
        .tab-btn .unskew-content {
            color: #94a3b8;
        }
        .tab-btn.active .unskew-content {
            color: #fff;
            text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
        }

        /* Grid Tile Style */
        .stat-tile {
            background: rgba(30, 41, 59, 0.4);
            border: 1px solid rgba(255,255,255,0.05);
            transition: transform 0.2s;
        }
        .stat-tile:hover {
            background: rgba(30, 41, 59, 0.7);
            border-color: rgba(255,255,255,0.1);
        }

    </style>
</head>
<body>

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
                        <span id="map-name" class="text-white">SIERRA</span>
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
                <button onclick="switchTab('scoreboard')" id="tab-btn-scoreboard" class="tab-btn active px-8 py-2">
                    <div class="unskew-content font-bold tracking-widest uppercase text-sm">Scoreboard</div>
                </button>
                <button onclick="switchTab('stats')" id="tab-btn-stats" class="tab-btn px-8 py-2">
                    <div class="unskew-content font-bold tracking-widest uppercase text-sm">Performance</div>
                </button>
                <button onclick="switchTab('weapons')" id="tab-btn-weapons" class="tab-btn px-8 py-2">
                    <div class="unskew-content font-bold tracking-widest uppercase text-sm">Weapons</div>
                </button>
            </div>

            <!-- VIEW: SCOREBOARD -->
            <div id="view-scoreboard" class="w-full flex-col transition-all duration-300">
                <!-- Headers -->
                <div class="flex w-full px-4 py-2 text-slate-300 font-bold text-sm tracking-widest uppercase mb-1 border-b border-white/10">
                    <div class="w-1/3 pl-12">Player</div>
                    <div class="w-10 text-center">K</div>
                    <div class="w-2 text-center text-slate-600">/</div>
                    <div class="w-10 text-center">D</div>
                    <div class="w-2 text-center text-slate-600">/</div>
                    <div class="w-10 text-center">A</div>
                    <div class="w-24 text-center">Headshot</div>
                    <div class="w-24 text-center">Damage</div>
                    <div class="w-24 text-center text-green-400">Acc %</div>
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
                <div class="bg-slate-900/60 p-2 h-32 overflow-y-auto text-xs space-y-1 rounded-sm border-l-2 border-slate-600">
                    <p><span class="text-blue-400 font-bold">[Team] Spectre:</span> Good game.</p>
                    <p><span class="text-red-400 font-bold">Viper:</span> Nice headshot streak.</p>
                </div>
                <div class="mt-2 relative">
                    <input type="text" placeholder="Press [ENTER] to message" class="w-full bg-slate-900/80 text-white text-sm py-2 px-3 border border-slate-700 outline-none focus:border-blue-500 rounded-sm">
                    <i class="fa-regular fa-comment absolute right-3 top-2.5 text-slate-500"></i>
                </div>
            </div>

            <!-- CENTER: Map Selection -->
            <div class="flex flex-col items-center justify-end h-full animate-slide-up" style="animation-delay: 0.1s;">
                <div class="bg-black/60 rounded-t-lg px-6 py-1 text-xs font-bold tracking-wider text-slate-400 uppercase">Select Next Map</div>
                <div class="bg-slate-900/90 p-1 w-full max-w-md border-t-2 border-blue-500 shadow-2xl">
                    <div class="flex justify-between items-center bg-slate-800/50 mb-1 p-1 hover:bg-slate-700 transition-colors cursor-pointer group">
                        <div class="flex items-center gap-2">
                            <img src="https://placehold.co/40x25/1e293b/FFF?text=S" class="w-10 h-6 object-cover border border-slate-600">
                            <span class="font-bold text-sm">Sierra</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="bg-slate-700 px-2 py-0.5 text-xs font-bold rounded">1</span>
                            <button class="bg-[#5c8d23] hover:bg-[#6da62a] text-[10px] font-bold px-3 py-1 uppercase skew-x-[-10deg] transition-colors">Play</button>
                        </div>
                    </div>
                    <div class="flex justify-between items-center bg-slate-800/50 mb-3 p-1 hover:bg-slate-700 transition-colors cursor-pointer group">
                        <div class="flex items-center gap-2">
                            <img src="https://placehold.co/40x25/3b2e1e/FFF?text=X" class="w-10 h-6 object-cover border border-slate-600">
                            <span class="font-bold text-sm">Xibalba</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="bg-slate-700 px-2 py-0.5 text-xs font-bold rounded">1</span>
                            <button class="bg-[#5c8d23] hover:bg-[#6da62a] text-[10px] font-bold px-3 py-1 uppercase skew-x-[-10deg] transition-colors">Play</button>
                        </div>
                    </div>
                    <div class="flex justify-between items-center px-1">
                        <button class="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-1.5 flex items-center gap-2 rounded-sm transition-colors">
                            <i class="fa-solid fa-xmark"></i> Leave
                        </button>
                        <div class="bg-slate-700/50 px-4 py-1.5 text-xs font-bold text-slate-300 uppercase tracking-wide">
                            Ready Players <span class="text-white">2 / 4</span>
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
                    <button class="w-full group bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-600 hover:to-indigo-700 p-0.5 skew-x-[-5deg] transition-all transform hover:-translate-y-1">
                        <div class="bg-slate-900/30 w-full h-full px-2 py-2 flex justify-between items-center unskew-content">
                             <div class="bg-slate-800 px-2 py-0.5 text-lg font-bold text-slate-400">1</div>
                             <span class="font-bold text-purple-200 uppercase text-sm tracking-wide">Claim Rewards</span>
                             <i class="fa-solid fa-gift text-yellow-400"></i>
                        </div>
                    </button>
                </div>
            </div>

        </div>
    </div>
    
    <script>
        // --- 1. DATA GENERATION ---
        const myPlayerId = "player1";

        // COMPLETE Data Mock based on GameStatistics Interface
        const players = [
            { 
                id: "player1", 
                name: "ZB_Stepps", 
                team: "blue",
                stats: {
                    // Match Info
                    placement: 1,
                    winner: "Team Blue",
                    gameMode: "Domination",
                    duration: 765,
                    
                    // Combat Stats
                    kills: 24,
                    deaths: 5,
                    assists: 12,
                    suicides: 0,
                    
                    // Weapon Stats
                    shotsFired: 450,
                    shotsHit: 191,
                    headshotKills: 8,
                    accuracy: 42.5,
                    
                    // Damage Stats
                    damageDealt: 4520,
                    damageTaken: 2100,
                    highestDamageInOneLife: 1200,
                    
                    // Performance Stats
                    killStreak: 4,
                    longestKillStreak: 9,
                    killsPerMinute: 1.88,
                    kdRatio: 4.8,
                    
                    // Additional
                    healthPacksCollected: 3,
                    distanceTraveled: 1450,
                    totalScore: 2850,
                    timeAlive: 650,
                    averageLifeTime: 108,
                    
                    // Weapon Breakdown
                    weaponStats: [
                        { name: "Scar-H", kills: 14, shots: 250, hits: 110, damage: 2800, headshots: 5 },
                        { name: "Shotgun", kills: 8, shots: 50, hits: 40, damage: 1400, headshots: 2 },
                        { name: "Deagle", kills: 2, shots: 25, hits: 15, damage: 320, headshots: 1 }
                    ]
                }
            },
            { 
                id: "player2", 
                name: "ViperZero", 
                team: "blue",
                stats: {
                    kills: 19, deaths: 8, assists: 5, suicides: 1,
                    shotsFired: 300, shotsHit: 114, headshotKills: 4, accuracy: 38.0,
                    damageDealt: 3200, damageTaken: 2500, highestDamageInOneLife: 800,
                    killStreak: 2, longestKillStreak: 5, killsPerMinute: 1.5, kdRatio: 2.37,
                    healthPacksCollected: 5, distanceTraveled: 1200, totalScore: 2100, timeAlive: 500, averageLifeTime: 62,
                    weaponStats: [], placement: 2, winner: "Team Blue", gameMode: "Domination", duration: 765
                }
            },
            { 
                id: "player3", 
                name: "RedBaron", 
                team: "red",
                stats: {
                    kills: 15, deaths: 12, assists: 4, suicides: 0,
                    shotsFired: 500, shotsHit: 157, headshotKills: 6, accuracy: 31.5,
                    damageDealt: 2800, damageTaken: 3000, highestDamageInOneLife: 600,
                    killStreak: 1, longestKillStreak: 4, killsPerMinute: 1.2, kdRatio: 1.25,
                    healthPacksCollected: 2, distanceTraveled: 1600, totalScore: 1800, timeAlive: 400, averageLifeTime: 33,
                    weaponStats: [], placement: 3, winner: "Team Blue", gameMode: "Domination", duration: 765
                }
            },
            { 
                id: "player4", 
                name: "Guest 2", 
                team: "red",
                stats: {
                    kills: 2, deaths: 15, assists: 1, suicides: 2,
                    shotsFired: 100, shotsHit: 12, headshotKills: 0, accuracy: 12.0,
                    damageDealt: 450, damageTaken: 3200, highestDamageInOneLife: 150,
                    killStreak: 0, longestKillStreak: 1, killsPerMinute: 0.15, kdRatio: 0.13,
                    healthPacksCollected: 0, distanceTraveled: 500, totalScore: 350, timeAlive: 200, averageLifeTime: 13,
                    weaponStats: [], placement: 4, winner: "Team Blue", gameMode: "Domination", duration: 765
                }
            }
        ];

        // --- 2. LOGIC ---

        // Tab Switching
        window.switchTab = (tabId) => {
            // Hide all
            document.getElementById('view-scoreboard').classList.add('hidden');
            document.getElementById('view-stats').classList.add('hidden');
            document.getElementById('view-weapons').classList.add('hidden');
            
            // Deactivate Btns
            document.getElementById('tab-btn-scoreboard').classList.remove('active');
            document.getElementById('tab-btn-stats').classList.remove('active');
            document.getElementById('tab-btn-weapons').classList.remove('active');

            // Show target
            document.getElementById('view-' + tabId).classList.remove('hidden');
            document.getElementById('view-' + tabId).classList.add('flex'); // Ensure flex display
            document.getElementById('tab-btn-' + tabId).classList.add('active');
            
            // Re-trigger animation if needed
            if(tabId === 'stats') renderStats();
            if(tabId === 'weapons') renderWeapons();
        };

        const renderScoreboard = () => {
            const container = document.getElementById('scoreboard-rows');
            container.innerHTML = '';
            
            players.forEach((p, i) => {
                const isMe = p.id === myPlayerId;
                const s = p.stats;
                const accentColor = p.team === "blue" ? "bg-blue-500" : "bg-red-500";
                const animClass = i % 2 === 0 ? 'row-animate-left' : 'row-animate-right';

                const row = document.createElement('div');
                row.className = `flex w-full items-stretch h-14 relative scoreboard-row group cursor-pointer opacity-0 ${animClass}`;
                row.style.animationDelay = `${i * 100}ms`;
                
                row.innerHTML = `
                    <div class="w-3 ${accentColor} skew-x-[-15deg] mr-2 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                    <div class="flex-1 bg-slate-800/80 skew-x-[-15deg] flex items-center pr-8 pl-4 border-b border-white/5 relative overflow-hidden">
                        ${isMe ? '<div class="absolute inset-0 bg-gradient-to-r from-blue-900/40 to-transparent pointer-events-none"></div>' : ''}
                        <div class="unskew-content flex w-full items-center text-sm font-bold">
                            <div class="w-1/3 flex items-center gap-3">
                                <div class="w-8 h-8 rounded bg-slate-600 overflow-hidden border border-slate-500 shadow-lg">
                                    <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=${p.name}" class="w-full h-full object-cover">
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-white text-base tracking-wide">${p.name}</span>
                                    ${isMe ? '<span class="bg-orange-500 text-black text-[10px] px-1.5 py-0.5 font-black rounded uppercase">YOU</span>' : ''}
                                    ${s.placement === 1 ? '<i class="fa-solid fa-crown text-yellow-400 text-xs"></i>' : ''}
                                </div>
                            </div>
                            <div class="w-10 text-center text-white text-lg">${s.kills}</div>
                            <div class="w-2 text-center text-slate-600">/</div>
                            <div class="w-10 text-center text-slate-400 text-lg">${s.deaths}</div>
                            <div class="w-2 text-center text-slate-600">/</div>
                            <div class="w-10 text-center text-slate-400 text-lg">${s.assists}</div>
                            <div class="w-24 text-center text-slate-300">${s.headshotKills}</div>
                            <div class="w-24 text-center text-slate-300">${s.damageDealt}</div>
                            <div class="w-24 text-center text-green-400 drop-shadow-sm">${s.accuracy.toFixed(1)}%</div>
                            <div class="w-24 text-right text-yellow-400 text-xl font-orbitron tracking-wider">${s.totalScore}</div>
                        </div>
                    </div>
                    <div class="w-16 ml-2 bg-slate-800/80 skew-x-[-15deg] flex items-center justify-center border-b border-white/5">
                        <div class="unskew-content text-4xl font-black text-yellow-600/40 group-hover:text-yellow-500/80 transition-colors rank-number italic">${s.placement}</div>
                    </div>
                `;
                container.appendChild(row);

                if (isMe) {
                    populateXP(s);
                    updateMatchHeader(s);
                }
            });
        };

        const renderStats = () => {
            const container = document.getElementById('view-stats').firstElementChild;
            if(container.children.length > 0) return; // already rendered

            const s = players[0].stats; // My Stats

            const metrics = [
                { label: 'K/D Ratio', value: s.kdRatio, unit: '', icon: 'fa-scale-balanced', color: 'text-yellow-400' },
                { label: 'Kills / Min', value: s.killsPerMinute, unit: '', icon: 'fa-stopwatch', color: 'text-blue-400' },
                { label: 'Longest Streak', value: s.longestKillStreak, unit: '', icon: 'fa-fire', color: 'text-red-500' },
                { label: 'Suicides', value: s.suicides, unit: '', icon: 'fa-skull', color: 'text-slate-500' },
                
                { label: 'Damage Taken', value: s.damageTaken, unit: '', icon: 'fa-shield-heart', color: 'text-red-400' },
                { label: 'Max Dmg / Life', value: s.highestDamageInOneLife, unit: '', icon: 'fa-burst', color: 'text-orange-400' },
                { label: 'Time Alive', value: Math.floor(s.timeAlive / 60) + ':' + (s.timeAlive % 60).toString().padStart(2,'0'), unit: '', icon: 'fa-hourglass-half', color: 'text-cyan-400' },
                { label: 'Avg Life Time', value: s.averageLifeTime, unit: 's', icon: 'fa-heart-pulse', color: 'text-emerald-400' },

                { label: 'Shots Fired', value: s.shotsFired, unit: '', icon: 'fa-crosshairs', color: 'text-slate-400' },
                { label: 'Shots Hit', value: s.shotsHit, unit: '', icon: 'fa-bullseye', color: 'text-green-500' },
                { label: 'Distance', value: s.distanceTraveled, unit: 'm', icon: 'fa-person-running', color: 'text-indigo-400' },
                { label: 'Health Packs', value: s.healthPacksCollected, unit: '', icon: 'fa-briefcase-medical', color: 'text-pink-400' }
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
        };

        const renderWeapons = () => {
             const container = document.getElementById('view-weapons').firstElementChild;
             if(container.children.length > 0) return;

             const weapons = players[0].stats.weaponStats;

             weapons.forEach((w, i) => {
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
                            <span class="font-bold text-xl text-yellow-400 uppercase tracking-widest">${w.name}</span>
                        </div>
                        <div class="grid grid-cols-4 gap-8 flex-1 text-center">
                            <div><div class="text-xs text-slate-500 uppercase">Kills</div><div class="text-xl font-bold">${w.kills}</div></div>
                            <div><div class="text-xs text-slate-500 uppercase">Accuracy</div><div class="text-xl font-bold text-green-400">${acc}%</div></div>
                            <div><div class="text-xs text-slate-500 uppercase">Headshots</div><div class="text-xl font-bold text-red-400">${w.headshots}</div></div>
                            <div><div class="text-xs text-slate-500 uppercase">Damage</div><div class="text-xl font-bold text-blue-400">${w.damage}</div></div>
                        </div>
                    </div>
                `;
                container.appendChild(row);
             });
        };

        const updateMatchHeader = (stats) => {
            const resultBadge = document.getElementById('result-badge');
            const resultText = document.getElementById('match-result');
            
            if(stats.placement === 1) {
                resultText.innerText = "VICTORY";
                resultText.classList.add('text-yellow-400');
            } else {
                resultText.innerText = "DEFEAT";
                resultText.classList.remove('text-yellow-400');
                resultText.classList.add('text-red-500');
                resultBadge.classList.remove('bg-blue-600/90');
                resultBadge.classList.add('bg-red-900/90');
            }
            
            const mins = Math.floor(stats.duration / 60);
            const secs = stats.duration % 60;
            document.getElementById('match-time').innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        const populateXP = (stats) => {
            const matchXP = Math.floor(stats.totalScore * 0.1); 
            const bonusXP = Math.floor(stats.kills * 10 + stats.headshotKills * 5);
            const totalXP = matchXP + bonusXP;

            animateValue("xp-match", 0, matchXP, 1000);
            animateValue("xp-bonus", 0, bonusXP, 1000);
            animateValue("xp-total", 0, totalXP, 1500);

            setTimeout(() => { document.getElementById('bar-match').style.width = '70%'; }, 500);
            setTimeout(() => { document.getElementById('bar-bonus').style.width = '45%'; }, 800);
        };

        const animateValue = (id, start, end, duration) => {
            const obj = document.getElementById(id);
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                obj.innerHTML = "+" + Math.floor(progress * (end - start) + start);
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                }
            };
            window.requestAnimationFrame(step);
        };

        // --- CSS PARTICLES ---
        const initParticles = () => {
            const container = document.getElementById('background-layer');
            const particleCount = 20;

            for(let i=0; i<particleCount; i++) {
                const p = document.createElement('div');
                p.className = 'particle';
                p.style.left = Math.random() * 100 + '%';
                p.style.animationDelay = Math.random() * 5 + 's';
                p.style.animationDuration = (10 + Math.random() * 20) + 's';
                container.appendChild(p);
            }
        };

        // Timer
        let time = 15;
        setInterval(() => {
            if(time > 0) {
                time--;
                document.getElementById('timer').innerText = time;
            }
        }, 1000);

        window.onload = () => {
            initParticles();
            renderScoreboard();
        };

    </script>
</body>
</html>