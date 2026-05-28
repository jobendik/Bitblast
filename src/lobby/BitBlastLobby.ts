/**
 * BITBLAST Lobby System
 * Displays the full lobby UI with 3D character, Battle Pass, Store, etc.
 * Integrates with the game when PLAY is clicked
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { io, Socket } from 'socket.io-client';
import { getBitBlastServerUrl, getSocketIOPath } from '../config/network';

// Lobby State
interface LobbyState {
    username: string;
    level: number;
    xp: number;
    credits: number;
    mode: string;
    modeDesc: string;
    isReady: boolean;
    fill: boolean;
    region: string;
    ping: number;
    battlePass: {
        isPremium: boolean;
        tier: number;
    };
    inventory: {
        primary: string;
        secondary: string;
        skin: string;
    };
    friends: Array<{ name: string; online: boolean }>;
    settings: {
        masterVolume: number;
        musicVolume: number;
        sfxVolume: number;
        graphicsQuality: string;
        fpsLimit: number;
        particles: boolean;
        sensitivity: number;
        invertY: boolean;
    };
}

// Massive repertoire of realistic FPS gamer chat messages
const FAKE_CHAT_MESSAGES: Array<{ username: string; message: string }> = [
    // Pre-game hype and warm-up
    { username: 'xShadowKiller', message: 'lets gooo' },
    { username: 'NightHawk99', message: 'gg last round everyone' },
    { username: 'VelocityX', message: 'finally warmed up lol' },
    { username: 'StormBringer', message: 'whos ready to dominate' },
    { username: 'PhantomAce', message: 'headshots only this game' },
    { username: 'CyberWolf', message: 'just changed my sens, wish me luck' },
    { username: 'BlazeMaster', message: 'spawn trap incoming' },
    { username: 'IronReaper', message: 'finally got my coffee brb' },
    { username: 'QuantumFury', message: 'anyone else lagging or just me' },
    { username: 'SteelVenom', message: 'these lobbies are sweaty today' },
    { username: 'DarkSpectre', message: 'AR only challenge accepted' },
    { username: 'ThunderBolt', message: 'my aim is cracked rn' },
    { username: 'RapidFire', message: 'camping is a valid strategy fight me' },
    { username: 'SilentStrike', message: 'shotgun meta is broken' },
    { username: 'NovaFlash', message: 'ranked later?' },

    // Casual conversation and banter
    { username: 'ZeroGravity', message: 'yo who wants to party up after' },
    { username: 'ToxicViper', message: 'this map is underrated tbh' },
    { username: 'GhostRider', message: 'anyone stream on twitch here?' },
    { username: 'AlphaStorm', message: 'whats everyones K/D' },
    { username: 'NeonBlade', message: 'imagine using aim assist lmao' },
    { username: 'SkyFall', message: 'controller or MnK?' },
    { username: 'OmegaWolf', message: 'PC master race' },
    { username: 'CrimsonFang', message: 'crossplay lobbies are wild' },
    { username: 'FrostBite', message: 'dinner is almost ready irl rip' },
    { username: 'EliteSniper', message: 'one more game then sleep' },

    // Competitive talk
    { username: 'WarMachine', message: 'grinding for diamond rank' },
    { username: 'ShadowFox', message: 'need 2 more wins for promotion' },
    { username: 'BulletProof', message: 'ranked is so different from casual' },
    { username: 'DeathMatch', message: 'just dropped a 30 bomb last game' },
    { username: 'HyperX', message: 'anyone else hate this sbmm' },
    { username: 'TurboKill', message: 'lobbies getting easier or im just cracked' },
    { username: 'NightOwl', message: '2am gaming hits different' },
    { username: 'FireStorm', message: 'energy drink kicking in' },
    { username: 'IceBreaker', message: 'lets get this bread' },
    { username: 'VenomStrike', message: 'i smell a dub' },

    // Loadout and meta discussion
    { username: 'RogueAgent', message: 'whats the best AR rn' },
    { username: 'SpeedDemon', message: 'SMG rush every time' },
    { username: 'AcidRain', message: 'hipfire only challenge' },
    { username: 'xShadowKiller', message: 'sniper quickscopes are so satisfying' },
    { username: 'NightHawk99', message: 'anyone tried the new attachments' },
    { username: 'VelocityX', message: 'red dot gang' },
    { username: 'StormBringer', message: 'iron sights supremacy' },
    { username: 'PhantomAce', message: 'extended mag is mandatory' },
    { username: 'CyberWolf', message: 'silencer for the sneaky plays' },
    { username: 'BlazeMaster', message: 'who needs a foregrip anyway' },

    // Post-game reactions
    { username: 'IronReaper', message: 'that last game was insane' },
    { username: 'QuantumFury', message: 'clutched a 1v3 earlier' },
    { username: 'SteelVenom', message: 'i got killed through the wall wtf' },
    { username: 'DarkSpectre', message: 'lag cost me that kill' },
    { username: 'ThunderBolt', message: 'literally one shot' },
    { username: 'RapidFire', message: 'how did that not register' },
    { username: 'SilentStrike', message: 'servers are rough today' },
    { username: 'NovaFlash', message: 'hit reg is sus sometimes' },
    { username: 'ZeroGravity', message: 'should have been a headshot' },
    { username: 'ToxicViper', message: 'getting better every game' },

    // General gamer talk
    { username: 'GhostRider', message: 'this game needs more maps' },
    { username: 'AlphaStorm', message: 'when is the next update' },
    { username: 'NeonBlade', message: 'new season soon hopefully' },
    { username: 'SkyFall', message: 'battle pass almost done' },
    { username: 'OmegaWolf', message: 'tier 100 grind is real' },
    { username: 'CrimsonFang', message: 'graphics are clean tho' },
    { username: 'FrostBite', message: '144fps feels smooth' },
    { username: 'EliteSniper', message: 'anyone got audio issues' },
    { username: 'WarMachine', message: 'footsteps audio is broken' },
    { username: 'ShadowFox', message: 'cant hear people behind me' },

    // Short reactions and emotes
    { username: 'BulletProof', message: 'nice' },
    { username: 'DeathMatch', message: 'gg' },
    { username: 'HyperX', message: 'lol' },
    { username: 'TurboKill', message: 'fr fr' },
    { username: 'NightOwl', message: 'bet' },
    { username: 'FireStorm', message: 'fax' },
    { username: 'IceBreaker', message: 'no cap' },
    { username: 'VenomStrike', message: 'ez' },
    { username: 'RogueAgent', message: 'oof' },
    { username: 'SpeedDemon', message: 'bruh' },

    // More competitive banter
    { username: 'AcidRain', message: 'who tryna 1v1' },
    { username: 'xShadowKiller', message: 'warm up complete' },
    { username: 'NightHawk99', message: 'feeling a big game coming' },
    { username: 'VelocityX', message: 'no deaths run incoming' },
    { username: 'StormBringer', message: 'aggressive gameplay only' },
    { username: 'PhantomAce', message: 'objective focus this time' },
    { username: 'CyberWolf', message: 'team communication key' },
    { username: 'BlazeMaster', message: 'call out enemy positions' },
    { username: 'IronReaper', message: 'flank left every time' },
    { username: 'QuantumFury', message: 'hold the angles' },

    // Late night gaming vibes
    { username: 'SteelVenom', message: 'should probably sleep but one more' },
    { username: 'DarkSpectre', message: 'school tomorrow rip' },
    { username: 'ThunderBolt', message: 'work in 6 hours worth it' },
    { username: 'RapidFire', message: 'gaming addiction is real' },
    { username: 'SilentStrike', message: 'this is my therapy session' },
    { username: 'NovaFlash', message: 'its only 3am' },
    { username: 'ZeroGravity', message: 'weekend vibes' },
    { username: 'ToxicViper', message: 'grind never stops' },

    // Skill and improvement
    { username: 'GhostRider', message: 'aim trainer paying off' },
    { username: 'AlphaStorm', message: 'kovaaks diff' },
    { username: 'NeonBlade', message: 'crosshair placement is everything' },
    { username: 'SkyFall', message: 'peekers advantage ftw' },
    { username: 'OmegaWolf', message: 'movement tech is underrated' },
    { username: 'CrimsonFang', message: 'slide cancel meta' },
    { username: 'FrostBite', message: 'bunny hopping works here lol' },
    { username: 'EliteSniper', message: 'prediction > reaction' },
    { username: 'WarMachine', message: 'game sense coming together' },
    { username: 'ShadowFox', message: 'vod review helped a lot' },

    // Random conversation
    { username: 'BulletProof', message: 'anyone watching the esports?' },
    { username: 'DeathMatch', message: 'that finals game was crazy' },
    { username: 'HyperX', message: 'pro players are built different' },
    { username: 'TurboKill', message: 'wish i had that aim' },
    { username: 'NightOwl', message: 'practice makes perfect' },
    { username: 'FireStorm', message: 'maybe in another life lol' },
    { username: 'IceBreaker', message: 'content creator dream' },
    { username: 'VenomStrike', message: 'youtube grind starts here' },
    { username: 'RogueAgent', message: 'clips for the montage' },
    { username: 'SpeedDemon', message: 'that would be edit worthy' },
];

// Notification types for simulated game activity
const NOTIFICATION_TEMPLATES = {
    kills: [
        '{killer} eliminated {victim}',
        '{killer} took out {victim}',
        '{killer} destroyed {victim}',
        '{killer} fragged {victim}',
        '{killer} neutralized {victim}',
        '{killer} ended {victim}',
        '{killer} dominated {victim}',
        '{killer} deleted {victim}',
        '{killer} obliterated {victim}',
        '{killer} crushed {victim}',
    ],
    headshots: [
        '{killer} headshot {victim}',
        '{killer} domed {victim}',
        '{killer} one-tapped {victim}',
        '{killer} sniped {victim}',
    ],
    streaks: [
        '{player} is on a 3-kill streak!',
        '{player} is on fire! 4 kills',
        '{player} is dominating! 5-kill streak',
        '{player} is UNSTOPPABLE! 6 kills',
        '{player} achieved a MEGA KILL!',
        '{player} is running a rampage!',
        '{player} got a triple kill!',
        '{player} double kill!',
    ],
    joins: [
        '{player} joined the arena',
        '{player} connected',
        '{player} entered the match',
        '{player} is ready to fight',
        '{player} has arrived',
    ],
    matchEvents: [
        'Match completed • {count} players',
        'New lobby starting • {count} waiting',
        'Server population: {count} online',
        'Ranked match in progress',
        'Tournament queue open',
        'Double XP event active!',
        'Peak hours • fast matchmaking',
    ],
    achievements: [
        '{player} unlocked a new weapon camo',
        '{player} reached Level {level}',
        '{player} completed a daily challenge',
        '{player} earned the Marksman badge',
        '{player} got MVP last match',
        '{player} is now Tier {tier} Battle Pass',
    ],
};

// Pool of gamer names for fake players
const FAKE_PLAYER_NAMES = [
    'xShadowKiller', 'NightHawk99', 'VelocityX', 'StormBringer', 'PhantomAce',
    'CyberWolf', 'BlazeMaster', 'IronReaper', 'QuantumFury', 'SteelVenom',
    'DarkSpectre', 'ThunderBolt', 'RapidFire', 'SilentStrike', 'NovaFlash',
    'ZeroGravity', 'ToxicViper', 'GhostRider', 'AlphaStorm', 'NeonBlade',
    'SkyFall', 'OmegaWolf', 'CrimsonFang', 'FrostBite', 'EliteSniper',
    'WarMachine', 'ShadowFox', 'BulletProof', 'DeathMatch', 'HyperX',
    'TurboKill', 'NightOwl', 'FireStorm', 'IceBreaker', 'VenomStrike',
    'DarkKnight', 'StealthMode', 'RogueAgent', 'SpeedDemon', 'AcidRain',
    'SniperElite', 'RunAndGun', 'HeadshotPro', 'FragMaster', 'KillStreak',
    'ProGamer420', 'NoobSlayer', 'RecoilKing', 'FlickShot', 'PreFireGod',
    'WallBang', 'SprayNPray', 'OneShot', 'NoScope360', 'AimBot_Real',
    'MLGpro2024', 'TwitchRival', 'eSportsHope', 'RankedGrinder', 'SoloCarry',
];

export class BitBlastLobby {
    private container: HTMLElement | null = null;
    private state: LobbyState;
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    private renderer: THREE.WebGLRenderer | null = null;
    private mixers: THREE.AnimationMixer[] = [];
    private clock = new THREE.Clock();
    private animationId: number | null = null;
    private onPlayCallback: ((matchInfo: { matchId: string; token: string; serverUrl: string; socket: Socket | null }) => void) | null = null;
    private particleInterval: ReturnType<typeof setInterval> | null = null;

    // Chat and notification simulation
    private chatSimulationInterval: ReturnType<typeof setInterval> | null = null;
    private notificationSimulationInterval: ReturnType<typeof setInterval> | null = null;
    private usedChatIndices: Set<number> = new Set();
    private playersFound: number = 0;

    // Multiplayer connection
    private socket: Socket | null = null;
    private serverUrl: string = getBitBlastServerUrl();
    private playerId: string = '';
    private matchId: string | null = null;

    constructor() {
        this.state = this.loadState();
        this.playerId = 'player-' + Math.random().toString(36).substring(2, 9);
    }

    private loadState(): LobbyState {
        // Load or generate username
        let username = localStorage.getItem('bitblast_username');
        if (!username) {
            username = `GUEST_${Math.floor(Math.random() * 9000) + 1000}`;
            localStorage.setItem('bitblast_username', username);
        }

        return {
            username: username,
            level: parseInt(localStorage.getItem('bitblast_level') || '1'),
            xp: parseInt(localStorage.getItem('bitblast_xp') || '150'),
            credits: parseInt(localStorage.getItem('bitblast_credits') || '1250'),
            mode: 'FREE FOR ALL',
            modeDesc: 'Every player for themselves',
            isReady: false,
            fill: true,
            region: 'NA-WEST',
            ping: 24,
            battlePass: {
                isPremium: localStorage.getItem('bitblast_bp_premium') === 'true',
                tier: parseInt(localStorage.getItem('bitblast_bp_tier') || '1')
            },
            inventory: JSON.parse(localStorage.getItem('bitblast_inventory') || '{"primary":"Assault Rifle","secondary":"Pistol","skin":"Default"}'),
            friends: JSON.parse(localStorage.getItem('bitblast_friends') || '[]'),
            settings: JSON.parse(localStorage.getItem('bitblast_settings') || '{"masterVolume":80,"musicVolume":60,"sfxVolume":100,"graphicsQuality":"high","fpsLimit":60,"particles":true,"sensitivity":50,"invertY":false}')
        };
    }

    public init(onPlay: (matchInfo: { matchId: string; token: string; serverUrl: string; socket: Socket | null }) => void): void {
        this.onPlayCallback = onPlay;
        this.createLobbyHTML();
        this.initializeUI();
        this.init3DCharacter();
        this.createParticles();
        this.populateQuests();
        this.setupEventListeners();
        this.connectToServer();
    }

    private connectToServer(): void {
        const socketPath = getSocketIOPath();

        this.socket = io(this.serverUrl, {
            path: socketPath,
            auth: { token: this.playerId },
            transports: ['websocket'],
        });

        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
            // If in queue, reset state
            if (this.state.isReady) {
                this.cancelQueue();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.warn('⚠️ Server connection failed:', error.message);
            this.updateConnectionStatus(false);
        });

        this.socket.on('queue_status', (data: { position: number; waiting: boolean; playersFound?: number; maxPlayers?: number }) => {
            this.updateQueueStatus(data.position, data.playersFound, data.maxPlayers);
        });

        this.socket.on('queue_update', (data: { playersFound: number; maxPlayers: number; countdown: number }) => {
            this.updateQueueCountdown(data.playersFound, data.maxPlayers, data.countdown);
        });

        this.socket.on('queue_countdown', (data: { countdown: number; playersFound: number; maxPlayers: number }) => {
            this.updateQueueCountdown(data.playersFound, data.maxPlayers, data.countdown);
        });

        this.socket.on('match_found', (data: { matchId: string; modeId: string; players: number; humanPlayers?: number; bots?: Array<{ oderId: string; username: string }> }) => {
            this.matchId = data.matchId;
            this.updateMatchFoundStatus(data.humanPlayers, data.bots?.length);
            this.showMatchLoadingScreen(data.humanPlayers || data.players, data.players);
        });

        this.socket.on('match_start', (data: { matchId: string; token: string; serverUrl: string; bots?: Array<{ oderId: string; username: string; spawnIndex: number; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }> }) => {
            this.matchId = data.matchId;
            this.updateLoadingForGameStart();

            // Store bot spawn data globally for World to use
            if (data.bots && data.bots.length > 0) {
                (window as any).__matchBotSpawns = data.bots;
            }

            this.startGame(data);
        });

        // Listen for chat messages from other players in the lobby
        this.socket.on('chat_message', (data: { userId: string; username: string; message: string }) => {
            // Don't duplicate our own messages (we already added them locally)
            if (data.userId === this.playerId) return;
            this.addChatMessage(data.username, data.message, false);
        });
    }

    private updateConnectionStatus(connected: boolean): void {
        const pingEl = document.getElementById('ping-display');
        if (pingEl) {
            pingEl.innerText = connected ? `${this.state.ping}ms` : 'OFFLINE';
            pingEl.style.color = connected ? '#10b981' : '#ef4444';
        }
    }

    private updateQueueStatus(position: number, playersFound?: number, maxPlayers?: number): void {
        const subText = document.getElementById('readySub');
        if (subText) {
            if (playersFound !== undefined && maxPlayers !== undefined) {
                subText.innerText = `SEARCHING... ${playersFound}/${maxPlayers} PLAYERS`;
            } else {
                subText.innerText = `SEARCHING... (${position} in queue)`;
            }
        }
    }

    private updateQueueCountdown(playersFound: number, maxPlayers: number, countdown: number): void {
        const subText = document.getElementById('readySub');
        this.playersFound = playersFound;

        // Update visual player slots
        this.updatePlayerSlots(playersFound);

        if (subText) {
            if (countdown > 0) {
                subText.innerText = `${playersFound}/${maxPlayers} PLAYERS • STARTING IN ${countdown}s`;
                subText.style.color = countdown <= 3 ? '#facc15' : 'rgba(255,255,255,0.8)';
            } else {
                subText.innerText = `${playersFound}/${maxPlayers} PLAYERS • STARTING...`;
                subText.style.color = '#10b981';
            }
        }

        // Update countdown ring
        const ring = document.getElementById('countdown-ring');
        if (ring) {
            ring.style.opacity = '1';
        }
    }

    private updateMatchFoundStatus(_humanPlayers?: number, _botCount?: number): void {
        // IMPORTANT: Never disclose bot counts - always show as if all players are human
        const subText = document.getElementById('readySub');
        if (subText) {
            subText.innerText = 'MATCH FOUND! 4 PLAYERS';
            subText.style.color = '#10b981';
        }

        // Fill all player slots
        this.updatePlayerSlots(4);
    }

    private cancelQueue(): void {
        this.state.isReady = false;
        this.socket?.emit('cancel_queue');

        const btn = document.getElementById('readyBtn');
        const mainText = document.getElementById('readyText');
        const subText = document.getElementById('readySub');

        if (btn && mainText && subText) {
            btn.style.background = '#facc15';
            mainText.innerText = 'PLAY';
            mainText.style.color = '#1e3a5f';
            subText.innerText = 'MATCHMAKING READY';
            subText.style.color = 'rgba(30,58,95,0.7)';
        }
    }

    private createLobbyHTML(): void {
        // Create the lobby container
        const lobby = document.createElement('div');
        lobby.id = 'lobby-screen';
        lobby.className = 'lobby-bg-slate-900 lobby-text-white lobby-overflow-hidden lobby-h-screen lobby-w-screen lobby-select-none font-ui';

        lobby.innerHTML = `
            <!-- Background Layers -->
            <div class="absolute inset-0 z-0" style="position:absolute;inset:0;">
                <img src="/lobby/background.png" style="width:100%;height:100%;object-fit:cover;" alt="Background">
                <div style="position:absolute;inset:0;background:linear-gradient(to bottom, rgba(30,58,138,0.3), transparent, rgba(0,0,0,0.8));"></div>
            </div>
            <div class="absolute inset-0 z-0 scanlines" style="position:absolute;inset:0;opacity:0.1;"></div>
            
            <!-- Particle Container -->
            <div id="lobby-particles" style="position:absolute;inset:0;overflow:hidden;pointer-events:none;"></div>

            <!-- App Container -->
            <div style="position:relative;z-index:10;display:flex;flex-direction:column;height:100%;">

                <!-- TOP NAVIGATION -->
                <header id="lobby-header" style="display:flex;align-items:center;justify-content:space-between;padding:12px 24px;background:linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);border-bottom:1px solid rgba(255,255,255,0.05);backdrop-filter:blur(4px);">
                    <!-- Logo -->
                    <div style="display:flex;align-items:center;gap:16px;width:25%;">
                        <h1 class="font-gaming" style="font-size:3rem;color:white;font-style:italic;letter-spacing:0.1em;text-shadow:0 4px 4px rgba(0,0,0,0.8);background:linear-gradient(to bottom, white, #9ca3af);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">BITBLAST</h1>
                        <span style="font-size:10px;background:#facc15;color:black;font-weight:900;padding:2px 8px;border-radius:4px;transform:skewX(-12deg);letter-spacing:0.2em;">SEASON 1</span>
                    </div>

                    <!-- Tabs -->
                    <nav style="display:flex;gap:8px;">
                        <button id="tab-lobby" class="nav-tab skew-tab font-gaming" style="padding:4px 24px;font-size:1.5rem;color:#facc15;border-bottom:4px solid #facc15;background:transparent;border-top:none;border-left:none;border-right:none;cursor:pointer;">
                            <span class="skew-tab-content">Lobby</span>
                        </button>
                        <button id="tab-bp" class="nav-tab skew-tab font-gaming" style="padding:4px 24px;font-size:1.5rem;color:#9ca3af;border-bottom:4px solid transparent;background:transparent;border-top:none;border-left:none;border-right:none;cursor:pointer;">
                            <span class="skew-tab-content">Battle Pass</span>
                        </button>
                        <button id="tab-loadout" class="nav-tab skew-tab font-gaming" style="padding:4px 24px;font-size:1.5rem;color:#9ca3af;border-bottom:4px solid transparent;background:transparent;border-top:none;border-left:none;border-right:none;cursor:pointer;">
                            <span class="skew-tab-content">Loadout</span>
                        </button>
                    </nav>

                    <!-- User Meta -->
                    <div style="display:flex;align-items:center;justify-content:flex-end;gap:16px;width:25%;">
                        <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.6);padding:6px 16px;border-radius:9999px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;">
                            <div style="width:16px;height:16px;background:#22d3ee;border-radius:50%;box-shadow:0 0 10px #22d3ee;"></div>
                            <span id="lobby-credits" style="font-weight:bold;font-size:14px;">${this.state.credits.toLocaleString()} CR</span>
                        </div>
                    </div>
                </header>

                <!-- MAIN CONTENT -->
                <main id="lobby-main-layout" style="flex:1;display:flex;overflow:hidden;position:relative;">
                    
                    <!-- LEFT SIDEBAR -->
                    <aside id="lobby-sidebar-left" style="width:16.67%;padding:24px;display:flex;flex-direction:column;gap:24px;background:linear-gradient(to right, rgba(0,0,0,0.6), rgba(0,0,0,0.2), transparent);">
                        <!-- Profile / Season Badge -->
                        <div style="background:linear-gradient(to bottom right, rgba(79,70,229,0.8), rgba(0,0,0,0.8));backdrop-filter:blur(4px);border:1px solid rgba(99,102,241,0.3);padding:20px;border-radius:12px;position:relative;overflow:hidden;">
                            <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
                                <div style="position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
                                    <svg style="width:40px;height:40px;color:#facc15;" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944z" clip-rule="evenodd" />
                                    </svg>
                                    <span id="bp-tier-badge" style="position:absolute;color:black;font-weight:900;font-size:18px;">${this.state.battlePass.tier}</span>
                                </div>
                                <div>
                                    <h2 id="bp-status" class="font-gaming" style="font-size:1.5rem;color:white;line-height:1;">${this.state.battlePass.isPremium ? 'PREMIUM PASS' : 'FREE PASS'}</h2>
                                    <p style="font-size:10px;color:#a5b4fc;font-weight:bold;letter-spacing:0.2em;margin-top:4px;">Tier ${this.state.battlePass.tier} • New Recruit</p>
                                </div>
                            </div>
                            <!-- XP Bar -->
                            <div style="width:100%;background:rgba(0,0,0,0.6);height:10px;border-radius:9999px;overflow:hidden;border:1px solid rgba(255,255,255,0.05);">
                                <div id="xp-bar" style="background:linear-gradient(to right, #fde047, #ca8a04);height:100%;width:15%;box-shadow:0 0 15px rgba(234,179,8,0.8);"></div>
                            </div>
                            <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:6px;font-weight:bold;color:#9ca3af;letter-spacing:0.1em;">
                                <span id="level-display">Lvl ${this.state.level}</span>
                                <span id="xp-display">${this.state.xp} / ${this.state.level * 1000} XP</span>
                            </div>
                        </div>

                        <!-- Daily Quests -->
                        <div style="flex:1;overflow-y:auto;padding-right:8px;">
                            <h3 class="font-gaming" style="font-size:1.25rem;margin-bottom:16px;color:rgba(255,255,255,0.9);border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                                DAILY OPS 
                                <span style="font-size:12px;font-family:'Inter',sans-serif;font-weight:normal;color:#9ca3af;background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:4px;">Reset: 14h</span>
                            </h3>
                            <div id="quest-list" style="display:flex;flex-direction:column;gap:12px;">
                                <!-- Quests populated by JS -->
                            </div>
                        </div>
                    </aside>

                    <!-- CENTER STAGE -->
                    <section id="lobby-center-stage" style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;">
                        <!-- Platform Glow -->
                        <div style="position:absolute;bottom:10%;width:60%;height:64px;background:rgba(6,182,212,0.1);border-radius:100%;filter:blur(24px);animation:pulse 2s infinite;"></div>

                        <!-- 3D Character Container -->
                        <div id="lobby-canvas-container" style="width:100%;height:100%;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                            <div id="lobby-loading-text" class="font-gaming" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:1.5rem;color:#22d3ee;animation:pulse 1s infinite;">
                                LOADING ASSETS... 0%
                            </div>
                        </div>

                        <!-- Player Name UI Layer (Editable) -->
                        <div style="position:absolute;top:20px;width:100%;display:flex;justify-content:center;pointer-events:auto;">
                            <div id="player-name-container" style="background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);display:flex;flex-direction:column;align-items:center;cursor:pointer;transition:all 0.2s;">
                                <input id="player-name-input" type="text" value="${this.state.username}" maxlength="16" style="display:none;background:rgba(0,0,0,0.6);border:1px solid #facc15;border-radius:4px;padding:4px 12px;font-size:1.5rem;color:white;text-align:center;font-family:'Anton',sans-serif;letter-spacing:0.15em;outline:none;width:200px;" />
                                <h2 id="player-name" class="font-gaming" style="font-size:1.875rem;color:white;letter-spacing:0.2em;cursor:pointer;">${this.state.username}</h2>
                                <span style="color:#facc15;font-size:10px;font-weight:bold;letter-spacing:0.2em;">CLICK TO EDIT NAME</span>
                            </div>
                        </div>
                        
                        <!-- Chat Box (Bottom Center) -->
                        <div id="lobby-chat" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);width:400px;max-height:200px;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
                            <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;">
                                <span style="color:#22d3ee;font-size:11px;font-weight:bold;letter-spacing:0.15em;">GLOBAL CHAT</span>
                                <span id="chat-online-count" style="color:#6b7280;font-size:10px;">47 online</span>
                            </div>
                            <div id="chat-messages" style="flex:1;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column;gap:4px;max-height:120px;">
                                <!-- Chat messages populated by JS -->
                            </div>
                            <div style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:8px;">
                                <input id="chat-input" type="text" placeholder="Type a message..." maxlength="100" style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 10px;color:white;font-size:12px;outline:none;" />
                                <button id="chat-send" style="background:#22d3ee;color:black;border:none;border-radius:4px;padding:6px 12px;font-size:11px;font-weight:bold;cursor:pointer;">SEND</button>
                            </div>
                        </div>
                    </section>

                    <!-- RIGHT PANEL -->
                    <aside id="lobby-sidebar-right" style="width:16.67%;padding:24px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;">
                        <!-- Notification Feed (Top Right) -->
                        <div id="notification-feed" style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:hidden;">
                            <!-- Notifications populated by JS -->
                        </div>
                        
                        <div id="lobby-controls-container" style="width:100%;max-width:320px;display:flex;flex-direction:column;align-items:flex-end;gap:16px;">
                            
                            <!-- Mode Selector Card -->
                            <div style="width:100%;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);padding:20px;border-radius:12px;position:relative;overflow:hidden;">
                                <div style="position:relative;z-index:10;">
                                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                                        <h3 style="color:#d1d5db;font-size:10px;font-weight:900;letter-spacing:0.2em;background:rgba(0,0,0,0.5);padding:2px 8px;border-radius:4px;">SELECTED MODE</h3>
                                        <button id="change-mode-btn" style="font-size:10px;background:#facc15;color:black;padding:2px 8px;border-radius:4px;font-weight:bold;border:none;cursor:pointer;">CHANGE</button>
                                    </div>
                                    <h2 id="current-mode-title" class="font-gaming" style="font-size:2.25rem;color:white;font-style:italic;line-height:1;margin-bottom:4px;">${this.state.mode}</h2>
                                    <p id="current-mode-desc" style="font-size:12px;color:#d1d5db;">${this.state.modeDesc}</p>
                                    
                                    <!-- Fill Toggle -->
                                    <div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;">
                                        <span style="font-size:12px;font-weight:bold;color:#d1d5db;letter-spacing:0.1em;">Squad Fill</span>
                                        <button id="fillToggle" style="width:40px;height:20px;background:#10b981;border-radius:9999px;position:relative;border:none;cursor:pointer;">
                                            <div id="fillKnob" style="position:absolute;right:2px;top:2px;width:16px;height:16px;background:white;border-radius:50%;transition:transform 0.2s;"></div>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Player Slots Visual -->
                            <div id="player-slots-container" style="width:100%;display:none;flex-direction:column;gap:8px;margin-bottom:8px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:#d1d5db;font-size:10px;font-weight:900;letter-spacing:0.2em;">PLAYERS FOUND</span>
                                    <span id="players-count" style="color:#facc15;font-size:12px;font-weight:bold;">0/4</span>
                                </div>
                                <div id="player-slots" style="display:flex;gap:8px;justify-content:center;">
                                    <div class="player-slot" style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;transition:all 0.3s;">👤</div>
                                    <div class="player-slot" style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;transition:all 0.3s;">👤</div>
                                    <div class="player-slot" style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;transition:all 0.3s;">👤</div>
                                    <div class="player-slot" style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;transition:all 0.3s;">👤</div>
                                </div>
                            </div>
                            
                            <!-- THE PLAY BUTTON -->
                            <button id="readyBtn" class="skew-tab ring-pulse" style="position:relative;width:100%;height:96px;background:#facc15;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 0 25px rgba(250,204,21,0.4);">
                                <div class="animate-shine" style="position:absolute;inset:0;background:linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);width:50%;"></div>
                                <div class="skew-tab-content" style="display:flex;flex-direction:column;align-items:center;line-height:1;z-index:10;">
                                    <span id="readyText" class="font-gaming" style="font-size:3.75rem;color:#1e3a5f;">PLAY</span>
                                    <span id="readySub" style="font-size:10px;font-weight:900;color:rgba(30,58,95,0.7);letter-spacing:0.3em;margin-top:4px;">MATCHMAKING READY</span>
                                </div>
                                <!-- Countdown Ring -->
                                <svg id="countdown-ring" style="position:absolute;width:100%;height:100%;top:0;left:0;pointer-events:none;opacity:0;transition:opacity 0.3s;">
                                    <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" fill="none" stroke="#22d3ee" stroke-width="3" stroke-dasharray="1000" stroke-dashoffset="0" style="transition:stroke-dashoffset 1s linear;"/>
                                </svg>
                            </button>
                            
                            <div style="font-size:10px;color:#6b7280;font-family:monospace;width:100%;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;">
                                <span style="width:8px;height:8px;border-radius:50%;background:#10b981;"></span>
                                <span id="region-display">${this.state.region} • ${this.state.ping}ms</span>
                            </div>
                        </div>
                    </aside>
                </main>

                <!-- FOOTER -->
                <footer style="height:40px;background:rgba(0,0,0,0.9);backdrop-filter:blur(4px);border-top:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-size:10px;color:#6b7280;font-weight:bold;letter-spacing:0.2em;">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <span>Global Chat [Enter]</span>
                        <span style="width:1px;height:12px;background:rgba(255,255,255,0.1);"></span>
                        <span>Friends (0)</span>
                    </div>
                    <div>
                        <span>BITBLAST Client v0.9.2 (BETA)</span>
                    </div>
                </footer>

            </div>

            <!-- Mode Selector Modal -->
            <div id="mode-modal" style="display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.8);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
                <div style="width:100%;max-width:896px;background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden;">
                    <div style="padding:24px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.2);">
                        <h2 class="font-gaming" style="font-size:1.875rem;color:white;letter-spacing:0.1em;">SELECT GAME MODE</h2>
                        <button id="close-mode-modal" style="color:#9ca3af;background:transparent;border:none;cursor:pointer;font-size:24px;">✕</button>
                    </div>
                    <div style="padding:32px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
                        <div class="mode-card" data-mode="TEAM DEATHMATCH" data-desc="5v5 Tactical Combat" style="cursor:pointer;border:2px solid transparent;background:linear-gradient(to bottom,rgba(6,182,212,0.3),black);padding:16px;border-radius:12px;height:256px;display:flex;flex-direction:column;justify-content:flex-end;">
                            <h3 class="font-gaming" style="font-size:1.5rem;color:white;font-style:italic;">TEAM DEATHMATCH</h3>
                            <p style="font-size:12px;color:#d1d5db;">5v5 Tactical Combat</p>
                        </div>
                        <div class="mode-card" data-mode="FREE FOR ALL" data-desc="Every player for themselves" style="cursor:pointer;border:2px solid transparent;background:linear-gradient(to bottom,rgba(147,51,234,0.3),black);padding:16px;border-radius:12px;height:256px;display:flex;flex-direction:column;justify-content:flex-end;">
                            <h3 class="font-gaming" style="font-size:1.5rem;color:white;font-style:italic;">FREE FOR ALL</h3>
                            <p style="font-size:12px;color:#d1d5db;">Every player for themselves</p>
                        </div>
                        <div class="mode-card" data-mode="CAPTURE THE FLAG" data-desc="Steal the enemy flag" style="cursor:pointer;border:2px solid transparent;background:linear-gradient(to bottom,rgba(16,185,129,0.3),black);padding:16px;border-radius:12px;height:256px;display:flex;flex-direction:column;justify-content:flex-end;">
                            <h3 class="font-gaming" style="font-size:1.5rem;color:white;font-style:italic;">CAPTURE THE FLAG</h3>
                            <p style="font-size:12px;color:#d1d5db;">Steal the enemy flag</p>
                        </div>
                        <div class="mode-card" data-mode="BATTLE ROYALE" data-desc="Be the last one standing" style="cursor:pointer;border:2px solid transparent;background:linear-gradient(to bottom,rgba(239,68,68,0.3),black);padding:16px;border-radius:12px;height:256px;display:flex;flex-direction:column;justify-content:flex-end;">
                            <h3 class="font-gaming" style="font-size:1.5rem;color:white;font-style:italic;">BATTLE ROYALE</h3>
                            <p style="font-size:12px;color:#d1d5db;">Be the last one standing</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Toast Notification -->
            <div id="lobby-toast" style="position:fixed;top:96px;left:50%;transform:translateX(-50%) translateY(-20px);background:#22d3ee;color:black;padding:12px 24px;border-radius:8px;font-weight:bold;opacity:0;pointer-events:none;transition:all 0.5s;z-index:200;">
                Profile Saved!
            </div>
        `;

        document.body.insertBefore(lobby, document.body.firstChild);
        this.container = lobby;
    }

    private initializeUI(): void {
        this.updateXPBar();
    }

    private updateXPBar(): void {
        const xpNeeded = this.state.level * 1000;
        const percentage = (this.state.xp / xpNeeded) * 100;
        const xpBar = document.getElementById('xp-bar');
        if (xpBar) {
            xpBar.style.width = `${percentage}%`;
        }
    }

    private init3DCharacter(): void {
        const container = document.getElementById('lobby-canvas-container');
        const loadingText = document.getElementById('lobby-loading-text');
        if (!container) return;

        this.scene = new THREE.Scene();

        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.set(0, 15, 280);

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        // Lighting
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0x22d3ee, 2.0);
        dirLight.position.set(50, 100, 150);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const rimLight = new THREE.DirectionalLight(0x818cf8, 1.2);
        rimLight.position.set(0, 80, -150);
        this.scene.add(rimLight);

        const leftFill = new THREE.PointLight(0x22d3ee, 0.8, 400);
        leftFill.position.set(-200, 100, 100);
        this.scene.add(leftFill);

        const rightFill = new THREE.PointLight(0xfacc15, 0.6, 400);
        rightFill.position.set(200, 100, 100);
        this.scene.add(rightFill);

        // Load character with idle animation and rifle
        const loader = new FBXLoader();
        const mtlLoader = new MTLLoader();
        const objLoader = new OBJLoader();

        // Load the rifle model first
        const weaponBasePath = `${import.meta.env.BASE_URL}assets/models/weapons/weaponpack/Models/`;

        mtlLoader.load(weaponBasePath + 'machinegun.mtl', (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            objLoader.load(weaponBasePath + 'machinegun.obj', (rifleModel) => {
                // Store rifle for attachment after character loads
                rifleModel.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        (child.material as THREE.MeshPhongMaterial).emissive = new THREE.Color(0x222222);
                        (child.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.1;
                    }
                });

                // Now load the character
                loader.load(`${import.meta.env.BASE_URL}assets/models/characters/Amy/amy_idle.fbx`, (object) => {
                    // Scale to match lobby display (adjusted for assets path model)
                    object.scale.set(1.27, 1.27, 1.27);
                    object.position.set(0, -45, 50);

                    object.traverse((child) => {
                        if ((child as THREE.Mesh).isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    this.scene!.add(object);

                    // Find right hand bone and attach rifle - log all bones for debugging
                    let handBone: THREE.Object3D | null = null;
                    const bones: string[] = [];
                    object.traverse((child) => {
                        if ((child as any).isBone) {
                            bones.push(child.name);
                            const boneName = child.name.toLowerCase();
                            if (boneName.includes('righthand') && !boneName.includes('thumb') && !boneName.includes('index') &&
                                !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
                                handBone = child;
                            }
                            if (!handBone && (boneName.includes('hand') && boneName.includes('right') ||
                                boneName.includes('r_hand') || boneName.includes('hand_r'))) {
                                handBone = child;
                            }
                        }
                    });

                    // Attach rifle to hand
                    if (handBone) {
                        const rifle = rifleModel.clone();

                        // Values from weapon-editor
                        // Scale: baseScale * 0.6 * scaleCompensation = 6.4 * 0.6 * 160 = 614.4
                        const weaponScale = 6.4 * 0.6 * 160;
                        rifle.scale.set(weaponScale, weaponScale, weaponScale);
                        // Position
                        rifle.position.set(6.3, 13.8, 1.3);
                        // Rotation: X=-102°, Y=7°, Z=-93°
                        rifle.rotation.set(
                            -0.569 * Math.PI,
                            0.040 * Math.PI,
                            -0.514 * Math.PI
                        );
                        handBone.add(rifle);
                    } else {
                        console.warn('[Lobby] No hand bone found! Adding rifle to scene directly for testing');
                        // Fallback: add rifle directly to scene to verify it loads
                        const rifle = rifleModel.clone();
                        rifle.scale.set(100, 100, 100);
                        rifle.position.set(50, 0, 50);
                        this.scene!.add(rifle);
                    }

                    const mixer = new THREE.AnimationMixer(object);
                    this.mixers.push(mixer);

                    if (object.animations && object.animations.length > 0) {
                        const action = mixer.clipAction(object.animations[0]);
                        action.play();
                    }

                    if (loadingText) {
                        loadingText.style.display = 'none';
                    }
                }, (xhr) => {
                    if (xhr.lengthComputable && loadingText) {
                        const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
                        loadingText.innerText = `LOADING ASSETS... ${percentComplete}%`;
                    }
                }, (error) => {
                    console.error('Error loading model:', error);
                    if (loadingText) {
                        loadingText.innerText = 'ERROR LOADING MODEL';
                        loadingText.style.color = '#ef4444';
                    }
                });
            });
        });

        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.animate();
    }

    private onWindowResize(): void {
        const container = document.getElementById('lobby-canvas-container');
        if (!container || !this.camera || !this.renderer) return;

        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    private animate(): void {
        this.animationId = requestAnimationFrame(this.animate.bind(this));

        const delta = this.clock.getDelta();
        this.mixers.forEach(mixer => mixer.update(delta));

        if (this.camera && this.renderer && this.scene) {
            // Subtle camera sway
            const time = this.clock.getElapsedTime();
            this.camera.position.x = Math.sin(time * 0.1) * 10;
            this.camera.position.y = 30 + Math.sin(time * 0.15) * 2;
            this.camera.lookAt(0, 40, 0);

            this.renderer.render(this.scene, this.camera);
        }
    }

    private createParticles(): void {
        if (!this.state.settings.particles) return;

        const container = document.getElementById('lobby-particles');
        if (!container) return;

        this.particleInterval = setInterval(() => {
            if (!this.state.settings.particles) return;

            const particle = document.createElement('div');
            particle.className = 'lobby-particle';

            const size = Math.random() * 4 + 2;
            const startX = Math.random() * window.innerWidth;
            const startY = window.innerHeight + 20;
            const endX = startX + (Math.random() - 0.5) * 200;
            const endY = -20;

            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.left = `${startX}px`;
            particle.style.top = `${startY}px`;
            particle.style.setProperty('--tx', `${endX - startX}px`);
            particle.style.setProperty('--ty', `${endY - startY}px`);

            container.appendChild(particle);

            setTimeout(() => particle.remove(), 8000);
        }, 500);
    }

    private populateQuests(): void {
        const quests = [
            { title: 'Play your first match', progress: 0, max: 1, xp: 1000, color: '#10b981' },
            { title: 'Deal 500 Damage', progress: 0, max: 500, xp: 2500, color: '#3b82f6' },
            { title: 'Get 3 Eliminations', progress: 0, max: 3, xp: 3000, color: '#8b5cf6' },
            { title: 'Survive 10 Minutes', progress: 0, max: 600, xp: 1500, color: '#facc15' }
        ];

        const container = document.getElementById('quest-list');
        if (!container) return;

        container.innerHTML = quests.map(q => `
            <div style="background:rgba(0,0,0,0.4);padding:12px;border-radius:8px;border-left:3px solid ${q.color};cursor:pointer;">
                <p style="font-size:14px;font-weight:bold;color:#e5e7eb;">${q.title}</p>
                <p style="font-size:12px;color:${q.color};opacity:0.8;margin-top:4px;">${q.progress}/${q.max} Completed</p>
                <span style="font-size:12px;color:${q.color};float:right;margin-top:-24px;">+${(q.xp / 1000).toFixed(1)}K XP</span>
            </div>
        `).join('');
    }

    // ========== Player Slots Visual ==========
    private updatePlayerSlots(filled: number): void {
        const container = document.getElementById('player-slots-container');
        const slots = document.querySelectorAll('#player-slots .player-slot');
        const countEl = document.getElementById('players-count');

        if (container) {
            container.style.display = 'flex';
        }

        if (countEl) {
            countEl.textContent = `${filled}/4`;
        }

        slots.forEach((slot, index) => {
            const slotEl = slot as HTMLElement;
            if (index < filled) {
                // Filled slot - glowing green
                slotEl.style.background = 'rgba(16, 185, 129, 0.3)';
                slotEl.style.borderColor = '#10b981';
                slotEl.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.5)';
                slotEl.innerHTML = '✅';
            } else {
                // Empty slot - gray
                slotEl.style.background = 'rgba(255, 255, 255, 0.05)';
                slotEl.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                slotEl.style.boxShadow = 'none';
                slotEl.innerHTML = '👤';
            }
        });
    }

    // ========== Username Editing ==========
    private setupUsernameEditing(): void {
        const container = document.getElementById('player-name-container');
        const nameDisplay = document.getElementById('player-name');
        const nameInput = document.getElementById('player-name-input') as HTMLInputElement;

        if (!container || !nameDisplay || !nameInput) return;

        // Click to edit
        container.addEventListener('click', () => {
            nameDisplay.style.display = 'none';
            nameInput.style.display = 'block';
            nameInput.focus();
            nameInput.select();
        });

        // Save on blur or enter
        const saveUsername = () => {
            let newName = nameInput.value.trim().replace(/[^a-zA-Z0-9_]/g, '');
            if (newName.length < 2) newName = this.state.username;
            if (newName.length > 16) newName = newName.substring(0, 16);

            this.state.username = newName;
            localStorage.setItem('bitblast_username', newName);
            nameDisplay.textContent = newName;
            nameInput.value = newName;

            nameDisplay.style.display = 'block';
            nameInput.style.display = 'none';

            this.showToast('Username saved!');
        };

        nameInput.addEventListener('blur', saveUsername);
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveUsername();
                e.preventDefault();
            }
            if (e.key === 'Escape') {
                nameInput.value = this.state.username;
                nameDisplay.style.display = 'block';
                nameInput.style.display = 'none';
            }
        });
    }

    // ========== Chat System ==========
    private setupChatHandlers(): void {
        const sendBtn = document.getElementById('chat-send');
        const chatInput = document.getElementById('chat-input') as HTMLInputElement;

        sendBtn?.addEventListener('click', () => {
            if (chatInput && chatInput.value.trim()) {
                this.sendChatMessage(chatInput.value.trim());
                chatInput.value = '';
            }
        });

        // Note: chat_message listener is set up in connectToServer() after socket is created
    }

    private sendChatMessage(message: string): void {
        // Add to local chat
        this.addChatMessage(this.state.username, message, true);

        // Send to server if connected
        if (this.socket?.connected) {
            this.socket.emit('chat_message', { message });
        }
    }

    private addChatMessage(username: string, message: string, isOwnMessage: boolean): void {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message';
        msgEl.style.cssText = `
            font-size: 12px;
            padding: 4px 0;
            animation: slideIn 0.3s ease-out;
        `;

        const nameColor = isOwnMessage ? '#facc15' : '#22d3ee';
        msgEl.innerHTML = `<span style="color:${nameColor};font-weight:bold;">${username}:</span> <span style="color:rgba(255,255,255,0.85);">${message}</span>`;

        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;

        // Limit messages
        while (container.children.length > 50) {
            container.removeChild(container.children[0]);
        }
    }

    private startChatSimulation(): void {
        // Add initial messages
        setTimeout(() => this.addFakeChatMessage(), 2000);
        setTimeout(() => this.addFakeChatMessage(), 5000);

        // Continue with random intervals
        this.chatSimulationInterval = setInterval(() => {
            this.addFakeChatMessage();
        }, 8000 + Math.random() * 12000); // 8-20 seconds
    }

    private addFakeChatMessage(): void {
        // Get a unique message
        let index: number;
        let attempts = 0;
        do {
            index = Math.floor(Math.random() * FAKE_CHAT_MESSAGES.length);
            attempts++;
        } while (this.usedChatIndices.has(index) && attempts < 10);

        // Reset if we've used too many
        if (this.usedChatIndices.size > FAKE_CHAT_MESSAGES.length * 0.7) {
            this.usedChatIndices.clear();
        }
        this.usedChatIndices.add(index);

        const msg = FAKE_CHAT_MESSAGES[index];
        this.addChatMessage(msg.username, msg.message, false);
    }

    // ========== Notification Feed ==========
    private startNotificationSimulation(): void {
        // Add initial notifications
        setTimeout(() => this.addFakeNotification(), 1500);
        setTimeout(() => this.addFakeNotification(), 4000);
        setTimeout(() => this.addFakeNotification(), 7000);

        // Continue with random intervals
        this.notificationSimulationInterval = setInterval(() => {
            this.addFakeNotification();
        }, 4000 + Math.random() * 6000); // 4-10 seconds
    }

    private addFakeNotification(): void {
        const container = document.getElementById('notification-feed');
        if (!container) return;

        const notification = this.generateRandomNotification();

        const notifEl = document.createElement('div');
        notifEl.style.cssText = `
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-left: 3px solid ${notification.color};
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.9);
            animation: slideIn 0.3s ease-out;
            transition: opacity 0.5s;
        `;
        notifEl.innerHTML = `<span style="color:${notification.color};">${notification.icon}</span> ${notification.text}`;

        // Add at top
        container.insertBefore(notifEl, container.firstChild);

        // Limit old ones - remove excess immediately
        while (container.children.length > 5) {
            const last = container.lastChild;
            if (last) {
                container.removeChild(last);
            }
        }

        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (notifEl.parentNode) {
                notifEl.style.opacity = '0';
                setTimeout(() => notifEl.remove(), 500);
            }
        }, 15000);
    }

    private generateRandomNotification(): { text: string; icon: string; color: string } {
        const types = ['kills', 'headshots', 'streaks', 'joins', 'matchEvents', 'achievements'];
        const type = types[Math.floor(Math.random() * types.length)];

        const getRandomName = () => FAKE_PLAYER_NAMES[Math.floor(Math.random() * FAKE_PLAYER_NAMES.length)];

        const templates = NOTIFICATION_TEMPLATES[type as keyof typeof NOTIFICATION_TEMPLATES];
        let template = templates[Math.floor(Math.random() * templates.length)];

        // Replace placeholders
        template = template
            .replace('{killer}', getRandomName())
            .replace('{victim}', getRandomName())
            .replace('{player}', getRandomName())
            .replace('{count}', String(Math.floor(Math.random() * 50) + 20))
            .replace('{level}', String(Math.floor(Math.random() * 100) + 1))
            .replace('{tier}', String(Math.floor(Math.random() * 100) + 1));

        const configs: Record<string, { icon: string; color: string }> = {
            kills: { icon: '💥', color: '#ef4444' },
            headshots: { icon: '🎯', color: '#f97316' },
            streaks: { icon: '🔥', color: '#facc15' },
            joins: { icon: '👤', color: '#10b981' },
            matchEvents: { icon: '🎮', color: '#22d3ee' },
            achievements: { icon: '🏆', color: '#a855f7' },
        };

        return {
            text: template,
            icon: configs[type].icon,
            color: configs[type].color,
        };
    }

    private setupEventListeners(): void {
        // Play button
        const readyBtn = document.getElementById('readyBtn');
        readyBtn?.addEventListener('click', () => this.toggleReady());
        // Add touch support for mobile
        readyBtn?.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.toggleReady();
        }, { passive: false });

        // Mode selector
        const changeModeBtn = document.getElementById('change-mode-btn');
        changeModeBtn?.addEventListener('click', () => this.openModeModal());

        const closeModeModal = document.getElementById('close-mode-modal');
        closeModeModal?.addEventListener('click', () => this.closeModeModal());

        // Mode cards
        document.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const mode = target.dataset.mode || '';
                const desc = target.dataset.desc || '';
                this.selectMode(mode, desc);
            });
        });

        // Fill toggle
        const fillToggle = document.getElementById('fillToggle');
        fillToggle?.addEventListener('click', () => this.toggleFill());

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModeModal();
            }
            // Enter key sends chat
            if (e.key === 'Enter') {
                const chatInput = document.getElementById('chat-input') as HTMLInputElement;
                if (document.activeElement === chatInput && chatInput.value.trim()) {
                    this.sendChatMessage(chatInput.value.trim());
                    chatInput.value = '';
                }
            }
        });

        // Username editing
        this.setupUsernameEditing();

        // Chat functionality
        this.setupChatHandlers();

        // Start simulations
        this.startChatSimulation();
        this.startNotificationSimulation();

        // Mobile-specific: Add fullscreen button and orientation warning
        this.setupMobileSupport();
    }

    private setupMobileSupport(): void {
        // Check if we're on a mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 0 && window.innerWidth < 1280);

        if (!isMobile) return;

        // Add mobile class to body
        document.body.classList.add('mobile-device');

        // Import MobileControls dynamically to avoid circular deps
        import('../controls/MobileControls').then(({ MobileControls }) => {
            // Show orientation warning if in portrait
            MobileControls.showOrientationWarning();

            // Add fullscreen button near the PLAY button
            const readyBtn = document.getElementById('readyBtn');
            if (readyBtn && readyBtn.parentElement) {
                const fullscreenContainer = document.createElement('div');
                fullscreenContainer.style.cssText = `
                    display: flex;
                    justify-content: center;
                    margin-top: 10px;
                `;

                const fullscreenBtn = document.createElement('button');
                fullscreenBtn.id = 'mobile-fullscreen-lobby-btn';
                fullscreenBtn.innerHTML = '⛶ TAP FOR FULLSCREEN';
                fullscreenBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(0, 242, 255, 0.2) 0%, rgba(0, 180, 255, 0.3) 100%);
                    border: 2px solid rgba(0, 242, 255, 0.6);
                    color: white;
                    font-family: 'Rajdhani', 'Teko', sans-serif;
                    font-size: 14px;
                    font-weight: 600;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    touch-action: manipulation;
                    transition: all 0.2s ease;
                `;

                const requestFullscreen = async () => {
                    const result = await MobileControls.requestFullscreen();
                    if (result) {
                        fullscreenBtn.innerHTML = '✓ FULLSCREEN ACTIVE';
                        fullscreenBtn.style.borderColor = 'rgba(100, 255, 150, 0.7)';
                    }
                };

                fullscreenBtn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    requestFullscreen();
                }, { passive: false });

                fullscreenBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    requestFullscreen();
                });

                fullscreenContainer.appendChild(fullscreenBtn);
                readyBtn.parentElement.insertBefore(fullscreenContainer, readyBtn.nextSibling);
            }

            // Add mobile controls info tooltip
            const mobileInfo = document.createElement('div');
            mobileInfo.style.cssText = `
                position: fixed;
                bottom: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: rgba(255, 255, 255, 0.7);
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                font-family: 'Rajdhani', sans-serif;
                z-index: 100;
                pointer-events: none;
            `;
            mobileInfo.innerHTML = '📱 Touch controls enabled • Rotate to landscape for best experience';
            document.body.appendChild(mobileInfo);

            // Hide info after 5 seconds
            setTimeout(() => {
                mobileInfo.style.transition = 'opacity 0.5s';
                mobileInfo.style.opacity = '0';
                setTimeout(() => mobileInfo.remove(), 500);
            }, 5000);
        });
    }

    private toggleReady(): void {
        this.state.isReady = !this.state.isReady;
        const btn = document.getElementById('readyBtn');
        const mainText = document.getElementById('readyText');
        const subText = document.getElementById('readySub');

        if (!btn || !mainText || !subText) return;

        if (this.state.isReady) {
            btn.style.background = '#dc2626';
            mainText.innerText = 'CANCEL';
            mainText.style.color = 'white';
            subText.innerText = 'CONNECTING TO SERVER...';
            subText.style.color = 'rgba(255,255,255,0.8)';

            // Start real matchmaking via socket
            if (this.socket?.connected) {
                const modeId = this.getSelectedModeId();
                this.socket.emit('start_queue', { modeId, username: this.state.username });
                subText.innerText = 'SEARCHING FOR MATCH...';
            } else {
                // Server not available - try to connect
                this.connectToServer();
                subText.innerText = 'CONNECTING...';

                // Retry queue after connection attempt
                setTimeout(() => {
                    if (this.socket?.connected && this.state.isReady) {
                        const modeId = this.getSelectedModeId();
                        this.socket.emit('start_queue', { modeId, username: this.state.username });
                        subText.innerText = 'SEARCHING FOR MATCH...';
                    } else if (this.state.isReady) {
                        // Still not connected - show error
                        subText.innerText = 'SERVER OFFLINE - RETRY?';
                        subText.style.color = '#ef4444';
                    }
                }, 2000);
            }
        } else {
            this.cancelQueue();
        }
    }

    private startGame(matchInfo: { matchId: string; token: string; serverUrl: string }): void {
        // Hide lobby
        if (this.container) {
            this.container.style.display = 'none';
        }

        // Stop 3D rendering
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
        }

        // Stop particles
        if (this.particleInterval !== null) {
            clearInterval(this.particleInterval);
        }

        // Dispose Three.js resources
        if (this.renderer) {
            this.renderer.dispose();
        }

        // Call the game start callback with match info INCLUDING the socket
        if (this.onPlayCallback) {
            // Pass the lobby socket so the game can reuse it instead of creating a new one
            this.onPlayCallback({
                ...matchInfo,
                socket: this.socket
            });
        }
    }

    private openModeModal(): void {
        const modal = document.getElementById('mode-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    private closeModeModal(): void {
        const modal = document.getElementById('mode-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    private selectMode(mode: string, desc: string): void {
        this.state.mode = mode;
        this.state.modeDesc = desc;

        const modeTitle = document.getElementById('current-mode-title');
        const modeDesc = document.getElementById('current-mode-desc');

        if (modeTitle) modeTitle.innerText = mode;
        if (modeDesc) modeDesc.innerText = desc;

        this.closeModeModal();
        this.showToast(`Mode changed to ${mode}`);
    }

    private toggleFill(): void {
        this.state.fill = !this.state.fill;
        const btn = document.getElementById('fillToggle');
        const knob = document.getElementById('fillKnob');

        if (!btn || !knob) return;

        if (this.state.fill) {
            btn.style.background = '#10b981';
            knob.style.transform = 'translateX(0)';
        } else {
            btn.style.background = '#4b5563';
            knob.style.transform = 'translateX(-20px)';
        }
    }

    private showToast(message: string): void {
        const toast = document.getElementById('lobby-toast');
        if (!toast) return;

        toast.innerText = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(-20px)';
        }, 2000);
    }

    /**
     * Get the selected game mode ID for the game to use
     */
    public getSelectedModeId(): string {
        // Map lobby mode names to game mode IDs
        const modeMap: Record<string, string> = {
            'FREE FOR ALL': 'ffa',
            'TEAM DEATHMATCH': 'tdm',
            'CAPTURE THE FLAG': 'ctf',
            'BATTLE ROYALE': 'br',
        };
        return modeMap[this.state.mode] || 'ffa';
    }

    /**
     * Get the full selected mode info
     */
    public getSelectedMode(): { mode: string; modeId: string; desc: string } {
        return {
            mode: this.state.mode,
            modeId: this.getSelectedModeId(),
            desc: this.state.modeDesc,
        };
    }

    /**
     * Get the socket for game to use (to stay in same connection)
     */
    public getSocket(): Socket | null {
        return this.socket;
    }

    /**
     * Get the player ID
     */
    public getPlayerId(): string {
        return this.playerId;
    }

    /**
     * Show loading screen when match is found
     */
    private showMatchLoadingScreen(humanPlayers: number, totalPlayers: number): void {
        // Create loading screen if it doesn't exist
        let loadingScreen = document.getElementById('match-loading-screen');

        if (!loadingScreen) {
            loadingScreen = document.createElement('div');
            loadingScreen.id = 'match-loading-screen';
            loadingScreen.className = 'fixed inset-0 z-[2000] flex items-center justify-center bg-black';

            // Add styles
            const style = document.createElement('style');
            style.id = 'match-loading-screen-style';
            style.textContent = `
                .loading-image-container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .loading-background {
                    width: 100vw;
                    height: 100vh;
                    object-fit: cover;
                    object-position: center;
                    animation: zoomInLoading 3s ease-out forwards;
                }
                
                @keyframes zoomInLoading {
                    0% { transform: scale(1); }
                    100% { transform: scale(1.2); }
                }
                
                .loading-overlay {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 2rem;
                    background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6));
                }
                
                .loading-title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 3rem;
                    font-weight: 700;
                    color: #fff;
                    text-shadow: 0 0 20px rgba(168, 85, 247, 0.8);
                    letter-spacing: 0.1em;
                }
                
                .loading-status {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 1rem;
                }
                
                .player-count {
                    font-family: 'Rajdhani', sans-serif;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #a78bfa;
                }
                
                .countdown-circle {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    border: 4px solid rgba(168, 85, 247, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.5);
                    box-shadow: 0 0 30px rgba(168, 85, 247, 0.5);
                }
                
                .countdown-number {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 3rem;
                    font-weight: 900;
                    color: #fff;
                    text-shadow: 0 0 10px rgba(168, 85, 247, 1);
                }
                
                .loading-info {
                    font-family: 'Rajdhani', sans-serif;
                    font-size: 1.2rem;
                    color: rgba(255, 255, 255, 0.8);
                    text-align: center;
                }
            `;

            if (!document.getElementById('match-loading-screen-style')) {
                document.head.appendChild(style);
            }

            document.body.appendChild(loadingScreen);
        }

        loadingScreen.innerHTML = `
            <div class="loading-image-container">
                <img src="/assets/images/loadingScreen.png" alt="Loading" class="loading-background" />
                <div class="loading-overlay">
                    <div class="loading-title">MATCH FOUND</div>
                    <div class="loading-status">
                        <div class="player-count">${humanPlayers}/${totalPlayers} PLAYERS READY</div>
                        <div class="countdown-circle">
                            <div class="countdown-number" id="loading-countdown">10</div>
                        </div>
                        <div class="loading-info">Game starting soon...</div>
                    </div>
                </div>
            </div>
        `;

        loadingScreen.style.display = 'flex';

        // Start countdown animation
        let countdown = 10;
        const countdownInterval = setInterval(() => {
            countdown--;
            const countdownEl = document.getElementById('loading-countdown');
            if (countdownEl) {
                countdownEl.textContent = countdown.toString();
            }
            if (countdown <= 0) {
                clearInterval(countdownInterval);
            }
        }, 1000);
    }

    /**
     * Update loading screen when game starts
     */
    private updateLoadingForGameStart(): void {
        const loadingScreen = document.getElementById('match-loading-screen');
        if (!loadingScreen) return;

        const overlay = loadingScreen.querySelector('.loading-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="loading-title">ENTERING GAME</div>
                <div class="loading-status">
                    <div class="loading-info">Connecting to server...</div>
                </div>
            `;
        }
    }

    public dispose(): void {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.particleInterval !== null) {
            clearInterval(this.particleInterval);
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.socket) {
            this.socket.disconnect();
        }
        if (this.container) {
            this.container.remove();
        }
    }
}
