/**
 * ServerBot.js - Full YUKA AI Bot for Server-Side Multiplayer
 * 
 * This runs the COMPLETE YUKA.js AI on the server:
 * - Vehicle with steering behaviors
 * - Think brain with Goal Evaluators
 * - Vision and Memory System
 * - Target System
 * - Path Planning with NavMesh
 * 
 * YUKA is rendering-agnostic and runs perfectly in Node.js!
 */

const YUKA = require('yuka');
const { WeaponType, WEAPON_CONFIG } = require('./weaponConfigs');

// Bot status constants - MUST match client-side Constants.ts values!
const STATUS_ALIVE = 12;
const STATUS_DYING = 13;
const STATUS_DEAD = 14;
const STATUS_WAITING_RESPAWN = 15; // Server-only state for respawn timer

// Configuration - mirrors client-side CONFIG.BOT from DIVE_SHOWCASE
const BOT_CONFIG = {
    MAX_HEALTH: 100, // matches original
    HEAD_HEIGHT: 1.5, // matches original
    BOUNDING_RADIUS: 0.5,
    MAX_SPEED: 4.5, // Increased for faster movement (was 3)
    MAX_FORCE: 25,
    MASS: 1,
    MAX_TURN_RATE: Math.PI * 0.5,
    MEMORY_SPAN: 20, // matches original (was 3)
    DYING_TIME: 3, // matches original

    // Weapon settings - tuned for slightly harder difficulty
    WEAPON: {
        REACTION_TIME: 0.7, // Faster reaction (was 1.0s)
        AIM_ACCURACY: 2, // Better accuracy - smaller aim offset (was 3m)
        NOISE_MAX_DISTANCE: 100, // Distance at which max noise is applied
        UPDATE_FREQUENCY: 4,
        DEFAULT_SHOOT_DELAY: 0.1, // Will be overridden by actual weapon fire rate
        DAMAGE_PER_SHOT: 15 // Will be overridden by actual weapon damage
    },

    // Navigation settings - matches original
    NAVIGATION: {
        NEXT_WAYPOINT_DISTANCE: 0.5, // matches original (was 1)
        ARRIVE_DECELERATION: 2, // matches original (was 1.5)
        PATH_RADIUS: 0.1, // matches original (was 0.5)
        FOLLOWPATH_WEIGHT: 1,
        ONPATH_WEIGHT: 1, // matches original
        ARRIVE_TOLERANCE: 1 // matches original
    },

    // Vision settings - matches DIVE_SHOWCASE defaults (uses YUKA.Vision defaults)
    VISION: {
        FOV: Math.PI,  // 180 degrees (YUKA default, matches DIVE_SHOWCASE)
        RANGE: 150, // Increased range for larger maps (DIVE_SHOWCASE uses Infinity)
        UPDATE_FREQUENCY: 5 // matches original
    },

    // Target system - matches original
    TARGET_SYSTEM: {
        UPDATE_FREQUENCY: 5 // matches original (was 10)
    },

    // Movement - matches original
    MOVEMENT: {
        DODGE_SIZE: 4 // matches original (was 3)
    },

    // Brain settings - matches original
    BRAIN: {
        GOAL_ARBITRATION_FREQUENCY: 5 // matches original (was 10)
    },

    // Respawn
    RESPAWN_TIME: 3, // seconds

    // Navmesh grounding (align with client CONFIG.NAVMESH.HEIGHT_CHANGE_FACTOR)
    NAVMESH_HEIGHT_CHANGE_FACTOR: 0.2
};

/**
 * TargetSystem - Selects targets from memory records
 */
class ServerTargetSystem {
    constructor(owner) {
        this.owner = owner;
        this._currentRecord = null;
    }

    update() {
        const records = this.owner.memoryRecords;
        this._currentRecord = null;

        const visibleRecords = [];
        const invisibleRecords = [];

        // Sort by visibility
        for (const record of records) {
            if (record.visible) {
                visibleRecords.push(record);
            } else {
                invisibleRecords.push(record);
            }
        }

        // Select closest visible target
        if (visibleRecords.length > 0) {
            let minDistance = Infinity;
            for (const record of visibleRecords) {
                const distance = this.owner.position.squaredDistanceTo(record.lastSensedPosition);
                if (distance < minDistance) {
                    minDistance = distance;
                    this._currentRecord = record;
                }
            }
        } else if (invisibleRecords.length > 0) {
            // Select most recently sensed invisible target
            let maxTime = -Infinity;
            for (const record of invisibleRecords) {
                if (record.timeLastSensed > maxTime) {
                    maxTime = record.timeLastSensed;
                    this._currentRecord = record;
                }
            }
        }

        return this;
    }

    reset() {
        this._currentRecord = null;
        return this;
    }

    isTargetShootable() {
        return this._currentRecord !== null && this._currentRecord.visible;
    }

    getLastSensedPosition() {
        return this._currentRecord ? this._currentRecord.lastSensedPosition : null;
    }

    getTarget() {
        return this._currentRecord ? this._currentRecord.entity : null;
    }

    hasTarget() {
        return this._currentRecord !== null;
    }

    getTimeBecameVisible() {
        return this._currentRecord ? this._currentRecord.timeBecameVisible : -1;
    }
}

/**
 * Feature calculations for evaluators
 */
const Feature = {
    // Returns a value 0-1 representing health status
    health(bot) {
        return bot.health / bot.maxHealth;
    },

    // Returns a value representing total weapon strength
    // Calculates based on current weapon's effectiveness
    totalWeaponStrength(bot) {
        const weaponConfig = bot.weaponConfig;
        if (!weaponConfig) return 0.5;

        // Factor in damage and fire rate for weapon effectiveness
        // Normalized to produce values around 0.5-0.9
        const damageScore = Math.min(weaponConfig.damage / 35, 1);
        const rateScore = Math.min(weaponConfig.fireRate / 12, 1);

        // Apply bot's personality aggression factor if available
        const aggression = bot.personality ? bot.personality.aggression : 1;

        return Math.min(((damageScore + rateScore) / 2) * aggression, 1);
    },

    // Distance to item
    distanceToItem(bot, itemPosition) {
        return bot.position.distanceTo(itemPosition);
    }
};

/**
 * ExploreEvaluator - Base behavior when nothing else to do
 * Matches original DIVE_SHOWCASE ExploreEvaluator.js
 */
