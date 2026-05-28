/**
 * BITBLAST Lobby — CrazyGames Edition
 *
 * A complete redesign of the pre-match lobby, built around the CrazyGames platform:
 *  - Uses the player's CrazyGames account (username + avatar) when available, with a
 *    local-edit fallback persisted through the SDK's cloud data store.
 *  - Server-driven matchmaking: PLAY queues on the multiplayer server, which runs a short
 *    join window for human players and then fills remaining slots with bots — so a match
 *    always starts, with all spawn positions assigned authoritatively by the server.
 *  - A rewarded-ad "Daily Drop" that grants credits (CrazyGames monetization).
 *  - Drives the SDK gameplay/loading lifecycle so ads are timed correctly.
 *  - A responsive banner slot, global chat, live activity feed and a 3D character stage.
 *
 * Public API is unchanged so the rest of the game keeps working:
 *   init(onPlay), getSelectedMode(), getSelectedModeId(), getSocket(), getPlayerId(), dispose()
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { io, Socket } from 'socket.io-client';
import { getBitBlastServerUrl, getSocketIOPath } from '../config/network';
import { CG } from '../integrations/CrazyGamesSDK';

interface MatchInfo {
    matchId: string;
    token: string;
    serverUrl: string;
    socket: Socket | null;
}

interface GameModeOption {
    id: string;          // lobby mode id sent to server / mapped by main.ts
    title: string;
    tagline: string;
    accent: string;      // hex accent colour
}

const GAME_MODES: GameModeOption[] = [
    { id: 'ffa', title: 'FREE FOR ALL', tagline: 'Every player for themselves', accent: '#22d3ee' },
    { id: 'tdm', title: 'TEAM DEATHMATCH', tagline: 'Squad up — most kills wins', accent: '#a855f7' },
];

const FAKE_PLAYER_NAMES = [
    'xShadowKiller', 'NightHawk99', 'VelocityX', 'StormBringer', 'PhantomAce',
    'CyberWolf', 'BlazeMaster', 'IronReaper', 'QuantumFury', 'SteelVenom',
    'DarkSpectre', 'ThunderBolt', 'RapidFire', 'SilentStrike', 'NovaFlash',
    'ZeroGravity', 'ToxicViper', 'GhostRider', 'AlphaStorm', 'NeonBlade',
    'SkyFall', 'OmegaWolf', 'CrimsonFang', 'FrostBite', 'EliteSniper',
    'WarMachine', 'ShadowFox', 'BulletProof', 'HyperX', 'TurboKill',
];

const FAKE_CHAT = [
    'lets gooo', 'gg last round', 'whos ready', 'headshots only', 'sniper meta is back',
    'AR diff', 'first to 30 wins', 'queue with me?', 'cracked aim today', 'one more game',
    'this map slaps', 'flank left', 'clutch or kick', 'warming up', 'ez dub incoming',
    'who wants to 1v1', 'rotate B', 'nice shot', 'lag spike rip', 'GLHF everyone',
];

const ACTIVITY_FEED = [
    (n1: string, n2: string) => `💥 ${n1} eliminated ${n2}`,
    (n1: string, n2: string) => `🎯 ${n1} headshot ${n2}`,
    (n1: string) => `🔥 ${n1} is on a killstreak!`,
    (n1: string) => `👤 ${n1} joined the arena`,
    (n1: string) => `🏆 ${n1} got MVP last match`,
    () => `🎮 Double XP weekend is live!`,
];

const DAILY_DROP_REWARD = 500;

export class BitBlastLobby {
    private container: HTMLElement | null = null;
    private styleEl: HTMLStyleElement | null = null;

    // Identity / progression state (persisted via CG cloud data with localStorage fallback)
    private username = '';
    private avatarUrl = '';
    private level = 1;
    private xp = 150;
    private credits = 1250;
    private selectedModeId = 'ffa';

    // 3D scene
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    private renderer: THREE.WebGLRenderer | null = null;
    private mixers: THREE.AnimationMixer[] = [];
    private clock = new THREE.Clock();
    private animationId: number | null = null;
    private resizeHandler = this.onWindowResize.bind(this);

    // Timers
    private chatTimer: ReturnType<typeof setInterval> | null = null;
    private feedTimer: ReturnType<typeof setInterval> | null = null;
    private feedParticleInterval: ReturnType<typeof setInterval> | null = null;
    private connectRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private usedChat = new Set<number>();

    // Matchmaking
    private socket: Socket | null = null;
    private serverUrl = getBitBlastServerUrl();
    private playerId = 'player-' + Math.random().toString(36).slice(2, 9);
    private isQueued = false;
    private started = false;
    private countdownMax = 0; // largest countdown value seen this queue, for ring progress

    private onPlay: ((info: MatchInfo) => void) | null = null;

    // ===================================================================
    //  Lifecycle
    // ===================================================================

    public async init(onPlay: (info: MatchInfo) => void): Promise<void> {
        this.onPlay = onPlay;

        // Ensure the SDK is ready and load the player's identity before painting UI.
        await CG.ready;
        await this.loadIdentity();

        this.injectStyles();
        this.buildDOM();
        this.bindEvents();
        this.init3DCharacter();
        this.startChatSimulation();
        this.startActivityFeed();
        this.connectToServer();
        this.requestBanner();

        // React to CrazyGames sign-in / sign-out at runtime.
        CG.onAuthChanged((user) => {
            if (user) {
                this.username = user.username;
                this.avatarUrl = user.profilePictureUrl || this.avatarUrl;
                this.applyIdentityToDOM();
            }
        });

        // Lobby is a "not gameplay" surface — make sure the SDK knows.
        CG.gameplayStop();
    }

    private async loadIdentity(): Promise<void> {
        // 1) Prefer the signed-in CrazyGames account.
        const cgUser = await CG.getUser();
        if (cgUser) {
            this.username = cgUser.username;
            this.avatarUrl = cgUser.profilePictureUrl || '';
        }

        // 2) Otherwise use a stored / generated guest name.
        if (!this.username) {
            this.username = CG.getItem('bb_username') || `GUEST_${Math.floor(Math.random() * 9000) + 1000}`;
            CG.setItem('bb_username', this.username);
        }

        this.level = parseInt(CG.getItem('bb_level') || '1', 10);
        this.xp = parseInt(CG.getItem('bb_xp') || '150', 10);
        this.credits = parseInt(CG.getItem('bb_credits') || '1250', 10);
        this.selectedModeId = CG.getItem('bb_mode') || 'ffa';
        if (!this.avatarUrl) {
            this.avatarUrl = `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(this.username)}`;
        }
    }

    // ===================================================================
    //  Styles
    // ===================================================================

    private injectStyles(): void {
        const css = `
        #bb-lobby{position:fixed;inset:0;z-index:50;color:#e7ecf3;font-family:'Rajdhani',sans-serif;
            overflow:hidden;user-select:none;
            background:radial-gradient(120% 100% at 50% 0%,#15233f 0%,#0a0f1d 55%,#05070d 100%);}
        #bb-lobby *{box-sizing:border-box;}
        .bb-display{font-family:'Orbitron',sans-serif;}
        .bb-grid{position:absolute;inset:0;pointer-events:none;opacity:.18;
            background-image:linear-gradient(rgba(34,211,238,.25) 1px,transparent 1px),
                             linear-gradient(90deg,rgba(34,211,238,.25) 1px,transparent 1px);
            background-size:48px 48px;mask-image:radial-gradient(120% 90% at 50% 0%,#000 30%,transparent 80%);
            -webkit-mask-image:radial-gradient(120% 90% at 50% 0%,#000 30%,transparent 80%);}
        .bb-glow{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;}
        .bb-particles{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
        .bb-particle{position:absolute;border-radius:50%;background:rgba(34,211,238,.8);
            box-shadow:0 0 8px rgba(34,211,238,.9);animation:bb-float linear forwards;}
        @keyframes bb-float{from{transform:translateY(0);opacity:0;}10%{opacity:.9;}
            to{transform:translate(var(--tx),var(--ty));opacity:0;}}
        @keyframes bb-pulse{0%,100%{opacity:.5;}50%{opacity:1;}}
        @keyframes bb-shine{from{transform:translateX(-120%);}to{transform:translateX(220%);}}
        @keyframes bb-slidein{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}

        .bb-shell{position:relative;z-index:10;display:flex;flex-direction:column;height:100%;}
        .bb-header{display:flex;align-items:center;justify-content:space-between;padding:14px 26px;
            background:linear-gradient(to bottom,rgba(0,0,0,.65),transparent);
            border-bottom:1px solid rgba(255,255,255,.06);}
        .bb-logo{display:flex;align-items:center;gap:14px;}
        .bb-logo h1{font-size:38px;line-height:1;font-style:italic;letter-spacing:.06em;margin:0;
            background:linear-gradient(180deg,#fff,#9fb4d4);-webkit-background-clip:text;background-clip:text;
            -webkit-text-fill-color:transparent;text-shadow:0 4px 18px rgba(34,211,238,.35);}
        .bb-badge{font-size:10px;font-weight:900;letter-spacing:.2em;padding:3px 9px;border-radius:5px;
            background:#facc15;color:#0a0f1d;transform:skewX(-10deg);}
        .bb-userchip{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.55);
            border:1px solid rgba(255,255,255,.1);padding:6px 12px;border-radius:999px;cursor:pointer;
            transition:border-color .2s;}
        .bb-userchip:hover{border-color:rgba(34,211,238,.6);}
        .bb-avatar{width:34px;height:34px;border-radius:50%;background:#1b2a47;object-fit:cover;
            border:1px solid rgba(255,255,255,.15);}
        .bb-credits{display:flex;align-items:center;gap:7px;background:rgba(0,0,0,.55);
            border:1px solid rgba(255,255,255,.1);padding:6px 14px;border-radius:999px;font-weight:700;}
        .bb-credits .dot{width:14px;height:14px;border-radius:50%;background:#22d3ee;box-shadow:0 0 10px #22d3ee;}

        .bb-main{flex:1;display:grid;grid-template-columns:300px 1fr 360px;gap:0;overflow:hidden;}
        .bb-col{padding:22px;display:flex;flex-direction:column;gap:18px;overflow-y:auto;}
        .bb-col.left{background:linear-gradient(to right,rgba(0,0,0,.55),transparent);}
        .bb-col.right{background:linear-gradient(to left,rgba(0,0,0,.55),transparent);align-items:stretch;}
        .bb-card{background:rgba(8,14,26,.72);border:1px solid rgba(255,255,255,.08);border-radius:14px;
            padding:18px;backdrop-filter:blur(6px);}
        .bb-card h3{margin:0 0 12px;font-size:13px;letter-spacing:.18em;font-weight:700;color:#9fb0c8;
            text-transform:uppercase;}

        /* Profile / progression */
        .bb-prof-top{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
        .bb-level-ring{width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;
            background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.4);font-family:'Orbitron';
            font-weight:900;font-size:20px;color:#22d3ee;}
        .bb-xp-track{height:9px;border-radius:999px;background:rgba(0,0,0,.6);overflow:hidden;
            border:1px solid rgba(255,255,255,.06);}
        .bb-xp-fill{height:100%;background:linear-gradient(90deg,#fde047,#f59e0b);
            box-shadow:0 0 14px rgba(245,158,11,.7);transition:width .6s;}
        .bb-xp-meta{display:flex;justify-content:space-between;font-size:11px;font-weight:700;
            color:#8aa0bd;margin-top:6px;letter-spacing:.08em;}

        /* Daily drop (rewarded ad) */
        .bb-drop{display:flex;flex-direction:column;gap:10px;}
        .bb-drop .reward{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;color:#fde047;}
        .bb-btn{cursor:pointer;border:none;border-radius:10px;font-family:'Rajdhani',sans-serif;font-weight:700;
            letter-spacing:.08em;transition:transform .12s,filter .2s,opacity .2s;}
        .bb-btn:hover{filter:brightness(1.08);}
        .bb-btn:active{transform:translateY(1px);}
        .bb-btn:disabled{opacity:.45;cursor:default;filter:none;}
        .bb-btn-ad{background:linear-gradient(90deg,#7c3aed,#4f46e5);color:#fff;padding:11px;font-size:14px;
            display:flex;align-items:center;justify-content:center;gap:8px;}

        /* Center stage */
        .bb-stage{position:relative;display:flex;align-items:center;justify-content:center;}
        #bb-canvas{position:absolute;inset:0;}
        .bb-stage-glow{position:absolute;bottom:12%;width:54%;height:60px;border-radius:50%;
            background:rgba(34,211,238,.16);filter:blur(26px);animation:bb-pulse 2.4s infinite;}
        .bb-loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:'Orbitron';
            font-size:18px;color:#22d3ee;letter-spacing:.1em;animation:bb-pulse 1.1s infinite;}
        .bb-name-wrap{position:absolute;top:22px;left:50%;transform:translateX(-50%);text-align:center;
            background:rgba(0,0,0,.4);backdrop-filter:blur(8px);padding:9px 22px;border-radius:10px;
            border:1px solid rgba(255,255,255,.1);cursor:pointer;}
        .bb-name{font-family:'Orbitron';font-size:26px;letter-spacing:.14em;margin:0;color:#fff;}
        .bb-name-hint{font-size:10px;letter-spacing:.2em;color:#facc15;font-weight:700;}
        .bb-name-input{display:none;background:rgba(0,0,0,.7);border:1px solid #facc15;border-radius:6px;
            padding:5px 12px;font-size:22px;color:#fff;text-align:center;font-family:'Orbitron';
            letter-spacing:.1em;outline:none;width:240px;}

        /* Chat */
        .bb-chat{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);width:min(440px,90%);
            background:rgba(0,0,0,.66);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);
            border-radius:12px;display:flex;flex-direction:column;overflow:hidden;}
        .bb-chat-head{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;
            border-bottom:1px solid rgba(255,255,255,.08);font-size:11px;letter-spacing:.14em;}
        .bb-chat-head .live{color:#22d3ee;font-weight:700;}
        .bb-chat-msgs{max-height:120px;overflow-y:auto;padding:8px 14px;display:flex;flex-direction:column;gap:4px;
            font-size:13px;}
        .bb-chat-msg{animation:bb-slidein .25s ease-out;}
        .bb-chat-form{display:flex;gap:8px;padding:8px 14px;border-top:1px solid rgba(255,255,255,.08);}
        .bb-chat-form input{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
            border-radius:6px;padding:7px 10px;color:#fff;font-size:13px;outline:none;font-family:'Rajdhani';}
        .bb-chat-form button{background:#22d3ee;color:#04121b;border:none;border-radius:6px;padding:0 14px;
            font-weight:700;cursor:pointer;}

        /* Activity feed */
        .bb-feed{display:flex;flex-direction:column;gap:6px;}
        .bb-feed-item{background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.08);border-left:3px solid #22d3ee;
            border-radius:7px;padding:7px 11px;font-size:12px;animation:bb-slidein .3s ease-out;transition:opacity .5s;}

        /* Mode select */
        .bb-modes{display:flex;flex-direction:column;gap:9px;}
        .bb-mode{display:flex;align-items:center;gap:12px;cursor:pointer;padding:12px 14px;border-radius:11px;
            background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);transition:all .18s;}
        .bb-mode:hover{background:rgba(255,255,255,.06);}
        .bb-mode.active{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 0 22px -6px var(--acc);
            background:linear-gradient(90deg,color-mix(in srgb,var(--acc) 16%,transparent),transparent);}
        .bb-mode .pip{width:10px;height:10px;border-radius:50%;background:var(--acc);box-shadow:0 0 10px var(--acc);}
        .bb-mode .txt{flex:1;}
        .bb-mode .txt .t{font-family:'Orbitron';font-size:16px;font-style:italic;color:#fff;line-height:1.1;}
        .bb-mode .txt .d{font-size:12px;color:#9fb0c8;}
        .bb-mode .soloflag{font-size:9px;font-weight:900;letter-spacing:.15em;color:#0a0f1d;background:#f97316;
            padding:2px 6px;border-radius:4px;}

        /* PLAY button */
        .bb-play{position:relative;width:100%;height:92px;border:none;cursor:pointer;border-radius:14px;
            background:linear-gradient(90deg,#fde047,#facc15);overflow:hidden;
            box-shadow:0 0 30px -4px rgba(250,204,21,.55);}
        .bb-play .shine{position:absolute;top:0;left:0;height:100%;width:40%;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);
            animation:bb-shine 2.6s infinite;}
        .bb-play .label{position:relative;display:flex;flex-direction:column;align-items:center;line-height:1;}
        .bb-play .big{font-family:'Bebas Neue','Orbitron',sans-serif;font-size:52px;color:#0a1f33;letter-spacing:.04em;}
        .bb-play .sub{font-size:10px;font-weight:900;letter-spacing:.28em;color:rgba(10,31,51,.72);margin-top:3px;}
        .bb-play.queued{background:linear-gradient(90deg,#ef4444,#b91c1c);}
        .bb-play.queued .big{color:#fff;}
        .bb-play.queued .sub{color:rgba(255,255,255,.8);}

        .bb-slot{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;
            background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.12);transition:all .3s;font-size:16px;}
        .bb-slot.on{background:rgba(16,185,129,.28);border-color:#10b981;box-shadow:0 0 14px rgba(16,185,129,.5);}

        .bb-region{display:flex;align-items:center;justify-content:center;gap:8px;font-size:11px;color:#7e93ad;
            font-family:'Orbitron';letter-spacing:.06em;}
        .bb-region .dot{width:8px;height:8px;border-radius:50%;background:#10b981;}
        .bb-region .dot.off{background:#ef4444;}

        #bb-banner{min-height:0;display:flex;align-items:center;justify-content:center;}

        .bb-footer{height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;
            background:rgba(0,0,0,.85);border-top:1px solid rgba(255,255,255,.08);font-size:10px;
            letter-spacing:.18em;color:#5d7088;font-weight:700;}

        .bb-toast{position:fixed;top:78px;left:50%;transform:translateX(-50%) translateY(-16px);
            background:#22d3ee;color:#04121b;padding:11px 22px;border-radius:9px;font-weight:700;opacity:0;
            pointer-events:none;transition:all .4s;z-index:200;}

        /* Matchmaking overlay — big, unmissable countdown */
        .bb-mm{position:fixed;inset:0;z-index:1500;display:none;align-items:center;justify-content:center;
            background:radial-gradient(circle at 50% 38%,rgba(16,32,58,.92),rgba(3,6,12,.96));
            backdrop-filter:blur(8px);}
        .bb-mm-card{display:flex;flex-direction:column;align-items:center;gap:26px;animation:bb-slidein .35s ease-out;}
        .bb-mm-status{font-family:'Orbitron';font-size:30px;font-weight:900;letter-spacing:.24em;color:#fff;
            text-shadow:0 0 26px rgba(34,211,238,.65);text-align:center;}
        .bb-mm-ringwrap{position:relative;width:320px;height:320px;display:flex;align-items:center;justify-content:center;}
        .bb-mm-ring{position:absolute;inset:0;border-radius:50%;
            background:conic-gradient(var(--ring,#22d3ee) calc(var(--pct,0)*1%), rgba(255,255,255,.06) 0);
            box-shadow:0 0 70px -12px var(--ring,#22d3ee);transition:background 1s linear,box-shadow .3s;}
        .bb-mm-ring::before{content:'';position:absolute;inset:16px;border-radius:50%;
            background:radial-gradient(circle at 50% 40%,#0f1d35,#060a13);
            box-shadow:inset 0 0 50px rgba(0,0,0,.7);}
        .bb-mm-spinner{position:absolute;inset:0;border-radius:50%;border:7px solid rgba(34,211,238,.12);
            border-top-color:#22d3ee;animation:bb-spin 1s linear infinite;}
        .bb-mm-num{position:relative;font-family:'Orbitron';font-size:160px;font-weight:900;line-height:1;color:#fff;
            text-shadow:0 0 36px rgba(34,211,238,.85);}
        .bb-mm-num.tick{animation:bb-tick .55s cubic-bezier(.2,.8,.2,1);}
        .bb-mm-num.urgent{color:#fca5a5;text-shadow:0 0 40px rgba(239,68,68,.95);}
        @keyframes bb-tick{0%{transform:scale(1.45);}60%{transform:scale(.96);}100%{transform:scale(1);}}
        @keyframes bb-spin{to{transform:rotate(360deg);}}
        .bb-mm-found{position:relative;font-family:'Orbitron';font-size:96px;}
        .bb-mm-players{font-family:'Orbitron';font-size:20px;letter-spacing:.2em;color:#9fb0c8;}
        .bb-mm-slots{display:flex;gap:16px;}
        .bb-mm-slots .bb-slot{width:58px;height:58px;font-size:24px;}
        .bb-mm-cancel{margin-top:6px;background:linear-gradient(90deg,#ef4444,#b91c1c);color:#fff;border:none;
            font-family:'Bebas Neue','Orbitron',sans-serif;font-size:34px;letter-spacing:.12em;padding:12px 80px;
            border-radius:14px;cursor:pointer;box-shadow:0 0 34px -6px rgba(239,68,68,.6);transition:filter .15s,transform .12s;}
        .bb-mm-cancel:hover{filter:brightness(1.1);}
        .bb-mm-cancel:active{transform:translateY(1px);}

        @media (max-width:1024px){
            .bb-main{grid-template-columns:1fr;grid-template-rows:auto 1fr auto;}
            .bb-col.left{display:none;}
            .bb-chat{display:none;}
            .bb-mm-ringwrap{width:240px;height:240px;}
            .bb-mm-num{font-size:120px;}
        }
        `;
        const el = document.createElement('style');
        el.id = 'bb-lobby-style';
        el.textContent = css;
        document.head.appendChild(el);
        this.styleEl = el;
    }

    // ===================================================================
    //  DOM
    // ===================================================================

    private buildDOM(): void {
        const mode = this.getModeById(this.selectedModeId);
        const root = document.createElement('div');
        root.id = 'bb-lobby';
        root.innerHTML = `
            <div class="bb-grid"></div>
            <div class="bb-glow" style="top:-120px;left:-80px;width:380px;height:380px;background:rgba(34,211,238,.18);"></div>
            <div class="bb-glow" style="bottom:-140px;right:-60px;width:420px;height:420px;background:rgba(124,58,237,.16);"></div>
            <div class="bb-particles" id="bb-particles"></div>

            <div class="bb-shell">
                <header class="bb-header">
                    <div class="bb-logo">
                        <h1 class="bb-display">BITBLAST</h1>
                        <span class="bb-badge">SEASON 1</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div class="bb-credits"><span class="dot"></span><span id="bb-credits">${this.credits.toLocaleString()} CR</span></div>
                        <div class="bb-userchip" id="bb-userchip" title="${CG.userAccountAvailable ? 'CrazyGames account' : 'Guest'}">
                            <img class="bb-avatar" id="bb-avatar" src="${this.avatarUrl}" alt="">
                            <span id="bb-userchip-name" style="font-weight:700;font-size:14px;">${this.escape(this.username)}</span>
                        </div>
                    </div>
                </header>

                <main class="bb-main">
                    <!-- LEFT: identity + daily drop -->
                    <aside class="bb-col left">
                        <div class="bb-card">
                            <div class="bb-prof-top">
                                <div class="bb-level-ring" id="bb-level-ring">${this.level}</div>
                                <div style="flex:1;">
                                    <div class="bb-display" style="font-size:18px;color:#fff;">RANK ${this.level}</div>
                                    <div style="font-size:11px;color:#8aa0bd;letter-spacing:.16em;font-weight:700;">${CG.userAccountAvailable && !CG.getItem('bb_is_guest') ? 'CRAZYGAMES PLAYER' : 'RECRUIT'}</div>
                                </div>
                            </div>
                            <div class="bb-xp-track"><div class="bb-xp-fill" id="bb-xp-fill" style="width:0%"></div></div>
                            <div class="bb-xp-meta"><span>LVL ${this.level}</span><span id="bb-xp-meta">${this.xp} / ${this.level * 1000} XP</span></div>
                        </div>

                        <div class="bb-card bb-drop">
                            <h3>Daily Drop</h3>
                            <div class="reward">🎁 +${DAILY_DROP_REWARD} Credits</div>
                            <div style="font-size:12px;color:#9fb0c8;">Watch a short ad to claim your free credits.</div>
                            <button class="bb-btn bb-btn-ad" id="bb-daily-drop">▶ WATCH &amp; CLAIM</button>
                        </div>

                        <div class="bb-card" style="flex:1;">
                            <h3>Live Activity</h3>
                            <div class="bb-feed" id="bb-feed"></div>
                        </div>
                    </aside>

                    <!-- CENTER: character + chat -->
                    <section class="bb-stage" id="bb-stage">
                        <div class="bb-stage-glow"></div>
                        <div id="bb-canvas"><div class="bb-loading" id="bb-loading">LOADING… 0%</div></div>

                        <div class="bb-name-wrap" id="bb-name-wrap">
                            <h2 class="bb-name" id="bb-name">${this.escape(this.username)}</h2>
                            <input class="bb-name-input" id="bb-name-input" maxlength="16" value="${this.escape(this.username)}">
                            <div class="bb-name-hint" id="bb-name-hint">CLICK TO EDIT NAME</div>
                        </div>

                        <div class="bb-chat">
                            <div class="bb-chat-head"><span class="live">GLOBAL CHAT</span><span id="bb-online">47 online</span></div>
                            <div class="bb-chat-msgs" id="bb-chat-msgs"></div>
                            <div class="bb-chat-form">
                                <input id="bb-chat-input" placeholder="Press Enter to chat…" maxlength="100" autocomplete="off">
                                <button id="bb-chat-send">SEND</button>
                            </div>
                        </div>
                    </section>

                    <!-- RIGHT: modes + PLAY -->
                    <aside class="bb-col right">
                        <div id="bb-banner"></div>

                        <div class="bb-card">
                            <h3>Game Mode</h3>
                            <div class="bb-modes" id="bb-modes">
                                ${GAME_MODES.map((m) => `
                                    <div class="bb-mode ${m.id === this.selectedModeId ? 'active' : ''}" data-mode="${m.id}" style="--acc:${m.accent}">
                                        <span class="pip"></span>
                                        <div class="txt"><div class="t">${m.title}</div><div class="d">${m.tagline}</div></div>
                                    </div>`).join('')}
                            </div>
                        </div>

                        <div style="flex:1;"></div>

                        <button class="bb-play" id="bb-play">
                            <div class="shine"></div>
                            <div class="label"><span class="big" id="bb-play-big">PLAY</span><span class="sub" id="bb-play-sub">${mode.title}</span></div>
                        </button>

                        <div class="bb-region"><span class="dot" id="bb-region-dot"></span><span id="bb-region">NA-WEST • CONNECTING…</span></div>
                    </aside>
                </main>

                <footer class="bb-footer">
                    <span>GLOBAL CHAT [ENTER]</span>
                    <span>BITBLAST • SEASON 1 • v1.0</span>
                </footer>
            </div>

            <div class="bb-toast" id="bb-toast"></div>

            <div class="bb-mm" id="bb-mm">
                <div class="bb-mm-card">
                    <div class="bb-mm-status" id="bb-mm-status">SEARCHING FOR MATCH</div>
                    <div class="bb-mm-ringwrap">
                        <div class="bb-mm-spinner" id="bb-mm-spinner"></div>
                        <div class="bb-mm-ring" id="bb-mm-ring" style="--pct:0"></div>
                        <span class="bb-mm-num" id="bb-mm-num"></span>
                    </div>
                    <div class="bb-mm-players" id="bb-mm-players">0 / 4 PLAYERS</div>
                    <div class="bb-mm-slots" id="bb-mm-slots">
                        <div class="bb-slot">👤</div><div class="bb-slot">👤</div>
                        <div class="bb-slot">👤</div><div class="bb-slot">👤</div>
                    </div>
                    <button class="bb-mm-cancel" id="bb-mm-cancel">CANCEL</button>
                </div>
            </div>
        `;
        document.body.insertBefore(root, document.body.firstChild);
        this.container = root;

        this.updateXPBar();
        this.spawnParticles();
    }

    private applyIdentityToDOM(): void {
        this.setText('bb-userchip-name', this.username);
        this.setText('bb-name', this.username);
        const avatar = document.getElementById('bb-avatar') as HTMLImageElement | null;
        if (avatar) avatar.src = this.avatarUrl;
        const input = document.getElementById('bb-name-input') as HTMLInputElement | null;
        if (input) input.value = this.username;
    }

    private updateXPBar(): void {
        const pct = Math.min(100, (this.xp / (this.level * 1000)) * 100);
        const fill = document.getElementById('bb-xp-fill');
        if (fill) fill.style.width = `${pct}%`;
    }

    private spawnParticles(): void {
        const host = document.getElementById('bb-particles');
        if (!host) return;
        const make = () => {
            if (!this.container) return;
            const p = document.createElement('div');
            p.className = 'bb-particle';
            const size = Math.random() * 3 + 2;
            const startX = Math.random() * window.innerWidth;
            p.style.width = p.style.height = `${size}px`;
            p.style.left = `${startX}px`;
            p.style.top = `${window.innerHeight + 10}px`;
            p.style.setProperty('--tx', `${(Math.random() - 0.5) * 160}px`);
            p.style.setProperty('--ty', `${-(window.innerHeight + 40)}px`);
            p.style.animationDuration = `${6 + Math.random() * 5}s`;
            host.appendChild(p);
            setTimeout(() => p.remove(), 11000);
        };
        this.feedParticleInterval = setInterval(make, 480);
    }

    // ===================================================================
    //  Events
    // ===================================================================

    private bindEvents(): void {
        const play = document.getElementById('bb-play');
        play?.addEventListener('click', () => this.togglePlay());
        play?.addEventListener('touchend', (e) => { e.preventDefault(); this.togglePlay(); }, { passive: false });

        // Cancel from inside the matchmaking overlay.
        const mmCancel = document.getElementById('bb-mm-cancel');
        mmCancel?.addEventListener('click', () => this.cancelQueue());
        mmCancel?.addEventListener('touchend', (e) => { e.preventDefault(); this.cancelQueue(); }, { passive: false });

        // Mode selection
        document.querySelectorAll('#bb-modes .bb-mode').forEach((el) => {
            el.addEventListener('click', () => this.selectMode((el as HTMLElement).dataset.mode || 'ffa'));
        });

        // Daily drop (rewarded ad)
        document.getElementById('bb-daily-drop')?.addEventListener('click', () => this.claimDailyDrop());

        // User chip → sign in prompt when account available
        document.getElementById('bb-userchip')?.addEventListener('click', () => this.promptSignIn());

        // Name editing
        this.setupNameEditing();

        // Chat
        document.getElementById('bb-chat-send')?.addEventListener('click', () => this.submitChat());
        document.getElementById('bb-chat-input')?.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); this.submitChat(); }
        });

        window.addEventListener('resize', this.resizeHandler);
    }

    private setupNameEditing(): void {
        const wrap = document.getElementById('bb-name-wrap');
        const name = document.getElementById('bb-name');
        const hint = document.getElementById('bb-name-hint');
        const input = document.getElementById('bb-name-input') as HTMLInputElement | null;
        if (!wrap || !name || !input || !hint) return;

        wrap.addEventListener('click', () => {
            name.style.display = 'none';
            hint.style.display = 'none';
            input.style.display = 'block';
            input.focus();
            input.select();
        });

        const save = () => {
            let v = input.value.trim().replace(/[^a-zA-Z0-9_]/g, '');
            if (v.length < 2) v = this.username;
            v = v.slice(0, 16);
            this.username = v;
            this.avatarUrl = `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(v)}`;
            CG.setItem('bb_username', v);
            CG.setItem('bb_is_guest', '1');
            this.applyIdentityToDOM();
            name.style.display = 'block';
            hint.style.display = 'block';
            input.style.display = 'none';
            this.toast('Name saved!');
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            const key = (e as KeyboardEvent).key;
            if (key === 'Enter') { save(); e.preventDefault(); }
            if (key === 'Escape') {
                input.value = this.username;
                name.style.display = 'block';
                hint.style.display = 'block';
                input.style.display = 'none';
            }
        });
    }

    private async promptSignIn(): Promise<void> {
        if (!CG.userAccountAvailable) return;
        const user = await CG.showAuthPrompt();
        if (user) {
            this.username = user.username;
            this.avatarUrl = user.profilePictureUrl || this.avatarUrl;
            CG.removeItem('bb_is_guest');
            this.applyIdentityToDOM();
            this.toast(`Welcome, ${user.username}!`);
        }
    }

    // ===================================================================
    //  Rewarded ad — daily drop
    // ===================================================================

    private async claimDailyDrop(): Promise<void> {
        const btn = document.getElementById('bb-daily-drop') as HTMLButtonElement | null;
        if (!btn || btn.disabled) return;

        btn.disabled = true;
        const original = btn.innerHTML;
        btn.textContent = 'LOADING AD…';

        const rewarded = await CG.requestRewardedAd({
            onMute: () => this.muteGame(true),
            onUnmute: () => this.muteGame(false),
        });

        if (rewarded) {
            this.credits += DAILY_DROP_REWARD;
            CG.setItem('bb_credits', String(this.credits));
            this.setText('bb-credits', `${this.credits.toLocaleString()} CR`);
            btn.textContent = '✓ CLAIMED';
            this.toast(`+${DAILY_DROP_REWARD} credits!`);
            // Re-enable after a short cooldown for repeat viewing.
            setTimeout(() => { btn.disabled = false; btn.innerHTML = original; }, 4000);
        } else {
            // No SDK / adblock / error — let the player retry.
            btn.disabled = false;
            btn.innerHTML = original;
            this.toast(CG.available ? 'Ad unavailable right now' : 'Rewards available on CrazyGames');
        }
    }

    private muteGame(mute: boolean): void {
        // Best-effort: dim the global Web Audio output during ads.
        const w = window as any;
        const audio = w.world?.combat?.audioManager || w.world?.assetManager?.audioManager;
        try { if (audio) { mute ? audio.mute?.() : audio.unmute?.(); } } catch { /* ignore */ }
    }

    // ===================================================================
    //  Mode selection
    // ===================================================================

    private selectMode(id: string): void {
        this.selectedModeId = id;
        CG.setItem('bb_mode', id);
        document.querySelectorAll('#bb-modes .bb-mode').forEach((el) => {
            el.classList.toggle('active', (el as HTMLElement).dataset.mode === id);
        });
        this.setText('bb-play-sub', this.getModeById(id).title);
    }

    private getModeById(id: string): GameModeOption {
        return GAME_MODES.find((m) => m.id === id) || GAME_MODES[0];
    }

    // ===================================================================
    //  Networking + matchmaking
    // ===================================================================

    private connectToServer(): void {
        try {
            this.socket = io(this.serverUrl, {
                path: getSocketIOPath(),
                auth: { token: this.playerId },
                transports: ['websocket'],
                reconnection: true,
                timeout: 4000,
            });
        } catch (e) {
            console.warn('[Lobby] socket init failed', e);
            this.setConnection(false);
            return;
        }

        this.socket.on('connect', () => this.setConnection(true));
        this.socket.on('disconnect', () => { this.setConnection(false); if (this.isQueued) this.resetPlayButton(); });
        this.socket.on('connect_error', () => this.setConnection(false));

        this.socket.on('queue_status', (d: { position: number; playersFound?: number; maxPlayers?: number }) => {
            this.updateMatchmaking(d.playersFound ?? 0, d.maxPlayers ?? 4, 0);
        });
        this.socket.on('queue_update', (d: { playersFound: number; maxPlayers: number; countdown: number }) =>
            this.updateMatchmaking(d.playersFound, d.maxPlayers, d.countdown));
        this.socket.on('queue_countdown', (d: { playersFound: number; maxPlayers: number; countdown: number }) =>
            this.updateMatchmaking(d.playersFound, d.maxPlayers, d.countdown));

        this.socket.on('match_found', (_d: { matchId: string; players: number; humanPlayers?: number }) => {
            this.showMatchFoundState();
        });

        this.socket.on('match_start', (d: { matchId: string; token: string; serverUrl: string; bots?: unknown[] }) => {
            // The server fills empty slots with bots (after its join window) and assigns
            // each one a spawn position — that data drives RemoteBots in multiplayer mode.
            if (d.bots && d.bots.length) (window as any).__matchBotSpawns = d.bots;
            this.launch({ matchId: d.matchId, token: d.token, serverUrl: d.serverUrl || this.serverUrl, socket: this.socket });
        });

        this.socket.on('chat_message', (d: { userId: string; username: string; message: string }) => {
            if (d.userId === this.playerId) return;
            this.addChat(d.username, d.message, false);
        });
    }

    private setConnection(connected: boolean): void {
        const dot = document.getElementById('bb-region-dot');
        const txt = document.getElementById('bb-region');
        if (dot) dot.classList.toggle('off', !connected);
        if (txt && !this.isQueued) txt.textContent = connected ? 'NA-WEST • 24ms' : 'CONNECTING…';
    }

    private togglePlay(): void {
        if (this.isQueued) { this.cancelQueue(); return; }
        this.startMatchmaking();
    }

    /**
     * Begin matchmaking. The server runs a short join window for human players and then
     * fills any remaining slots with bots, so a match always starts. We simply queue and
     * wait for match_found / match_start (no client-side bot logic).
     */
    private startMatchmaking(): void {
        this.isQueued = true;
        this.countdownMax = 0;
        const play = document.getElementById('bb-play');
        play?.classList.add('queued');
        this.setText('bb-play-big', 'CANCEL');
        this.setText('bb-play-sub', 'SEARCHING FOR MATCH…');
        this.showMatchmaking();

        if (this.socket?.connected) {
            this.socket.emit('start_queue', { modeId: this.selectedModeId, username: this.username });
            return;
        }

        // Not connected yet — (re)connect, then queue once the socket is up.
        if (!this.socket) this.connectToServer();
        this.setText('bb-play-sub', 'CONNECTING…');
        this.setMmStatus('CONNECTING…');
        this.clearConnectRetry();
        this.connectRetryTimer = setTimeout(() => {
            if (!this.isQueued) return;
            if (this.socket?.connected) {
                this.socket.emit('start_queue', { modeId: this.selectedModeId, username: this.username });
                this.setText('bb-play-sub', 'SEARCHING FOR MATCH…');
                this.setMmStatus('SEARCHING FOR MATCH');
            } else {
                this.setText('bb-play-sub', 'SERVER OFFLINE — CANCEL & RETRY');
                this.setMmStatus('SERVER OFFLINE');
                this.setMmSearching(false);
            }
        }, 2500);
    }

    private clearConnectRetry(): void {
        if (this.connectRetryTimer) { clearTimeout(this.connectRetryTimer); this.connectRetryTimer = null; }
    }

    private cancelQueue(): void {
        this.isQueued = false;
        this.clearConnectRetry();
        this.socket?.emit('cancel_queue');
        this.resetPlayButton();
        this.hideMatchmaking();
    }

    private resetPlayButton(): void {
        const play = document.getElementById('bb-play');
        play?.classList.remove('queued');
        this.setText('bb-play-big', 'PLAY');
        this.setText('bb-play-sub', this.getModeById(this.selectedModeId).title);
    }

    // ===================================================================
    //  Matchmaking overlay (big, central countdown)
    // ===================================================================

    /** Show the full-screen matchmaking overlay in its initial "searching" state. */
    private showMatchmaking(): void {
        const overlay = document.getElementById('bb-mm');
        if (!overlay) return;
        overlay.style.display = 'flex';
        this.setMmStatus('SEARCHING FOR MATCH');
        this.setMmSearching(true);
        this.setMmNumber('');
        this.setMmRing(0, '#22d3ee');
        this.setSlots(0);
        this.setText('bb-mm-players', '0 / 4 PLAYERS');
    }

    private hideMatchmaking(): void {
        const overlay = document.getElementById('bb-mm');
        if (overlay) overlay.style.display = 'none';
    }

    /** Drive the overlay from server queue updates. countdown<=0 means "still searching". */
    private updateMatchmaking(found: number, max: number, countdown: number): void {
        if (!this.isQueued) return;
        const overlay = document.getElementById('bb-mm');
        if (overlay && overlay.style.display === 'none') overlay.style.display = 'flex';

        this.setSlots(found, max);
        this.setText('bb-mm-players', `${found} / ${max} PLAYERS`);
        this.setText('bb-play-sub', countdown > 0 ? `STARTING IN ${countdown}s` : `${found}/${max} SEARCHING…`);

        if (countdown > 0) {
            this.countdownMax = Math.max(this.countdownMax, countdown);
            this.setMmStatus('MATCH STARTING IN');
            this.setMmSearching(false);
            this.setMmNumber(String(countdown), countdown <= 3);
            // Ring depletes as the timer runs out.
            const pct = this.countdownMax > 0 ? (countdown / this.countdownMax) * 100 : 0;
            this.setMmRing(pct, countdown <= 3 ? '#ef4444' : '#22d3ee');
        } else {
            this.setMmStatus('SEARCHING FOR MATCH');
            this.setMmSearching(true);
            this.setMmNumber('');
        }
    }

    /** Final "MATCH FOUND" celebratory state before the game loads. */
    private showMatchFoundState(): void {
        const overlay = document.getElementById('bb-mm');
        if (overlay) overlay.style.display = 'flex';
        this.setMmStatus('MATCH FOUND');
        this.setMmSearching(false);
        this.setSlots(4, 4);
        this.setText('bb-mm-players', '4 / 4 PLAYERS');
        this.setMmRing(100, '#10b981');
        const num = document.getElementById('bb-mm-num');
        if (num) {
            num.classList.remove('urgent');
            num.classList.add('bb-mm-found');
            num.textContent = 'GO';
            this.retick(num);
        }
        this.setText('bb-play-sub', 'ENTERING MATCH…');
    }

    private setMmStatus(text: string): void { this.setText('bb-mm-status', text); }

    private setMmSearching(searching: boolean): void {
        const spinner = document.getElementById('bb-mm-spinner');
        if (spinner) spinner.style.display = searching ? 'block' : 'none';
    }

    private setMmNumber(text: string, urgent = false): void {
        const num = document.getElementById('bb-mm-num');
        if (!num) return;
        num.classList.remove('bb-mm-found');
        num.classList.toggle('urgent', urgent && text !== '');
        if (num.textContent !== text) {
            num.textContent = text;
            if (text) this.retick(num);
        }
    }

    private setMmRing(pct: number, color: string): void {
        const ring = document.getElementById('bb-mm-ring');
        if (!ring) return;
        ring.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct))));
        ring.style.setProperty('--ring', color);
    }

    /** Re-trigger the tick pop animation on an element. */
    private retick(el: HTMLElement): void {
        el.classList.remove('tick');
        // Force reflow so the animation restarts.
        void el.offsetWidth;
        el.classList.add('tick');
    }

    private setSlots(filled: number, max = 4): void {
        document.querySelectorAll('#bb-mm-slots .bb-slot').forEach((el, i) => {
            const slot = el as HTMLElement;
            const visible = i < Math.max(max, 1);
            slot.style.display = visible ? 'flex' : 'none';
            const on = i < filled;
            slot.classList.toggle('on', on);
            slot.textContent = on ? '✅' : '👤';
        });
    }

    /** Hand off to the game. Tears down the lobby render loop and fires the play callback. */
    private launch(info: MatchInfo): void {
        if (this.started) return;
        this.started = true;
        this.clearConnectRetry();

        // Asset loading begins now — tell the SDK and pause lobby ad surfaces.
        CG.loadingStart();
        CG.clearBanner('bb-banner');

        // Show the match loading screen. World._hideLoadingScreen() removes it once the
        // game is fully ready (it looks for the #match-loading-screen id).
        this.showLoadingScreen();

        // Stop lobby rendering + timers (the game takes over the screen).
        if (this.animationId !== null) cancelAnimationFrame(this.animationId);
        this.stopTimers();
        this.renderer?.dispose();
        window.removeEventListener('resize', this.resizeHandler);

        if (this.container) this.container.style.display = 'none';

        this.onPlay?.(info);
    }

    /**
     * Full-screen loading screen shown during the lobby → match handoff. Persists on
     * document.body (outside the lobby container, which gets hidden) until the World
     * hides it via _hideLoadingScreen() once the game is ready.
     */
    private showLoadingScreen(): void {
        if (document.getElementById('match-loading-screen')) return;

        const mode = this.getModeById(this.selectedModeId);
        const base = (import.meta as any).env.BASE_URL;

        const screen = document.createElement('div');
        screen.id = 'match-loading-screen';
        screen.innerHTML = `
            <style>
                #match-loading-screen{position:fixed;inset:0;z-index:2500;overflow:hidden;
                    display:flex;align-items:center;justify-content:center;background:#05070d;
                    font-family:'Rajdhani',sans-serif;}
                #match-loading-screen .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
                    animation:mls-zoom 6s ease-out forwards;}
                #match-loading-screen .scrim{position:absolute;inset:0;
                    background:linear-gradient(to bottom,rgba(5,7,13,.55),rgba(5,7,13,.35),rgba(5,7,13,.9));}
                #match-loading-screen .content{position:relative;text-align:center;display:flex;
                    flex-direction:column;align-items:center;gap:22px;padding-bottom:40px;}
                #match-loading-screen .mode{font-family:'Orbitron',sans-serif;font-size:13px;font-weight:900;
                    letter-spacing:.35em;color:#22d3ee;text-shadow:0 0 18px rgba(34,211,238,.7);}
                #match-loading-screen .title{font-family:'Orbitron',sans-serif;font-size:64px;font-weight:900;
                    font-style:italic;letter-spacing:.04em;color:#fff;line-height:1;
                    text-shadow:0 6px 30px rgba(0,0,0,.8),0 0 40px rgba(34,211,238,.35);}
                #match-loading-screen .bar{width:360px;max-width:70vw;height:8px;border-radius:999px;
                    background:rgba(255,255,255,.1);overflow:hidden;border:1px solid rgba(255,255,255,.08);}
                #match-loading-screen .bar > i{display:block;height:100%;width:40%;border-radius:999px;
                    background:linear-gradient(90deg,#22d3ee,#7c3aed);box-shadow:0 0 16px rgba(34,211,238,.8);
                    animation:mls-slide 1.1s ease-in-out infinite;}
                #match-loading-screen .hint{font-size:14px;letter-spacing:.18em;color:#9fb0c8;font-weight:700;}
                @keyframes mls-zoom{0%{transform:scale(1);}100%{transform:scale(1.18);}}
                @keyframes mls-slide{0%{transform:translateX(-120%);}100%{transform:translateX(320%);}}
            </style>
            <img class="bg" src="${base}assets/images/loadingScreen.png" alt="">
            <div class="scrim"></div>
            <div class="content">
                <div class="mode">${this.escape(mode.title)}</div>
                <div class="title">ENTERING MATCH</div>
                <div class="bar"><i></i></div>
                <div class="hint">DEPLOYING TO ARENA…</div>
            </div>
        `;
        document.body.appendChild(screen);
    }

    // ===================================================================
    //  Chat + activity simulation
    // ===================================================================

    private submitChat(): void {
        const input = document.getElementById('bb-chat-input') as HTMLInputElement | null;
        const msg = input?.value.trim();
        if (!input || !msg) return;
        input.value = '';
        this.addChat(this.username, msg, true);
        if (this.socket?.connected) this.socket.emit('chat_message', { message: msg });
    }

    private addChat(user: string, message: string, mine: boolean): void {
        const host = document.getElementById('bb-chat-msgs');
        if (!host) return;
        const el = document.createElement('div');
        el.className = 'bb-chat-msg';
        const color = mine ? '#facc15' : '#22d3ee';
        el.innerHTML = `<span style="color:${color};font-weight:700;">${this.escape(user)}:</span> <span style="color:#d3dcea;">${this.escape(message)}</span>`;
        host.appendChild(el);
        host.scrollTop = host.scrollHeight;
        while (host.children.length > 50) host.removeChild(host.firstChild!);
    }

    private startChatSimulation(): void {
        const push = () => {
            let idx = Math.floor(Math.random() * FAKE_CHAT.length);
            let tries = 0;
            while (this.usedChat.has(idx) && tries++ < 8) idx = Math.floor(Math.random() * FAKE_CHAT.length);
            if (this.usedChat.size > FAKE_CHAT.length * 0.7) this.usedChat.clear();
            this.usedChat.add(idx);
            this.addChat(this.randomName(), FAKE_CHAT[idx], false);
        };
        setTimeout(push, 1800);
        setTimeout(push, 4200);
        this.chatTimer = setInterval(push, 7000 + Math.random() * 8000);
    }

    private startActivityFeed(): void {
        const push = () => {
            const host = document.getElementById('bb-feed');
            if (!host) return;
            const tpl = ACTIVITY_FEED[Math.floor(Math.random() * ACTIVITY_FEED.length)];
            const text = tpl(this.randomName(), this.randomName());
            const el = document.createElement('div');
            el.className = 'bb-feed-item';
            el.textContent = text;
            host.insertBefore(el, host.firstChild);
            while (host.children.length > 6) host.removeChild(host.lastChild!);
            setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 14000);
        };
        setTimeout(push, 1200);
        setTimeout(push, 3500);
        this.feedTimer = setInterval(push, 4500 + Math.random() * 4000);
    }

    private randomName(): string {
        return FAKE_PLAYER_NAMES[Math.floor(Math.random() * FAKE_PLAYER_NAMES.length)];
    }

    // ===================================================================
    //  Banner ad
    // ===================================================================

    private requestBanner(): void {
        // Only on the real portal; harmless no-op elsewhere.
        if (!CG.onPortal) return;
        // Defer a frame so the container has layout.
        setTimeout(() => { CG.requestBanner('bb-banner'); }, 300);
    }

    // ===================================================================
    //  3D character stage
    // ===================================================================

    private init3DCharacter(): void {
        const container = document.getElementById('bb-canvas');
        const loading = document.getElementById('bb-loading');
        if (!container) return;

        this.scene = new THREE.Scene();
        const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.set(0, 15, 280);

        try {
            this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        } catch (e) {
            console.warn('[Lobby] WebGL unavailable, skipping 3D character', e);
            if (loading) loading.style.display = 'none';
            return;
        }
        this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
        const dir = new THREE.DirectionalLight(0x22d3ee, 2.0); dir.position.set(50, 100, 150); this.scene.add(dir);
        const rim = new THREE.DirectionalLight(0x818cf8, 1.2); rim.position.set(0, 80, -150); this.scene.add(rim);
        const lp = new THREE.PointLight(0x22d3ee, 0.8, 400); lp.position.set(-200, 100, 100); this.scene.add(lp);
        const rp = new THREE.PointLight(0xfacc15, 0.6, 400); rp.position.set(200, 100, 100); this.scene.add(rp);

        this.loadCharacter(loading);
        this.animate();
    }

    private loadCharacter(loading: HTMLElement | null): void {
        const base = (import.meta as any).env.BASE_URL;
        const weaponBase = `${base}assets/models/weapons/weaponpack/Models/`;
        const finishLoading = () => { if (loading) loading.style.display = 'none'; };

        const loadChar = (rifle?: THREE.Object3D) => {
            new FBXLoader().load(`${base}assets/models/characters/Amy/amy_idle.fbx`, (object) => {
                object.scale.set(1.27, 1.27, 1.27);
                object.position.set(0, -45, 50);
                object.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
                this.scene!.add(object);

                if (rifle) this.attachRifle(object, rifle);

                const mixer = new THREE.AnimationMixer(object);
                this.mixers.push(mixer);
                if (object.animations?.length) mixer.clipAction(object.animations[0]).play();
                finishLoading();
            }, (xhr) => {
                if (xhr.lengthComputable && loading) loading.textContent = `LOADING… ${Math.round((xhr.loaded / xhr.total) * 100)}%`;
            }, (err) => { console.warn('[Lobby] character load failed', err); finishLoading(); });
        };

        // Try to load a rifle to place in the character's hand; fall back to no rifle.
        const mtl = new MTLLoader();
        mtl.load(weaponBase + 'machinegun.mtl', (materials) => {
            materials.preload();
            const obj = new OBJLoader();
            obj.setMaterials(materials);
            obj.load(weaponBase + 'machinegun.obj', (rifle) => loadChar(rifle), undefined, () => loadChar());
        }, undefined, () => loadChar());
    }

    private attachRifle(object: THREE.Object3D, rifleModel: THREE.Object3D): void {
        let hand: THREE.Object3D | null = null;
        object.traverse((c) => {
            if (!(c as any).isBone) return;
            const n = c.name.toLowerCase();
            const isFinger = /thumb|index|middle|ring|pinky/.test(n);
            if (!isFinger && n.includes('righthand')) hand = c;
            if (!hand && ((n.includes('hand') && n.includes('right')) || n.includes('r_hand') || n.includes('hand_r'))) hand = c;
        });
        if (!hand) return;
        const rifle = rifleModel.clone();
        const s = 6.4 * 0.6 * 160;
        rifle.scale.set(s, s, s);
        rifle.position.set(6.3, 13.8, 1.3);
        rifle.rotation.set(-0.569 * Math.PI, 0.040 * Math.PI, -0.514 * Math.PI);
        (hand as THREE.Object3D).add(rifle);
    }

    private animate(): void {
        this.animationId = requestAnimationFrame(this.animate.bind(this));
        const delta = this.clock.getDelta();
        this.mixers.forEach((m) => m.update(delta));
        if (this.camera && this.renderer && this.scene) {
            const t = this.clock.getElapsedTime();
            this.camera.position.x = Math.sin(t * 0.1) * 10;
            this.camera.position.y = 30 + Math.sin(t * 0.15) * 2;
            this.camera.lookAt(0, 40, 0);
            this.renderer.render(this.scene, this.camera);
        }
    }

    private onWindowResize(): void {
        const container = document.getElementById('bb-canvas');
        if (!container || !this.camera || !this.renderer) return;
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    // ===================================================================
    //  Public API (preserved for the rest of the game)
    // ===================================================================

    public getSelectedModeId(): string {
        return this.selectedModeId;
    }

    public getSelectedMode(): { mode: string; modeId: string; desc: string } {
        const m = this.getModeById(this.selectedModeId);
        return { mode: m.title, modeId: m.id, desc: m.tagline };
    }

    public getSocket(): Socket | null {
        return this.socket;
    }

    public getPlayerId(): string {
        return this.playerId;
    }

    public getUsername(): string {
        return this.username;
    }

    // ===================================================================
    //  Helpers / teardown
    // ===================================================================

    private setText(id: string, text: string): void {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    private toast(msg: string): void {
        const t = document.getElementById('bb-toast');
        if (!t) return;
        t.textContent = msg;
        t.style.opacity = '1';
        t.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(-50%) translateY(-16px)';
        }, 2000);
    }

    private escape(s: string): string {
        return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    }

    private stopTimers(): void {
        for (const t of [this.chatTimer, this.feedTimer, this.feedParticleInterval]) {
            if (t) clearInterval(t);
        }
        this.chatTimer = this.feedTimer = this.feedParticleInterval = null;
        this.clearConnectRetry();
    }

    public dispose(): void {
        if (this.animationId !== null) cancelAnimationFrame(this.animationId);
        this.stopTimers();
        this.renderer?.dispose();
        window.removeEventListener('resize', this.resizeHandler);
        CG.clearBanner('bb-banner');
        this.socket?.disconnect();
        this.container?.remove();
        this.styleEl?.remove();
    }
}
