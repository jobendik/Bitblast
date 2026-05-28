# 🎮 BitBlast FPS Codebase User Manual

> **A Complete Guide to Understanding the BitBlast Multiplayer FPS Game Architecture**

Welcome! This manual will help you understand how this multiplayer first-person shooter works. The game is built with **Three.js** (3D graphics) and **Yuka.js** (AI and game logic).

---

## 📋 Table of Contents

1. [Quick Overview](#quick-overview)
2. [Project Structure Map](#project-structure-map)
3. [The Big Picture: How It All Fits Together](#the-big-picture)
4. [Core Systems Explained](#core-systems-explained)
5. [Game Flow: From Start to Gameplay](#game-flow)
6. [Entity System: Players, Bots & Items](#entity-system)
7. [Combat System: Weapons & Damage](#combat-system)
8. [AI System: How Bots Think](#ai-system)
9. [Networking: Multiplayer Architecture](#networking)
10. [UI & HUD System](#ui-system)
11. [Common Patterns Used](#common-patterns)
12. [Where to Find Things](#where-to-find-things)

---

## 🎯 Quick Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BITBLAST FPS GAME                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│   │   CLIENT    │◄───►│   SERVER    │◄───►│   CLIENT    │              │
│   │  (Browser)  │     │  (Node.js)  │     │  (Browser)  │              │
│   └─────────────┘     └─────────────┘     └─────────────┘              │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│   │  Three.js   │     │  Socket.IO  │     │  Three.js   │              │
│   │  (Render)   │     │  (Network)  │     │  (Render)   │              │
│   └─────────────┘     └─────────────┘     └─────────────┘              │
│         │                                       │                       │
│         ▼                                       ▼                       │
│   ┌─────────────┐                         ┌─────────────┐              │
│   │   Yuka.js   │                         │   Yuka.js   │              │
│   │  (AI/Logic) │                         │  (AI/Logic) │              │
│   └─────────────┘                         └─────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**What is BitBlast?**
- A browser-based multiplayer FPS game
- Players can fight against AI bots or other players online
- Features various game modes (Free-For-All, Team Deathmatch)
- Has a full lobby system with matchmaking

**Key Technologies:**
| Technology | Purpose |
|------------|---------|
| **Three.js** | 3D rendering (graphics, models, effects) |
| **Yuka.js** | AI decision-making, pathfinding, entity management |
| **Socket.IO** | Real-time multiplayer networking |
| **Vite** | Development server and build tool |
| **TypeScript** | Type-safe JavaScript |

---

## 📁 Project Structure Map

```
BitBlast/
│
├── 📄 main.ts                 # Entry point - starts everything!
│
├── 📂 src/                    # All game source code
│   │
│   ├── 📂 core/               # 🧠 BRAIN - Central systems
│   │   ├── World.ts           # THE MAIN FILE - orchestrates everything
│   │   ├── AssetManager.ts    # Loads all game assets
│   │   ├── CombatManager.ts   # Manages weapons, effects, combat
│   │   ├── Config.ts          # Game configuration values
│   │   ├── Constants.ts       # Game constants (weapon types, etc)
│   │   ├── SpawningManager.ts # Handles spawning players/items
│   │   ├── InputManager.ts    # Keyboard/mouse input
│   │   └── ...more
│   │
│   ├── 📂 entities/           # 🎭 ACTORS - Things that exist in game
│   │   ├── Player.ts          # The human player you control
│   │   ├── Bot.ts             # AI-controlled enemies
│   │   ├── Level.ts           # The game map/arena
│   │   ├── HealthPack.ts      # Pickup items
│   │   └── WeaponItem.ts      # Weapon pickups
│   │
│   ├── 📂 weapons/            # 🔫 WEAPONS - All weapon logic
│   │   ├── Weapon.ts          # Base weapon class
│   │   ├── Blaster.ts         # Pistol-type weapon
│   │   ├── Shotgun.ts         # Spread weapon
│   │   ├── AssaultRifle.ts    # Automatic weapon
│   │   └── Bullet.ts          # Projectile logic
│   │
│   ├── 📂 controls/           # 🎮 CONTROLS - Player input
│   │   ├── FirstPersonControls.ts  # Mouse/keyboard FPS controls
│   │   └── MobileControls.ts       # Touch controls for mobile
│   │
│   ├── 📂 systems/            # ⚙️ SYSTEMS - Visual effects & processing
│   │   ├── PlayerWeaponSystem.ts   # Weapon visuals & animations
│   │   ├── ParticleSystem.ts       # Sparks, explosions, etc
│   │   ├── DecalSystem.ts          # Bullet holes on walls
│   │   ├── BulletTracerSystem.ts   # Bullet trail effects
│   │   └── PostProcessingSystem.ts # Screen effects
│   │
│   ├── 📂 gamemodes/          # 🏆 GAME MODES - Rules & scoring
│   │   ├── GameModeManager.ts      # Switches between modes
│   │   ├── FreeForAllMode.ts       # Everyone vs everyone
│   │   ├── TeamDeathmatchMode.ts   # Team-based combat
│   │   └── WaveSurvivalMode.ts     # Fight enemy waves
│   │
│   ├── 📂 network/            # 🌐 NETWORKING - Multiplayer
│   │   ├── NetworkManager.ts  # Handles server communication
│   │   ├── RemotePlayer.ts    # Other players in the game
│   │   └── RemoteBot.ts       # Server-controlled bots
│   │
│   ├── 📂 lobby/              # 🏠 LOBBY - Pre-game menu
│   │   ├── BitBlastLobby.ts       # Main lobby UI with matchmaking
│   │   ├── LobbyManager.ts    # Manages lobby state
│   │   └── LobbyUI.ts         # Lobby interface elements
│   │
│   ├── 📂 ui/                 # 📊 UI - Heads-up display
│   │   ├── HUDManager.ts      # Health, ammo, crosshair, etc
│   │   ├── KillfeedManager.ts # Kill notifications
│   │   └── DamageNumberManager.ts # Floating damage numbers
│   │
│   ├── 📂 goals/              # 🎯 AI GOALS - What bots want to do
│   │   ├── AttackGoal.ts      # Attack an enemy
│   │   ├── ExploreGoal.ts     # Wander and explore
│   │   ├── SeekCoverGoal.ts   # Find cover when hurt
│   │   └── ...more
│   │
│   ├── 📂 evaluators/         # 🤔 AI EVALUATORS - Decision making
│   │   ├── AttackEvaluator.ts # Should I attack?
│   │   ├── GetHealthEvaluator.ts # Should I get health?
│   │   └── ...more
│   │
│   ├── 📂 config/             # ⚙️ CONFIGURATION FILES
│   │   ├── gameConfig.ts      # Player settings
│   │   ├── weaponConfigs.ts   # Weapon stats
│   │   └── network.ts         # Server URLs
│   │
│   └── 📂 utils/              # 🔧 UTILITIES - Helper functions
│       ├── NavMeshUtils.ts    # Navigation helpers
│       ├── PathPlanner.ts     # AI pathfinding
│       └── SceneUtils.ts      # 3D scene helpers
│
└── 📂 server/                 # 🖥️ SERVER CODE
    ├── standalone.cjs         # Main server file
    └── yuka-bot/              # Server-side AI bots
```

---

## 🌍 The Big Picture

Think of the game like a theater production:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           THE THEATER                                   │
│                          (World.ts)                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐                    │
│  │      THE STAGE      │    │   BACKSTAGE CREW    │                    │
│  │   (Three.js Scene)  │    │   (Core Managers)   │                    │
│  │                     │    │                     │                    │
│  │  - 3D Models        │    │  - AssetManager     │                    │
│  │  - Lights           │    │  - SpawningManager  │                    │
│  │  - Camera           │    │  - CombatManager    │                    │
│  │  - Effects          │    │  - GameModeManager  │                    │
│  │                     │    │  - NetworkManager   │                    │
│  └─────────────────────┘    └─────────────────────┘                    │
│                                                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐                    │
│  │       ACTORS        │    │      THE SCRIPT     │                    │
│  │     (Entities)      │    │     (Game Logic)    │                    │
│  │                     │    │                     │                    │
│  │  - Player           │    │  - Goals            │                    │
│  │  - Bots             │    │  - Evaluators       │                    │
│  │  - Items            │    │  - Gamemodes        │                    │
│  │  - Level            │    │  - Controls         │                    │
│  └─────────────────────┘    └─────────────────────┘                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**The Director: World.ts**

`World.ts` is like the director of a play. It:
1. Sets up the stage (creates the 3D scene)
2. Hires the crew (initializes all managers)
3. Brings in the actors (creates player and bots)
4. Runs the show (game loop)

---

## 🧠 Core Systems Explained

### The World (World.ts)

This is the heart of the game. Everything connects to it.

```
                              ┌──────────────────────┐
                              │       WORLD          │
                              │    (The Director)    │
                              └──────────┬───────────┘
                                         │
         ┌───────────────────────────────┼───────────────────────────────┐
         │               │               │               │               │
         ▼               ▼               ▼               ▼               ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │ Entity  │    │ Asset   │    │ Combat  │    │ Network │    │ Game    │
    │ Manager │    │ Manager │    │ Manager │    │ Manager │    │ Mode    │
    └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
         │               │               │               │               │
    All game         Loading        Weapons &        Online          Rules &
    entities        3D models,       effects        play            scoring
    (player,        sounds,
    bots, etc)      textures
```

**What World.ts does:**
1. **Initialization** - Loads assets, creates scene, spawns entities
2. **Game Loop** - Updates everything 60 times per second
3. **Coordination** - Makes sure all systems work together

### The Game Loop

Every game runs a "loop" - code that runs over and over very fast (60 times per second):

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          THE GAME LOOP                                  │
│                    (runs 60 times per second)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│    ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐        │
│    │ 1. READ │ ──► │ 2. THINK│ ──► │3. UPDATE│ ──► │ 4. DRAW │        │
│    │  INPUT  │     │ (Logic) │     │  STATE  │     │ (Render)│        │
│    └─────────┘     └─────────┘     └─────────┘     └─────────┘        │
│                                                                         │
│    What keys      Process AI,     Move players,    Draw the            │
│    are pressed?   check hits,     update health,   new frame           │
│                   calculate       apply physics    to screen           │
│                   damage                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The `animate()` function in World.ts IS this game loop.

---

## 🎬 Game Flow: From Start to Gameplay

Here's what happens when you open the game:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     STARTUP SEQUENCE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐                                                      │
│   │  1. main.ts  │   Entry point - first code that runs                │
│   │    starts    │                                                      │
│   └──────┬───────┘                                                      │
│          │                                                              │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ 2. BitBlastLobby │   Shows the lobby UI (mode selection,               │
│   │   created    │   play button, settings)                            │
│   └──────┬───────┘                                                      │
│          │                                                              │
│          │  [Player clicks PLAY]                                        │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ 3. Matchmake │   Connects to server, finds/creates match           │
│   │   (Socket.IO)│                                                      │
│   └──────┬───────┘                                                      │
│          │                                                              │
│          │  [Match found!]                                              │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ 4. World.init│   Loads all game assets (models, sounds)            │
│   │   (loading)  │   This may take several seconds                      │
│   └──────┬───────┘                                                      │
│          │                                                              │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ 5. Create    │   • Create 3D scene with lighting                   │
│   │    Scene     │   • Load the level/map                              │
│   └──────┬───────┘                                                      │
│          │                                                              │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ 6. Create    │   • Player entity                                   │
│   │   Entities   │   • AI Bots                                         │
│   │              │   • Items (health packs, weapons)                   │
│   └──────┬───────┘                                                      │
│          │                                                              │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ 7. Start     │   Game loop begins!                                 │
│   │  animate()   │   Player can now play                               │
│   └──────────────┘                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 👤 Entity System: Players, Bots & Items

All "things" in the game are called **Entities**. They use Yuka.js for behavior.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENTITY HIERARCHY                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                        GameEntity (Yuka)                                │
│                    Base class for all entities                          │
│                              │                                          │
│              ┌───────────────┼───────────────┐                          │
│              │               │               │                          │
│              ▼               ▼               ▼                          │
│       MovingEntity       GameEntity      GameEntity                     │
│     (things that move)   (static things)                               │
│              │               │               │                          │
│      ┌───────┴───────┐       │               │                          │
│      │               │       │               │                          │
│      ▼               ▼       ▼               ▼                          │
│  ┌────────┐    ┌─────────┐ ┌───────┐    ┌──────────┐                   │
│  │ Player │    │   Bot   │ │ Level │    │ HealthPack│                  │
│  │        │    │(Vehicle)│ │       │    │ WeaponItem│                  │
│  └────────┘    └─────────┘ └───────┘    └──────────┘                   │
│      │               │                                                  │
│  Human player    AI enemy                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Player (Player.ts)

The player YOU control:

```typescript
// Key parts of the Player:
class Player extends MovingEntity {
    health: number;           // How much life you have
    weaponSystem: AIWeaponSystem;  // Your weapons
    head: GameEntity;         // Camera attaches here
    velocity: Vector3;        // How fast you're moving
    onGround: boolean;        // Are you touching the floor?
    isSprinting: boolean;     // Running fast?
}
```

**Player components:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                            PLAYER                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────┐                                                     │
│  │      HEAD      │ ◄─── Camera attaches here (what you see)           │
│  │                │                                                     │
│  │ ┌────────────┐ │                                                     │
│  │ │  Weapon    │ │ ◄─── Weapon Container (holds current weapon)       │
│  │ │ Container  │ │                                                     │
│  │ └────────────┘ │                                                     │
│  └────────────────┘                                                     │
│         │                                                               │
│  ┌────────────────┐                                                     │
│  │     BODY       │ ◄─── Collision bounds, position in world           │
│  │   (bounds)     │                                                     │
│  └────────────────┘                                                     │
│                                                                         │
│  Properties:                                                            │
│  • health / maxHealth                                                   │
│  • velocity (movement)                                                  │
│  • weaponSystem (guns)                                                  │
│  • audios (sounds)                                                      │
│  • animations                                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Bot (Bot.ts)

AI-controlled enemies:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              BOT (AI Enemy)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         THE "BRAIN"                               │  │
│  │                        (Think class)                              │  │
│  │                                                                   │  │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │  │
│  │   │  EVALUATORS │───►│   CHOOSE    │───►│    GOALS    │         │  │
│  │   │  "What can  │    │    BEST     │    │   "Do it!"  │         │  │
│  │   │   I do?"    │    │   OPTION    │    │             │         │  │
│  │   └─────────────┘    └─────────────┘    └─────────────┘         │  │
│  │                                                                   │  │
│  │   • AttackEvaluator     Score each       • AttackGoal            │  │
│  │   • ExploreEvaluator    option and       • ExploreGoal           │  │
│  │   • GetHealthEval       pick the best    • GetItemGoal           │  │
│  │   • GetWeaponEval                        • SeekCoverGoal         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                          SENSORS                                  │  │
│  │                                                                   │  │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │  │
│  │   │   VISION    │    │   MEMORY    │    │   TARGET    │         │  │
│  │   │  Can I see  │    │  Remember   │    │   Who am I  │         │  │
│  │   │  enemies?   │    │  enemies    │    │   shooting? │         │  │
│  │   └─────────────┘    └─────────────┘    └─────────────┘         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ⚔️ Combat System: Weapons & Damage

The combat system handles shooting, damage, and all visual effects.

### Combat Manager (CombatManager.ts)

This is the "hub" for all combat-related systems:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COMBAT MANAGER                                  │
│              (Coordinates all combat subsystems)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                         CombatManager                                   │
│                              │                                          │
│    ┌─────────┬───────────────┼───────────────┬─────────┬─────────┐     │
│    │         │               │               │         │         │     │
│    ▼         ▼               ▼               ▼         ▼         ▼     │
│ ┌──────┐ ┌──────┐      ┌──────────┐      ┌──────┐ ┌──────┐ ┌──────┐  │
│ │Weapon│ │Tracer│      │ Particle │      │Decal │ │Impact│ │ HUD  │  │
│ │System│ │System│      │  System  │      │System│ │System│ │Mngr  │  │
│ └──────┘ └──────┘      └──────────┘      └──────┘ └──────┘ └──────┘  │
│    │         │               │               │         │         │     │
│  Weapon    Bullet        Sparks &        Bullet    Impact     Health   │
│  Models    Trails        Effects         Holes     Effects    Bars     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Weapon System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          WEAPON HIERARCHY                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                            Weapon (Base)                                │
│                                 │                                       │
│             ┌───────────────────┼───────────────────┐                  │
│             │                   │                   │                  │
│             ▼                   ▼                   ▼                  │
│        ┌─────────┐        ┌─────────┐        ┌─────────────┐          │
│        │ Blaster │        │ Shotgun │        │AssaultRifle │          │
│        │(Pistol) │        │(Spread) │        │  (Auto)     │          │
│        └─────────┘        └─────────┘        └─────────────┘          │
│             │                   │                   │                  │
│        12 rounds          6 rounds            30 rounds               │
│        Fast fire          Slow fire           Very fast               │
│        Low damage         High damage         Medium damage           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### What Happens When You Shoot

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SHOOTING SEQUENCE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│    ┌──────────────┐                                                     │
│    │ 1. CLICK!    │                                                     │
│    │ Mouse Down   │                                                     │
│    └──────┬───────┘                                                     │
│           │                                                             │
│           ▼                                                             │
│    ┌──────────────┐     ┌──────────────┐                               │
│    │ 2. Weapon    │────►│ 3. Raycast   │  Fire a ray from camera       │
│    │    Fires     │     │   (Check Hit)│  to see what we hit           │
│    └──────────────┘     └──────┬───────┘                               │
│           │                    │                                        │
│           │                    ▼                                        │
│           │             ┌──────────────┐                               │
│           │             │ 4. Did we    │                               │
│           │             │  hit something│                              │
│           │             └──────┬───────┘                               │
│           │                    │                                        │
│           │      ┌─────────────┼─────────────┐                         │
│           │      │             │             │                         │
│           │      ▼             ▼             ▼                         │
│           │   ┌──────┐    ┌──────┐     ┌──────────┐                    │
│           │   │ HIT  │    │ HIT  │     │ MISS     │                    │
│           │   │PLAYER│    │ WALL │     │(hit air) │                    │
│           │   └───┬──┘    └───┬──┘     └──────────┘                    │
│           │       │           │                                         │
│           │       ▼           ▼                                         │
│           │   Apply       Create                                        │
│           │   Damage      Decal                                         │
│           │                                                             │
│           ▼                                                             │
│    ┌───────────────────────────────────────────────────┐               │
│    │                   VISUAL EFFECTS                   │               │
│    │   • Muzzle Flash  • Bullet Tracer  • Hit Marker   │               │
│    │   • Screen Shake  • Sound Effect   • Particles    │               │
│    └───────────────────────────────────────────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🤖 AI System: How Bots Think

The AI uses **Goal-Oriented Action Planning (GOAP)**. It's like a decision tree.

### The Decision Process

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BOT DECISION MAKING                                  │
│                  (Every few frames)                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: EVALUATE all options                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  AttackEvaluator:    "Can I attack? Score: 0.8"                  │  │
│  │  ExploreEvaluator:   "Should I explore? Score: 0.3"              │  │
│  │  GetHealthEvaluator: "Do I need health? Score: 0.6"              │  │
│  │  GetWeaponEvaluator: "Should I get weapons? Score: 0.2"          │  │
│  │  FlankEvaluator:     "Should I flank? Score: 0.5"                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Step 2: PICK the highest score                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Winner: AttackEvaluator (0.8) → Use AttackGoal                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Step 3: EXECUTE the goal                                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        AttackGoal                                 │  │
│  │                            │                                      │  │
│  │          ┌─────────────────┼─────────────────┐                   │  │
│  │          │                 │                 │                   │  │
│  │          ▼                 ▼                 ▼                   │  │
│  │     Can see target?   Can strafe?      Can't see?               │  │
│  │          │                 │                 │                   │  │
│  │          ▼                 ▼                 ▼                   │  │
│  │     DodgeGoal         ChargeGoal        HuntGoal                │  │
│  │   (shoot & move)    (run at enemy)   (find enemy)               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Evaluator Scoring Example

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HOW EVALUATORS CALCULATE SCORES                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  AttackEvaluator:                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Has Target?  ×  Weapon Strength  ×  My Health  =  SCORE         │  │
│  │      1.0      ×       0.8         ×     1.0     =   0.8          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  GetHealthEvaluator:                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Health Low?  ×  Health Pack Near?  ×  Tweaker  =  SCORE         │  │
│  │      0.8      ×         0.5         ×    1.5    =   0.6          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Higher scores = more desirable action!                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🌐 Networking: Multiplayer Architecture

The game uses **Socket.IO** for real-time multiplayer.

### Client-Server Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     MULTIPLAYER ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│     CLIENT 1                SERVER                 CLIENT 2             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│  │              │     │              │     │              │            │
│  │   Browser    │◄───►│   Node.js    │◄───►│   Browser    │            │
│  │   Player 1   │     │   Server     │     │   Player 2   │            │
│  │              │     │              │     │              │            │
│  └──────────────┘     └──────────────┘     └──────────────┘            │
│        │                    │                    │                      │
│        │                    │                    │                      │
│        ▼                    ▼                    ▼                      │
│   NetworkManager       standalone.cjs       NetworkManager             │
│                                                                         │
│  ════════════════════════════════════════════════════════════════       │
│                         DATA FLOW                                       │
│  ════════════════════════════════════════════════════════════════       │
│                                                                         │
│   Player 1 moves ──────►  Server receives  ──────► Player 2 sees       │
│   [position update]       [broadcasts]              [remote update]     │
│                                                                         │
│   Player 2 shoots ──────► Server validates ──────► Player 1 sees       │
│   [shoot event]           [hit detection]           [gets damaged]      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Network Events

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SOCKET.IO EVENTS                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  CLIENT → SERVER                    SERVER → CLIENT                     │
│  ────────────────                   ────────────────                    │
│  • 'player_update'                  • 'remote_players'                  │
│    (my position)                      (other players)                   │
│                                                                         │
│  • 'player_shoot'                   • 'player_killed'                   │
│    (I fired weapon)                   (someone died)                    │
│                                                                         │
│  • 'player_damage'                  • 'damage_taken'                    │
│    (I hit someone)                    (you got hit)                     │
│                                                                         │
│  • 'join_match'                     • 'match_state'                     │
│    (enter game)                       (scores, time)                    │
│                                                                         │
│  • 'chat_message'                   • 'chat_broadcast'                  │
│    (send message)                     (receive message)                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 UI & HUD System

The HUD (Heads-Up Display) shows game information overlaid on the 3D view.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GAME SCREEN LAYOUT                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ┌────────────┐                              ┌────────────────┐ │   │
│  │  │ KILLFEED   │                              │  LEADERBOARD   │ │   │
│  │  │ xShadow... │                              │  1. You: 5     │ │   │
│  │  │ killed     │                              │  2. Bot: 3     │ │   │
│  │  │ Player2    │                              │  3. Bot: 2     │ │   │
│  │  └────────────┘                              └────────────────┘ │   │
│  │                                                                  │   │
│  │                                                                  │   │
│  │                      ╋ CROSSHAIR ╋                              │   │
│  │                                                                  │   │
│  │                                                                  │   │
│  │                                                                  │   │
│  │  ┌────────────────────┐              ┌────────────────────────┐ │   │
│  │  │  HEALTH & STAMINA  │              │      WEAPON & AMMO     │ │   │
│  │  │  ████████░░ 80HP   │              │  AK-47      30/90      │ │   │
│  │  │  ██████████ 100%   │              │  ████████████████████  │ │   │
│  │  └────────────────────┘              └────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### HUD Manager (HUDManager.ts)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HUD MANAGER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Manages:                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  • Health & Shield bars                                          │   │
│  │  • Stamina bar                                                   │   │
│  │  • Weapon name & ammo count                                      │   │
│  │  • Crosshair (dynamic spread)                                    │   │
│  │  • Kill/death statistics                                         │   │
│  │  • Damage indicators                                             │   │
│  │  • Hit markers                                                   │   │
│  │  • Multi-kill notifications                                      │   │
│  │  • Leaderboard                                                   │   │
│  │  • Chat messages                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Sub-managers:                                                          │
│  ┌─────────────────┐    ┌─────────────────┐                            │
│  │ KillfeedManager │    │DamageNumberMngr │                            │
│  │ (kill notifs)   │    │ (floating dmg)  │                            │
│  └─────────────────┘    └─────────────────┘                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Common Patterns Used

### 1. Manager Pattern

Many things are organized into "Manager" classes that control a specific area:

```
AssetManager      → Loads and stores game assets
CombatManager     → Coordinates all combat systems  
SpawningManager   → Handles entity spawning
GameModeManager   → Switches between game modes
NetworkManager    → Handles multiplayer
AudioManager      → Plays sounds
HUDManager        → Updates UI
```

### 2. Entity-Component Pattern (Yuka.js)

Entities are game objects that can have:
- **Position/Rotation** - Where they are
- **Render Component** - 3D model (Three.js)
- **Behaviors** - AI steering behaviors

```typescript
// Example: Bot entity
const bot = new Bot(world);
bot.position.set(10, 0, 5);              // Position
bot.setRenderComponent(botModel, sync);   // 3D Model
bot.steering.add(new FollowPathBehavior()); // Behavior
```

### 3. Event-Driven Pattern

Systems communicate through events/messages:

```typescript
// Yuka's messaging system
entity.handleMessage(MESSAGE_HIT, data);    // Entity receives damage message
entity.handleMessage(MESSAGE_DEAD, data);   // Entity died

// Socket.IO events for networking
socket.emit('player_shoot', data);          // Send shooting event
socket.on('player_killed', callback);       // Receive kill event
```

### 4. Goal-Based AI (GOAP)

Bots use a hierarchy of Goals:
- **Atomic Goals** - Single actions (e.g., SeekToPosition)
- **Composite Goals** - Made of sub-goals (e.g., AttackGoal contains DodgeGoal + ShootGoal)

```
AttackGoal (Composite)
├── DodgeGoal (Composite)
│   ├── SeekToPositionGoal (Atomic)
│   └── ShootGoal (Atomic)
└── HuntGoal (Composite)
    ├── FindPathGoal (Atomic)
    └── FollowPathGoal (Atomic)
```

---

## 📍 Where to Find Things

Quick reference for common tasks:

| I want to... | Look in... |
|--------------|------------|
| Change player speed | `src/config/gameConfig.ts` |
| Change weapon damage | `src/config/weaponConfigs.ts` |
| Change bot behavior | `src/core/Config.ts` (BOT section) |
| Add a new weapon | `src/weapons/` + update constants |
| Add visual effects | `src/systems/` |
| Change game rules | `src/gamemodes/` |
| Modify HUD | `src/ui/HUDManager.ts` + `index.html` |
| Change controls | `src/controls/FirstPersonControls.ts` |
| Add network events | `src/network/NetworkManager.ts` + `server/standalone.cjs` |
| Change bot AI | `src/evaluators/` and `src/goals/` |
| Modify loading | `src/core/AssetManager.ts` |
| Change map/level | `src/entities/Level.ts` + asset files |

---

## 🎓 Understanding Key Files

### main.ts - The Starting Point

```typescript
// 1. Import the world and lobby
import world from './core/World';
import { BitBlastLobby } from './lobby/BitBlastLobby';

// 2. Create lobby UI
const lobby = new BitBlastLobby();

// 3. When player clicks PLAY:
lobby.init((matchInfo) => {
    // 4. Initialize the game world
    world.init(() => {
        // 5. Set the game mode
        world.gameModeManager.setMode('FREE_FOR_ALL');
        
        // 6. Connect to multiplayer server
        world.networkManager.connect(serverUrl, token, matchId);
    });
});
```

### World.ts - The Heart

```typescript
class World {
    // Core systems
    entityManager: EntityManager;    // All game entities
    assetManager: AssetManager;      // Loaded assets
    combat: CombatManager;           // Combat systems
    gameModeManager: GameModeManager; // Game rules
    networkManager: NetworkManager;   // Multiplayer
    
    init() {
        // Load assets, then:
        this._initScene();     // Create 3D scene
        this._initLevel();     // Load map
        this._initBots();      // Create AI enemies
        this._initPlayer();    // Create player
        this._initControls();  // Setup input
        this._initUI();        // Setup HUD
        this._animate();       // Start game loop!
    }
    
    animate() {
        // THE GAME LOOP - runs every frame
        requestAnimationFrame(this._animate);
        
        // Update everything
        this.entityManager.update(delta);
        this.controls.update(delta);
        this.combat.update(delta);
        this.gameModeManager.update(delta);
        
        // Render the frame
        this.renderer.render(this.scene, this.camera);
    }
}
```

---

## 🎮 Summary Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BITBLAST FPS - COMPLETE OVERVIEW                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                           ┌─────────────┐                              │
│                           │   main.ts   │                              │
│                           │  (Entry)    │                              │
│                           └──────┬──────┘                              │
│                                  │                                      │
│                     ┌────────────┴────────────┐                        │
│                     ▼                         ▼                        │
│              ┌─────────────┐          ┌─────────────┐                  │
│              │  BitBlastLobby  │          │    World    │                  │
│              │   (Menu)    │─────────►│   (Game)    │                  │
│              └─────────────┘          └──────┬──────┘                  │
│                                              │                          │
│         ┌────────────┬───────────────────────┼───────────────────┐     │
│         │            │           │           │           │       │     │
│         ▼            ▼           ▼           ▼           ▼       ▼     │
│    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────┐ │
│    │ Entity  │ │ Asset   │ │ Combat  │ │ Network │ │GameMode │ │ UI │ │
│    │ Manager │ │ Manager │ │ Manager │ │ Manager │ │ Manager │ │    │ │
│    └────┬────┘ └─────────┘ └────┬────┘ └────┬────┘ └─────────┘ └────┘ │
│         │                       │           │                          │
│         ▼                       ▼           ▼                          │
│    ┌─────────┐           ┌───────────┐ ┌─────────┐                    │
│    │ Player  │           │  Weapon   │ │ Socket  │                    │
│    │  Bots   │           │  Particle │ │   IO    │                    │
│    │ Items   │           │  Decal    │ │ Server  │                    │
│    └─────────┘           └───────────┘ └─────────┘                    │
│                                                                         │
│    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   │
│                          THREE.JS SCENE                                 │
│                       (What you see on screen)                          │
│    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Next Steps

Now that you understand the structure:

1. **Start with `main.ts`** - Follow the startup sequence
2. **Explore `World.ts`** - See how everything connects
3. **Look at `Player.ts`** - Understand the main character
4. **Study `Bot.ts`** - See how AI works
5. **Check `CombatManager.ts`** - Understand combat systems

**Tips:**
- Use your IDE's "Go to Definition" (F12) to jump between files
- Search for `console.log` statements to see debugging output
- The game has detailed debug logging - check browser console

Happy coding! 🎮