class ExploreEvaluator extends YUKA.GoalEvaluator {
    constructor(characterBias = 1) {
        super(characterBias);
    }

    calculateDesirability(/* owner */) {
        // Low priority - explore when nothing else to do (matches original)
        return 0.1;
    }

    setGoal(owner) {
        const currentSubgoal = owner.brain.currentSubgoal();
        if (!(currentSubgoal instanceof ExploreGoal)) {
            owner.brain.clearSubgoals();
            owner.brain.addSubgoal(new ExploreGoal(owner));
        }
    }
}

/**
 * AttackEvaluator - Combat behavior when target visible
 * Matches original DIVE_SHOWCASE AttackEvaluator.js
 */
class AttackEvaluator extends YUKA.GoalEvaluator {
    constructor(characterBias = 1) {
        super(characterBias);
        this.tweaker = 1;
    }

    calculateDesirability(owner) {
        let desirability = 0;

        if (owner.targetSystem.hasTarget()) {
            // Original formula: tweaker * totalWeaponStrength * health
            desirability = this.tweaker * Feature.totalWeaponStrength(owner) * Feature.health(owner);
        }

        return desirability;
    }

    setGoal(owner) {
        const currentSubgoal = owner.brain.currentSubgoal();
        if (!(currentSubgoal instanceof AttackGoal)) {
            owner.brain.clearSubgoals();
            owner.brain.addSubgoal(new AttackGoal(owner));
        }
    }
}

/**
 * GetHealthEvaluator - Seek health when low
 * Enhanced: Lower threshold, higher priority when critically wounded
 */
class GetHealthEvaluator extends YUKA.GoalEvaluator {
    constructor(characterBias = 1) {
        super(characterBias);
        this.tweaker = 0.8; // Higher base value for health seeking (matches DIVE_SHOWCASE tweaker of 0.2 but we scale differently)
    }

    calculateDesirability(owner) {
        const healthRatio = Feature.health(owner);

        // If at full health, no need to seek
        if (healthRatio >= 1) return 0;

        // Calculate health need (0 at full health, 1 at 0 health)
        const healthNeed = 1 - healthRatio;

        // Progressive urgency: higher priority as health drops
        // At 70% health: 0.3 * 0.24 = 0.072 (low priority)
        // At 50% health: 0.5 * 0.4 = 0.2 (moderate priority)
        // At 30% health: 0.7 * 0.56 = 0.39 (high priority)
        // At 10% health: 0.9 * 0.72 = 0.65 (very high priority - may override attack)
        const urgency = this.tweaker * healthNeed * healthNeed; // Quadratic scaling for urgency

        return urgency * this.characterBias;
    }

    setGoal(owner) {
        // When seeking health, explore the map to find health packs
        // TODO: If health pickups are added, navigate to nearest health pack
        const currentSubgoal = owner.brain.currentSubgoal();
        if (!(currentSubgoal instanceof ExploreGoal)) {
            owner.brain.clearSubgoals();
            owner.brain.addSubgoal(new ExploreGoal(owner));
        }
    }
}

// ============================================
// GOALS - Matching original DIVE_SHOWCASE pattern
// ============================================

/**
 * FindPathGoal - Finds path using async pathfinder, stores on owner.path
 * Matches original DIVE_SHOWCASE FindPathGoal.js
 */
class FindPathGoal extends YUKA.Goal {
    constructor(owner, from, to) {
        super(owner);
        this.from = from;
        this.to = to;
    }

    activate() {
        const owner = this.owner;
        const pathPlanner = owner.world.pathPlanner;

        owner.path = null; // reset previous path

        // perform async path finding (matches original)
        pathPlanner.findPath(owner, this.from, this.to, onPathFound);
    }

    execute() {
        const owner = this.owner;

        if (owner.path) {
            // when a path was found, mark this goal as completed
            this.status = YUKA.Goal.STATUS.COMPLETED;
        }
    }
}

// Callback function for async path finding (matches original)
function onPathFound(owner, path) {
    owner.path = path;
}

/**
 * FollowPathGoal - Follows the path stored on owner.path
 * Matches original DIVE_SHOWCASE FollowPathGoal.js
 */
class FollowPathGoal extends YUKA.Goal {
    constructor(owner) {
        super(owner);
        this.to = null;
    }

    activate() {
        const owner = this.owner;
        const path = owner.path;

        if (path !== null && path.length > 0) {
            // update path and steering behaviors
            const followPathBehavior = owner.steering.behaviors[0];
            followPathBehavior.active = true;
            followPathBehavior.path.clear();

            const onPathBehavior = owner.steering.behaviors[1];
            onPathBehavior.active = true;

            for (let i = 0, l = path.length; i < l; i++) {
                const waypoint = path[i];
                followPathBehavior.path.add(waypoint);
            }

            // store destination for arrival check
            this.to = path[path.length - 1];
        } else {
            this.status = YUKA.Goal.STATUS.FAILED;
        }
    }

    execute() {
        if (this.active()) {
            const owner = this.owner;

            if (owner.atPosition(this.to)) {
                this.status = YUKA.Goal.STATUS.COMPLETED;
            }
        }
    }

    terminate() {
        const owner = this.owner;

        const followPathBehavior = owner.steering.behaviors[0];
        followPathBehavior.active = false;

        const onPathBehavior = owner.steering.behaviors[1];
        onPathBehavior.active = false;
    }
}

/**
 * SeekToPositionGoal - Simple seek without pathfinding
 * Matches original DIVE_SHOWCASE SeekToPositionGoal.js
 */
class SeekToPositionGoal extends YUKA.Goal {
    constructor(owner, target = new YUKA.Vector3()) {
        super(owner);
        this.target = target;
    }

    activate() {
        const owner = this.owner;

        const seekBehavior = owner.steering.behaviors[2];
        seekBehavior.target.copy(this.target);
        seekBehavior.active = true;
    }

    execute() {
        if (this.owner.atPosition(this.target)) {
            this.status = YUKA.Goal.STATUS.COMPLETED;
        }
    }

    terminate() {
        const seekBehavior = this.owner.steering.behaviors[2];
        seekBehavior.active = false;
    }
}

/**
 * ExploreGoal - Navigate to random points on the NavMesh
 * Matches original DIVE_SHOWCASE ExploreGoal.js
 */
class ExploreGoal extends YUKA.CompositeGoal {
    constructor(owner) {
        super(owner);
    }

    activate() {
        const owner = this.owner;

        // if this goal is reactivated then there may be some existing subgoals that must be removed
        this.clearSubgoals();

        // compute random position on map
        if (owner.world && owner.world.navMesh) {
            const region = owner.world.navMesh.getRandomRegion();

            const from = new YUKA.Vector3().copy(owner.position);
            const to = new YUKA.Vector3().copy(region.centroid);

            // setup subgoals (order matters - they execute in sequence)
            this.addSubgoal(new FindPathGoal(owner, from, to));
            this.addSubgoal(new FollowPathGoal(owner));
        } else {
            console.warn(`[ExploreGoal] ${owner.name} - No NavMesh available!`);
        }
    }

    execute() {
        this.status = this.executeSubgoals();
        this.replanIfFailed();
    }

    terminate() {
        this.clearSubgoals();
    }
}

/**
 * AttackGoal - Top-level combat management
 * Matches original DIVE_SHOWCASE AttackGoal.js
 */
const left = new YUKA.Vector3(-1, 0, 0);
const right = new YUKA.Vector3(1, 0, 0);
const targetPosition = new YUKA.Vector3();

class AttackGoal extends YUKA.CompositeGoal {
    constructor(owner) {
        super(owner);
    }

    activate() {
        // if this goal is reactivated then there may be some existing subgoals that must be removed
        this.clearSubgoals();

        const owner = this.owner;

        // if the enemy is able to shoot the target (there is line of sight between enemy and
        // target), then select a tactic to follow while shooting
        if (owner.targetSystem.isTargetShootable() === true) {
            // if the enemy has space to strafe then do so
            if (owner.canMoveInDirection(left, targetPosition)) {
                this.addSubgoal(new DodgeGoal(owner, false));
            } else if (owner.canMoveInDirection(right, targetPosition)) {
                this.addSubgoal(new DodgeGoal(owner, true));
            } else {
                // if not able to strafe, charge at the target's position
                this.addSubgoal(new ChargeGoal(owner));
            }
        } else {
            // if the target is not visible, go hunt it
            this.addSubgoal(new HuntGoal(owner));
        }
    }

    execute() {
        // it is possible for a enemy's target to die while this goal is active so we
        // must test to make sure the enemy always has an active target
        const owner = this.owner;

        if (owner.targetSystem.hasTarget() === false) {
            this.status = YUKA.Goal.STATUS.COMPLETED;
        } else {
            const currentSubgoal = this.currentSubgoal();
            const status = this.executeSubgoals();

            if (currentSubgoal instanceof DodgeGoal && currentSubgoal.inactive()) {
                // inactive dodge goals should be reactivated but without reactivating the entire attack goal
                this.status = YUKA.Goal.STATUS.ACTIVE;
            } else {
                this.status = status;
                this.replanIfFailed();
            }
        }
    }

    terminate() {
        this.clearSubgoals();
    }
}

/**
 * DodgeGoal - Strafe while keeping aim on target
 * Matches original DIVE_SHOWCASE DodgeGoal.js
 */
const dodgeRight = new YUKA.Vector3(1, 0, 0);
const dodgeLeft = new YUKA.Vector3(-1, 0, 0);

class DodgeGoal extends YUKA.CompositeGoal {
    constructor(owner, right) {
        super(owner);
        this.right = right;
        this.targetPosition = new YUKA.Vector3();
        this.dodgeStartTime = 0;
        this.dodgeDuration = 0.8 + Math.random() * 0.6; // 0.8-1.4 seconds per dodge
        this.directionSwitchChance = 0.3; // 30% chance to switch direction randomly
    }

    activate() {
        this.clearSubgoals();
        this.dodgeStartTime = this.owner.currentTime;

        // Randomly adjust dodge duration for unpredictability
        this.dodgeDuration = 0.8 + Math.random() * 0.6;

        const owner = this.owner;

        if (this.right) {
            // dodge to right as long as there is enough space
            if (owner.canMoveInDirection(dodgeRight, this.targetPosition)) {
                this.addSubgoal(new SeekToPositionGoal(owner, this.targetPosition));
            } else {
                // no space anymore, now dodge to left
                this.right = false;
                this.status = YUKA.Goal.STATUS.INACTIVE;
            }
        } else {
            // dodge to left as long as there is enough space
            if (owner.canMoveInDirection(dodgeLeft, this.targetPosition)) {
                this.addSubgoal(new SeekToPositionGoal(owner, this.targetPosition));
            } else {
                // no space anymore, now dodge to right
                this.right = true;
                this.status = YUKA.Goal.STATUS.INACTIVE;
            }
        }
    }

    execute() {
        if (this.active()) {
            const owner = this.owner;

            // stop executing if the target is not visible anymore
            if (owner.targetSystem.isTargetShootable() === false) {
                this.status = YUKA.Goal.STATUS.COMPLETED;
            } else {
                this.status = this.executeSubgoals();
                this.replanIfFailed();

                // Enhanced: Force direction change after dodge duration elapsed
                const elapsedTime = owner.currentTime - this.dodgeStartTime;
                if (elapsedTime >= this.dodgeDuration) {
                    // Random chance to switch direction for more dynamic movement
                    if (Math.random() < this.directionSwitchChance) {
                        this.right = !this.right;
                    }
                    this.status = YUKA.Goal.STATUS.INACTIVE;
                } else if (this.completed()) {
                    // Original behavior: repeat the goal
                    this.status = YUKA.Goal.STATUS.INACTIVE;
                }
            }
        }
    }

    terminate() {
        this.clearSubgoals();
    }
}

/**
 * ChargeGoal - Rush toward target using pathfinding
 * Matches original DIVE_SHOWCASE ChargeGoal.js
 */
class ChargeGoal extends YUKA.CompositeGoal {
    constructor(owner) {
        super(owner);
    }

    activate() {
        this.clearSubgoals();

        const owner = this.owner;

        // seek to the current position of the target
        const target = owner.targetSystem.getTarget();

        if (target) {
            // it's important to use path finding since an enemy might be visible
            // but not directly reachable via a seek behavior because of an obstacle
            const from = new YUKA.Vector3().copy(owner.position);
            const to = new YUKA.Vector3().copy(target.position);

            // setup subgoals
            this.addSubgoal(new FindPathGoal(owner, from, to));
            this.addSubgoal(new FollowPathGoal(owner));
        }
    }

    execute() {
        // stop executing if the target is not visible anymore
        if (this.owner.targetSystem.isTargetShootable() === false) {
            this.status = YUKA.Goal.STATUS.COMPLETED;
        } else {
            this.status = this.executeSubgoals();
            this.replanIfFailed();
        }
    }

    terminate() {
        this.clearSubgoals();
    }
}

/**
 * HuntGoal - Move to last known position of target using pathfinding
 * Matches original DIVE_SHOWCASE HuntGoal.js
 */
class HuntGoal extends YUKA.CompositeGoal {
    constructor(owner) {
        super(owner);
    }

    activate() {
        this.clearSubgoals();

        const owner = this.owner;

        // seek to the last sensed position
        const targetPosition = owner.targetSystem.getLastSensedPosition();

        if (targetPosition) {
            // it's important to use path finding since there might be obstacle
            // between the current and target position
            const from = new YUKA.Vector3().copy(owner.position);
            const to = new YUKA.Vector3().copy(targetPosition);

            // setup subgoals
            this.addSubgoal(new FindPathGoal(owner, from, to));
            this.addSubgoal(new FollowPathGoal(owner));
        }
    }

    execute() {
        const owner = this.owner;

        // hunting is not necessary if the target becomes visible again
        if (owner.targetSystem.isTargetShootable()) {
            this.status = YUKA.Goal.STATUS.COMPLETED;
        } else {
            this.status = this.executeSubgoals();

            // if the enemy is at the last sensed position, forget about
            // the bot, update the target system and consider this goal as completed
            if (this.completed()) {
                const target = owner.targetSystem.getTarget();
                if (target) {
                    owner.removeEntityFromMemory(target);
                }
                owner.targetSystem.update();
            } else {
                this.replanIfFailed();
            }
        }
    }

    terminate() {
        this.clearSubgoals();
    }
}

/**
 * PathPlanner - Async pathfinding on NavMesh
 */
class ServerPathPlanner {
    constructor(navMesh) {
        this.navMesh = navMesh;
        this.taskQueue = new YUKA.TaskQueue();
    }

    findPath(vehicle, from, to, callback) {
        const task = new ServerPathPlannerTask(this, vehicle, from, to, callback);
        this.taskQueue.enqueue(task);
    }

    update() {
        this.taskQueue.update();
    }
}

/**
 * PathPlannerTask - Individual pathfinding task
 */
class ServerPathPlannerTask extends YUKA.Task {
    constructor(pathPlanner, vehicle, from, to, callback) {
        super();
        this.pathPlanner = pathPlanner;
        this.vehicle = vehicle;
        this.from = from;
        this.to = to;
        this.callback = callback;
    }

    execute() {
        const navMesh = this.pathPlanner.navMesh;
        const path = navMesh.findPath(this.from, this.to);

        // Debug: Log pathfinding results
        if (path.length === 0) {
            console.warn(`[PathPlanner] No path found from (${this.from.x.toFixed(1)}, ${this.from.y.toFixed(1)}, ${this.from.z.toFixed(1)}) to (${this.to.x.toFixed(1)}, ${this.to.y.toFixed(1)}, ${this.to.z.toFixed(1)})`);
        }

        this.callback(this.vehicle, path);
    }
}

/**
 * ServerBot - Full YUKA-powered bot for server-side simulation
 */
class ServerBot extends YUKA.Vehicle {
    constructor(world, id, username, spawnPoint) {
        super();

        // Core properties
        this.name = username;
        this.oderId = id;  // Custom ID - YUKA's uuid is read-only
        this.isBot = true;
        this.world = world;

        // Stats
        this.health = BOT_CONFIG.MAX_HEALTH;
        this.maxHealth = BOT_CONFIG.MAX_HEALTH;
        this.kills = 0;
        this.deaths = 0;
        this.shotsFired = 0;
        this.shotsHit = 0;
        this.damageDealt = 0;

        // Status
        this.status = STATUS_ALIVE;
        this.currentTime = 0;
        this.dyingTime = BOT_CONFIG.DYING_TIME;
        this.endTimeDying = Infinity;
        this.respawnTime = 0;

        // Position
        this.position.set(spawnPoint.position.x, spawnPoint.position.y, spawnPoint.position.z);
        this.rotation.fromEuler(0, spawnPoint.rotation.y, 0);
        this.previousPosition = this.position.clone();
        this.currentPosition = this.position.clone();

        // Navigation - find NavMesh region and snap to correct height
        this.currentRegion = null;
        this.path = null; // For async pathfinding (matches original pattern)

        if (world.navMesh) {
            // Use larger tolerance to find region even if Y is off
            this.currentRegion = world.navMesh.getRegionForPoint(this.position, 10);

            // Snap to NavMesh height immediately if region found
            if (this.currentRegion) {
                const distance = this.currentRegion.plane.distanceToPoint(this.position);
                this.position.y -= distance;
                this.previousPosition.copy(this.position);
                this.currentPosition.copy(this.position);
                console.log(`[ServerBot] ${username} snapped to NavMesh height: Y=${this.position.y.toFixed(2)}`);
            } else {
                console.warn(`[ServerBot] ${username} could not find NavMesh region at spawn!`);
            }
        }

        // Head position for vision
        this.head = new YUKA.GameEntity();
        this.head.position.set(0, BOT_CONFIG.HEAD_HEIGHT, 0);
        this.add(this.head);

        // Vehicle settings (matches original Enemy.js)
        this.maxSpeed = BOT_CONFIG.MAX_SPEED;
        this.maxForce = BOT_CONFIG.MAX_FORCE;
        this.mass = BOT_CONFIG.MASS;
        this.maxTurnRate = BOT_CONFIG.MAX_TURN_RATE;
        this.updateOrientation = false; // Rotation is controlled manually via rotateTo (matches original)

        // Bounding radius
        this.boundingRadius = BOT_CONFIG.BOUNDING_RADIUS;

        // Memory system for perception
        this.memorySystem = new YUKA.MemorySystem(this);
        this.memorySystem.memorySpan = BOT_CONFIG.MEMORY_SPAN;
        this.memoryRecords = [];

        // Target system
        this.targetSystem = new ServerTargetSystem(this);
        this.targetSystemRegulator = new YUKA.Regulator(BOT_CONFIG.TARGET_SYSTEM.UPDATE_FREQUENCY);

        // Personality variation - makes each bot behave slightly differently
        // This creates more organic, less predictable AI behavior
        this.personality = {
            aggression: 0.85 + Math.random() * 0.3,     // 0.85-1.15: affects attack priority
            exploration: 0.8 + Math.random() * 0.4,     // 0.8-1.2: affects exploration priority
            selfPreservation: 0.8 + Math.random() * 0.4, // 0.8-1.2: affects health-seeking
            reactionSpeed: 0.9 + Math.random() * 0.2    // 0.9-1.1: affects reaction time
        };
        console.log(`[ServerBot] ${username} personality: aggression=${this.personality.aggression.toFixed(2)}, preservation=${this.personality.selfPreservation.toFixed(2)}`);

        // Brain with Think for goal-driven behavior
        // Evaluator biases are modified by personality for behavioral variety
        this.brain = new YUKA.Think(this);
        this.brain.addEvaluator(new AttackEvaluator(this.personality.aggression));
        this.brain.addEvaluator(new ExploreEvaluator(this.personality.exploration * 0.5)); // Base 0.5, scaled by personality
        this.brain.addEvaluator(new GetHealthEvaluator(this.personality.selfPreservation));
        this.goalArbitrationRegulator = new YUKA.Regulator(BOT_CONFIG.BRAIN.GOAL_ARBITRATION_FREQUENCY);

        // Vision - MUST use head as owner like the original client-side code
        // The head's world transform provides the correct eye position for vision checks
        this.vision = new YUKA.Vision(this.head);
        this.vision.fieldOfView = BOT_CONFIG.VISION.FOV;
        this.vision.range = BOT_CONFIG.VISION.RANGE;
        this.visionRegulator = new YUKA.Regulator(BOT_CONFIG.VISION.UPDATE_FREQUENCY);

        // Steering behaviors
        const followPathBehavior = new YUKA.FollowPathBehavior();
        followPathBehavior.active = false;
        followPathBehavior.weight = BOT_CONFIG.NAVIGATION.FOLLOWPATH_WEIGHT;
        followPathBehavior.nextWaypointDistance = BOT_CONFIG.NAVIGATION.NEXT_WAYPOINT_DISTANCE;
        this.steering.add(followPathBehavior);

        const onPathBehavior = new YUKA.OnPathBehavior();
        onPathBehavior.active = false;
        onPathBehavior.path = followPathBehavior.path;
        onPathBehavior.radius = BOT_CONFIG.NAVIGATION.PATH_RADIUS;
        onPathBehavior.weight = BOT_CONFIG.NAVIGATION.ONPATH_WEIGHT;
        this.steering.add(onPathBehavior);

        const seekBehavior = new YUKA.SeekBehavior();
        seekBehavior.active = false;
        this.steering.add(seekBehavior);

        // Weapon state
        this.lastAttackTime = 0;
        this.pendingAttack = null; // { targetId, damage } to be broadcast on hit
        this.pendingMiss = null; // { shooterId, targetId, aimPosition } for visual effects on miss

        // Current weapon - pick a random weapon for variety
        const weaponTypes = [WeaponType.AK47, WeaponType.M4, WeaponType.Scar, WeaponType.LMG, WeaponType.Tec9];
        this.weaponType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
        this.weaponConfig = WEAPON_CONFIG[this.weaponType] || WEAPON_CONFIG[WeaponType.AK47];
        console.log(`[ServerBot] ${username} equipped with ${this.weaponType} (fire rate: ${this.weaponConfig.fireRate}/s)`);

        // Animation state
        this.animationState = 'idle';

        // Attacker search behavior - matches DIVE_SHOWCASE Enemy.js
        // When hit from behind, bot will turn to search for attacker
        this.searchAttacker = false;
        this.attackDirection = new YUKA.Vector3();
        this.endTimeSearch = Infinity;
        this.searchTime = 3; // seconds (matches DIVE_SHOWCASE CONFIG.BOT.SEARCH_FOR_ATTACKER_TIME)
    }

    /**
     * Called once when bot is added to EntityManager
     */
    start() {
        // Initialize region
        if (this.world.navMesh && !this.currentRegion) {
            this.currentRegion = this.world.navMesh.getRegionForPoint(this.position, 2);
        }

        // Add level occluder as vision obstacle for LOS blocking
        // This matches the client-side pattern: vision.addObstacle(level)
        // The ServerLevelOccluder implements lineOfSightTest() using BVH from level.glb
        const levelOccluder = this.world.getLevelOccluder ? this.world.getLevelOccluder() : null;
        if (levelOccluder && levelOccluder.isLoaded) {
            this.vision.addObstacle(levelOccluder);
        }

        return this;
    }

    /**
     * Main update loop - runs all YUKA AI logic
     */
    update(delta) {
        super.update(delta);

        this.currentTime += delta;

        // Keep bot on NavMesh
        this.stayInLevel();

        if (this.status === STATUS_ALIVE) {
            // Update perception
            if (this.visionRegulator.ready()) {
                this.updateVision();
            }

            // Update memory - get records that are still within memory span
            this.memorySystem.getValidMemoryRecords(this.currentTime, this.memoryRecords);

            // Update target system
            if (this.targetSystemRegulator.ready()) {
                this.targetSystem.update();

                // Debug: Log target state periodically (uncomment for debugging)
                // if (Math.random() < 0.01) {
                //     const hasTarget = this.targetSystem.hasTarget();
                //     const target = this.targetSystem.getTarget();
                //     const isShootable = this.targetSystem.isTargetShootable();
                //     console.log(`[AI] ${this.name}: hasTarget=${hasTarget}, target=${target?.name || target?.oderId || 'none'}, shootable=${isShootable}, memoryRecords=${this.memoryRecords.length}`);
                // }
            }

            // Execute current goals
            this.brain.execute();

            // Arbitrate new goals
            if (this.goalArbitrationRegulator.ready()) {
                this.brain.arbitrate();

                // Debug: Log current goal periodically
                const currentGoal = this.brain.currentSubgoal();
                const goalName = currentGoal ? currentGoal.constructor.name : 'none';
                if (Math.random() < 0.02) { // ~2% chance per tick
                    console.log(`[Brain] ${this.name}: Goal=${goalName}, Velocity=${this.velocity.length().toFixed(2)}, HasTarget=${this.targetSystem.hasTarget()}`);
                }
            }

            // Stop attacker search after timeout (matches DIVE_SHOWCASE Enemy.update())
            if (this.currentTime >= this.endTimeSearch) {
                this.resetSearch();
            }

            // Weapon system - aim and shoot
            this.updateWeaponSystem(delta);

            // Update animation state
            this.updateAnimationState();
        }

        // Handle dying
        if (this.status === STATUS_DYING) {
            if (this.currentTime >= this.endTimeDying) {
                this.status = STATUS_DEAD;
                this.endTimeDying = Infinity;
            }
        }

        // Handle death - schedule respawn
        if (this.status === STATUS_DEAD) {
            this.respawnTime = this.currentTime + BOT_CONFIG.RESPAWN_TIME;
            this.status = STATUS_WAITING_RESPAWN;
        }

        return this;
    }

    /**
     * Keep bot on NavMesh
     */
    stayInLevel() {
        if (!this.world.navMesh) return;

        this.currentPosition.copy(this.position);

        const newRegion = this.world.navMesh.clampMovement(
            this.currentRegion,
            this.previousPosition,
            this.currentPosition,
            this.position
        );

        if (newRegion) {
            this.currentRegion = newRegion;
        }

        this.previousPosition.copy(this.position);

        // Adjust height - snap more aggressively to stay on NavMesh
        if (this.currentRegion) {
            const distance = this.currentRegion.plane.distanceToPoint(this.position);
            this.position.y -= distance * BOT_CONFIG.NAVMESH_HEIGHT_CHANGE_FACTOR;
        }
    }

    /**
     * Update vision - scan for enemies
     * Matches original DIVE_SHOWCASE Enemy.updateVision() pattern:
     * Uses the YUKA Vision system which handles FOV, range, and line-of-sight
     * 
     * LOS blocking is now handled by ServerLevelColliders added as a vision obstacle.
     * vision.visible() calls lineOfSightTest() on obstacles to check for wall occlusion.
     */
    updateVision() {
        const memorySystem = this.memorySystem;
        const vision = this.vision;
        const competitors = this.world.getCompetitors();

        // Reusable vector for target head position
        const worldPosition = new YUKA.Vector3();

        for (let i = 0, l = competitors.length; i < l; i++) {
            const competitor = competitors[i];

            // Ignore self and consider only living entities
            if (competitor === this) continue;

            // Check if competitor is alive - handle different status representations
            const isAlive = competitor.status === STATUS_ALIVE ||
                (competitor.status === undefined && competitor.active === true);

            if (!isAlive) {
                // If competitor is dead, ensure we update memory to stop tracking/shooting
                if (memorySystem.hasRecord(competitor)) {
                    const record = memorySystem.getRecord(competitor);
                    record.visible = false;
                }
                continue;
            }

            // Ensure we have a memory record for this competitor
            if (memorySystem.hasRecord(competitor) === false) {
                memorySystem.createRecord(competitor);
            }

            const record = memorySystem.getRecord(competitor);

            // Get target's head world position
            // For bots/entities with head child: use head.getWorldPosition()
            // For simple entities (like player representations): offset from position
            if (competitor.head && typeof competitor.head.getWorldPosition === 'function') {
                competitor.head.getWorldPosition(worldPosition);
            } else {
                // Fallback: use position + estimated head height
                worldPosition.copy(competitor.position);
                worldPosition.y += competitor.isBot ? BOT_CONFIG.HEAD_HEIGHT : 1.7;
            }

            // Use YUKA's built-in vision.visible() which handles:
            // - Range check (distance <= this.vision.range)
            // - FOV check (angle within fieldOfView)
            // - Line-of-sight check via obstacles (ServerLevelColliders.lineOfSightTest)
            const isVisible = vision.visible(worldPosition) === true && competitor.active !== false;

            if (isVisible) {
                // Target is VISIBLE
                record.timeLastSensed = this.currentTime;
                record.lastSensedPosition.copy(competitor.position); // Use body position (original pattern)
                if (record.visible === false) {
                    record.timeBecameVisible = this.currentTime;
                    // Debug log new sightings
                    console.log(`[Vision] 👁️ ${this.name} SEES ${competitor.name || competitor.oderId}`);
                }
                record.visible = true;
            } else {
                record.visible = false;
            }
        }

        return this;
    }

    /**
     * Update weapon system - aim and shoot at targets
     * Matches original DIVE_SHOWCASE WeaponSystem.updateAimAndShot()
     */
    updateWeaponSystem(delta) {
        this.pendingAttack = null;

        const targetSystem = this.targetSystem;
        const target = targetSystem.getTarget();

        if (target) {
            // if the target is visible, directly rotate towards it and then fire a round
            if (targetSystem.isTargetShootable()) {
                // Stop searching for attacker since we can see a target
                // Matches DIVE_SHOWCASE WeaponSystem.updateAimAndShot() pattern
                this.resetSearch();

                // the bot can fire a round if it is headed towards its target
                // and after a certain reaction time
                const targeted = this.rotateTo(target.position, delta, 0.05);

                const timeBecameVisible = targetSystem.getTimeBecameVisible();
                const elapsedTime = this.currentTime;

                if (targeted === true && (elapsedTime - timeBecameVisible) >= BOT_CONFIG.WEAPON.REACTION_TIME * (this.personality ? this.personality.reactionSpeed : 1)) {
                    const timeSinceLastShot = this.currentTime - this.lastAttackTime;

                    // Use actual weapon fire rate: fireRate = shots per second
                    // So delay between shots = 1 / fireRate
                    const shootDelay = 1.0 / this.weaponConfig.fireRate;

                    if (timeSinceLastShot >= shootDelay) {
                        this.lastAttackTime = this.currentTime;

                        // Track shot fired for accuracy stats
                        this.shotsFired++;

                        // Calculate aim position with noise (matching DIVE_SHOWCASE)
                        // Target center mass (chest height)
                        const aimPosition = new YUKA.Vector3().copy(target.position);
                        aimPosition.y += 1.0; // Chest height

                        // Add noise to aim - bots don't have perfect aim!
                        this.addNoiseToAim(aimPosition);

                        // Perform hit check with noisy aim position
                        const hitResult = this.performHitCheck(target, aimPosition);

                        if (hitResult.hit) {
                            // Shot connected - queue attack for broadcast
                            this.pendingAttack = {
                                targetId: target.oderId || target.uuid,
                                damage: this.weaponConfig.damage,
                                weaponType: this.weaponType
                            };

                            // Combat logging for hits
                            // console.log(`[Combat] 🎯 ${this.name} HIT ${target.oderId || target.name} with ${this.weaponType}`);
                        } else {
                            // Shot missed - still broadcast for visual effects but no damage
                            this.pendingMiss = {
                                shooterId: this.oderId,
                                targetId: target.oderId || target.uuid,
                                weaponType: this.weaponType,
                                aimPosition: { x: aimPosition.x, y: aimPosition.y, z: aimPosition.z }
                            };

                            // Combat logging for misses
                            // console.log(`[Combat] 💨 ${this.name} MISSED ${target.oderId || target.name} (distance: ${hitResult.distance.toFixed(1)}m, offset: ${hitResult.missDistance.toFixed(2)}m)`);
                        }
                    }
                }
            } else {
                // Target not visible - search for attacker or rotate to last sensed position
                // Matches DIVE_SHOWCASE WeaponSystem.updateAimAndShot() pattern
                if (this.searchAttacker) {
                    // Look toward attack direction (where shot came from)
                    const searchTarget = new YUKA.Vector3().copy(this.position).add(this.attackDirection);
                    this.rotateTo(searchTarget, delta, 0.05);
                } else {
                    // Rotate to last sensed position
                    const lastSensedPos = targetSystem.getLastSensedPosition();
                    if (lastSensedPos) {
                        this.rotateTo(lastSensedPos, delta, 0.05);
                    }
                }
            }
        } else {
            // No target - look for attacker or along movement direction
            // Matches DIVE_SHOWCASE WeaponSystem.updateAimAndShot() pattern
            if (this.searchAttacker) {
                // Look toward attack direction (where shot came from)
                const searchTarget = new YUKA.Vector3().copy(this.position).add(this.attackDirection);
                this.rotateTo(searchTarget, delta, 0.05);
            } else {
                // Look along movement direction
                const speed = this.velocity.length();
                if (speed > 0.1) {
                    const displacement = new YUKA.Vector3().copy(this.velocity).normalize();
                    const lookTarget = new YUKA.Vector3().copy(this.position).add(displacement);
                    this.rotateTo(lookTarget, delta, 0.05);
                }
            }
        }
    }

    /**
     * Add noise to aim position to simulate human-like inaccuracy
     * Matches original DIVE_SHOWCASE WeaponSystem.addNoiseToAim()
     * 
     * Noise increases proportionally with distance to target.
     * At NOISE_MAX_DISTANCE, the full AIM_ACCURACY offset is applied.
     */
    addNoiseToAim(targetPosition) {
        const distance = this.position.distanceTo(targetPosition);
        const maxDistance = BOT_CONFIG.WEAPON.NOISE_MAX_DISTANCE;
        const aimAccuracy = BOT_CONFIG.WEAPON.AIM_ACCURACY;

        // Scale factor: 0 at close range, 1 at max distance
        const f = Math.min(distance, maxDistance) / maxDistance;

        // Random offset in each axis, scaled by distance factor
        // Using YUKA.MathUtils.randFloat equivalent
        const offsetX = (Math.random() * 2 - 1) * aimAccuracy * f;
        const offsetY = (Math.random() * 2 - 1) * aimAccuracy * f;
        const offsetZ = (Math.random() * 2 - 1) * aimAccuracy * f;

        targetPosition.x += offsetX;
        targetPosition.y += offsetY;
        targetPosition.z += offsetZ;

        return targetPosition;
    }

    /**
     * Perform hit check - determines if the noisy aim position hits the target
     * Uses simple sphere intersection to check if aim point is close enough to target
     */
    performHitCheck(target, aimPosition) {
        // Get target center mass position
        const targetCenter = new YUKA.Vector3().copy(target.position);
        targetCenter.y += 1.0; // Chest height

        // Calculate distance between aim point and target center
        const missDistance = aimPosition.distanceTo(targetCenter);
        const distance = this.position.distanceTo(targetCenter);

        // Hit radius - slightly generous hitbox (0.6m radius for human-sized target)
        // This matches the bounding radius concept from DIVE_SHOWCASE
        const hitRadius = 0.6;

        return {
            hit: missDistance <= hitRadius,
            distance: distance,
            missDistance: missDistance
        };
    }

    /**
     * Update animation state based on movement direction relative to facing
     * Matches DIVE_SHOWCASE pattern: determines forward/backward/left/right based on
     * the relationship between velocity direction and look direction
     */
    updateAnimationState() {
        const speed = this.velocity.length();

        if (this.status !== STATUS_ALIVE) {
            this.animationState = 'death';
            return;
        }

        if (speed <= 0.5) {
            this.animationState = 'idle';
            return;
        }

        // Get the facing direction (forward vector from rotation)
        const lookDir = new YUKA.Vector3(0, 0, 1).applyRotation(this.rotation).normalize();

        // Get the movement direction
        const moveDir = new YUKA.Vector3().copy(this.velocity).normalize();

        // Calculate dot products to determine direction
        // Forward: positive dot with look direction
        // Backward: negative dot with look direction
        const forwardDot = moveDir.dot(lookDir);

        // Right vector (perpendicular to look direction in XZ plane)
        const rightDir = new YUKA.Vector3(-lookDir.z, 0, lookDir.x).normalize();
        const rightDot = moveDir.dot(rightDir);

        // Determine dominant movement direction
        const absForward = Math.abs(forwardDot);
        const absRight = Math.abs(rightDot);

        if (absForward > absRight) {
            // Moving primarily forward or backward
            if (forwardDot > 0) {
                // Moving forward
                this.animationState = speed > this.maxSpeed * 0.7 ? 'run' : 'walk';
            } else {
                // Moving backward
                this.animationState = 'backward';
            }
        } else {
            // Moving primarily sideways (strafing)
            if (rightDot > 0) {
                this.animationState = 'right';  // Strafing right
            } else {
                this.animationState = 'left';   // Strafing left
            }
        }
    }

    /**
     * Check if at target position
     */
    atPosition(position) {
        const tolerance = BOT_CONFIG.NAVIGATION.ARRIVE_TOLERANCE * BOT_CONFIG.NAVIGATION.ARRIVE_TOLERANCE;
        return this.position.squaredDistanceTo(position) <= tolerance;
    }

    /**
     * Check if can move in direction without leaving NavMesh
     * Matches original DIVE_SHOWCASE Enemy.canMoveInDirection()
     */
    canMoveInDirection(direction, resultPosition) {
        if (!this.world.navMesh) return true;

        resultPosition.copy(direction).applyRotation(this.rotation).normalize();
        resultPosition.multiplyScalar(BOT_CONFIG.MOVEMENT.DODGE_SIZE).add(this.position);

        const region = this.world.navMesh.getRegionForPoint(resultPosition, 1);
        return region !== null;
    }

    /**
     * Removes the given entity from the memory system.
     * Matches original DIVE_SHOWCASE Enemy.removeEntityFromMemory()
     */
    removeEntityFromMemory(entity) {
        this.memorySystem.deleteRecord(entity);
        this.memorySystem.getValidMemoryRecords(this.currentTime, this.memoryRecords);
        return this;
    }

    /**
     * Ensure the enemy only changes its rotation around its y-axis by considering the target
     * in a logical xz-plane which has the same height as the current position.
     * In this way, the enemy never "tilts" its body. Necessary for levels with different heights.
     * Matches original DIVE_SHOWCASE Enemy.rotateTo()
     */
    rotateTo(target, delta, tolerance) {
        const customTarget = new YUKA.Vector3().copy(target);
        customTarget.y = this.position.y;
        return super.rotateTo(customTarget, delta, tolerance);
    }

    /**
     * Take damage and initiate attacker search behavior
     * Matches DIVE_SHOWCASE Enemy.handleMessage() for MESSAGE_HIT
     */
    takeDamage(damage, attackerId) {
        if (this.status !== STATUS_ALIVE) return;

        this.health -= damage;

        // Start searching for attacker if we can't see them
        // Matches DIVE_SHOWCASE behavior: turn toward attacker direction
        if (attackerId) {
            const attacker = this.world.getCompetitorById ? this.world.getCompetitorById(attackerId) : null;
            if (attacker && !this.targetSystem.isTargetShootable()) {
                // Calculate direction to attacker
                this.attackDirection.subVectors(attacker.position, this.position).normalize();
                this.searchAttacker = true;
                this.endTimeSearch = this.currentTime + this.searchTime;
            }
        }

        if (this.health <= 0) {
            this.health = 0;
            this.initDeath(attackerId);
        }
    }

    /**
     * Reset attacker search state
     * Matches DIVE_SHOWCASE Enemy.resetSearch()
     */
    resetSearch() {
        this.searchAttacker = false;
        this.endTimeSearch = Infinity;
    }

    /**
     * Initialize death
     */
    initDeath(killerId) {
        this.status = STATUS_DYING;
        this.endTimeDying = this.currentTime + this.dyingTime;
        this.deaths++;

        // Stop movement
        this.velocity.set(0, 0, 0);

        // Deactivate steering
        for (const behavior of this.steering.behaviors) {
            behavior.active = false;
        }

        this.animationState = 'death';

        // Notify all other bots that this entity died
        // Matches DIVE_SHOWCASE MESSAGE_DEAD pattern: other bots remove dead entity
        // from memory and immediately update their target system
        this.notifyCompetitorsOfDeath();

        // Return killer ID for kill credit
        return killerId;
    }

    /**
     * Notify all other competitors that this bot has died
     * Matches DIVE_SHOWCASE handleMessage for MESSAGE_DEAD
     * Other bots will remove this entity from memory and re-target immediately
     */
    notifyCompetitorsOfDeath() {
        const competitors = this.world.getCompetitors ? this.world.getCompetitors() : [];

        for (const competitor of competitors) {
            if (competitor === this) continue;
            if (!competitor.memorySystem) continue;

            // Remove dead entity from memory
            const record = competitor.memorySystem.getRecord(this);
            if (record && record.visible) {
                competitor.removeEntityFromMemory(this);
                // Immediately update target system to find new target
                competitor.targetSystem.update();
                // Force goal re-arbitration for immediate response
                competitor.brain.arbitrate();
            }
        }
    }

    /**
     * Respawn at position
     */
    respawn(spawnPoint) {
        this.health = this.maxHealth;
        this.status = STATUS_ALIVE;

        this.position.set(spawnPoint.position.x, spawnPoint.position.y, spawnPoint.position.z);
        this.rotation.fromEuler(0, spawnPoint.rotation.y, 0);
        this.previousPosition.copy(this.position);

        // Reset region and path
        this.path = null;
        if (this.world.navMesh) {
            this.currentRegion = this.world.navMesh.getRegionForPoint(this.position, 2);
        }

        // Reset systems
        this.brain.clearSubgoals();
        this.memoryRecords.length = 0;
        this.memorySystem.clear();
        this.targetSystem.reset();

        this.animationState = 'idle';
    }

    /**
     * Get state for network broadcast
     */
    getNetworkState() {
        // Convert quaternion rotation to Euler angles for client compatibility
        // Client expects rotation as { x, y, z } Euler angles
        const euler = { x: 0, y: 0, z: 0 };

        // Extract Y rotation from quaternion (for horizontal facing direction)
        // Using quaternion to Euler conversion: y = atan2(2*(w*y + x*z), 1 - 2*(y*y + z*z))
        const qx = this.rotation.x;
        const qy = this.rotation.y;
        const qz = this.rotation.z;
        const qw = this.rotation.w;

        euler.y = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qz * qz));
        // Client's model.rotation.y = Math.PI handles model orientation - no offset needed
        euler.x = Math.asin(Math.max(-1, Math.min(1, 2 * (qw * qx - qz * qy))));
        euler.z = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qx * qx + qz * qz));

        return {
            id: this.oderId,
            oderId: this.oderId,
            username: this.name,
            isBot: true,
            position: {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            },
            rotation: {
                x: euler.x,
                y: euler.y,
                z: euler.z
            },
            velocity: {
                x: this.velocity.x,
                y: this.velocity.y,
                z: this.velocity.z
            },
            health: this.health,
            isAlive: this.status === STATUS_ALIVE,
            animation: this.animationState,
            kills: this.kills,
            deaths: this.deaths,
            weaponType: this.weaponType
        };
    }
}

// Export everything
module.exports = {
    ServerBot,
    ServerPathPlanner,
    ServerTargetSystem,
    BOT_CONFIG,
    STATUS_ALIVE,
    STATUS_DYING,
    STATUS_DEAD,
    STATUS_WAITING_RESPAWN,
    // Goals for external use
    ExploreGoal,
    AttackGoal,
    SeekToPositionGoal,
    FindPathGoal,
    FollowPathGoal,
    DodgeGoal,
    ChargeGoal,
    HuntGoal
};
